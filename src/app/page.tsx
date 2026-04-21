import { supabase, type Product } from '../lib/supabase';
import Navbar from '../components/Navbar';
import ProductCard from '../components/ProductCard';
import SearchBar from '../components/SearchBar';
import Link from 'next/link';
import Image from 'next/image';
import FeaturedProductsCarousel from '../components/FeaturedProductsCarousel';
import { LucideIcon, Building2, ShoppingCart, Timer, Sprout, Coins, Flame, Apple, Leaf, Carrot, Milk, Package, LayoutGrid } from 'lucide-react';
import { CATEGORY_MAP, REVERSE_CATEGORY_MAP } from '../lib/constants';
import { translations, Locale } from '../lib/translations';

const CATEGORY_ICON_MAP: Record<string, LucideIcon> = {
  'FR': Apple,
  'VE': Leaf,
  'TU': Carrot,
  'HO': Sprout,
  'LA': Milk,
  'DE': Package,
  'Todos': LayoutGrid
};

// SEO Metadata
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang } = await searchParams;
  const locale = (lang === 'en' ? 'en' : 'es') as Locale;
  const t = translations[locale];
  
  return {
    title: `Logistics Pro | ${locale === 'es' ? 'Soluciones de Abastecimiento Inteligente' : 'Intelligent Sourcing Solutions'}`,
    description: t.heroDescription,
    keywords: ['logística integral', 'gestión de suministros', 'transporte inteligente', 'logistics pro'],
  };
}

