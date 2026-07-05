import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";


async function startServer() {
  const app = express();
  const PORT = 5173;

  app.use(express.json());

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", db: "browser-localstorage" });
  });

  app.post("/api/telegram/send", async (req, res) => {
    const { photo, photos, caption } = req.body;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      return res.status(500).json({
        ok: false,
        description: "Telegram Bot Token yoki Kanal ID sozlanmagan. Iltimos, .env faylini tekshiring."
      });
    }

    // Telegram caption max 1024 chars
    let safeCaption = typeof caption === 'string' ? caption.slice(0, 1024) : '';

    // HTML escape & convert basic markdown to HTML for Telegram
    safeCaption = safeCaption
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');

    // Build the list of URLs to send
    const photoList: string[] = Array.isArray(photos) && photos.length > 0
      ? photos.filter(Boolean)
      : photo ? [photo] : [];

    if (photoList.length === 0) {
      return res.status(400).json({ ok: false, description: "Rasm URL topilmadi." });
    }

    try {
      if (photoList.length === 1) {
        // ── Single photo ──────────────────────────────────────────
        // Try each URL until one works
        let lastData: any = null;
        for (const url of photoList) {
          const response = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              photo: url,
              caption: safeCaption,
              parse_mode: 'HTML',
            }),
          });
          lastData = await response.json() as any;
          if (lastData.ok) return res.json(lastData);
          // If WEBPAGE_CURL_FAILED or similar, try next URL
          const desc: string = lastData.description || '';
          if (desc.includes('WEBPAGE_CURL_FAILED') || desc.includes('wrong type') || desc.includes('failed to get HTTP URL')) {
            console.warn(`URL ishlamadi, keyingisini sinab ko'rilmoqda: ${url}`);
            continue;
          }
          break; // Other errors — stop
        }
        return res.status(400).json(lastData || { ok: false, description: 'Rasm yuborishda xatolik' });

      } else {
        // ── Media group (album) — up to 10 photos ─────────────────
        const media = photoList.slice(0, 10).map((url: string, i: number) => ({
          type: 'photo',
          media: url,
          ...(i === 0 ? { caption: safeCaption, parse_mode: 'HTML' } : {}),
        }));

        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMediaGroup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, media }),
        });
        const data = await response.json() as any;
        if (data.ok) return res.json({ ok: true });

        // If media group fails (e.g. some URLs broken), try single best photo
        if (!data.ok) {
          const desc: string = data.description || '';
          if (desc.includes('WEBPAGE_CURL_FAILED') || desc.includes('wrong type') || desc.includes('failed to get HTTP URL')) {
            console.warn('Media group failed, single foto yuborilmoqda...');
            const singleRes = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: chatId,
                photo: photoList[0],
                caption: safeCaption,
                parse_mode: 'HTML',
              }),
            });
            const singleData = await singleRes.json() as any;
            if (singleData.ok) return res.json(singleData);
          }
          return res.status(400).json(data);
        }
      }
    } catch (error: any) {
      console.error("Telegram API Error:", error);
      res.status(500).json({ ok: false, description: error.message });
    }
  });

  // Automated Image Search using DuckDuckGo
  app.get("/api/search-image", async (req, res) => {
    try {
      const q = req.query.q as string;
      if (!q) return res.status(400).json({ error: "Missing query" });
      
      const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36' };
      const response = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(q)}&iax=images&ia=images`, { headers });
      const html = await response.text();
      
      let vqd = '';
      const vqdMatch1 = html.match(/vqd=([\d-]+)/);
      const vqdMatch2 = html.match(/vqd="([^"]+)"/);
      if (vqdMatch1) vqd = vqdMatch1[1];
      else if (vqdMatch2) vqd = vqdMatch2[1];
      
      if (!vqd) {
          const m = html.match(/vqd[='"]+([^&"'\s]+)/);
          if (m) vqd = m[1];
      }

      if (!vqd) {
        return res.json({ imageUrl: '' });
      }
      
      const searchRes = await fetch(`https://duckduckgo.com/i.js?q=${encodeURIComponent(q)}&o=json&vqd=${encodeURIComponent(vqd)}&f=,,,,&p=1`, { headers });
      const data = await searchRes.json();
      const results = data.results || [];
      // Return up to 5 image URLs
      const imageUrls: string[] = results
        .slice(0, 5)
        .map((r: any) => r.image)
        .filter((url: string) => !!url);
      const imageUrl = imageUrls[0] || '';
      res.json({ imageUrl, imageUrls });
    } catch(err) {
      console.error("Image search error:", err);
      res.json({ imageUrl: '', imageUrls: [] }); // Fail gracefully
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
