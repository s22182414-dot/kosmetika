import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import {
  Upload, Send, Image as ImageIcon, Search, Loader2,
  CheckCircle2, AlertCircle, Trash2, Sparkles, X,
  Package, Zap, RefreshCw, ChevronDown, ChevronLeft, ChevronRight,
  Sun, Moon, Download
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
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);

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
    
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Faqat shu sessiyada yopilmagan bo'lsa ko'rsatish
      if (!sessionStorage.getItem('installPromptDismissed')) {
        setShowInstallPrompt(true);
      }
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setShowInstallPrompt(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

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

    const handleWindowDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

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
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt as any);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setShowInstallPrompt(false);
    }
  };

  const closeInstallPrompt = () => {
    setShowInstallPrompt(false);
    sessionStorage.setItem('installPromptDismissed', 'true');
  };

  const fetchProducts = async () => {
    try {
      // Simulate slight loading delay for UX
      await new Promise(r => setTimeout(r, 300));
      const data = getLocalProducts();
      _setProducts(data);
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
    "description": "QAT'IY SHART: Telegram kanal uchun quyidagi mukammal shablon strukturasida yozing, lekin faqat mazmunini shu MAHSULOTNING O'ZIGA moslab o'zgartiring (shablonni shunchaki ko'chirib qo'ymang!):\n\n[Mahsulotning qisqacha, ta'sirchan 1-2 jumlalik ta'rifi]\n\n📍 Kimlar uchun?\n✔️ [Teri turi yoki muammo]\n✔️ [Teri turi yoki muammo]\n✔️ [Kutilyotgan natija qidirayotganlar]\n\n✨ [Asosiy foyda 1] — [izoh, qaysi modda hisobiga]\n✨ [Asosiy foyda 2] — [izoh...]\n✨ [Asosiy foyda 3] — [izoh...]\n✨ [Tekstura / qo'shimcha foyda] — [izoh...]\n\n🧪 Asosiy tarkibiy qismlar\n[Modda 1] – [teriga ta'siri]\n[Modda 2] – [teriga ta'siri]\n\nHajmi: [bilganingizcha taxmin qiling (masalan: 50ml), yoki bo'sh joy qoldiring]\n\nNarxi: 235.000❌ 195.000✅\n\n@Farangiz_Azimovna",
    "searchQuery": "Inglizcha eng aniq qidiruv (qadoqdagi xuddi shu mahsulotning rasmini topish uchun eng to'g'ri so'rov)."
  }
]

