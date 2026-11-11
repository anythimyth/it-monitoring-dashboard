import { Telegraf } from 'telegraf';
import { GoogleGenAI } from '@google/genai';
import axios from 'axios';
import http from 'http';
import 'dotenv/config';

// 1. Inisialisasi Bot Telegram & Gemini API
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const geminiApiKey = process.env.GEMINI_API_KEY;
const appScriptUrl = process.env.APPS_SCRIPT_URL;

if (!botToken || !geminiApiKey || !appScriptUrl) {
  console.error('❌ ERROR: Salah satu Environment Variable (TELEGRAM_BOT_TOKEN, GEMINI_API_KEY, APPS_SCRIPT_URL) belum diisi!');
}

const bot = new Telegraf(botToken);
const ai = new GoogleGenAI({ apiKey: geminiApiKey });

// 2. System Prompt untuk Gemini AI (Pengolahan Unit Riil)
const SYSTEM_PROMPT = `
Anda adalah AI Agent IT Support yang bertugas mengekstrak laporan progres harian pembukaan toko baru menjadi data unit riil.

Ekstrak atau perkirakan angka integer unit berikut berdasarkan pesan yang diberikan:
- store_id: Nama/Kode toko (contoh: "Prama Cibogo", "Narma Harvest").
- cctv_target, cctv_kabel_done, cctv_fisik_done, cctv_online_done
- net_target_titik, net_kabel_done, net_rack_done, net_test_done
- admin_target, admin_kabel_done, admin_pc_done, admin_sw_done
- kasir_target, kasir_kabel_done, kasir_pc_done, kasir_sw_done, kasir_test_done
- total_progress_percent: Persentase rata-rata total fisik selesai dibanding target (0-100).
- ai_summary: Ringkasan singkat progres pengerjaan hari ini.
- blockers_issues: Catatan kendala, barang kurang, atau kendala lapangan jika ada (isi string kosong jika tidak ada).

Kembalikan HANYA JSON murni tanpa markdown formatting (tanpa ```json ... ```):
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

// 3. Command Handler /start
bot.start((ctx) => {
  ctx.reply('👋 Halo! Saya adalah AI Agent IT Support Monitoring Progres Toko Baru.\n\nSilakan kirimkan laporan harian pengerjaan CCTV, Jaringan, PC Admin, dan PC Kasir. Saya akan merekapnya secara otomatis ke Google Sheets dan Web Dashboard.');
});

// 4. Message Handler (Setiap Kali Ada Chat Masuk)
bot.on('text', async (ctx) => {
  const userMessage = ctx.message.text;
  
  // Abaikan perintah /start agar tidak diproses Gemini
  if (userMessage.startsWith('/start')) return;

  console.log(`📩 Pesan masuk dari Telegram: "${userMessage}"`);
  await ctx.reply('⏳ AI Agent sedang mengekstrak laporan unit...');

  try {
    // A. Panggil Gemini API
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { role: 'user', parts: [{ text: `${SYSTEM_PROMPT}\n\nPesan Laporan Harian:\n"${userMessage}"` }] }
      ],
      config: { responseMimeType: "application/json" }
    });

    const rawJsonText = response.text;
    console.log('🤖 Hasil respons dari Gemini API:', rawJsonText);

    const parsedData = JSON.parse(rawJsonText);

    // B. Kirim Data Hasil Ekstraksi ke Google Apps Script API
    console.log('🚀 Mengirim data ke Apps Script API...');
    const apiResponse = await axios.post(appScriptUrl, {
      type: "UPDATE_STATUS",
      data: {
        ...parsedData,
        raw_message: userMessage
      }
    });

    console.log('✅ Respons dari Google Apps Script:', apiResponse.data);

    // C. Balas Konfirmasi ke Chat Telegram
    const replyMessage = 
      `✅ **Laporan Berhasil Direkap!**\n\n` +
      `🏪 **Toko:** ${parsedData.store_id || 'Toko Unnamed'}\n` +
      `📊 **Total Progres:** ${parsedData.total_progress_percent || 0}%\n\n` +
      `📹 **CCTV:** ${parsedData.cctv_fisik_done || 0}/${parsedData.cctv_target || 0} Unit Terpasang (${parsedData.cctv_online_done || 0} Online)\n` +
      `🌐 **Jaringan:** ${parsedData.net_kabel_done || 0}/${parsedData.net_target_titik || 0} Titik LAN\n` +
      `💻 **PC Admin:** ${parsedData.admin_pc_done || 0}/${parsedData.admin_target || 0} Unit Terpasang\n` +
      `🛒 **PC Kasir:** ${parsedData.kasir_pc_done || 0}/${parsedData.kasir_target || 0} Unit (${parsedData.kasir_sw_done || 0} SW POS)\n\n` +
      `📝 **Summary:** ${parsedData.ai_summary || '-'}\n` +
      (parsedData.blockers_issues ? `⚠️ **Kendala:** ${parsedData.blockers_issues}` : `✨ **Kendala:** Nihil`);

    await ctx.replyWithMarkdown(replyMessage);

  } catch (err) {
    console.error('❌ Error pada proses AI Agent:', err.message || err);
    await ctx.reply('❌ Gagal memproses laporan. Pastikan pesan berisi informasi nama toko dan detail unit riil (CCTV, PC, Jaringan).');
  }
});

// 5. Jalankan Bot Telegram Polling
bot.launch()
  .then(() => console.log('🤖 IT Agent Telegram Bot is running...'))
  .catch((err) => console.error('❌ Gagal menjalankan Telegram Bot:', err));

// 6. HTTP Server Dummy untuk Port Binding Render (Web Service Mode)
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('IT Support Telegram Bot Engine is Live & Running!\n');
}).listen(PORT, () => {
  console.log(`🌐 HTTP Server listening on port ${PORT} for Render health checks.`);
});

// 7. Graceful Shutdown Handlers
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
