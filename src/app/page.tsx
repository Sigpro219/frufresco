import { supabase, type Product } from '../lib/supabase';
import Navbar from '../components/Navbar';
import ProductCard from '../components/ProductCard';
import SearchBar from '../components/SearchBar';
import Link from 'next/link';
import FeaturedProductsCarousel from '../components/FeaturedProductsCarousel';
import { Building2, ShoppingCart, Clock, Leaf, Gem, Flame } from 'lucide-react';

// SEO Metadata
export const metadata = {
  title: 'Logistics Pro | Soluciones de Abastecimiento Inteligente',
  description: 'Líderes en gestión logística y abastecimiento para tu negocio. Eficiencia garantizada y tecnología de punta.',
  keywords: ['logística integral', 'gestión de suministros', 'transporte inteligente', 'logistics pro'],
};

// Opt out of caching (for dev)
export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  const { q, category } = await searchParams;

  // 1. Fetch Featured Products (Top 10)
  const { data: featuredProducts } = await supabase.from('products').select('*').eq('is_active', true).limit(10);

  // 2. Fetch Unique Categories & Settings
  const { data: categoriesData } = await supabase
    .from('products')
    .select('category')
    .eq('is_active', true)
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
    .eq('is_active', true);

  if (q) {
    query = query.ilike('name', `%${q}%`);
  }

  if (category && category !== 'Todos') {
    query = query.eq('category', category);
  }

  const { data: products, error } = await query.order('name').limit(24);

  return (
    <main style={{ minHeight: '100vh', paddingBottom: '4rem', backgroundColor: '#FFFFFF' }}>
      <Navbar />

      {/* HERO SECTION: European/Clean Style */}
      <section style={{
        position: 'relative',
        height: '620px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        overflow: 'hidden',
        background: 'linear-gradient(rgba(0,0,0,0.2), rgba(0,0,0,0.5)), url(/hero_fresh_produce.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        boxShadow: 'inset 0 -120px 100px -50px rgba(0,0,0,0.3)'
      }}>
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
                {i === 0 ? <Clock size={40} strokeWidth={1.5} /> : i === 1 ? <Leaf size={40} strokeWidth={1.5} /> : <Gem size={40} strokeWidth={1.5} />}
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
            <Link href="#catalog" style={{
              color: 'var(--secondary)',
              fontWeight: '700',
              fontSize: '0.9rem',
              textDecoration: 'none',
              transition: 'all 0.2s'
            }}>
              Ver todo el catálogo →
            </Link>
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
            {dynamicCategories.map((cat: string) => (
              <Link
                key={cat}
                href={`/?${new URLSearchParams({
                  ...Object.fromEntries(new URLSearchParams(String(q || ''))),
                  category: cat
                }).toString()}`}
                className={`category-pill ${((!category && cat === 'Todos') || category === cat) ? 'active' : ''}`}
                style={{
                  padding: '0.8rem 1.8rem',
                  fontSize: '1rem'
                }}
              >
                {cat}
              </Link>
            ))}
          </div>
        </div>

        {products && products.length > 0 ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '2rem'
          }}>
            {products.map((product: Product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
            {error ? 'Error cargando productos' : 'No encontramos productos con ese nombre.'}
          </div>
        )}
      </section>


    </main>
  );
}
