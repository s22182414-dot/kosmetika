import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const q = req.query.q as string;
  if (!q) return res.status(400).json({ error: 'Missing query' });

  try {
    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36',
    };

    const response = await fetch(
      `https://duckduckgo.com/?q=${encodeURIComponent(q)}&iax=images&ia=images`,
      { headers }
    );
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
      return res.json({ imageUrl: '', imageUrls: [] });
    }

    const searchRes = await fetch(
      `https://duckduckgo.com/i.js?q=${encodeURIComponent(q)}&o=json&vqd=${encodeURIComponent(vqd)}&f=,,,,&p=1`,
      { headers }
    );
    const data = await searchRes.json();
    const results = data.results || [];

    const imageUrls: string[] = results
      .slice(0, 5)
      .map((r: any) => r.image)
      .filter((url: string) => !!url);

    const imageUrl = imageUrls[0] || '';
    return res.json({ imageUrl, imageUrls });
  } catch (err) {
    console.error('Image search error:', err);
    return res.json({ imageUrl: '', imageUrls: [] });
  }
}
