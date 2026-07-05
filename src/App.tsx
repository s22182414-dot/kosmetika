import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import {
  Upload, Send, Loader2,
  CheckCircle2, AlertCircle, Trash2, Sparkles, X,
  Package, Zap, RefreshCw, ChevronDown, ChevronLeft, ChevronRight,
  Sun, Moon
} from 'lucide-react';

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface Product {
  id: string;
  name: string;
  description: string;
  searchQuery: string;
  imageUrl: string;
  imageUrls: string[];
  status: 'idle' | 'sending' | 'success' | 'error';
  batchId: string;
}

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ConfirmModal {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
}

const LOCAL_STORAGE_KEY = 'kosmetika_products';

const getLocalProducts = (): Product[] => {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

const saveLocalProducts = (products: Product[]) => {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(products));
};

export default function App() {
  const [isDarkTheme, setIsDarkTheme] = useState(() => {
    return localStorage.getItem('theme') === 'dark';
  });
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [_products, _setProducts] = useState<Product[]>([]);
  const setProducts = (action: React.SetStateAction<Product[]>) => {
    _setProducts(prev => {
      const next = typeof action === 'function' ? (action as any)(prev) : action;
      saveLocalProducts(next);
      return next;
    });
  };
  const products = _products;
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [collapsedBatches, setCollapsedBatches] = useState<Set<string>>(new Set());
  const [carouselIndexes, setCarouselIndexes] = useState<Record<string, number>>({});
  const [confirmModal, setConfirmModal] = useState<ConfirmModal>({
    isOpen: false, title: '', message: '', onConfirm: () => { },
  });

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmModal({ isOpen: true, title, message, onConfirm });
  };

  const closeConfirm = () => {
    setConfirmModal(prev => ({ ...prev, isOpen: false }));
  };

  const toggleBatch = (batchId: string) => {
    setCollapsedBatches(prev => {
      const next = new Set(prev);
      if (next.has(batchId)) next.delete(batchId);
      else next.add(batchId);
      return next;
    });
  };

  const showToast = (message: string, type: Toast['type'] = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const removeToast = (id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isDarkTheme) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkTheme]);

  useEffect(() => {
    fetchProducts();

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) readFile(file);
          break;
        }
      }
    };

    const handleWindowDragOver = (e: DragEvent) => { e.preventDefault(); };
    const handleWindowDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith('image/')) readFile(file);
    };

    window.addEventListener('paste', handlePaste);
    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('drop', handleWindowDrop);

    return () => {
      window.removeEventListener('paste', handlePaste);
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('drop', handleWindowDrop);
    };
  }, []);

  const fetchProducts = async () => {
    try {
      await new Promise(r => setTimeout(r, 300));
      const data = getLocalProducts();
      // 'sending' holatida qolgan mahsulotlarni 'idle'ga qaytarish
      const fixed = data.map((p: Product) =>
        p.status === 'sending' ? { ...p, status: 'idle' as const } : p
      );
      if (fixed.some((p: Product, i: number) => p.status !== data[i].status)) {
        saveLocalProducts(fixed);
      }
      _setProducts(fixed);
    } catch (err) {
      console.error('Failed to fetch products', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    readFile(file);
  };

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      setSelectedImage(reader.result as string);
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) readFile(file);
  };

  const analyzeImage = async () => {
    if (!selectedImage) return;
    setIsAnalyzing(true);
    setError(null);

    try {
      const base64Data = selectedImage.split(',')[1];
      const mimeType = selectedImage.split(';')[0].split(':')[1];

      const prompt = `
Sen kosmetika va go'zallik mahsulotlari bo'yicha professional ekspertsiz. Bu rasmda juda ko'p turli kosmetika mahsulotlari ko'rsatilgan.

MUHIM KO'RSATMALAR:
1. Rasmning BARCHA qismlarini sinchiklab ko'rib chiq — yuqori chap, yuqori o'ng, pastki chap, pastki o'ng, markaz — hammasini tekshir.
2. Har bir ALOHIDA mahsulotni identifikatsiya qil, hatto eng kichik narsalarni ham (tubalar, ampulalar, namunalar, maskalalar, parfyum sinovlari va hokazo).
3. Qadoq (packaging) ustidagi BRENDNI va mahsulot nomini ANIQ o'qi. Koreyscha, inglizcha, yaponcha matnlarni o'qi.
4. Bir xil mahsulotning bir nechta donasi bo'lsa, uni BIR MARTA yoz, lekin izohda "X dona" deb qayd qil.
5. Har bir mahsulotni to'liq va aniq nomlash — "krem" yoki "serum" deb yetarli emas, brend nomi + mahsulot nomi + turi kerak.

Mashhur koreyscha brendlar: MEDIPEEL, Numbuzin, Cell Fusion C, Torriden, Innisfree, COSRX, Laneige, Sulwhasoo, Missha, Etude House, The Saem, Banila Co, Illiyoon, Skin1004, Anua, Beauty of Joseon, Rovectin, Round Lab, Dr.Jart+, TONYMOLY, Holika Holika, Purito, Klairs, SNP, JMsolution, Some By Mi va boshqalar.

Har bir mahsulot uchun quyidagi formatda JSON array qaytaring:
[
  {
    "name": "Brend nomi + Mahsulot to'liq nomi (masalan: MEDIPEEL Glutathione 600)",
    "description": "QAT'IY SHART: Telegram kanal uchun quyidagi mukammal shablon strukturasida yozing, lekin faqat mazmunini shu MAHSULOTNING O'ZIGA moslab o'zgartiring (shablonni shunchaki ko'chirib qo'ymang!):\\n\\n[Mahsulotning qisqacha, ta'sirchan 1-2 jumlalik ta'rifi]\\n\\n📍 Kimlar uchun?\\n✔️ [Teri turi yoki muammo]\\n✔️ [Teri turi yoki muammo]\\n✔️ [Kutilyotgan natija qidirayotganlar]\\n\\n✨ [Asosiy foyda 1] — [izoh, qaysi modda hisobiga]\\n✨ [Asosiy foyda 2] — [izoh...]\\n✨ [Asosiy foyda 3] — [izoh...]\\n✨ [Tekstura / qo'shimcha foyda] — [izoh...]\\n\\n🧪 Asosiy tarkibiy qismlar\\n[Modda 1] – [teriga ta'siri]\\n[Modda 2] – [teriga ta'siri]\\n\\nHajmi: [bilganingizcha taxmin qiling (masalan: 50ml), yoki bo'sh joy qoldiring]\\n\\nNarxi: 235.000❌ 195.000✅\\n\\n@Farangiz_Azimovna",
    "searchQuery": "Inglizcha eng aniq qidiruv (qadoqdagi xuddi shu mahsulotning rasmini topish uchun eng to'g'ri so'rov)."
  }
]

DIQQAT: 
- BARCHA mahsulotlarni top, hech birini tashlab ketma!
- Faqat JSON array qaytar, boshqa matn yozma.
- Agar biror mahsulotni aniqlay olmasang ham, ko'rinishiga qarab eng yaqin nom ber.
      `;

      const MODELS = [
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-2.0-flash-lite',
        'gemini-flash-latest',
      ];

      let responseText = '';

      for (let i = 0; i < MODELS.length; i++) {
        const model = MODELS[i];
        const isLast = i === MODELS.length - 1;
        try {
          console.log(`Urinish: ${model}...`);
          const response = await ai.models.generateContent({
            model,
            contents: [
              prompt,
              { inlineData: { data: base64Data, mimeType: mimeType } },
            ],
            config: { responseMimeType: 'application/json' },
          });
          const text = response.text;
          if (text && text.trim().length > 2) {
            try {
              const parsed = JSON.parse(text);
              if (Array.isArray(parsed) && parsed.length > 0) {
                responseText = text;
                break;
              }
            } catch {
              console.warn(`Model ${model} noto'g'ri JSON qaytardi, keyingisi sinab ko'rilmoqda...`);
            }
          }
        } catch (modelErr: any) {
          const errMsg: string = modelErr?.message || String(modelErr);
          const statusMatch = errMsg.match(/\b(4\d\d|5\d\d)\b/);
          const statusCode = statusMatch ? Number(statusMatch[1]) : 0;
          console.error(`Model ${model} xatolik berdi (${statusCode || 'unknown'}):`, errMsg);
          const shouldFallback = [400, 404, 429, 500, 503].includes(statusCode) || statusCode >= 400;
          if (isLast) throw modelErr;
          if (!shouldFallback) throw modelErr;
        }
      }

      if (!responseText) throw new Error('Barcha modellar javob bera olmadi.');

      const parsedProducts = JSON.parse(responseText);
      const batchId = new Date().toISOString();

      const newProducts = await Promise.all(parsedProducts.map(async (p: any) => {
        let autoImageUrl = '';
        let autoImageUrls: string[] = [];
        try {
          const imgRes = await fetch(`/api/search-image?q=${encodeURIComponent(p.searchQuery)}`);
          if (imgRes.ok) {
            const imgData = await imgRes.json();
            autoImageUrl = imgData.imageUrl || '';
            autoImageUrls = imgData.imageUrls || [];
          }
        } catch (e) {
          console.error('Failed to auto-fetch image for', p.searchQuery);
        }

        return {
          id: Math.random().toString(36).substring(2, 11),
          name: p.name,
          description: p.description,
          searchQuery: p.searchQuery,
          imageUrl: autoImageUrl,
          imageUrls: autoImageUrls,
          status: 'idle',
          batchId: batchId,
        };
      }));

      setProducts(prev => [...newProducts, ...prev]);
      setSelectedImage(null);
    } catch (err: any) {
      console.error(err);
      setError("Rasmni tahlil qilishda xatolik yuz berdi. Iltimos qayta urinib ko'ring.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const sendToTelegram = async (product: Product) => {
    let imageUrl = product.imageUrl;
    let imageUrls = product.imageUrls || [];

    if (!imageUrl) {
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, status: 'sending' } : p));
      try {
        const imgRes = await fetch(`/api/search-image?q=${encodeURIComponent(product.searchQuery)}`);
        if (imgRes.ok) {
          const imgData = await imgRes.json();
          imageUrl = imgData.imageUrl || '';
          imageUrls = imgData.imageUrls || [];
        }
      } catch (e) {
        console.error('Auto image search failed', e);
      }

      if (!imageUrl) {
        showToast("Rasm internetdan topilmadi. Keyinroq urinib ko'ring.", 'error');
        setProducts(prev => prev.map(p => p.id === product.id ? { ...p, status: 'idle' } : p));
        return;
      }
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, imageUrl, imageUrls } : p));
    }

    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, status: 'sending' } : p));

    try {
      const text = `🛍 **${product.name}**\n\n${product.description}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 soniya
      let response: Response;
      try {
        response = await fetch('/api/telegram/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photo: imageUrl, photos: imageUrls, caption: text }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
      const data = await response.json();

      if (data.ok) {
        setProducts(prev => prev.map(p => p.id === product.id ? { ...p, status: 'success' } : p));
      } else {
        let errorMsg = data.description || "Telegramga yuborishda xatolik";
        if (errorMsg.includes("wrong type of the web page content") || errorMsg.includes("failed to get HTTP URL content")) {
          errorMsg = "Rasm ssilkasi noto'g'ri! Rasmning to'g'ridan-to'g'ri ssilkasini kiriting (.jpg yoki .png).";
        } else if (errorMsg.includes("chat not found")) {
          errorMsg = "Kanal topilmadi! Bot kanalda admin ekanligiga ishonch hosil qiling.";
        }
        throw new Error(errorMsg);
      }
    } catch (err: any) {
      console.error(err);
      showToast(`Xatolik: ${err.message}`, 'error');
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, status: 'error' } : p));
    }
  };

  const retryImageSearch = async (product: Product) => {
    try {
      const imgRes = await fetch(`/api/search-image?q=${encodeURIComponent(product.searchQuery)}`);
      if (imgRes.ok) {
        const imgData = await imgRes.json();
        const newUrl = imgData.imageUrl || '';
        const newUrls: string[] = imgData.imageUrls || [];
        if (newUrl) {
          setProducts(prev => prev.map(p => p.id === product.id ? { ...p, imageUrl: newUrl, imageUrls: newUrls } : p));
        }
      }
    } catch (err) {
      console.error('Failed to retry image search', err);
    }
  };

  const selectProductImage = async (product: Product, url: string) => {
    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, imageUrl: url } : p));
  };

  const deleteProduct = async (id: string) => {
    setProducts(prev => prev.filter(p => p.id !== id));
  };

  const deleteBatch = async (batchId: string, items: Product[]) => {
    setProducts(prev => prev.filter(p => p.batchId !== batchId));
    showToast(`${items.length} ta mahsulot o'chirildi`, 'info');
  };

  const sendBatchToTelegram = async (items: Product[]) => {
    const toSend = items.filter(p => p.status !== 'sending');
    if (toSend.length === 0) {
      showToast("Mahsulotlar hozirda yuborilmoqda, kuting...", 'info');
      return;
    }
    showToast(`${toSend.length} ta mahsulot Telegramga yuborilmoqda...`, 'info');
    for (const product of toSend) {
      await sendToTelegram(product);
      await new Promise(r => setTimeout(r, 1500));
    }
  };

  /* ─────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────── */
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>

      {/* ===== HEADER ===== */}
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="logo-icon">
            <Sparkles size={18} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1 }}>
              BeautyPost AI
            </div>
            <div className="hidden sm:block" style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400, marginTop: '2px' }}>
              Kosmetika tahlil & Telegram post
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setIsDarkTheme(!isDarkTheme)}
            style={{
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border)',
              borderRadius: '99px',
              padding: '5px 12px',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '12px',
              fontWeight: 500,
              transition: 'all 0.2s',
            }}
          >
            {isDarkTheme ? <Sun size={14} /> : <Moon size={14} />}
            <span className="hidden sm:inline-block">
              {isDarkTheme ? "Yorug'" : "Qorong'u"}
            </span>
          </button>
          <div className="stat-chip hidden sm:block">
            {products.length} mahsulot
          </div>
        </div>
      </header>

      {/* ===== MAIN ===== */}
      <main className="app-main">

        {/* ===== SIDEBAR ===== */}
        <aside className="app-sidebar">

          {/* Upload Zone */}
          {!selectedImage && (
            <div
              className="upload-zone"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              id="upload-zone"
              style={{
                padding: '32px 20px',
                textAlign: 'center',
                borderColor: isDragging ? 'var(--border-strong)' : undefined,
                background: isDragging ? 'var(--bg)' : undefined,
              }}
            >
              <div className="animate-float" style={{ fontSize: '36px', marginBottom: '12px' }}>📸</div>
              <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '5px', color: 'var(--text-primary)' }}>
                Mahsulot rasmini yuklang
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Ctrl+V — rasm joylang, yoki bu yerga tashlang
                <br />JPG, PNG, WEBP qo'llab-quvvatlanadi
              </div>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                marginTop: '14px',
                padding: '7px 16px',
                borderRadius: '99px',
                background: 'var(--accent)',
                fontSize: '12px',
                fontWeight: 600,
                color: '#fff',
                cursor: 'pointer',
              }}>
                <Upload size={12} /> Rasm tanlash
              </div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageUpload}
                accept="image/*"
                style={{ display: 'none' }}
                id="file-input"
              />
            </div>
          )}

          {/* Image Preview */}
          {selectedImage && (
            <div className="animate-fade-in glass-card" style={{ overflow: 'hidden' }}>
              <div style={{
                position: 'relative', maxHeight: '240px', overflow: 'hidden',
                display: 'flex', justifyContent: 'center',
                background: 'var(--bg-subtle)',
              }}>
                <img
                  src={selectedImage}
                  alt="Yuklangan rasm"
                  style={{ objectFit: 'contain', maxHeight: '240px', width: '100%' }}
                />
                <button
                  onClick={() => setSelectedImage(null)}
                  id="clear-image-btn"
                  style={{
                    position: 'absolute', top: '10px', right: '10px',
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-secondary)',
                    borderRadius: '6px',
                    padding: '5px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s',
                  }}
                >
                  <X size={13} />
                </button>
              </div>

              <div style={{ padding: '14px' }}>
                <button
                  onClick={analyzeImage}
                  disabled={isAnalyzing}
                  id="analyze-btn"
                  className="btn-brand"
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '7px',
                  }}
                >
                  {isAnalyzing ? (
                    <><Loader2 size={15} className="animate-spin-custom" /> AI tahlil qilmoqda...</>
                  ) : (
                    <><Zap size={15} /> Mahsulotlarni aniqlash</>
                  )}
                </button>
                {isAnalyzing && (
                  <p style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
                    Gemini AI rasmni o'rganmoqda...
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="alert-error animate-fade-in">
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
              <p>{error}</p>
            </div>
          )}
        </aside>

        {/* ===== PRODUCTS AREA ===== */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Section Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: '2px' }}>
                Aniqlangan mahsulotlar
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {products.length > 0 ? `${products.length} ta mahsulot topilgan` : "Hali mahsulot yo'q"}
              </p>
            </div>
            {products.length > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                fontSize: '12px', color: 'var(--text-muted)',
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                padding: '5px 10px',
              }}>
                <Package size={12} />
                Jami: {products.length}
              </div>
            )}
          </div>

          {/* Products by Batch */}
          {isLoading ? (
            <div style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              padding: '80px 20px', gap: '14px',
            }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '50%',
                border: '2px solid var(--border)',
                borderTopColor: 'var(--text-primary)',
                animation: 'spin 0.8s linear infinite',
              }} />
              <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Yuklanmoqda...</p>
            </div>
          ) : products.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 20px' }}>
              <div className="empty-icon">🧴</div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '6px' }}>Hali mahsulot yo'q</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', maxWidth: '300px', margin: '0 auto' }}>
                Chapdan rasm yuklang — AI kosmetika mahsulotlarini avtomatik aniqlaydi.
              </p>
            </div>
          ) : (
            (() => {
              const batches: { batchId: string; items: Product[] }[] = [];
              const batchMap = new Map<string, Product[]>();
              products.forEach(p => {
                const key = p.batchId || 'unknown';
                if (!batchMap.has(key)) {
                  batchMap.set(key, []);
                  batches.push({ batchId: key, items: batchMap.get(key)! });
                }
                batchMap.get(key)!.push(p);
              });

              return batches.map((batch, batchIdx) => {
                const batchDate = batch.batchId !== 'unknown' ? new Date(batch.batchId) : null;
                const months = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];
                const dateStr = batchDate
                  ? `${batchDate.getDate()} ${months[batchDate.getMonth()]}, ${batchDate.getFullYear()}`
                  : "Noma'lum sana";
                const timeStr = batchDate
                  ? batchDate.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })
                  : '';

                return (
                  <div key={batch.batchId} className="animate-fade-in" style={{
                    marginBottom: batchIdx < batches.length - 1 ? '24px' : 0,
                  }}>
                    {/* Batch Header */}
                    <div
                      className={`batch-header ${collapsedBatches.has(batch.batchId) ? 'collapsed' : ''}`}
                      onClick={() => toggleBatch(batch.batchId)}
                    >
                      <div className="batch-icon">📦</div>

                      <div className="batch-info">
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {dateStr}
                          {timeStr && <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: '8px', fontSize: '12px' }}>{timeStr}</span>}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>
                          {batch.items.length} ta mahsulot
                        </div>
                      </div>

                      <div className="batch-actions">
                        <div className="stat-chip">
                          {batch.items.filter(p => p.status === 'success').length}/{batch.items.length}
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); sendBatchToTelegram(batch.items); }}
                          title="Hammasini Telegramga yuborish"
                          className="batch-action-btn send-btn"
                        >
                          <Send size={13} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation(); showConfirm(
                              `${batch.items.length} ta mahsulotni o'chirish`,
                              `Ushbu guruhdagi barcha mahsulotlar butunlay o'chiriladi.`,
                              () => deleteBatch(batch.batchId, batch.items)
                            );
                          }}
                          title="Hammasini o'chirish"
                          className="batch-action-btn delete-btn"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      <ChevronDown
                        size={16}
                        className="batch-chevron"
                        style={{ transform: collapsedBatches.has(batch.batchId) ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                      />
                    </div>

                    {/* Batch Products Grid */}
                    {!collapsedBatches.has(batch.batchId) && (
                      <div className="products-grid">
                        {batch.items.map((product, index) => (
                          <div
                            key={product.id}
                            className="product-card animate-fade-in"
                            id={`product-card-${product.id}`}
                            style={{ animationDelay: `${index * 50}ms` }}
                          >
                            {/* Product Image */}
                            <div className="product-image-container">
                              <span className="badge-ai" style={{ position: 'absolute', top: '9px', left: '9px', zIndex: 2 }}>
                                AI
                              </span>
                              <button
                                onClick={() => showConfirm(
                                  "Mahsulotni o'chirish",
                                  `"${product.name}" o'chiriladi. Davom etasizmi?`,
                                  () => deleteProduct(product.id)
                                )}
                                id={`delete-btn-${product.id}`}
                                title="O'chirish"
                                className="delete-btn"
                                style={{
                                  position: 'absolute', top: '9px', right: '9px', zIndex: 2,
                                  background: 'var(--bg)',
                                  border: '1px solid var(--border)',
                                  color: 'var(--text-muted)',
                                  borderRadius: '6px', padding: '5px',
                                  cursor: 'pointer', display: 'flex',
                                  transition: 'all 0.15s',
                                }}
                              >
                                <Trash2 size={13} />
                              </button>

                              {(() => {
                                const imgs = product.imageUrls && product.imageUrls.length > 0
                                  ? product.imageUrls
                                  : product.imageUrl
                                    ? [product.imageUrl]
                                    : [];
                                const idx = carouselIndexes[product.id] ?? 0;
                                const safeIdx = Math.min(idx, Math.max(0, imgs.length - 1));
                                const setIdx = (n: number) =>
                                  setCarouselIndexes(prev => ({ ...prev, [product.id]: n }));

                                if (imgs.length === 0) {
                                  return (
                                    <div
                                      onClick={() => retryImageSearch(product)}
                                      style={{
                                        width: '100%', height: '100%',
                                        display: 'flex', flexDirection: 'column',
                                        alignItems: 'center', justifyContent: 'center',
                                        background: 'var(--bg-subtle)',
                                        color: 'var(--text-muted)',
                                        cursor: 'pointer',
                                        fontSize: '12px', gap: '6px',
                                      }}>
                                      <RefreshCw size={20} style={{ opacity: 0.4 }} />
                                      Rasmni qayta qidirish
                                    </div>
                                  );
                                }

                                return (
                                  <>
                                    <img
                                      src={imgs[safeIdx]}
                                      alt={product.name}
                                      style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.3s ease' }}
                                      onError={() => {
                                        // Keyingi rasmga o'tish
                                        const nextIdx = safeIdx + 1;
                                        if (nextIdx < imgs.length) {
                                          setIdx(nextIdx);
                                        } else {
                                          // Barcha rasmlar buzilgan — URL'larni tozalab qayta qidirish
                                          setProducts(prev => prev.map(p =>
                                            p.id === product.id ? { ...p, imageUrl: '', imageUrls: [] } : p
                                          ));
                                          retryImageSearch(product);
                                        }
                                      }}
                                    />
                                    {imgs.length > 1 && (
                                      <>
                                        <button
                                          className="carousel-arrow"
                                          onClick={e => { e.stopPropagation(); setIdx((safeIdx - 1 + imgs.length) % imgs.length); }}
                                          style={{ left: '7px' }}
                                        >
                                          <ChevronLeft size={13} color="var(--text-primary)" />
                                        </button>
                                        <button
                                          className="carousel-arrow"
                                          onClick={e => { e.stopPropagation(); setIdx((safeIdx + 1) % imgs.length); }}
                                          style={{ right: '7px' }}
                                        >
                                          <ChevronRight size={13} color="var(--text-primary)" />
                                        </button>

                                        {/* Dot indicators */}
                                        <div style={{
                                          position: 'absolute', bottom: '7px', left: 0, right: 0,
                                          display: 'flex', justifyContent: 'center', gap: '4px', zIndex: 4,
                                        }}>
                                          {imgs.map((_, i) => (
                                            <span
                                              key={i}
                                              onClick={e => { e.stopPropagation(); setIdx(i); }}
                                              style={{
                                                width: i === safeIdx ? '16px' : '5px',
                                                height: '5px',
                                                borderRadius: '99px',
                                                background: i === safeIdx ? 'var(--accent)' : 'rgba(255,255,255,0.6)',
                                                cursor: 'pointer',
                                                transition: 'width 0.2s ease',
                                                display: 'inline-block',
                                              }}
                                            />
                                          ))}
                                        </div>

                                        {/* Counter */}
                                        <div style={{
                                          position: 'absolute', top: '9px', right: '38px',
                                          zIndex: 5, background: 'rgba(0,0,0,0.45)',
                                          borderRadius: '4px', padding: '2px 6px',
                                          fontSize: '10px', fontWeight: 600, color: '#fff',
                                        }}>
                                          {safeIdx + 1}/{imgs.length}
                                        </div>
                                      </>
                                    )}
                                  </>
                                );
                              })()}
                            </div>

                            {/* Product Info */}
                            <div style={{ padding: '14px', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              <h3 style={{ fontSize: '14px', fontWeight: 600, lineHeight: 1.35, color: 'var(--text-primary)' }}>
                                {product.name}
                              </h3>
                              <div style={{
                                fontSize: '12px', color: 'var(--text-secondary)',
                                lineHeight: 1.65, flex: 1, whiteSpace: 'pre-wrap',
                                maxHeight: '110px', overflow: 'auto',
                              }}>
                                {product.description}
                              </div>

                              <div className="divider" />

                              <button
                                onClick={() => sendToTelegram(product)}
                                disabled={product.status === 'sending'}
                                id={`send-btn-${product.id}`}
                                className={`btn-telegram${product.status === 'success' ? ' success' : ''}`}
                                style={{
                                  width: '100%', padding: '10px 12px',
                                  borderRadius: '8px', fontSize: '12px',
                                  display: 'flex', alignItems: 'center',
                                  justifyContent: 'center', gap: '6px',
                                }}
                              >
                                {product.status === 'success' ? (
                                  <><RefreshCw size={13} /> Qayta yuborish</>
                                ) : product.status === 'sending' ? (
                                  <><Loader2 size={13} className="animate-spin-custom" /> Yuborilmoqda</>
                                ) : (
                                  <><Send size={13} /> Telegramga yuborish</>
                                )}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              });
            })()
          )}
        </section>
      </main>

      {/* ===== CONFIRM MODAL ===== */}
      {confirmModal.isOpen && (
        <div
          onClick={closeConfirm}
          style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.4)',
            animation: 'modalOverlayIn 0.2s ease',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '380px',
              width: '90%',
              boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
              animation: 'modalContentIn 0.25s ease',
              textAlign: 'center',
            }}
          >
            <div style={{
              width: '52px', height: '52px', borderRadius: '50%',
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 18px',
            }}>
              <Trash2 size={22} color="var(--text-secondary)" />
            </div>

            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
              {confirmModal.title}
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '24px' }}>
              {confirmModal.message}
            </p>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={closeConfirm}
                style={{
                  flex: 1, padding: '11px 16px', borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-subtle)', color: 'var(--text-primary)',
                  fontSize: '13px', fontWeight: 500, cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                Bekor qilish
              </button>
              <button
                onClick={() => { confirmModal.onConfirm(); closeConfirm(); }}
                style={{
                  flex: 1, padding: '11px 16px', borderRadius: '8px',
                  border: 'none',
                  background: 'var(--accent)', color: 'var(--bg)',
                  fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                Ha, o'chirish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== FOOTER ===== */}
      <footer style={{
        borderTop: '1px solid var(--border)',
        padding: '14px 24px',
        textAlign: 'center',
        fontSize: '11px',
        color: 'var(--text-muted)',
        letterSpacing: '0.01em',
      }}>
        BeautyPost AI · Gemini 2.5 Flash · {new Date().getFullYear()}
      </footer>

      {/* ===== TOAST NOTIFICATIONS ===== */}
      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className="animate-fade-in toast-item"
              style={{
                pointerEvents: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '12px 16px',
                borderRadius: '10px',
                background: 'var(--accent)',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--bg)',
              }}
            >
              {toast.type === 'error' ? (
                <AlertCircle size={15} style={{ flexShrink: 0 }} />
              ) : toast.type === 'success' ? (
                <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
              ) : (
                <span style={{ fontSize: '14px' }}>✦</span>
              )}
              <span style={{ flex: 1 }}>{toast.message}</span>
              <button
                onClick={() => removeToast(toast.id)}
                style={{
                  background: 'none', border: 'none',
                  cursor: 'pointer', color: 'inherit',
                  opacity: 0.6, padding: '2px', display: 'flex', flexShrink: 0,
                }}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
