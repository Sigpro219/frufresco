import { supabase, type Product } from '../lib/supabase';
import Navbar from '../components/Navbar';
import ProductCard from '../components/ProductCard';
import SearchBar from '../components/SearchBar';
import Link from 'next/link';
import Image from 'next/image';
import FeaturedProductsCarousel from '../components/FeaturedProductsCarousel';
import { LucideIcon, Building2, ShoppingCart, Timer, Sprout, Coins, Flame, Apple, Leaf, Carrot, Milk, Package, LayoutGrid } from 'lucide-react';
import { CATEGORY_MAP } from '../lib/constants';

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
export const metadata = {
  title: 'FruFresco | Proveedor de Frutas y Verduras Institucionales',
  description: 'Líderes en abastecimiento de alimentos frescos para restaurantes, hoteles y casinos en Bogotá. Frescura garantizada, entrega puntual y los mejores precios del mercado.',
  keywords: ['frutas al por mayor', 'verduras institucional', 'proveedor alimentos bogota', 'corabastos a domicilio', 'frufresco'],
};

// Opt out of caching (for dev)
export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  const { q, category } = await searchParams;

  // 1. Fetch Featured Products (Top 10) - Balaceado por categorías
  const { data: allVisibleResponse } = await supabase
    .from('products')
    .select('*')
    .eq('is_active', true)
    .eq('show_on_web', true)
    .order('image_url', { ascending: false, nullsFirst: false }) // Priorizar no nulos en DB
    .limit(250); 

  const allVisible = allVisibleResponse || [];
  const featuredProducts: Product[] = [];
  const catCount: Record<string, number> = {};
  
  // Priorizar visualmente los que tienen foto y luego REVOLVER (Shuffle)
  // para que el catálogo se vea vivo
      // Seed estable por día para evitar hydration mismatches y ser "puro" según React
      const dailySeed = new Date().getDate();
      
      const sortedByImage = [...allVisible].sort((a, b) => {
          const hasA = a.image_url && a.image_url.trim().length > 5;
          const hasB = b.image_url && b.image_url.trim().length > 5;
          if (hasA && !hasB) return -1;
          if (!hasA && hasB) return 1;
          
          // Shuffle pseudo-aleatorio estable por día
          const scoreA = (parseInt(a.id.slice(0, 8), 16) || a.name.length) * dailySeed;
          const scoreB = (parseInt(b.id.slice(0, 8), 16) || b.name.length) * dailySeed;
          return (scoreA % 100) - (scoreB % 100);
      });

  if (allVisible.length > 0) {

      // Intentamos tomar 1-2 de cada categoría para Featured
      sortedByImage.forEach(p => {
          if (!catCount[p.category]) catCount[p.category] = 0;
          if (catCount[p.category] < 2 && featuredProducts.length < 10) {
              featuredProducts.push(p);
              catCount[p.category]++;
          }
      });

      // Si faltan para completar 10, llenamos con el resto priorizando fotos
      if (featuredProducts.length < 10) {
          sortedByImage.forEach(p => {
              if (!featuredProducts.find(f => f.id === p.id) && featuredProducts.length < 10) {
                  featuredProducts.push(p);
              }
          });
      }
  }

  // 2. Fetch Unique Categories & Settings
  const { data: categoriesData } = await supabase
    .from('products')
    .select('category')
    .eq('is_active', true)
    .eq('show_on_web', true)
    .not('category', 'is', null);

  const { data: appSettings } = await supabase
      .from('app_settings')
      .select('key, value');

  const getSetting = (key: string, defaultValue: string) => {
      const s = appSettings?.find(x => x.key === key);
      return s ? s.value : defaultValue;
  };

  const isB2bEnabled = getSetting('enable_b2b_lead_capture', 'true') === 'true';
  const heroTitle = getSetting('hero_title', 'Excelencia en Frescura \n para tu Negocio y Hogar');
  const heroDescription = getSetting('hero_description', 'Somos el aliado estratégico de los mejores restaurantes y casinos de Bogotá. Llevamos la calidad de Corabastos a tu puerta, con cero desperdicio y puntualidad suiza.');
  const heroImageUrl = getSetting('hero_image_url', '/hero_fresh_produce.png');
  const featuredTitle = getSetting('home_featured_title', '🔥 Lo más vendido de la semana');
  const catalogTitle = getSetting('home_catalog_title', 'Nuestro Catálogo');
  
  const valuePropsRaw = getSetting('value_proposition_items', '[]');
  let valueProps: { icon: string; title: string; desc: string }[] = [];
  try {
      valueProps = JSON.parse(valuePropsRaw);
  } catch {
      valueProps = [
        { icon: '⏱️', title: 'Entrega Puntual', desc: 'Tu operación no puede detenerse. Garantizamos entregas antes de la apertura de tu cocina.' },
        { icon: '🥬', title: 'Frescura Absoluta', desc: 'Seleccionamos producto a producto cada madrugada. Lo que recibes hoy, se cosechó ayer.' },
        { icon: '💎', title: 'Precios Competitivos', desc: 'Sin intermediarios innecesarios. Optimizamos la cadena para darte el mejor margen.' }
      ];
  }

  const dynamicCategories: string[] = ['Todos', ...Array.from(new Set(categoriesData?.map((c: { category: string }) => c.category) || []))];

  // 3. Build Query
  let query = supabase
    .from('products')
    .select('*')
    .eq('is_active', true)
    .eq('show_on_web', true);

  if (q) {
    const searchTerms = q.split(',')
      .map(term => term.trim())
      .filter(term => term.length > 0);
    
    if (searchTerms.length > 0) {
      if (searchTerms.length === 1) {
        query = query.ilike('name', `%${searchTerms[0]}%`);
      } else {
        // Build OR filter for multiple terms
        const orFilter = searchTerms
          .map(term => `name.ilike.%${term}%`)
          .join(',');
        query = query.or(orFilter);
      }
    }
  }

  if (category && category !== 'Todos') {
    query = query.eq('category', category);
  }

  const { data: rawProducts, error } = await query
    .order('image_url', { ascending: false, nullsFirst: false }) // Prioridad DB (fotos primero)
    .limit(250); 

  // 4. Catálogo Dinámico: Shuffle total pero manteniendo fotos arriba
  // Usamos el mismo dailySeed definido arriba para consistencia
  const products = rawProducts ? [...rawProducts].sort((a, b) => {
      // 1. Prioridad absoluta: tiene foto (URL válida)
      const hasA = a.image_url && a.image_url.includes('http');
      const hasB = b.image_url && b.image_url.includes('http');
      
      if (hasA && !hasB) return -1;
      if (!hasA && hasB) return 1;
      
      // 2. Shuffle aleatorio estable por día entre iguales
      const scoreA = (parseInt(a.id.slice(0, 8), 16) || a.name.length) * dailySeed;
      const scoreB = (parseInt(b.id.slice(0, 8), 16) || b.name.length) * dailySeed;
      return (scoreA % 100) - (scoreB % 100);
  }) : [];

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
                <span><Building2 size={22} strokeWidth={2.5} /></span> Institucional
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
                <span><ShoppingCart size={22} strokeWidth={2.5} /></span> Hogar / Mi cuenta
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

          <FeaturedProductsCarousel products={featuredProducts || []} />
        </div>
      </section>
      
      <section id="catalog" className="container" style={{ padding: '4rem 1rem', scrollMarginTop: '80px' }}>
        <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
          <h2 className="section-title" style={{ fontFamily: 'var(--font-outfit), sans-serif', fontSize: '2.8rem', fontWeight: '900', letterSpacing: '-0.03em' }}>{catalogTitle}</h2>
          <div style={{ maxWidth: '600px', margin: '0 auto' }}>
            <SearchBar />
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '0.75rem',
            marginTop: '1.5rem',
            flexWrap: 'wrap'
          }}>
            {dynamicCategories.map((cat: string) => {
              const Icon = CATEGORY_ICON_MAP[cat] || (cat === 'Todos' ? CATEGORY_ICON_MAP['Todos'] : null);
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
                    padding: '0.8rem 1.8rem',
                    fontSize: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem'
                  }}
                >
                  {Icon && <Icon size={18} strokeWidth={2.5} />}
                  {CATEGORY_MAP[cat.trim().toUpperCase()] || cat}
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
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '2.5rem',
                maxHeight: '850px', // Altura más humana (~2.5 filas visibles a la vez, invita a scrollear)
                overflowY: 'auto',
                padding: '1.5rem',
                borderRadius: 'var(--radius-lg)',
                scrollbarWidth: 'thin',
                scrollbarColor: 'var(--primary) transparent',
                scrollBehavior: 'smooth',
                border: '1px solid rgba(0,0,0,0.03)',
                backgroundColor: '#ffffff'
              }}
              className="custom-scrollbar"
            >
              {products.map((product: Product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
            
            {/* Fade Effect at the bottom */}
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '150px',
              background: 'linear-gradient(to top, rgba(255,255,255,0.95), transparent)',
              zIndex: 10,
              pointerEvents: 'none',
              borderRadius: '0 0 var(--radius-lg) var(--radius-lg)'
            }} />
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
            {error ? 'Error cargando productos' : 'No encontramos productos con ese nombre.'}
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
            border: 3px solid transparent;
          }
          .custom-scrollbar {
            mask-image: linear-gradient(to bottom, black 90%, transparent 100%);
            -webkit-mask-image: linear-gradient(to bottom, black 90%, transparent 100%);
          }
        `}} />
      </section>


    </main>
  );
}
