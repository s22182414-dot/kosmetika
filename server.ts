import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define Product Schema
const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  searchQuery: { type: String, required: true },
  imageUrl: { type: String, default: '' },
  imageUrls: { type: [String], default: [] },
  status: { type: String, enum: ['idle', 'sending', 'success', 'error'], default: 'idle' },
  batchId: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

const Product = mongoose.model('Product', productSchema);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Connect to MongoDB
  if (process.env.MONGODB_URI) {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log("Connected to MongoDB");
    } catch (err) {
      console.error("MongoDB connection error:", err);
    }
  } else {
    console.warn("MONGODB_URI is not set in .env. Running without database connection.");
  }

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", db: mongoose.connection.readyState === 1 ? "connected" : "disconnected" });
  });

  // Product CRUD Routes
  app.get("/api/products", async (req, res) => {
    if (mongoose.connection.readyState !== 1) return res.json([]);
    try {
      const products = await Product.find().sort({ createdAt: -1 });
      // Map _id to id for frontend compatibility
      const formatted = products.map(p => ({
        id: p._id.toString(),
        name: p.name,
        description: p.description,
        searchQuery: p.searchQuery,
        imageUrl: p.imageUrl,
        imageUrls: (p as any).imageUrls || [],
        status: p.status,
        batchId: p.batchId || (p.createdAt as Date)?.toISOString() || ''
      }));
      res.json(formatted);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/products", async (req, res) => {
    if (mongoose.connection.readyState !== 1) return res.json(req.body.map((p: any) => ({ ...p, id: Math.random().toString(36).substring(7) })));
    try {
      const products = req.body;
      const created = await Product.insertMany(products);
      const formatted = created.map(p => ({
        id: p._id.toString(),
        name: p.name,
        description: p.description,
        searchQuery: p.searchQuery,
        imageUrl: p.imageUrl,
        imageUrls: (p as any).imageUrls || [],
        status: p.status,
        batchId: p.batchId || ''
      }));
      res.json(formatted);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/products/:id", async (req, res) => {
    if (mongoose.connection.readyState !== 1) return res.json(req.body);
    try {
      const updated = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!updated) return res.status(404).json({ error: "Product not found" });
      res.json({
        id: updated._id.toString(),
        name: updated.name,
        description: updated.description,
        searchQuery: updated.searchQuery,
        imageUrl: updated.imageUrl,
        imageUrls: (updated as any).imageUrls || [],
        status: updated.status,
        batchId: updated.batchId || ''
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/products/:id", async (req, res) => {
    if (mongoose.connection.readyState !== 1) return res.json({ success: true });
    try {
      await Product.findByIdAndDelete(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
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

    // Telegram caption max 1024 chars (media group) or 4096 (single photo)
    let safeCaption = typeof caption === 'string' ? caption.slice(0, 1024) : '';

    // HTML escape to avoid unclosed entity errors & converting basic markdown to HTML
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
        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            photo: photoList[0],
            caption: safeCaption,
            //parse_mode: 'HTML',
          }),
        });
        const data = await response.json() as any;
        if (data.ok) return res.json(data);
        return res.status(400).json(data);

      } else {
        // ── Media group (album) — up to 10 photos ─────────────────
        const media = photoList.slice(0, 10).map((url: string, i: number) => ({
          type: 'photo',
          media: url,
          // Caption only on first photo; parse_mode required with caption
          ...(i === 0 ? { caption: safeCaption, parse_mode: 'HTML' } : {}),
        }));

        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMediaGroup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, media }),
        });
        const data = await response.json() as any;
        // sendMediaGroup returns { ok: true, result: [...] } on success
        if (data.ok) return res.json({ ok: true });
        return res.status(400).json(data);
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
