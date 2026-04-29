import { supabase, type Product } from '../lib/supabase';
import SearchBar from '../components/SearchBar';
import Link from 'next/link';
import Image from 'next/image';
import FeaturedProductsCarousel from '../components/FeaturedProductsCarousel';
import { Building2, ShoppingCart, Timer, Sprout, Coins, Flame, Apple, Leaf, Carrot, Milk, Package, LayoutGrid } from 'lucide-react';
import { CATEGORY_MAP, REVERSE_CATEGORY_MAP } from '../lib/constants';
import { translations, Locale } from '../lib/translations';
import { Suspense } from 'react';
import ProductGridContainer from '../components/ProductGridContainer';
import ProductSkeleton from '../components/ProductSkeleton';
import HeroActions from '../components/HeroActions';

export const dynamic = 'force-dynamic';

// --- SUB-COMPONENTS FOR STREAMING ---

async function CategoryPills({ category, q, locale }: { category?: string, q?: string, locale: Locale }) {
    const t = translations[locale];
    const { data: categoriesData } = await supabase
      .from('products')
      .select('category')
      .eq('is_active', true)
      .eq('show_on_web', true)
      .not('category', 'is', null);

    const dynamicCategories = ['Todos', ...Array.from(new Set((categoriesData || []).map(c => c.category)))];
    
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
    
    // Fetch products for featured section
    const { data: allVisible } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .eq('show_on_web', true)
        .order('image_url', { ascending: false, nullsFirst: false })
        .limit(100);

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
        <section style={{ padding: '3.5rem 0 1.5rem', backgroundColor: '#FFFFFF', overflow: 'hidden' }}>
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

// --- MAIN PAGE ---

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; lang?: string }> }) {
  const { q, category, lang } = await searchParams;
  const locale = (lang === 'en' ? 'en' : 'es') as Locale;
  const t = translations[locale];

  // 1. CRITICAL FETCH (FAST)
  const { data: appSettings } = await supabase.from('app_settings').select('key, value');
  
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
    <main style={{ minHeight: '100vh', paddingBottom: '4rem', backgroundColor: '#FFFFFF' }}>

      {/* HERO SECTION - Renders with appSettings */}
      <section className="hero-container" style={{ position: 'relative', height: '620px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', overflow: 'hidden', backgroundColor: '#1a4d2e' }}>
        <Image src={heroImageUrl} alt="Hero" fill priority quality={85} style={{ objectFit: 'cover', zIndex: 0 }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(rgba(0,0,0,0.2), rgba(0,0,0,0.5))', zIndex: 1 }} />
        <div className="container" style={{ textAlign: 'center', position: 'relative', zIndex: 10 }}>
          <h1 style={{ fontFamily: 'var(--font-outfit), sans-serif', fontSize: '4.5rem', fontWeight: '900', marginBottom: '1.5rem', textShadow: '0 10px 30px rgba(0,0,0,0.3)', lineHeight: 1.1 }}>{heroTitle}</h1>
          <p style={{ fontSize: '1.35rem', maxWidth: '800px', margin: '0 auto 3rem', textShadow: '0 2px 4px rgba(0,0,0,0.3)', opacity: 0.95 }}>{heroDescription}</p>
          <HeroActions t={t} isB2bEnabled={isB2bEnabled} />


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
      {/* VALUE PROPOSITION - Static Information */}
      <section style={{ padding: '3rem 0', backgroundColor: '#F8FAFC', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
        <div className="container" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
          {t.valueProps.map((prop: any, i: number) => (
            <div key={i} style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              textAlign: 'center',
              padding: '1rem'
            }}>
              <div style={{ 
                marginBottom: '1rem', 
                color: 'var(--primary)', 
                backgroundColor: 'var(--accent, #DCFCE7)', 
                width: '60px', 
                height: '60px', 
                borderRadius: '16px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center'
              }}>
                {i === 0 ? <Timer size={30} strokeWidth={2.5} /> : i === 1 ? <Sprout size={30} strokeWidth={2.5} /> : <Coins size={30} strokeWidth={2.5} />}
              </div>
              <h3 style={{ 
                fontFamily: 'var(--font-outfit), sans-serif',
                fontSize: '1.3rem', 
                fontWeight: '800', 
                marginBottom: '0.5rem',
                color: '#0F172A',
                letterSpacing: '-0.02em'
              }}>
                {prop.title}
              </h3>
              <p style={{ 
                color: '#64748B', 
                lineHeight: '1.5',
                fontSize: '0.95rem',
                margin: 0
              }}>
                {prop.desc}
              </p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
