import { supabase, type Product } from '../lib/supabase';
import Navbar from '../components/Navbar';
import ProductCard from '../components/ProductCard';
import SearchBar from '../components/SearchBar';
import Link from 'next/link';
import FeaturedProductsCarousel from '../components/FeaturedProductsCarousel';

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
        height: '500px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        overflow: 'hidden',
        background: 'linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.5)), url(/hero_fresh_produce.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}>
        <div className="container" style={{ textAlign: 'center', position: 'relative', zIndex: 10 }}>
          <h1 style={{
            fontSize: '3.5rem',
            fontWeight: '800',
            marginBottom: '1rem',
            textShadow: '0 2px 4px rgba(0,0,0,0.3)',
            lineHeight: 1.2,
            whiteSpace: 'pre-line' 
          }}>
            {heroTitle}
          </h1>
          <p style={{
            fontSize: '1.25rem',
            maxWidth: '700px',
            margin: '0 auto 2rem',
            textShadow: '0 1px 2px rgba(0,0,0,0.3)',
            fontWeight: '400'
          }}>
            {heroDescription}
          </p>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            {isB2bEnabled && (
            <Link href="/b2b/register">
              <button className="btn btn-primary" style={{
                fontSize: '1.2rem',
                padding: '1rem 2.5rem',
                fontWeight: 'bold',
                boxShadow: '0 8px 20px rgba(46, 204, 113, 0.4)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                transform: 'scale(1.05)'
              }}>
                <span>🏢</span> Institucional
              </button>
            </Link>
            )}
            
            <Link href="/register" style={{ textDecoration: 'none' }}>
              <button className={isB2bEnabled ? "btn" : "btn btn-primary"} style={{
                fontSize: isB2bEnabled ? '1.1rem' : '1.3rem',
                padding: isB2bEnabled ? '1rem 2rem' : '1rem 3rem',
                backgroundColor: isB2bEnabled ? 'rgba(255, 255, 255, 0.95)' : undefined,
                color: isB2bEnabled ? '#374151' : undefined,
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                boxShadow: !isB2bEnabled ? '0 8px 25px rgba(46, 204, 113, 0.5)' : undefined,
                transform: !isB2bEnabled ? 'scale(1.1)' : undefined,
                cursor: 'pointer'
              }}>
                <span>{isB2bEnabled ? '🛒' : '🛒'}</span> {isB2bEnabled ? 'Hogar / Registro' : 'Ver Catálogo Completo'}
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* VALUE PROPOSITION (SEO Content) */}
      <section style={{ padding: '4rem 0', backgroundColor: '#F9FAFB' }}>
        <div className="container" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '3rem', textAlign: 'center' }}>
          {valueProps.map((prop: { icon: string; title: string; desc: string }, i: number) => (
            <div key={i}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>{prop.icon}</div>
              <h3 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '0.5rem' }}>{prop.title}</h3>
              <p style={{ color: 'var(--text-muted)' }}>{prop.desc}</p>
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
            <h2 style={{
              fontSize: '2rem',
              fontWeight: '900',
              color: 'var(--primary-dark)',
              textTransform: 'uppercase',
              letterSpacing: '-0.02em',
              margin: 0
            }}>
              {featuredTitle}
            </h2>
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
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <h2 className="section-title">{catalogTitle}</h2>
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
                  ...(q ? { q } : {}),
                  category: cat
                }).toString()}#catalog`}
                scroll={false}
                style={{
                  padding: '0.6rem 1.4rem',
                  borderRadius: '30px',
                  fontSize: '0.95rem',
                  fontWeight: '600',
                  textDecoration: 'none',
                  border: '1px solid var(--border)',
                  backgroundColor: (category === cat || (!category && cat === 'Todos')) ? 'var(--primary)' : 'white',
                  color: (category === cat || (!category && cat === 'Todos')) ? 'white' : 'var(--text-main)',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: (category === cat || (!category && cat === 'Todos')) ? '0 4px 12px rgba(46, 204, 113, 0.2)' : 'var(--shadow-sm)'
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