DIQQAT: 
- BARCHA mahsulotlarni top, hech birini tashlab ketma!
- Faqat JSON array qaytar, boshqa matn yozma.
- Agar biror mahsulotni aniqlay olmasang ham, ko'rinishiga qarab eng yaqin nom ber.
      `;

      // Model fallback chain — kichikdan kattaga (tezdan kuchliroqqa)
      const MODELS = [
        'gemini-2.5-flash',       // Yangi, tezkor model
        'gemini-2.0-flash',       // Hozirgi eng tezkor va barqaror model
        'gemini-2.0-flash-lite',  // Yengil, kvota tejash uchun ajoyib
        'gemini-flash-latest',    // Eng so'nggi muqobil model
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
          // Validate: must be non-empty and parseable JSON array
          if (text && text.trim().length > 2) {
            try {
              const parsed = JSON.parse(text);
              if (Array.isArray(parsed) && parsed.length > 0) {
                responseText = text;
                break;
              }
            } catch {
              // Not valid JSON — try next model
              console.warn(`Model ${model} noto'g'ri JSON qaytardi, keyingisi sinab ko'rilmoqda...`);
            }
          }
        } catch (modelErr: any) {
          // Extract HTTP status code from error message if available
          const errMsg: string = modelErr?.message || String(modelErr);
          const statusMatch = errMsg.match(/\b(4\d\d|5\d\d)\b/);
          const statusCode = statusMatch ? Number(statusMatch[1]) : 0;

          console.error(`Model ${model} xatolik berdi (${statusCode || 'unknown'}):`, errMsg);

          // Always continue to next model on: 429 (quota), 503 (server error),
          // 404 (model not found), 400 (bad request), 500 (internal)
          const shouldFallback = [400, 404, 429, 500, 503].includes(statusCode) || statusCode >= 400;

          if (isLast) throw modelErr;          // All models exhausted
          if (!shouldFallback) throw modelErr; // Unknown fatal error — stop
          // Otherwise: continue to next model silently
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

    // Agar rasm URL bo'sh bo'lsa, avtomatik qidiramiz
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

      // Topilgan rasmni saqlash
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, imageUrl, imageUrls } : p));
    }

    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, status: 'sending' } : p));

    try {
      const text = `🛍 **${product.name}**\n\n${product.description}`;
      const response = await fetch('/api/telegram/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo: imageUrl, photos: imageUrls, caption: text }),
      });
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
      // Har bir yuborishdan keyin 1.5 soniya kutish (Telegram rate limit uchun)
      await new Promise(r => setTimeout(r, 1500));
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* ===== HEADER ===== */}
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className="logo-icon scale-90 sm:scale-100">
            <Sparkles size={20} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              <span className="gradient-text">BeautyPost</span>
              <span style={{ color: 'var(--text-primary)', marginLeft: 2 }}>AI</span>
            </div>
            <div className="hidden sm:block" style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>
              Kosmetika tahlil & Telegram post
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button 
            onClick={() => setIsDarkTheme(!isDarkTheme)}
            style={{
              background: 'var(--surface-hover)',
              border: '1px solid var(--surface-card-border)',
              borderRadius: '99px',
              padding: '6px 14px',
              cursor: 'pointer',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              fontWeight: 600,
              justifyContent: 'center',
              transition: 'all 0.2s',
            }}
          >
            {isDarkTheme ? <Sun size={16} /> : <Moon size={16} />}
            <span className="hidden sm:inline-block">
              {isDarkTheme ? "Yorug' rejim" : "Tungi rejim"}
            </span>
          </button>
          <div className="stat-chip hidden sm:block">
            <span>{products.length} ta mahsulot</span>
          </div>
        </div>
      </header>

      {/* ===== MAIN ===== */}
      <main className="app-main">

        {/* ===== SIDEBAR ===== */}
        <aside className="app-sidebar">

          {/* Upload Zone — only show when no image is selected */}
          {!selectedImage && (
            <div
              className="upload-zone"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              id="upload-zone"
              style={{
                padding: '36px 24px',
                textAlign: 'center',
                borderColor: isDragging ? 'rgba(168,85,247,0.8)' : undefined,
                background: isDragging ? 'rgba(168,85,247,0.12)' : undefined,
              }}
            >
              <div className="animate-float" style={{ fontSize: '44px', marginBottom: '12px' }}>📸</div>
              <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px', color: 'var(--text-primary)' }}>
                Mahsulot rasmini yuklang
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Ctrl+V bosib rasm joylang, yoki tashlang
                <br />JPG, PNG, WEBP qo'llab-quvvatlanadi
              </div>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                marginTop: '16px',
                padding: '8px 18px',
                borderRadius: '99px',
                background: 'rgba(147,51,234,0.1)',
                border: '1px solid rgba(147,51,234,0.25)',
                fontSize: '12px',
                fontWeight: 600,
                color: '#7c3aed',
              }}>
                <Upload size={13} /> Rasm tanlash
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
              <div style={{ position: 'relative', maxHeight: '260px', overflow: 'hidden', display: 'flex', justifyContent: 'center', background: 'rgba(0,0,0,0.05)' }}>
                <img
                  src={selectedImage}
                  alt="Yuklangan rasm"
                  style={{ objectFit: 'contain', maxHeight: '260px', width: '100%' }}
                />
                <button
                  onClick={() => { setSelectedImage(null); }}
                  id="clear-image-btn"
                  style={{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    background: 'rgba(255,255,255,0.92)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(147,51,234,0.15)',
                    color: 'var(--text-secondary)',
                    borderRadius: '8px',
                    padding: '6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s',
                  }}
                >
                  <X size={14} />
                </button>
              </div>

              <div style={{ padding: '16px' }}>
                  <button
                    onClick={analyzeImage}
                    disabled={isAnalyzing}
                    id="analyze-btn"
                    className="btn-brand"
                    style={{
                      width: '100%',
                      padding: '14px',
                      borderRadius: '12px',
                      fontSize: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                    }}
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 size={16} className="animate-spin-custom" />
                        AI tahlil qilmoqda...
                      </>
                    ) : (
                      <>
                        <Zap size={16} />
                        Mahsulotlarni aniqlash
                      </>
                    )}
                  </button>
                  {isAnalyzing && (
                    <p style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)', marginTop: '10px' }}>
                      Gemini AI rasmni o'rganmoqda...
                    </p>
                  )}
                </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="alert-error animate-fade-in">
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
              <p>{error}</p>
            </div>
          )}
        </aside>

        {/* ===== PRODUCTS AREA ===== */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Section Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '2px' }}>
                Aniqlangan mahsulotlar
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                {products.length > 0 ? `${products.length} ta mahsulot topilgan` : "Hali mahsulot yo'q"}
              </p>
            </div>
            {products.length > 0 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                color: 'var(--text-muted)',
                background: 'rgba(147,51,234,0.05)',
                border: '1px solid rgba(147,51,234,0.12)',
                borderRadius: '8px',
                padding: '6px 12px',
              }}>
                <Package size={13} />
                Jami: {products.length}
              </div>
            )}
          </div>

          {/* Products by Batch */}
          {isLoading ? (
            <div style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              padding: '80px 20px', gap: '16px',
            }}>
              <div style={{
                width: '52px', height: '52px', borderRadius: '50%',
                border: '3px solid rgba(147,51,234,0.15)',
                borderTopColor: '#9333ea',
                animation: 'spin 0.9s linear infinite',
              }} />
              <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Mahsulotlar yuklanmoqda...</p>
            </div>
          ) : products.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 20px' }}>
              <div className="empty-icon">🧴</div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>Hali mahsulot yo'q</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', maxWidth: '320px', margin: '0 auto' }}>
                Chapdan rasm yuklang va AI avtomatik kosmetika mahsulotlarini aniqlab beradi.
              </p>
            </div>
          ) : (
            (() => {
              // Group products by batchId
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
                const months = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
                const dateStr = batchDate
                  ? `${batchDate.getDate()}-${months[batchDate.getMonth()]}, ${batchDate.getFullYear()}-yil`
                  : 'Noma\'lum sana';
                const timeStr = batchDate
                  ? batchDate.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })
                  : '';

                return (
                  <div key={batch.batchId} className="animate-fade-in" style={{
                    marginBottom: batchIdx < batches.length - 1 ? '28px' : 0,
                  }}>
                    {/* Batch Header */}
                    <div
                      className={`batch-header ${collapsedBatches.has(batch.batchId) ? 'collapsed' : ''}`}
                      onClick={() => toggleBatch(batch.batchId)}
                    >
                      <div className="batch-icon">
                        📦
                      </div>
                      
                      <div className="batch-info">
                        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {dateStr}
                          {timeStr && <span style={{ fontWeight: 500, color: 'var(--text-muted)', marginLeft: '8px', fontSize: '12px' }}>⏰ {timeStr}</span>}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '1px' }}>
                          {batch.items.length} ta mahsulot aniqlangan
                        </div>
                      </div>

                      <div className="batch-actions">
                        <div className="stat-chip">
                          {batch.items.filter(p => p.status === 'success').length}/{batch.items.length} yuborilgan
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); sendBatchToTelegram(batch.items); }}
                          title="Hammasini Telegramga yuborish"
                          className="batch-action-btn send-btn"
                        >
                          <Send size={14} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation(); showConfirm(
                              `${batch.items.length} ta mahsulotni o'chirish`,
                              `Ushbu guruhdagi barcha mahsulotlar butunlay o'chiriladi. Bu amalni ortga qaytarib bo'lmaydi.`,
                              () => deleteBatch(batch.batchId, batch.items)
                            );
                          }}
                          title="Hammasini o'chirish"
                          className="batch-action-btn delete-btn"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      
                      <ChevronDown
                        size={18}
                        className="batch-chevron"
                        style={{
                          transform: collapsedBatches.has(batch.batchId) ? 'rotate(-90deg)' : 'rotate(0deg)',
                        }}
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
                            style={{ animationDelay: `${index * 60}ms` }}
                          >
                            {/* Product Image */}
                            <div className="product-image-container">
                              <span className="badge-ai" style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 2 }}>
                                ✦ AI
                              </span>
                              <button
                                onClick={() => showConfirm(
                                  'Mahsulotni o\'chirish',
                                  `"${product.name}" mahsuloti butunlay o\'chiriladi. Davom etasizmi?`,
                                  () => deleteProduct(product.id)
                                )}
                                id={`delete-btn-${product.id}`}
                                title="O'chirish"
                                style={{
                                  position: 'absolute', top: '10px', right: '10px', zIndex: 2,
                                  background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)',
                                  border: '1px solid rgba(239,68,68,0.25)',
                                  color: '#dc2626', borderRadius: '8px', padding: '6px',
                                  cursor: 'pointer', display: 'flex', opacity: 0,
                                  transition: 'opacity 0.2s',
                                }}
                                className="delete-btn"
                              >
                                <Trash2 size={14} />
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
                                        background: 'linear-gradient(135deg, rgba(147,51,234,0.06), rgba(196,132,252,0.06))',
                                        color: 'var(--text-muted)',
                                        cursor: 'pointer',
                                      }}>
                                      <RefreshCw size={24} style={{ opacity: 0.4, marginBottom: '6px' }} />
                                      <span style={{ fontSize: '11px' }}>Rasmni qayta qidirish</span>
                                    </div>
                                  );
                                }

                                return (
                                  <>
                                    {/* Main image */}
                                    <img
                                      src={imgs[safeIdx]}
                                      alt={product.name}
                                      style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'opacity 0.25s ease' }}
                                    />

                                    {/* Arrows — only if more than 1 image */}
                                    {imgs.length > 1 && (
                                      <>
                                        <button
                                          className="carousel-arrow"
                                          onClick={e => { e.stopPropagation(); setIdx((safeIdx - 1 + imgs.length) % imgs.length); }}
                                          style={{
                                            position: 'absolute', left: '8px', top: '50%',
                                            transform: 'translateY(-50%)',
                                            zIndex: 4, background: 'rgba(255,255,255,0.88)',
                                            backdropFilter: 'blur(6px)', border: 'none',
                                            borderRadius: '50%', width: '28px', height: '28px',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                                            transition: 'transform 0.15s, background 0.15s',
                                          }}
                                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,1)')}
                                          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.88)')}
                                        >
                                          <ChevronLeft size={15} color="#6d28d9" />
                                        </button>
                                        <button
                                          className="carousel-arrow"
                                          onClick={e => { e.stopPropagation(); setIdx((safeIdx + 1) % imgs.length); }}
                                          style={{
                                            position: 'absolute', right: '8px', top: '50%',
                                            transform: 'translateY(-50%)',
                                            zIndex: 4, background: 'rgba(255,255,255,0.88)',
                                            backdropFilter: 'blur(6px)', border: 'none',
                                            borderRadius: '50%', width: '28px', height: '28px',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                                            transition: 'transform 0.15s, background 0.15s',
                                          }}
                                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,1)')}
                                          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.88)')}
                                        >
                                          <ChevronRight size={15} color="#6d28d9" />
                                        </button>

                                        {/* Dot indicators */}
                                        <div style={{
                                          position: 'absolute', bottom: '8px', left: 0, right: 0,
                                          display: 'flex', justifyContent: 'center', gap: '5px', zIndex: 4,
                                        }}>
                                          {imgs.map((_, i) => (
                                            <span
                                              key={i}
                                              onClick={e => { e.stopPropagation(); setIdx(i); }}
                                              style={{
                                                width: i === safeIdx ? '18px' : '6px',
                                                height: '6px',
                                                borderRadius: '99px',
                                                background: i === safeIdx ? '#9333ea' : 'rgba(255,255,255,0.7)',
                                                cursor: 'pointer',
                                                transition: 'width 0.25s ease, background 0.2s',
                                                display: 'inline-block',
                                              }}
                                            />
                                          ))}
                                        </div>

                                        {/* Counter badge */}
                                        <div style={{
                                          position: 'absolute', top: '10px', right: '10px',
                                          zIndex: 5, background: 'rgba(0,0,0,0.5)',
                                          backdropFilter: 'blur(6px)',
                                          borderRadius: '99px', padding: '2px 8px',
                                          fontSize: '10px', fontWeight: 700, color: '#fff',
                                          letterSpacing: '0.04em',
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
                            <div style={{ padding: '18px', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              <h3 style={{ fontSize: '15px', fontWeight: 700, lineHeight: 1.3, color: 'var(--text-primary)' }}>
                                {product.name}
                              </h3>
                              <div style={{
                                fontSize: '12.5px', color: 'var(--text-secondary)',
                                lineHeight: 1.65, flex: 1, whiteSpace: 'pre-wrap',
                                maxHeight: '120px', overflow: 'auto',
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
                                  width: '100%', padding: '11px 12px',
                                  borderRadius: '10px', fontSize: '13px',
                                  display: 'flex', alignItems: 'center',
                                  justifyContent: 'center', gap: '6px',
                                }}
                              >
                                {product.status === 'success' ? (
                                  <><RefreshCw size={14} /> Qayta yuborish</>
                                ) : product.status === 'sending' ? (
                                  <><Loader2 size={14} className="animate-spin-custom" /> Yuborilmoqda</>
                                ) : (
                                  <><Send size={14} /> Telegramga yuborish</>
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
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.35)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            animation: 'modalOverlayIn 0.25s ease',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--surface-card)',
              borderRadius: '20px',
              padding: '24px',
              maxWidth: '400px',
              width: '90%',
              boxShadow: '0 25px 60px rgba(0,0,0,0.18), 0 0 0 1px rgba(147,51,234,0.08)',
              animation: 'modalContentIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
              textAlign: 'center',
            }}
          >
            {/* Warning Icon */}
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(239,68,68,0.1), rgba(239,68,68,0.2))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
            }}>
              <Trash2 size={28} color="#dc2626" />
            </div>

            {/* Title */}
            <h3 style={{
              fontSize: '18px',
              fontWeight: 800,
              color: 'var(--text-primary)',
              marginBottom: '10px',
              letterSpacing: '-0.02em',
            }}>
              {confirmModal.title}
            </h3>

            {/* Message */}
            <p style={{
              fontSize: '14px',
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
              marginBottom: '28px',
            }}>
              {confirmModal.message}
            </p>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={closeConfirm}
                style={{
                  flex: 1,
                  padding: '13px 20px',
                  borderRadius: '12px',
                  border: '1.5px solid var(--surface-card-border)',
                  background: 'var(--surface-bg)',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.background = 'var(--surface-hover)';
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.background = 'var(--surface-bg)';
                }}
              >
                Bekor qilish
              </button>
              <button
                onClick={() => { confirmModal.onConfirm(); closeConfirm(); }}
                style={{
                  flex: 1,
                  padding: '13px 20px',
                  borderRadius: '12px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 4px 14px rgba(239,68,68,0.35)',
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.transform = 'translateY(-1px)';
                  (e.target as HTMLElement).style.boxShadow = '0 6px 20px rgba(239,68,68,0.45)';
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.transform = 'translateY(0)';
                  (e.target as HTMLElement).style.boxShadow = '0 4px 14px rgba(239,68,68,0.35)';
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
        borderTop: '1px solid var(--surface-card-border)',
        padding: '16px 24px',
        textAlign: 'center',
        fontSize: '12px',
        color: 'var(--text-muted)',
      }}>
        BeautyPost AI · Gemini 2.5 Flash tomonidan quvvatlanadi · {new Date().getFullYear()}
      </footer>

      {/* ===== INSTALL PWA PROMPT ===== */}
      {showInstallPrompt && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.35)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            animation: 'modalOverlayIn 0.25s ease',
          }}
        >
          <div style={{
            background: 'var(--surface-card)',
            border: '1.5px solid var(--surface-card-border)',
            borderRadius: '20px',
            padding: '24px',
            boxShadow: '0 25px 60px rgba(0,0,0,0.18), 0 0 0 1px rgba(147,51,234,0.08)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            maxWidth: '380px',
            width: '90%',
            animation: 'modalContentIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}>
            <div style={{
              width: '64px', height: '64px', borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--brand-500), var(--pink-500))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', marginBottom: '20px',
              boxShadow: '0 8px 16px rgba(168, 85, 247, 0.25)',
            }}>
              <Download size={28} />
            </div>
            
            <h4 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 8px', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              Ilovani o'rnatish
            </h4>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 24px', lineHeight: 1.5 }}>
              Tezroq ishlashi va qulay bo'lishi uchun BeautyPost ilovasini qurilmangizga o'rnating.
            </p>
            
            <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
              <button
                onClick={closeInstallPrompt}
                style={{
                  flex: 1, padding: '12px', borderRadius: '12px',
                  background: 'var(--surface-bg)', color: 'var(--text-primary)',
                  border: '1.5px solid var(--surface-card-border)', fontSize: '14px', fontWeight: 600,
                  cursor: 'pointer', transition: 'all 0.2s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface-bg)')}
              >
                Keyinroq
              </button>
              <button
                onClick={handleInstallClick}
                className="btn-brand"
                style={{
                  flex: 1, padding: '12px', borderRadius: '12px',
                  fontSize: '14px', whiteSpace: 'nowrap'
                }}
              >
                O'rnatish
              </button>
            </div>
          </div>
        </div>
      )}

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
                padding: '14px 20px',
                borderRadius: '14px',
                background: toast.type === 'error'
                  ? 'linear-gradient(135deg, #fef2f2, #fff1f2)'
                  : toast.type === 'success'
                    ? 'linear-gradient(135deg, #f0fdf4, #ecfdf5)'
                    : 'linear-gradient(135deg, #f5f3ff, #faf5ff)',
                border: `1.5px solid ${toast.type === 'error' ? 'rgba(239,68,68,0.25)'
                    : toast.type === 'success' ? 'rgba(34,197,94,0.25)'
                      : 'rgba(147,51,234,0.2)'
                  }`,
                boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
                fontSize: '13px',
                fontWeight: 500,
                color: toast.type === 'error' ? '#b91c1c'
                  : toast.type === 'success' ? '#15803d'
                    : '#6d28d9',
              }}
            >
              {toast.type === 'error' ? (
                <AlertCircle size={18} style={{ flexShrink: 0 }} />
              ) : toast.type === 'success' ? (
                <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
              ) : (
                <Sparkles size={18} style={{ flexShrink: 0 }} />
              )}
              <span style={{ flex: 1 }}>{toast.message}</span>
              <button
                onClick={() => removeToast(toast.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'inherit',
                  opacity: 0.5,
                  padding: '2px',
                  display: 'flex',
                  flexShrink: 0,
                }}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
