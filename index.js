import { Telegraf } from 'telegraf';
import { GoogleGenAI } from '@google/genai';
import axios from 'axios';
import 'dotenv/config';

// Inisialisasi Environment Variables
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

// Prompt System untuk Ekstraksi Progres IT
const SYSTEM_PROMPT = `
Anda adalah AI Agent IT Support yang bertugas mengekstrak laporan harian pembukaan toko baru menjadi data jumlah unit riil.

Tugas Anda:
1. Identifikasi store_id.
2. Ekstrak data unit berikut (format angka integer):
   - cctv_target, cctv_kabel_done, cctv_fisik_done, cctv_online_done
   - net_target_titik, net_kabel_done, net_rack_done, net_test_done
   - admin_target, admin_kabel_done, admin_pc_done, admin_sw_done
   - kasir_target, kasir_kabel_done, kasir_pc_done, kasir_sw_done, kasir_test_done
3. Hitung total_progress_percent (otomatis dari total fisik terpasang dibanding target).
4. Ringkas ai_summary dan catat blockers_issues jika ada.

Kembalikan HANYA JSON murni:
{
  "store_id": "STRING",
  "cctv_target": NUMBER,
  "cctv_kabel_done": NUMBER,
  "cctv_fisik_done": NUMBER,
  "cctv_online_done": NUMBER,
  "net_target_titik": NUMBER,
  "net_kabel_done": NUMBER,
  "net_rack_done": NUMBER,
  "net_test_done": NUMBER,
  "admin_target": NUMBER,
  "admin_kabel_done": NUMBER,
  "admin_pc_done": NUMBER,
  "admin_sw_done": NUMBER,
  "kasir_target": NUMBER,
  "kasir_kabel_done": NUMBER,
  "kasir_pc_done": NUMBER,
  "kasir_sw_done": NUMBER,
  "kasir_test_done": NUMBER,
  "total_progress_percent": NUMBER,
  "ai_summary": "STRING",
  "blockers_issues": "STRING"
}
`;
// Event Listener Telegram Pesan Teks
bot.on('text', async (ctx) => {
  const userMessage = ctx.message.text;
  await ctx.reply('⏳ AI Agent sedang memproses & merekap laporan...');

  try {
    // 1. Panggil Gemini 2.5 Flash
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { role: 'user', parts: [{ text: `${SYSTEM_PROMPT}\n\nPesan Laporan Harian:\n"${userMessage}"` }] }
      ],
      config: { responseMimeType: "application/json" }
    });

    const parsedData = JSON.parse(response.text);

    // 2. Kirim Payload ke Google Apps Script
    const payload = {
      type: "UPDATE_STATUS",
      data: {
        ...parsedData,
        raw_message: userMessage
      }
    };

    await axios.post(APPS_SCRIPT_URL, payload);

    // 3. Balas ke Telegram
    const replyText = `✅ **Laporan Berhasil Direkap!**\n\n` +
      `🏪 **Toko:** ${parsedData.store_id}\n` +
      `📊 **Total Progres:** ${parsedData.total_progress}%\n` +
      `📝 **Summary:** ${parsedData.ai_summary}\n` +
      (parsedData.blockers_issues ? `⚠️ **Kendala:** ${parsedData.blockers_issues}` : `✨ **Kendala:** Nihil`);

    await ctx.replyWithMarkdown(replyText);

  } catch (err) {
    console.error('Error processing agent:', err);
    await ctx.reply('❌ Gagal memproses laporan. Pastikan format pesan mencantumkan nama toko dan detail progres.');
  }
});

// Launch Bot (Polling Mode)
bot.launch();
console.log('🤖 IT Agent Telegram Bot is running...');

// Graceful Stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
