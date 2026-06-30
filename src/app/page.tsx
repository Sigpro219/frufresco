import { getVisibleProducts, getAppSettings, getWebCategories } from '../lib/data';
import { type Product } from '../lib/supabase';
import SearchBar from '../components/SearchBar';
import Link from 'next/link';
import Image from 'next/image';
import FeaturedProductsCarousel from '../components/FeaturedProductsCarousel';
import { Building2, ShoppingCart, Timer, Sprout, Coins, Flame, Apple, Leaf, Carrot, Milk, Package, LayoutGrid, ArrowRight } from 'lucide-react';
import { CATEGORY_MAP, REVERSE_CATEGORY_MAP } from '../lib/constants';
import { translations, Locale } from '../lib/translations';
import { Suspense } from 'react';
import ProductGridContainer from '../components/ProductGridContainer';
import ProductSkeleton from '../components/ProductSkeleton';
import HeroActions from '../components/HeroActions';

export const revalidate = 3600; // Revalidate every hour

// --- SUB-COMPONENTS FOR STREAMING ---

async function CategoryPills({ category, q, locale }: { category?: string, q?: string, locale: Locale }) {
    const t = translations[locale];
    const dynamicCategories = await getWebCategories();
    
    const getCategoryName = (cat: string) => {
        if (cat === 'Todos') return t.allCategories;
        const code = REVERSE_CATEGORY_MAP[cat] || cat.toUpperCase();
        return (t.categories as any)[code] || cat;
    };

    return (
        <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '0.6rem',
            marginTop: '1.5rem',
            maxWidth: '1200px',
            margin: '1.5rem auto 0',
            width: '100%',
            padding: '0 1rem'
        }}>
            {dynamicCategories.map((cat: string) => (
                <Link
                    key={cat}
                    href={`/?${new URLSearchParams({
                        ...(q ? { q } : {}),
                        category: cat,
                        lang: locale === 'en' ? 'en' : 'es'
                    }).toString()}#catalog`}
                    scroll={false}
                    className={`category-pill ${((!category && cat === 'Todos') || category === cat) ? 'active' : ''}`}
                >
                    {getCategoryName(cat)}
                </Link>
            ))}
        </div>
    );
}

async function FeaturedSection({ locale }: { locale: Locale }) {
    const t = translations[locale];
    
    // Fetch products from cache
    const allVisible = await getVisibleProducts();

    if (!allVisible || allVisible.length === 0) return null;

    // Featured Logic
    const featuredProducts: Product[] = [];
    const catCount: Record<string, number> = {};
    const dailySeed = new Date().getDate();
    
    const sorted = [...allVisible].sort((a, b) => {
        const scoreA = (parseInt(a.id.slice(0, 8), 16) || a.name.length) * dailySeed;
        const scoreB = (parseInt(b.id.slice(0, 8), 16) || b.name.length) * dailySeed;
        return (scoreA % 100) - (scoreB % 100);
    });

    sorted.forEach(p => {
        if (!catCount[p.category]) catCount[p.category] = 0;
        if (catCount[p.category] < 2 && featuredProducts.length < 10) {
            featuredProducts.push(p);
            catCount[p.category]++;
        }
    });

    return (
        <section style={{ padding: '3.5rem 0 1.5rem', backgroundColor: 'var(--background)', overflow: 'hidden' }}>
            <div className="container">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
                    <Flame size={32} strokeWidth={2.5} style={{ color: 'var(--primary)' }} />
                    <h2 style={{ fontFamily: 'var(--font-outfit), sans-serif', fontSize: '2.4rem', fontWeight: '900', color: 'var(--primary-dark)', margin: 0 }}>
                        {t.featuredTitle.replace('🔥', '').trim()}
                    </h2>
                </div>
                <FeaturedProductsCarousel products={featuredProducts} />
            </div>
        </section>
    );
}

function formatHeroTitle(title: string) {
  if (title.includes('*')) {
    const parts = title.split('*');
    return parts.map((part, i) => i % 2 === 1 ? <span key={i} className="editorial-serif">{part}</span> : part);
  }
  const wordsToHighlight = [
    'directa', 'campo', 'tierra', 'premium', 'delicia', 'frescura', 'fresco', 'frescos',
    'direct', 'nature', 'fresh', 'organic', 'farm', 'premium', 'excellence', 'negocio', 'business'
  ];
  const words = title.split(' ');
  return words.map((word, i) => {
    const cleanWord = word.toLowerCase().replace(/[^a-zñáéíóú]/g, '');
    if (wordsToHighlight.includes(cleanWord)) {
      const prefix = word.match(/^[^a-zA-Zñáéíóú]+/)?.[0] || '';
      const suffix = word.match(/[^a-zA-Zñáéíóú]+$/)?.[0] || '';
      const core = word.substring(prefix.length, word.length - suffix.length);
      return (
        <span key={i}>
          {prefix}<span className="editorial-serif">{core}</span>{suffix}{' '}
        </span>
      );
    }
    return word + ' ';
  });
}