// Opt out of caching (for dev)
export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; lang?: string }> }) {
  const { q, category, lang } = await searchParams;
  const locale = (lang === 'en' ? 'en' : 'es') as Locale;
  const t = translations[locale];

  // 1. Parallel Data Fetching
  const [
    allVisibleResponse,
    categoriesDataResponse,
    appSettingsResponse,
    sessionResponse
  ] = await Promise.all([
    supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .eq('show_on_web', true)
      .order('image_url', { ascending: false, nullsFirst: false })
      .limit(300),
    supabase
      .from('products')
      .select('category')
      .eq('is_active', true)
      .eq('show_on_web', true)
      .not('category', 'is', null),
    supabase
      .from('app_settings')
      .select('key, value'),
    supabase.auth.getSession()
  ]);

  const allVisible = allVisibleResponse.data || [];
  const categoriesData = categoriesDataResponse.data || [];
  const appSettings = appSettingsResponse.data || [];
  const session = sessionResponse.data?.session;
  const userId = session?.user?.id;

  // 2. Fetch Dependent Data (Nicknames & Translation Cache)
  const [nicknamesResponse, translationCacheResponse] = await Promise.all([
    userId 
      ? supabase.from('product_nicknames').select('product_id, custom_name').eq('profile_id', userId)
      : Promise.resolve({ data: [] }),
    locale === 'en'
      ? supabase.from('product_translations_cache').select('source_text, translated_text').eq('lang', 'en')
      : Promise.resolve({ data: [] })
  ]);

  const nicknameMap = (nicknamesResponse.data || []).reduce((acc, item) => ({
    ...acc,
    [item.product_id]: item.custom_name
  }), {} as Record<string, string>);

  const translationCache = (translationCacheResponse.data || []).reduce((acc, item) => ({
    ...acc,
    [item.source_text]: item.translated_text
  }), {} as Record<string, string>);

  // 3. Featured Products Logic (In-memory from allVisible)
  const featuredProducts: Product[] = [];
  const catCount: Record<string, number> = {};
  const dailySeed = new Date().getDate();
  
  const sortedByImage = [...allVisible].sort((a, b) => {
    const hasA = a.image_url && a.image_url.trim().length > 5;
    const hasB = b.image_url && b.image_url.trim().length > 5;
    if (hasA && !hasB) return -1;
    if (!hasA && hasB) return 1;
    const scoreA = (parseInt(a.id.slice(0, 8), 16) || a.name.length) * dailySeed;
    const scoreB = (parseInt(b.id.slice(0, 8), 16) || b.name.length) * dailySeed;
    return (scoreA % 100) - (scoreB % 100);
  });

  sortedByImage.forEach(p => {
    if (!catCount[p.category]) catCount[p.category] = 0;
    if (catCount[p.category] < 2 && featuredProducts.length < 10) {
      featuredProducts.push(p);
      catCount[p.category]++;
    }
  });

  if (featuredProducts.length < 10) {
    sortedByImage.forEach(p => {
      if (!featuredProducts.find(f => f.id === p.id) && featuredProducts.length < 10) {
        featuredProducts.push(p);
      }
    });
  }

  // 4. Catalog Products Logic
  let rawProducts: Product[] = [];
  if (!q && (!category || category === 'Todos')) {
    // Reuse already fetched visible products if no filter
    rawProducts = allVisible;
  } else {
    // If filtering, we might need a specific query but let's try to filter in-memory first if it's small
    // For now, keep the specific query if search exists to use DB indexing
    let query = supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .eq('show_on_web', true);

    if (q) {
      const searchTerms = q.split(',').map(t => t.trim()).filter(t => t.length > 0);
      if (searchTerms.length > 0) {
        const conditions = searchTerms.flatMap(term => [
          `name.ilike.%${term}%`,
          `description.ilike.%${term}%`,
          `keywords.ilike.%${term}%`,
          `tags.cs.{${term}}`
        ]);
        query = query.or(conditions.join(','));
      }
    }
    if (category && category !== 'Todos') {
      query = query.eq('category', category);
    }
    const { data } = await query.order('image_url', { ascending: false, nullsFirst: false }).limit(250);
    rawProducts = data || [];
  }

  const getSetting = (key: string, defaultValue: string) => {
    const s = appSettings?.find((x: {key: string, value: string}) => x.key === key);
    return s ? s.value : defaultValue;
  };

  const isB2bEnabled = getSetting('enable_b2b_lead_capture', 'true') === 'true';
  const heroTitle = (locale === 'en' ? getSetting('hero_title_en', '') : getSetting('hero_title', '')) || t.heroTitle;
  const heroDescription = (locale === 'en' ? getSetting('hero_description_en', '') : getSetting('hero_description', '')) || t.heroDescription;
  const heroImageUrl = getSetting('hero_image_url', '/hero_fresh_produce.png');
  const featuredTitleRaw = (locale === 'en' ? getSetting('home_featured_title_en', '') : getSetting('home_featured_title', ''));
  const featuredTitle = featuredTitleRaw || t.featuredTitle;
  const catalogTitleRaw = (locale === 'en' ? getSetting('home_catalog_title_en', '') : getSetting('home_catalog_title', ''));
  const catalogTitle = catalogTitleRaw || t.catalogTitle;
  const dynamicCategories: string[] = ['Todos', ...Array.from(new Set(categoriesData.map(c => c.category)))];
  const valueProps = t.valueProps;


  const applyNicknames = (plist: Product[]) => plist.map(p => ({
    ...p,
    display_name: nicknameMap[p.id] || translationCache[p.name] || p.display_name || p.name
  }));

  const products = applyNicknames(rawProducts || []);
  const finalFeatured = applyNicknames(featuredProducts);
  
  // Helper to get translated category name
  const getCategoryName = (cat: string) => {
    if (cat === 'Todos') return t.allCategories;
    const code = REVERSE_CATEGORY_MAP[cat] || cat.toUpperCase();
    return (t.categories as any)[code] || cat;
  };


  return (
    <main style={{ minHeight: '100vh', paddingBottom: '4rem', backgroundColor: '#FFFFFF' }}>
      <Navbar />

      <section 
        className="hero-container"
        style={{
          position: 'relative',
          height: '620px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          overflow: 'hidden',
          backgroundColor: '#1a4d2e', // Fallback color
          boxShadow: 'inset 0 -120px 100px -50px rgba(0,0,0,0.3)'
        }}>
        {/* Optimized Hero Image */}
        <Image 
          src={heroImageUrl}
          alt="Fresh Produce Hero"
          fill
          priority
          quality={85}
          style={{ objectFit: 'cover', zIndex: 0 }}
        />
        {/* Overlay */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'linear-gradient(rgba(0,0,0,0.2), rgba(0,0,0,0.5))',
          zIndex: 1
        }} />
        <div className="container" style={{ textAlign: 'center', position: 'relative', zIndex: 10 }}>
          <h1 style={{
            fontFamily: 'var(--font-outfit), sans-serif',
            fontSize: '4.5rem',
            fontWeight: '900',
            marginBottom: '1.5rem',
            textShadow: '0 10px 30px rgba(0,0,0,0.3)',
            lineHeight: 1.1,
            letterSpacing: '-0.03em',
            whiteSpace: 'pre-line' 
          }}>
            {heroTitle}
          </h1>
          <p style={{
            fontSize: '1.35rem',
            maxWidth: '800px',
            margin: '0 auto 3rem',
            textShadow: '0 2px 4px rgba(0,0,0,0.3)',
            fontWeight: '400',
            opacity: 0.95,
            lineHeight: 1.5
          }}>
            {heroDescription}
          </p>

          <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', alignItems: 'center' }}>
            {isB2bEnabled && (
            <Link href="/b2b/register">
              <button className="btn btn-primary btn-premium" style={{
                fontSize: '1.15rem',
                padding: '1.1rem 2.8rem',
                fontWeight: '700',
                borderRadius: 'var(--radius-full)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                backgroundColor: 'var(--primary)'
              }}>
                <span><Building2 size={22} strokeWidth={2.5} /></span> {t.btnInstitutional}
              </button>
            </Link>
            )}
            
            <Link href="/register" style={{ textDecoration: 'none' }}>
              <button className="btn-glass" style={{
                fontSize: '1.15rem',
                padding: '1.1rem 2.8rem',
                color: 'white',
                fontWeight: '700',
                borderRadius: 'var(--radius-full)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                cursor: 'pointer'
              }}>
                <span><ShoppingCart size={22} strokeWidth={2.5} /></span> {t.btnHome}
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* VALUE PROPOSITION (SEO Content) */}
      <section style={{ padding: '4rem 0', backgroundColor: '#F9FAFB' }}>
        <div className="container" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '3rem', textAlign: 'center' }}>
          {valueProps.map((prop: { icon: string; title: string; desc: string }, i: number) => (
            <div key={i} style={{ padding: '1rem' }}>
              <div style={{ 
                marginBottom: '1.5rem', 
                color: 'var(--primary)',
                backgroundColor: 'var(--accent)',
                width: '80px',
                height: '80px',
                borderRadius: 'var(--radius-lg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.5rem',
                boxShadow: '0 10px 20px rgba(26, 77, 46, 0.1)'
              }}>
                {i === 0 ? <Timer size={40} strokeWidth={2} /> : i === 1 ? <Sprout size={40} strokeWidth={2} /> : <Coins size={40} strokeWidth={2} />}
              </div>
              <h3 style={{ fontFamily: 'var(--font-outfit), sans-serif', fontSize: '1.6rem', fontWeight: '800', marginBottom: '1rem', color: 'var(--primary-dark)' }}>{prop.title}</h3>
              <p style={{ color: 'var(--text-muted)', lineHeight: '1.7', fontSize: '1.05rem' }}>{prop.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{
        padding: '5rem 0 2rem',
        backgroundColor: '#FFFFFF',
        overflow: 'hidden'
      }}>
        <div className="container">
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: '2.5rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Flame size={32} strokeWidth={2.5} style={{ color: 'var(--primary)' }} />
              <h2 style={{
                fontFamily: 'var(--font-outfit), sans-serif',
                fontSize: '2.4rem',
                fontWeight: '900',
                color: 'var(--primary-dark)',
                letterSpacing: '-0.04em',
                margin: 0
              }}>
                {featuredTitle.replace('🔥', '').trim()}
              </h2>
            </div>
          </div>

          <FeaturedProductsCarousel products={finalFeatured || []} />
        </div>
      </section>
      
      <section id="catalog" className="container" style={{ padding: '4rem 1rem', scrollMarginTop: '80px' }}>
        <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
          <h2 className="section-title" style={{ fontFamily: 'var(--font-outfit), sans-serif', fontSize: '2.8rem', fontWeight: '900', letterSpacing: '-0.03em' }}>{catalogTitle === 'Nuestro Catálogo' ? t.catalogTitle : catalogTitle}</h2>
          <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            <SearchBar placeholder={t.searchPlaceholder} />
          </div>

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
            {dynamicCategories.map((cat: string) => {
              return (
                <Link
                  key={cat}
                  href={`/?${new URLSearchParams({
                    ...Object.fromEntries(new URLSearchParams(String(q || ''))),
                    category: cat
                  }).toString()}#catalog`}
                  scroll={false}
                  className={`category-pill ${((!category && cat === 'Todos') || category === cat) ? 'active' : ''}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {getCategoryName(cat)}
                </Link>
              );
            })}
          </div>
        </div>

        {products && products.length > 0 ? (
          <div style={{ position: 'relative' }}>
            <div 
              id="catalog-scroll-area"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: '2rem',
                maxHeight: '1000px', 
                overflowY: 'auto',
                overflowX: 'hidden',
                padding: '1.5rem',
                borderRadius: 'var(--radius-lg)',
                scrollbarWidth: 'thin',
                scrollbarColor: 'var(--primary) transparent',
                scrollBehavior: 'smooth',
                border: '1px solid rgba(0,0,0,0.03)',
                backgroundColor: '#ffffff',
                width: '100%'
              }}
              className="custom-scrollbar"
            >
              {products.map((product: Product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
            
            {/* Shadow Effect at the bottom - subtle */}
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '80px',
              background: 'linear-gradient(to top, rgba(255,255,255,0.8), transparent)',
              zIndex: 10,
              pointerEvents: 'none',
              borderRadius: '0 0 var(--radius-lg) var(--radius-lg)'
            }} />
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
            {error ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <span style={{ fontWeight: '800', color: '#ef4444' }}>Error cargando productos</span>
                <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>{(error as { message: string }).message || JSON.stringify(error)}</span>
              </div>
            ) : 'No encontramos productos con ese nombre.'}
          </div>
        )}
        
        {/* CSS for custom scrollbar hidden globally */}
        <style dangerouslySetInnerHTML={{ __html: `
          .custom-scrollbar::-webkit-scrollbar {
            width: 6px;
          }
          .custom-scrollbar::-webkit-scrollbar-track {
            background: transparent;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background-color: var(--primary);
            border-radius: 20px;
          }
          .custom-scrollbar {
            /* Mask removed to prevent clipping */
          }
        `}} />
      </section>


    </main>
  );
}
