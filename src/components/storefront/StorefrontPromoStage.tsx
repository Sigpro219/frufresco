'use client';

import { FormEvent, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChefHat,
  Loader2,
  ShieldCheck,
  Snowflake,
  Tag,
  X,
} from 'lucide-react';
import { useCart } from '@/lib/cartContext';
import type { Product } from '@/lib/supabase';
import type { Locale } from '@/lib/translations';
import type { CanonicalRecipeId, RecipeBundleItemResult, StorefrontRuntimeConfig } from '@/lib/storefront/storefrontContracts';
import {
  RECIPE_BUNDLES,
  buildStorefrontCartItem,
  calculateRecipeServingQuantity,
  resolveProductStorefrontPresentation,
  resolveRecipeBundleProducts,
} from '@/lib/storefront/storefrontEngine';

interface StorefrontPromoStageProps {
  products: Product[];
  config: StorefrontRuntimeConfig;
  locale: Locale;
}

export default function StorefrontPromoStage({ products, config, locale }: StorefrontPromoStageProps) {
  const { addItem, openDrawer } = useCart();
  const [activeRecipeId, setActiveRecipeId] = useState<CanonicalRecipeId | null>(null);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [teaserName, setTeaserName] = useState('');
  const [teaserPhone, setTeaserPhone] = useState('');
  const [teaserLoading, setTeaserLoading] = useState(false);
  const [teaserError, setTeaserError] = useState<string | null>(null);
  const [teaserLeadId, setTeaserLeadId] = useState<string | null>(null);
  const [showAllRecipes, setShowAllRecipes] = useState(false);
  const [servings, setServings] = useState<number>(4);

  const visibleBundles = showAllRecipes ? RECIPE_BUNDLES : RECIPE_BUNDLES.slice(0, 6);

  const activeBundle = useMemo(() => RECIPE_BUNDLES.find((b) => b.id === activeRecipeId) || null, [activeRecipeId]);
  const resolvedIngredients = useMemo<RecipeBundleItemResult[]>(
    () => (activeRecipeId ? resolveRecipeBundleProducts(products, activeRecipeId, config.frioganMode, locale) : []),
    [activeRecipeId, products, config.frioganMode, locale]
  );

  const computeQuantitiesForServings = (items: RecipeBundleItemResult[], targetServings: number) => {
    const nextQty: Record<string, number> = {};
    for (const item of items) {
      nextQty[item.product.id] = calculateRecipeServingQuantity(
        item.matchedTerm,
        targetServings,
        item.defaultOption.weightKg
      );
    }
    return nextQty;
  };

  const openRecipeModal = (bundleId: CanonicalRecipeId) => {
    const items = resolveRecipeBundleProducts(products, bundleId, config.frioganMode, locale);
    const defaultServings = 4;
    const nextSel: Record<string, boolean> = {};
    for (const item of items) {
      nextSel[item.product.id] = true;
    }
    setServings(defaultServings);
    setSelectedIds(nextSel);
    setQuantities(computeQuantitiesForServings(items, defaultServings));
    setActiveRecipeId(bundleId);
  };

  const handleServingsChange = (nextVal: number) => {
    const clamped = Math.max(1, Math.min(500, Math.round(nextVal || 1)));
    setServings(clamped);
    setQuantities(computeQuantitiesForServings(resolvedIngredients, clamped));
  };

  const bundleSubtotal = useMemo(
    () =>
      resolvedIngredients.reduce((acc, item) => {
        if (!selectedIds[item.product.id]) return acc;
        const qty = Math.max(1, quantities[item.product.id] || 1);
        return acc + Math.ceil((item.price.displayPrice * qty) / 50) * 50;
      }, 0),
    [resolvedIngredients, selectedIds, quantities]
  );

  const handleAddBundleToCart = () => {
    let added = 0;
    for (const item of resolvedIngredients) {
      if (!selectedIds[item.product.id]) continue;
      const qty = Math.max(1, quantities[item.product.id] || 1);
      const pres = resolveProductStorefrontPresentation(item.product, locale);
      addItem(buildStorefrontCartItem(item.product, item.defaultOption, qty, pres.options.length, pres.kind, item.price, locale));
      added += 1;
    }
    if (added > 0) {
      setActiveRecipeId(null);
      openDrawer();
    }
  };

  const handleTeaserSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTeaserError(null);
    setTeaserLoading(true);
    try {
      const res = await fetch('/api/storefront/lead-express', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'FRIOGAN_TEASER',
          segment: 'HOGAR',
          contact_name: teaserName,
          phone: teaserPhone,
          notes: 'Registro prioritario Carnicería al Vacío FruFresco × Friogan',
        }),
      });
      const json = await res.json();
      if (!res.ok) setTeaserError(json.error || 'No pudimos guardar tu registro.');
      else {
        setTeaserLeadId(json.leadId || 'OK');
        setTeaserName('');
        setTeaserPhone('');
      }
    } catch {
      setTeaserError('Error de conexión al enviar tu solicitud.');
    } finally {
      setTeaserLoading(false);
    }
  };

  const heroBg = config.heroImageUrl || '/hero_fresh_produce.png';
  const isOptimizableHero =
    heroBg.startsWith('/') || heroBg.includes('.supabase.co/storage/v1/object/public/');

  return (
    <section aria-label={locale === 'en' ? 'Featured store stage' : 'Vitrina y recetas destacadas'} style={{ maxWidth: '1440px', margin: '0 auto', padding: '16px 20px 8px' }}>
      <div className="sf-stage-grid">
        {/* Boutique Photo Editorial Banner */}
        <div className="sf-promo-hero">
          <Image
            src={heroBg}
            alt={locale === 'en' ? 'Fresh morning harvest at FruFresco' : 'Cosecha fresca de mañana en FruFresco'}
            fill
            priority
            sizes="(max-width: 960px) 100vw, 55vw"
            unoptimized={!isOptimizableHero}
            style={{ objectFit: 'cover', zIndex: 0 }}
          />
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(100deg, rgba(8,28,21,0.92) 0%, rgba(8,28,21,0.74) 55%, rgba(8,28,21,0.45) 100%)',
              zIndex: 0,
            }}
          />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: 'rgba(250,249,246,0.14)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.2)', color: '#D1FAE5', padding: '4px 12px', borderRadius: '9999px', fontSize: '0.8125rem', fontWeight: 700, marginBottom: '10px' }}>
              <ShieldCheck size={14} aria-hidden="true" />
              {locale === 'en' ? 'Farm-direct morning harvest' : 'Cosecha de madrugada · Entrega AM en Bogotá y Sabana'}
            </span>
            <h1 style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 800, fontSize: 'clamp(1.45rem, 2.3vw, 1.95rem)', lineHeight: 1.14, letterSpacing: '-0.02em', margin: 0, color: '#FFFFFF', maxWidth: '24ch' }}>
              {locale === 'en' ? 'Farm-fresh Colombian harvest, handpicked every morning.' : 'Del campo a tu cocina, cosecha seleccionada cada mañana.'}
            </h1>
          </div>

          <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <Link href={locale === 'en' ? '/?lang=en&category=OFERTAS#catalog' : '/?category=OFERTAS#catalog'} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', backgroundColor: '#F59E0B', color: '#081C15', padding: '10px 18px', borderRadius: '9999px', fontWeight: 800, fontSize: '0.875rem', boxShadow: '0 6px 16px rgba(0,0,0,0.22)' }}>
              <Tag size={15} aria-hidden="true" />
              <span>{locale === 'en' ? 'See Today’s Deals' : 'Ver Ofertas del Día'}</span>
            </Link>
            <Link href={locale === 'en' ? '/?lang=en#catalog' : '/#catalog'} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#FAF9F6', fontWeight: 700, fontSize: '0.875rem', padding: '9px 14px', borderRadius: '9999px', border: '1px solid rgba(255,255,255,0.28)', backgroundColor: 'rgba(8,28,21,0.35)' }}>
              <span>{locale === 'en' ? 'Full catalog' : 'Explorar catálogo'}</span>
              <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </div>

        {/* Boutique Recipe Tiles Card */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: '20px', border: '1px solid #E5DFD3', padding: '18px 20px', flex: 1, boxShadow: '0 8px 24px -14px rgba(8,28,21,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', paddingBottom: '10px', borderBottom: '1px solid #F1ECE1' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ width: '34px', height: '34px', borderRadius: '10px', backgroundColor: '#081C15', color: '#D1FAE5', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ChefHat size={18} aria-hidden="true" />
                </span>
                <div>
                  <h2 style={{ margin: 0, fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 800, fontSize: '1.02rem', color: '#081C15', letterSpacing: '-0.01em' }}>
                    {locale === 'en' ? 'Chef Recipe Kits' : 'Canastas por Receta'}
                  </h2>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748B', fontWeight: 500 }}>
                    {locale === 'en' ? 'Add all fresh ingredients in one click' : 'Arma tu receta tradicional en un clic'}
                  </p>
                </div>
              </div>
              <span style={{ fontSize: '0.78rem', color: '#0D7A57', fontWeight: 700, backgroundColor: '#ECFDF5', padding: '4px 10px', borderRadius: '9999px' }}>
                {locale === 'en' ? '7 curated kits' : '7 recetas'}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', gap: '8px' }}>
              {visibleBundles.map((bundle) => (
                <button
                  key={bundle.id}
                  type="button"
                  onClick={() => openRecipeModal(bundle.id)}
                  className="sf-recipe-tile"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '10px 12px', borderRadius: '12px', backgroundColor: '#FAF8F4', border: '1px solid #EAE3D5', color: '#081C15', fontSize: '0.84rem', fontWeight: 700, textAlign: 'left', transition: 'all 150ms ease' }}
                >
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#081C15' }}>
                      {locale === 'en' ? bundle.labelEn : bundle.labelEs}
                    </span>
                    <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#0D7A57' }}>
                      {bundle.ingredientMatchTerms.length} {locale === 'en' ? 'ingredients' : 'ingredientes'}
                    </span>
                  </span>
                  <span style={{ width: '24px', height: '24px', borderRadius: '9999px', backgroundColor: '#FFFFFF', border: '1px solid #E5DFD3', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#081C15' }}>
                    <ArrowUpRight size={13} aria-hidden="true" />
                  </span>
                </button>
              ))}
            </div>
            {RECIPE_BUNDLES.length > 6 && (
              <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowAllRecipes((v) => !v)}
                  style={{
                    background: 'transparent',
                    border: '1px solid #E5DFD3',
                    borderRadius: '9999px',
                    padding: '5px 12px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    color: '#0D7A57',
                  }}
                >
                  {showAllRecipes
                    ? (locale === 'en' ? 'Show fewer recipes' : 'Ver menos recetas')
                    : (locale === 'en'
                        ? `See more recipes (+${RECIPE_BUNDLES.length - 6})`
                        : `Ver más recetas (+${RECIPE_BUNDLES.length - 6})`)}
                </button>
              </div>
            )}
          </div>

          {config.frioganMode === 'TEASER' && (
            <div id="friogan-stage" style={{ backgroundColor: '#FFF5F5', borderRadius: '16px', border: '1px solid rgba(127,29,29,0.24)', padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '6px', color: '#7F1D1D', fontWeight: 800, fontSize: '0.88rem' }}>
                <Snowflake size={16} aria-hidden="true" />
                <span>Próximamente: Carnicería al Vacío FruFresco × Friogan</span>
              </div>
              {teaserLeadId ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 10px', borderRadius: '10px', backgroundColor: '#ECFDF5', color: '#065F46', fontSize: '0.8125rem', fontWeight: 700 }}>
                  <CheckCircle2 size={16} />
                  <span>¡Registro confirmado! Te avisaremos primero cuando abramos los cortes Friogan.</span>
                </div>
              ) : (
                <form onSubmit={handleTeaserSubmit} style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <input type="text" required value={teaserName} onChange={(e) => setTeaserName(e.target.value)} placeholder="Tu nombre" style={{ flex: '1 1 110px', padding: '7px 10px', borderRadius: '9px', border: '1px solid rgba(127,29,29,0.25)', fontSize: '0.84rem', backgroundColor: '#FFFFFF' }} />
                  <input type="tel" required value={teaserPhone} onChange={(e) => setTeaserPhone(e.target.value)} placeholder="WhatsApp (300...)" style={{ flex: '1 1 120px', padding: '7px 10px', borderRadius: '9px', border: '1px solid rgba(127,29,29,0.25)', fontSize: '0.84rem', backgroundColor: '#FFFFFF' }} />
                  <button type="submit" disabled={teaserLoading} style={{ padding: '7px 14px', borderRadius: '9px', border: 'none', backgroundColor: '#7F1D1D', color: '#FFFFFF', fontWeight: 700, fontSize: '0.84rem', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    {teaserLoading && <Loader2 size={14} className="animate-spin" />}
                    <span>Avísame</span>
                  </button>
                  {teaserError && <span style={{ width: '100%', fontSize: '0.8125rem', color: '#991B1B', fontWeight: 600 }}>{teaserError}</span>}
                </form>
              )}
            </div>
          )}
        </div>
      </div>

      {activeBundle && (
        <div role="dialog" aria-modal="true" aria-label={activeBundle.labelEs} onClick={() => setActiveRecipeId(null)} style={{ position: 'fixed', inset: 0, zIndex: 10050, backgroundColor: 'rgba(8,28,21,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: '#FFFFFF', borderRadius: '20px', width: '100%', maxWidth: '520px', maxHeight: 'min(84dvh, 660px)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 48px -12px rgba(8,28,21,0.35)' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(8,28,21,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FAF9F6' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ChefHat size={19} color="#0D7A57" />
                <h3 style={{ margin: 0, fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 800, fontSize: '1.05rem', color: '#081C15' }}>
                  Kit {locale === 'en' ? activeBundle.labelEn : activeBundle.labelEs}
                </h3>
              </div>
              <button type="button" onClick={() => setActiveRecipeId(null)} aria-label="Cerrar modal" style={{ background: '#FFFFFF', border: '1px solid rgba(8,28,21,0.12)', borderRadius: '9999px', width: '32px', height: '32px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={16} />
              </button>
            </div>

            {/* Friendly Servings Calculator Bar */}
            <div style={{ padding: '10px 18px', backgroundColor: '#F7F4ED', borderBottom: '1px solid #EAE3D5', display: 'flex', flexDirection: 'column', gap: '7px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#081C15' }}>
                  {locale === 'en' ? 'How many servings?' : '¿Para cuántos platos?'}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                  {[4, 8, 15, 30].map((preset) => {
                    const active = servings === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handleServingsChange(preset)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '9999px',
                          border: active ? '1px solid #081C15' : '1px solid #DCD4C4',
                          backgroundColor: active ? '#081C15' : '#FFFFFF',
                          color: active ? '#FFFFFF' : '#081C15',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                        }}
                      >
                        {preset}
                      </button>
                    );
                  })}
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: '4px', backgroundColor: '#FFFFFF', borderRadius: '9999px', border: '1px solid #DCD4C4', padding: '2px 6px' }}>
                    <button type="button" onClick={() => handleServingsChange(servings - 1)} aria-label="Menos platos" style={{ border: 'none', background: 'transparent', fontWeight: 800, padding: '0 4px', color: '#081C15' }}>-</button>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={servings}
                      onChange={(e) => handleServingsChange(Number(e.target.value))}
                      aria-label={locale === 'en' ? 'Number of servings' : 'Cantidad de platos'}
                      style={{ width: '40px', textAlign: 'center', border: 'none', fontSize: '0.82rem', fontWeight: 800, color: '#081C15', background: 'transparent' }}
                    />
                    <button type="button" onClick={() => handleServingsChange(servings + 1)} aria-label="Más platos" style={{ border: 'none', background: 'transparent', fontWeight: 800, padding: '0 4px', color: '#081C15' }}>+</button>
                  </div>
                </div>
              </div>
              <span style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 500 }}>
                {locale === 'en'
                  ? 'Estimated from standard Colombian culinary yields (includes prep waste). You can adjust any item below.'
                  : 'Cálculo estimado según porción estándar colombiana (incluye merma). Puedes ajustar cada producto abajo.'}
              </span>
            </div>

            <div style={{ padding: '12px 18px', overflowY: 'auto', overscrollBehavior: 'contain', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {resolvedIngredients.map((item) => {
                const checked = Boolean(selectedIds[item.product.id]);
                const qty = quantities[item.product.id] || 1;
                return (
                  <div key={item.product.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '9px 11px', borderRadius: '12px', border: `1px solid ${checked ? 'rgba(13,122,87,0.32)' : 'rgba(8,28,21,0.1)'}`, backgroundColor: checked ? '#F0FDF4' : '#FFFFFF' }}>
                    <button type="button" onClick={() => setSelectedIds((p) => ({ ...p, [item.product.id]: !checked }))} style={{ display: 'flex', alignItems: 'center', gap: '9px', border: 'none', background: 'transparent', textAlign: 'left', flex: 1, minWidth: 0 }}>
                      <span style={{ width: '18px', height: '18px', borderRadius: '5px', backgroundColor: checked ? '#0D7A57' : '#FFFFFF', border: `1.5px solid ${checked ? '#0D7A57' : '#94A3B8'}`, color: '#FFFFFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {checked && <Check size={12} strokeWidth={3} />}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#081C15', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.product.display_name || item.product.name}
                        </div>
                        <div style={{ fontSize: '0.8125rem', color: '#475569', fontVariantNumeric: 'tabular-nums' }}>
                          {item.defaultOption.label} · <strong>${item.price.displayPrice.toLocaleString('es-CO')}</strong>
                        </div>
                      </div>
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <button type="button" onClick={() => setQuantities((p) => ({ ...p, [item.product.id]: Math.max(1, (p[item.product.id] || 1) - 1) }))} style={{ width: '26px', height: '26px', borderRadius: '8px', border: '1px solid rgba(8,28,21,0.16)', backgroundColor: '#FFFFFF', fontWeight: 700 }}>-</button>
                      <span style={{ minWidth: '18px', textAlign: 'center', fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontSize: '0.84rem' }}>{qty}</span>
                      <button type="button" onClick={() => setQuantities((p) => ({ ...p, [item.product.id]: (p[item.product.id] || 1) + 1 }))} style={{ width: '26px', height: '26px', borderRadius: '8px', border: '1px solid rgba(8,28,21,0.16)', backgroundColor: '#FFFFFF', fontWeight: 700 }}>+</button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ padding: '12px 18px', borderTop: '1px solid rgba(8,28,21,0.08)', backgroundColor: '#FAF9F6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
              <Link href={`/?q=${encodeURIComponent(activeBundle.searchQuery)}${locale === 'en' ? '&lang=en' : ''}#catalog`} onClick={() => setActiveRecipeId(null)} style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0D7A57' }}>
                Ver en catálogo
              </Link>
              <button type="button" disabled={bundleSubtotal <= 0} onClick={handleAddBundleToCart} style={{ backgroundColor: bundleSubtotal > 0 ? '#0D7A57' : '#94A3B8', color: '#FFFFFF', border: 'none', borderRadius: '9999px', padding: '9px 16px', fontWeight: 800, fontSize: '0.875rem', fontVariantNumeric: 'tabular-nums' }}>
                Agregar al carrito · ${bundleSubtotal.toLocaleString('es-CO')}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .sf-stage-grid { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 14px; align-items: stretch; }
        .sf-promo-hero { position: relative; overflow: hidden; border-radius: 20px; padding: 26px 28px; display: flex; flex-direction: column; justify-content: space-between; gap: 18px; min-height: 295px; height: 100%; box-shadow: 0 14px 32px -12px rgba(8, 28, 21, 0.3); }
        .sf-recipe-tile:hover { background-color: #ECFDF5 !important; border-color: rgba(13, 122, 87, 0.35) !important; }
        @media (max-width: 960px) { .sf-stage-grid { grid-template-columns: 1fr; } .sf-promo-hero { max-height: none; } }
      `}</style>
    </section>
  );
}
