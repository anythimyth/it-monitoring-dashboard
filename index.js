import { Telegraf } from 'telegraf';
import { GoogleGenAI } from '@google/genai';
import axios from 'axios';
import 'dotenv/config';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

const SYSTEM_PROMPT = `
Anda adalah AI Agent IT Support yang bertugas mengekstrak laporan progres harian pembukaan toko baru menjadi data unit riil.

Ekstrak atau perkirakan angka integer unit berikut berdasarkan pesan:
- store_id: Nama/Kode toko.
- cctv_target, cctv_kabel_done, cctv_fisik_done, cctv_online_done
- net_target_titik, net_kabel_done, net_rack_done, net_test_done
- admin_target, admin_kabel_done, admin_pc_done, admin_sw_done
- kasir_target, kasir_kabel_done, kasir_pc_done, kasir_sw_done, kasir_test_done
- total_progress_percent: Persentase rata-rata total fisik selesai dibanding target.
- ai_summary: Ringkasan singkat progres.
- blockers_issues: Catatan kendala/part yang kurang jika ada.

Kembalikan HANYA JSON murni tanpa markdown codeblock:
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

bot.on('text', async (ctx) => {
  const userMessage = ctx.message.text;
  await ctx.reply('⏳ AI Agent sedang merekap laporan unit...');

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { role: 'user', parts: [{ text: `${SYSTEM_PROMPT}\n\nPesan:\n"${userMessage}"` }] }
      ],
      config: { responseMimeType: "application/json" }
    });

    const parsed = JSON.parse(response.text);

    await axios.post(APPS_SCRIPT_URL, {
      type: "UPDATE_STATUS",
      data: { ...parsed, raw_message: userMessage }
    });

    const reply = `✅ **Laporan Berhasil Direkap!**\n\n` +
      `🏪 **Toko:** ${parsed.store_id}\n` +
      `📊 **Total Progres:** ${parsed.total_progress_percent}%\n\n` +
      `📹 **CCTV:** ${parsed.cctv_fisik_done}/${parsed.cctv_target} Unit Terpasang (${parsed.cctv_online_done} Online)\n` +
      `🌐 **Jaringan:** ${parsed.net_kabel_done}/${parsed.net_target_titik} Titik LAN\n` +
      `💻 **PC Admin:** ${parsed.admin_pc_done}/${parsed.admin_target} PC Terpasang\n` +
      `🛒 **PC Kasir:** ${parsed.kasir_pc_done}/${parsed.kasir_target} Unit (${parsed.kasir_sw_done} SW POS)\n\n` +
      `📝 **Summary:** ${parsed.ai_summary}\n` +
      (parsed.blockers_issues ? `⚠️ **Kendala:** ${parsed.blockers_issues}` : `✨ **Kendala:** Nihil`);

    await ctx.replyWithMarkdown(reply);

  } catch (err) {
    console.error(err);
    await ctx.reply('❌ Gagal memproses laporan. Pastikan menyebutkan nama toko dan detail unit.');
  }
});

bot.launch();
console.log('🤖 IT Bot running...');
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
