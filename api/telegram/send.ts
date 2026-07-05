import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, description: 'Method not allowed' });
  }

  const { photo, photos, caption } = req.body;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    return res.status(500).json({
      ok: false,
      description: 'Telegram Bot Token yoki Kanal ID sozlanmagan.',
    });
  }

  // Telegram caption max 1024 chars
  let safeCaption = typeof caption === 'string' ? caption.slice(0, 1024) : '';

  safeCaption = safeCaption
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');

  const photoList: string[] = Array.isArray(photos) && photos.length > 0
    ? photos.filter(Boolean)
    : photo ? [photo] : [];

  if (photoList.length === 0) {
    return res.status(400).json({ ok: false, description: 'Rasm URL topilmadi.' });
  }

  try {
    if (photoList.length === 1) {
      // Single photo — try each URL until one works
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
        const desc: string = lastData.description || '';
        if (
          desc.includes('WEBPAGE_CURL_FAILED') ||
          desc.includes('wrong type') ||
          desc.includes('failed to get HTTP URL')
        ) {
          console.warn(`URL ishlamadi, keyingisi: ${url}`);
          continue;
        }
        break;
      }
      return res.status(400).json(lastData || { ok: false, description: 'Rasm yuborishda xatolik' });

    } else {
      // Media group — up to 10 photos
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

      // Fallback: try single photo
      const desc: string = data.description || '';
      if (
        desc.includes('WEBPAGE_CURL_FAILED') ||
        desc.includes('wrong type') ||
        desc.includes('failed to get HTTP URL')
      ) {
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
  } catch (error: any) {
    console.error('Telegram API Error:', error);
    return res.status(500).json({ ok: false, description: error.message });
  }
}
