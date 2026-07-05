import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const q = req.query.q as string;
  if (!q) return res.status(400).json({ error: 'Missing query' });

  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  const baseHeaders = {
    'User-Agent': ua,
    'Accept-Language': 'en-US,en;q=0.9',
  };

  // ── 1. DuckDuckGo ─────────────────────────────────────────────
  try {
    const ddgHtml = await fetch(
      `https://duckduckgo.com/?q=${encodeURIComponent(q)}&iax=images&ia=images`,
      {
        headers: { ...baseHeaders, 'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8' },
        signal: AbortSignal.timeout(8000),
      }
    ).then(r => r.text());

    let vqd = '';
    for (const pattern of [
      /"vqd"\s*:\s*"([\d-]+)"/,
      /vqd=['"]?([\d-]+)['"]?[,&\s]/,
      /vqd=([\d-]+)/,
      /vqd[='"]+([^&"'\s]+)/,
    ]) {
      const m = ddgHtml.match(pattern);
      if (m?.[1]) { vqd = m[1]; break; }
    }

    if (vqd) {
      const data = await fetch(
        `https://duckduckgo.com/i.js?q=${encodeURIComponent(q)}&o=json&vqd=${vqd}&f=,,,,&p=1`,
        {
          headers: { ...baseHeaders, 'Referer': 'https://duckduckgo.com/', 'Accept': 'application/json,*/*' },
          signal: AbortSignal.timeout(8000),
        }
      ).then(r => r.json()) as any;

      const imageUrls: string[] = (data.results || [])
        .slice(0, 5)
        .map((r: any) => r.image)
        .filter((url: string) => typeof url === 'string' && url.startsWith('http'));

      if (imageUrls.length > 0) {
        return res.json({ imageUrl: imageUrls[0], imageUrls });
      }
    }
  } catch (e) {
    console.warn('DuckDuckGo failed:', e);
  }

  // ── 2. Bing fallback ──────────────────────────────────────────
  try {
    const bingHtml = await fetch(
      `https://www.bing.com/images/async?q=${encodeURIComponent(q)}&first=1&count=5&adlt=off&qft=`,
      {
        headers: { ...baseHeaders, 'Accept': 'text/html,*/*;q=0.8', 'Referer': 'https://www.bing.com/' },
        signal: AbortSignal.timeout(8000),
      }
    ).then(r => r.text());

    const murlMatches = [...bingHtml.matchAll(/murl&quot;:&quot;(https?:\/\/[^&]+?)&quot;/g)];
    const imageUrls = murlMatches.slice(0, 5).map(m => decodeURIComponent(m[1])).filter(Boolean);

    if (imageUrls.length > 0) {
      return res.json({ imageUrl: imageUrls[0], imageUrls });
    }
  } catch (e) {
    console.warn('Bing failed:', e);
  }

  return res.json({ imageUrl: '', imageUrls: [] });
}