// --- MAIN PAGE ---

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; lang?: string }> }) {
  const { q, category, lang } = await searchParams;
  const locale = (lang === 'en' ? 'en' : 'es') as Locale;
  const t = translations[locale];

  // 1. CRITICAL FETCH (FAST CACHED)
  const appSettings = await getAppSettings();
  
  const getSetting = (key: string, defaultValue: string) => {
    const s = appSettings?.find((x: {key: string, value: string}) => x.key === key);
    return s ? s.value : defaultValue;
  };

  const isB2bEnabled = getSetting('enable_b2b_lead_capture', 'true') === 'true';
  const heroTitle = (locale === 'en' ? getSetting('hero_title_en', '') : getSetting('hero_title', '')) || t.heroTitle;
  const heroDescription = (locale === 'en' ? getSetting('hero_description_en', '') : getSetting('hero_description', '')) || t.heroDescription;
  const heroImageUrl = getSetting('hero_image_url', '/hero_fresh_produce.png');
  const catalogTitle = (locale === 'en' ? getSetting('home_catalog_title_en', '') : getSetting('home_catalog_title', '')) || t.catalogTitle;

  return (
    <main style={{ minHeight: '100vh', paddingBottom: '4rem', backgroundColor: 'var(--background)' }}>

      {/* HERO SECTION - Premium Split Layout */}
      <section className="hero-split">
        {/* CSS Styles injection */}
        <style dangerouslySetInnerHTML={{__html: `
          @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Outfit:wght@300;400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap');

          .editorial-serif {
            font-family: 'Instrument Serif', Georgia, 'Playfair Display', serif;
            font-style: italic;
            font-weight: 400;
            text-transform: none;
            color: var(--secondary, #d4a373);
          }

          .hero-split {
            display: flex;
            min-height: 650px;
            background-color: #081c15;
            overflow: hidden;
            position: relative;
            align-items: stretch;
          }

          .hero-left {
            width: 48%;
            display: flex;
            align-items: center;
            padding: 5rem 4rem;
            z-index: 10;
            position: relative;
            background: linear-gradient(90deg, #081c15 85%, rgba(8, 28, 21, 0.9) 100%);
          }

          .hero-right {
            width: 52%;
            position: relative;
            overflow: hidden;
            background-color: #1a4d2e;
            background-image: url('${heroImageUrl}');
            background-size: cover;
            background-position: center;
          }

          .carousel-slide {
            position: absolute;
            inset: 0;
            background-size: cover;
            background-position: center;
            opacity: 0;
            transition: opacity 1.5s ease-in-out;
          }

          .carousel-slide-1 {
            background-image: url('/hero_fresh_1.jpg');
            animation: kb-1 18s infinite ease-in-out;
          }

          .carousel-slide-2 {
            background-image: url('/hero_fresh_2_clean.png');
            animation: kb-2 18s infinite ease-in-out;
          }

          .carousel-slide-3 {
            background-image: url('/hero_fresh_3.jpg');
            animation: kb-3 18s infinite ease-in-out;
          }

          @keyframes kb-1 {
            0% { opacity: 1; transform: scale(1.02); }
            28% { opacity: 1; }
            38% { opacity: 0; transform: scale(1.12); }
            90% { opacity: 0; transform: scale(1.02); }
            100% { opacity: 1; transform: scale(1.02); }
          }

          @keyframes kb-2 {
            0% { opacity: 0; transform: scale(1.02); }
            28% { opacity: 0; transform: scale(1.02); }
            38% { opacity: 1; }
            62% { opacity: 1; }
            72% { opacity: 0; transform: scale(1.12); }
            100% { opacity: 0; }
          }

          @keyframes kb-3 {
            0% { opacity: 0; }
            62% { opacity: 0; transform: scale(1.02); }
            72% { opacity: 1; }
            90% { opacity: 1; }
            100% { opacity: 0; transform: scale(1.12); }
          }

          /* Bento grid styles */
          /* Bento grid styles */
          .bento-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 1.5rem;
            margin-top: 2rem;
          }

          .bento-card {
            background: white;
            border: 1px solid rgba(0, 0, 0, 0.04);
            border-radius: var(--radius-lg);
            padding: 2rem 2.2rem;
            transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            box-shadow: 0 4px 30px rgba(0, 0, 0, 0.015);
            position: relative;
            overflow: hidden;
          }

          .bento-card:hover {
            transform: translateY(-6px);
            box-shadow: 0 24px 48px rgba(26, 77, 46, 0.08);
            border-color: rgba(26, 77, 46, 0.15);
          }

          @media (max-width: 991px) {
            .bento-grid {
              grid-template-columns: repeat(2, 1fr);
            }
          }

          .bento-card:hover .bento-icon-container {
            transform: scale(1.1) rotate(-3deg);
          }

          .bento-card:hover .bento-explore-link svg {
            transform: translateX(4px);
          }

          .bento-explore-link svg {
            transition: transform 0.2s ease;
          }

          @media (max-width: 991px) {
            .hero-split {
              flex-direction: column;
              min-height: 520px;
            }
            .hero-left {
              width: 100%;
              padding: 6.5rem 2rem 4rem;
              text-align: center;
              background: linear-gradient(rgba(8, 28, 21, 0.88), rgba(8, 28, 21, 0.94));
              align-items: center;
              justify-content: center;
            }
            .hero-right {
              position: absolute;
              inset: 0;
              width: 100%;
              height: 100%;
              z-index: 1;
            }
          }

          @media (max-width: 768px) {
            .bento-grid {
              grid-template-columns: 1fr;
            }
            .hero-split {
              min-height: 480px;
            }
            .hero-left {
              padding: 5.5rem 1.5rem 3.5rem;
            }
          }
        `}} />

        <div className="hero-left">
          <div style={{ maxWidth: '640px', width: '100%' }}>
            <h1 style={{ 
              fontFamily: 'var(--font-outfit), sans-serif', 
              fontSize: '4rem', 
              fontWeight: '900', 
              marginBottom: '1.5rem', 
              color: '#ffffff',
              lineHeight: 1.1,
              letterSpacing: '-0.02em'
            }}>
              {formatHeroTitle(heroTitle)}
            </h1>
            <p style={{ 
              fontFamily: '"Inter", sans-serif',
              fontSize: '1.2rem', 
              lineHeight: '1.6',
              marginBottom: '3rem', 
              color: 'rgba(255,255,255,0.85)',
              fontWeight: 400
            }}>
              {heroDescription}
            </p>
            <div style={{ display: 'flex', justifyContent: 'inherit' }} className="hero-actions-wrapper">
              <HeroActions t={t} isB2bEnabled={isB2bEnabled} />
            </div>
          </div>
        </div>

        <div className="hero-right">
          <div className="carousel-slide carousel-slide-1" />
          <div className="carousel-slide carousel-slide-2" />
          <div className="carousel-slide carousel-slide-3" />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(8,28,21,0.25) 0%, rgba(8,28,21,0) 100%)', zIndex: 2 }} />
        </div>
      </section>

      {/* FEATURED SECTION - Streamed */}
      <Suspense fallback={<div style={{ height: '400px' }}><ProductSkeleton /></div>}>
        <FeaturedSection locale={locale} />
      </Suspense>
      
      {/* CATALOG SECTION */}
      <section id="catalog" className="container" style={{ padding: '1.8rem 1rem 1rem', scrollMarginTop: '80px' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <h2 className="section-title" style={{ fontFamily: 'var(--font-outfit), sans-serif', fontSize: '2.8rem', fontWeight: '900' }}>{catalogTitle}</h2>
          <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            <SearchBar placeholder={t.searchPlaceholder} />
          </div>

          <Suspense fallback={<div style={{ height: '40px', marginTop: '1.5rem' }}></div>}>
            <CategoryPills category={category} q={q} locale={locale} />
          </Suspense>
        </div>

        <Suspense key={`${q}-${category}-${locale}`} fallback={<ProductSkeleton />}>
            <ProductGridContainer 
                q={q} 
                category={category} 
                locale={locale} 
            />
        </Suspense>
      </section>

      {/* VALUE PROPOSITION - Bento Box Layout */}
      <section style={{ padding: '5rem 0', backgroundColor: '#FBFBFA', borderTop: '1px solid rgba(0,0,0,0.03)' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
            <span style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--primary)', fontWeight: 700, display: 'block', marginBottom: '0.75rem' }}>
              {locale === 'en' ? 'OUR PROMISE' : 'NUESTRA PROMESA'}
            </span>
            <h2 style={{ fontFamily: 'var(--font-outfit), sans-serif', fontSize: '2.5rem', fontWeight: '900', color: 'var(--primary-dark)', margin: 0 }}>
              {locale === 'en' ? 'Why choose FruFresco?' : '¿Por qué elegir FruFresco?'}
            </h2>
          </div>
          <div className="bento-grid">
            {t.valueProps.map((prop: any, i: number) => {
              const iconColor = 'var(--primary-light)';
              const iconBg = 'rgba(26, 77, 46, 0.04)';
              return (
                <div 
                  key={i} 
                  className="bento-card"
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', height: '100%', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ 
                        marginBottom: '1.5rem', 
                        color: iconColor, 
                        backgroundColor: iconBg, 
                        width: '56px', 
                        height: '56px', 
                        borderRadius: '16px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        transition: 'transform 0.3s ease'
                      }} className="bento-icon-container">
                        {i === 0 ? <Timer size={28} strokeWidth={2} /> : i === 1 ? <Sprout size={28} strokeWidth={2} /> : <Coins size={28} strokeWidth={2} />}
                      </div>
                      <h3 style={{ 
                        fontFamily: 'var(--font-outfit), sans-serif',
                        fontSize: '1.4rem', 
                        fontWeight: '800', 
                        marginBottom: '0.75rem',
                        color: 'var(--primary-dark)',
                        letterSpacing: '-0.02em'
                      }}>
                        {prop.title}
                      </h3>
                      <p style={{ 
                        color: '#475569', 
                        lineHeight: '1.6',
                        fontSize: '0.95rem',
                        margin: 0
                      }}>
                        {prop.desc}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}

