import Link from 'next/link';
import { Flame, ShoppingBasket, X } from 'lucide-react';
import { getAppSettings, getProductSalesRanking, getVisibleProducts } from '@/lib/data';
import { CATEGORY_MAP } from '@/lib/constants';
import { translations, type Locale } from '@/lib/translations';
import type { Product } from '@/lib/supabase';
import {
  RECIPE_BUNDLES,
  buildStorefrontRuntimeConfig,
  filterStorefrontProductsByFrioganMode,
  isFrioganProteinProduct,
  isOfferOrPromoProduct,
  resolveProductStorefrontPresentation,
  resolveRecipeBundleProducts,
  resolveStorefrontPrice,
} from '@/lib/storefront/storefrontEngine';
import StorefrontPromoStage from '@/components/storefront/StorefrontPromoStage';
import FrioganShowcaseRail from '@/components/storefront/FrioganShowcaseRail';
import HorecaExecutiveBand from '@/components/storefront/HorecaExecutiveBand';
import ProductGridContainer from '@/components/ProductGridContainer';
import FeaturedProductsCarousel from '@/components/FeaturedProductsCarousel';

export const dynamic = 'force-dynamic';

function selectFeaturedProducts(products: Product[], locale: Locale): Product[] {
  const priced = products.filter((p) => {
    const pres = resolveProductStorefrontPresentation(p, locale);
    return resolveStorefrontPrice(p, pres.defaultOption).isPriceAvailable;
  });

  const result: Product[] = [];
  const addedIds = new Set<string>();
  const catCount: Record<string, number> = {};

  const hasTag = (p: Product, keys: string[]) =>
    Array.isArray(p.tags) &&
    p.tags.some((tag) => keys.some((k) => String(tag || '').toLowerCase().includes(k)));

  for (const p of priced.filter((item) => hasTag(item, ['promo', 'oferta', 'descuento', 'temporada']))) {
    if (result.length >= 10) break;
    if (!addedIds.has(p.id)) {
      result.push(p);
      addedIds.add(p.id);
      const cat = p.category || 'Otros';
      catCount[cat] = (catCount[cat] || 0) + 1;
    }
  }

  for (const p of priced.filter((item) => hasTag(item, ['vendido', 'best', 'top', 'estrella']))) {
    if (result.length >= 10) break;
    if (!addedIds.has(p.id)) {
      result.push(p);
      addedIds.add(p.id);
      const cat = p.category || 'Otros';
      catCount[cat] = (catCount[cat] || 0) + 1;
    }
  }

  if (result.length < 10) {
    const dailySeed = new Date().getDate();
    const remaining = priced
      .filter((p) => !addedIds.has(p.id))
      .sort((a, b) => {
        const sA = (parseInt(a.id.slice(0, 8), 16) || a.name.length) * dailySeed;
        const sB = (parseInt(b.id.slice(0, 8), 16) || b.name.length) * dailySeed;
        return (sA % 100) - (sB % 100);
      });

    for (const p of remaining) {
      if (result.length >= 10) break;
      const cat = p.category || 'Otros';
      if ((catCount[cat] || 0) < 2) {
        result.push(p);
        addedIds.add(p.id);
        catCount[cat] = (catCount[cat] || 0) + 1;
      }
    }
  }

  return result;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; lang?: string }>;
}) {
  const { q, category, lang } = await searchParams;
  const locale: Locale = lang === 'en' ? 'en' : 'es';
  const isEn = locale === 'en';
  const t = translations[locale];

  const [settingsRows, allRawProducts, salesRanking] = await Promise.all([
    getAppSettings(),
    getVisibleProducts(),
    getProductSalesRanking(),
  ]);

  const config = buildStorefrontRuntimeConfig(settingsRows || [], allRawProducts || []);
  const visibleProducts = filterStorefrontProductsByFrioganMode(allRawProducts || [], config.frioganMode);
  const settingsMap = new Map<string, string>(
    (settingsRows || []).map((s: { key?: string; value?: string | null }) => [String(s?.key || ''), String(s?.value ?? '')])
  );

  const activeCatCode = (category || 'Todos').trim().toUpperCase();
  const isFiltered = Boolean(q || (category && category !== 'Todos'));
  const catalogHeading = (() => {
    if (q) return isEn ? `Results for "${q}"` : `Resultados para "${q}"`;
    if (activeCatCode === 'OFERTAS') return isEn ? 'Today’s Featured Deals' : 'Ofertas y Cosechas de Hoy';
    if (activeCatCode === 'CP' && config.frioganMode === 'LIVE') {
      return isEn ? 'Friogan Butcher Showcase' : 'Carnicería Friogan al Vacío';
    }
    if (category && category !== 'Todos') {
      return isEn
        ? t.categories[activeCatCode as keyof typeof t.categories] || CATEGORY_MAP[activeCatCode] || category
        : CATEGORY_MAP[activeCatCode] || category;
    }
    return settingsMap.get('home_catalog_title') || (isEn ? 'Fresh Market Catalog' : 'Catálogo de Mercado Fresco');
  })();

  const featuredTitle =
    settingsMap.get('home_featured_title') ||
    (isEn ? 'Top 10 Best Sellers' : 'Top 10 Más Vendidos');
  const featuredProducts = !isFiltered
    ? visibleProducts
        .filter((p) => {
          const pres = resolveProductStorefrontPresentation(p, locale);
          return resolveStorefrontPrice(p, pres.defaultOption).isPriceAvailable;
        })
        .sort((a, b) => {
          const salesA = salesRanking[a.id] || 0;
          const salesB = salesRanking[b.id] || 0;
          if (salesA !== salesB) return salesB - salesA;
          const offerA = isOfferOrPromoProduct(a) ? 1 : 0;
          const offerB = isOfferOrPromoProduct(b) ? 1 : 0;
          if (offerA !== offerB) return offerB - offerA;
          return (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' });
        })
        .slice(0, 10)
    : [];

  const recipeProductsMap = new Map<string, Product>();
  for (const bundle of RECIPE_BUNDLES) {
    const matched = resolveRecipeBundleProducts(visibleProducts, bundle.id, config.frioganMode, locale);
    for (const item of matched) {
      if (!recipeProductsMap.has(item.product.id)) {
        recipeProductsMap.set(item.product.id, item.product);
      }
    }
  }
  const recipeProducts = Array.from(recipeProductsMap.values());
  const frioganRailProducts =
    config.frioganMode === 'LIVE'
      ? visibleProducts.filter((p) => isFrioganProteinProduct(p)).slice(0, 12)
      : [];

  return (
    <main style={{ backgroundColor: '#FAF9F6', minHeight: '100vh', overflowX: 'clip' }}>
      <StorefrontPromoStage products={recipeProducts} config={config} locale={locale} />

      <FrioganShowcaseRail products={frioganRailProducts} config={config} locale={locale} />

      {/* Main Direct-Add Storefront Catalog Grid */}
      <section
        id="catalog"
        aria-label={isEn ? 'Product Catalog' : 'Catálogo de Productos'}
        style={{ maxWidth: '1440px', margin: '0 auto', padding: '12px 16px 24px', scrollMarginTop: '195px' }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
            marginBottom: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShoppingBasket size={20} color="#0D7A57" aria-hidden="true" />
            <h2
              style={{
                margin: 0,
                fontFamily: 'var(--font-outfit), sans-serif',
                fontWeight: 800,
                fontSize: 'clamp(1.2rem, 2vw, 1.55rem)',
                color: '#081C15',
                letterSpacing: '-0.02em',
              }}
            >
              {catalogHeading}
            </h2>
          </div>

          {isFiltered && (
            <Link
              href={isEn ? '/?lang=en#catalog' : '/#catalog'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                minHeight: '44px',
                padding: '8px 14px',
                borderRadius: '9999px',
                backgroundColor: '#FFFFFF',
                border: '1px solid rgba(8,28,21,0.14)',
                color: '#081C15',
                fontSize: '0.84rem',
                fontWeight: 700,
              }}
            >
              <X size={14} aria-hidden="true" />
              <span>{isEn ? 'Clear filters' : 'Ver todo el mercado'}</span>
            </Link>
          )}
        </div>

        <ProductGridContainer q={q} category={category} locale={locale} />
      </section>

      {featuredProducts.length > 0 && (
        <section
          aria-label={featuredTitle}
          style={{ maxWidth: '1440px', margin: '0 auto', padding: '10px 16px 8px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Flame size={18} color="#D97706" aria-hidden="true" />
              <h2
                style={{
                  margin: 0,
                  fontFamily: 'var(--font-outfit), sans-serif',
                  fontWeight: 800,
                  fontSize: 'clamp(1.1rem, 2vw, 1.3rem)',
                  color: '#081C15',
                }}
              >
                {featuredTitle}
              </h2>
            </div>
            <Link
              href={isEn ? '/?lang=en&category=OFERTAS#catalog' : '/?category=OFERTAS#catalog'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: '44px',
                fontSize: '0.84rem',
                fontWeight: 700,
                color: '#0D7A57',
              }}
            >
              {isEn ? 'See all deals →' : 'Ver todas las ofertas →'}
            </Link>
          </div>
          <FeaturedProductsCarousel products={featuredProducts} locale={locale} />
        </section>
      )}

      <HorecaExecutiveBand config={config} locale={locale} />
    </main>
  );
}
