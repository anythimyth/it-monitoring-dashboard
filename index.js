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
Anda adalah AI Agent IT Support yang bertugas mengekstrak laporan progres harian pembukaan toko baru menjadi data JSON terstruktur.

Tugas Anda:
1. Identifikasi nama/kode toko (store_id).
2. Perkirakan atau ekstrak nilai persentase (0-100) untuk subunit berikut:
   - cctv_kabel, cctv_fisik, cctv_online
   - net_kabel, net_rack_switch, net_testing
   - admin_kabel, admin_pc_setup, admin_software
   - kasir_kabel, kasir_pc_setup, kasir_software, kasir_testing
3. Hitung total_progress (rata-rata dari seluruh subunit).
4. Buat ringkasan singkat (ai_summary) dan catat kendala jika ada (blockers_issues).

Kembalikan HANYA format JSON murni tanpa markdown formatting:
{
  "store_id": "STRING",
  "cctv_kabel": NUMBER,
  "cctv_fisik": NUMBER,
  "cctv_online": NUMBER,
  "net_kabel": NUMBER,
  "net_rack_switch": NUMBER,
  "net_testing": NUMBER,
  "admin_kabel": NUMBER,
  "admin_pc_setup": NUMBER,
  "admin_software": NUMBER,
  "kasir_kabel": NUMBER,
  "kasir_pc_setup": NUMBER,
  "kasir_software": NUMBER,
  "kasir_testing": NUMBER,
  "total_progress": NUMBER,
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
