'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ChevronRight,
  Flame,
  Leaf,
  Minus,
  Plus,
  ShoppingBag,
  Snowflake,
  Sparkles,
  Tag,
  Zap,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { CATEGORY_MAP } from '@/lib/constants';
import { useCart } from '@/lib/cartContext';
import { translations, type Locale } from '@/lib/translations';
import {
  buildCartItemName,
  buildStorefrontCartItem,
  isFrioganProteinProduct,
  resolveProductStorefrontPresentation,
  resolveStorefrontPrice,
} from '@/lib/storefront/storefrontEngine';

interface ProductDetailProps {
  id: string;
  name: string;
  name_en?: string;
  display_name?: string;
  description?: string;
  description_en?: string;
  unit_of_measure: string;
  web_unit?: string;
  web_conversion_factor?: number;
  image_url: string;
  iva_rate?: number;
  options_config?: { name: string; values: string[] }[];
  pricing_model_prices?: { price: number; model_id?: string }[];
  weight_kg?: number | null;
  category?: string;
  inventory_group?: string;
  tags?: string[];
  accounting_id?: number | null;
  campaign_info?: {
    campaignName?: string;
    originalPrice?: number;
    adjustmentValue?: number;
    type?: string;
  } | null;
}

const BADGE_STYLE_MAP = {
  promo: { bg: '#FEF2F2', color: '#DC2626', border: '1px solid #FCA5A5' },
  harvest: { bg: '#ECFDF5', color: '#059669', border: '1px solid #A7F3D0' },
  best: { bg: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A' },
  gourmet: { bg: '#F5F3FF', color: '#7C3AED', border: '1px solid #DDD6FE' },
  plain: { bg: 'rgba(8,28,21,0.04)', color: '#081C15', border: '1px solid rgba(8,28,21,0.09)' },
};

export default function ProductDetailClient({ product }: { product: ProductDetailProps }) {
  const { addItem, items, openDrawer } = useCart();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEn = searchParams.get('lang') === 'en';
  const locale: Locale = isEn ? 'en' : 'es';
  const t = translations[locale];

  const isFriogan = isFrioganProteinProduct(product);
  const sfPresentation = useMemo(
    () => resolveProductStorefrontPresentation(product, locale),
    [product, locale]
  );

  const [selectedOptKey, setSelectedOptKey] = useState<string>(sfPresentation.defaultOption.key);
  const [extraSelections, setExtraSelections] = useState<Record<string, string>>({});
  const [visibleAttrNames, setVisibleAttrNames] = useState<Set<string> | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [inputValue, setInputValue] = useState('1');

  useEffect(() => {
    if (!sfPresentation.options.some((o) => o.key === selectedOptKey)) {
      setSelectedOptKey(sfPresentation.defaultOption.key);
    }
  }, [sfPresentation, selectedOptKey]);

  useEffect(() => {
    supabase
      .from('product_attributes_master')
      .select('name, show_on_web')
      .then(({ data }) => {
        if (!data) return;
        const allowed = new Set<string>(
          data.filter((a) => a.show_on_web !== false).map((a) => String(a.name || '').toLowerCase())
        );
        setVisibleAttrNames(allowed);
      });
  }, []);

  const extraOptionGroups = useMemo(() => {
    if (isFriogan || !Array.isArray(product.options_config)) return [];
    return product.options_config
      .filter((grp) => {
        const lower = String(grp?.name || '').toLowerCase();
        if (lower.includes('presentaci') || lower.includes('presentation') || lower.includes('gramaje')) {
          return false;
        }
        if (visibleAttrNames && visibleAttrNames.size > 0 && !visibleAttrNames.has(lower)) {
          return false;
        }
        return Array.isArray(grp.values) && grp.values.length > 0;
      })
      .map((grp) => {
        const isRipeness = grp.name.toLowerCase().includes('madura');
        const cleanValues = grp.values.filter((v) => {
          const clean = (v.includes('|') ? v.split('|')[0] : v).trim().toLowerCase();
          return !isRipeness || (clean !== 'maduro' && clean !== 'madura');
        });
        return { name: grp.name, values: cleanValues };
      })
      .filter((grp) => grp.values.length > 0);
  }, [isFriogan, product.options_config, visibleAttrNames]);

  useEffect(() => {
    if (extraOptionGroups.length === 0) return;
    setExtraSelections((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const grp of extraOptionGroups) {
        if (!next[grp.name] || !grp.values.includes(next[grp.name])) {
          next[grp.name] = grp.values[0];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [extraOptionGroups]);

  const activeOption =
    sfPresentation.options.find((o) => o.key === selectedOptKey) || sfPresentation.defaultOption;
  const priceRes = resolveStorefrontPrice(product, activeOption);
  const safeQty = Math.max(1, Math.round(quantity || 1));

  const cartItemName = useMemo(() => {
    const includeSuffix =
      sfPresentation.options.length > 1 || sfPresentation.kind === 'FIXED_VACUUM_PACK';
    const baseName = buildCartItemName(product, activeOption, includeSuffix, locale);
    const extraEntries = Object.entries(extraSelections);
    if (isFriogan || extraEntries.length === 0) return baseName;
    const extraStr = extraEntries
      .map(([k, v]) => `${k}: ${v.includes('|') ? v.split('|')[0].trim() : v}`)
      .join(', ');
    return `${baseName} · ${extraStr}`;
  }, [product, activeOption, sfPresentation, locale, extraSelections, isFriogan]);

  const existingInCart = useMemo(
    () =>
      items?.find((i) => i.id === product.id && i.name === cartItemName) ||
      items?.find((i) => i.id === product.id),
    [items, product.id, cartItemName]
  );

  const quantityFeedback = useMemo(() => {
    const totalWeightKg = Math.round(safeQty * activeOption.weightKg * 1000) / 1000;
    const totalGrams = Math.round(safeQty * activeOption.weightKg * 1000);
    if (isFriogan) {
      const unitWord = safeQty === 1 ? (isEn ? 'Pack' : 'Paquete') : isEn ? 'Packs' : 'Paquetes';
      return isEn
        ? `${safeQty} ${unitWord} (${totalGrams.toLocaleString('es-CO')} g exact vacuum sealed)`
        : `${safeQty} ${unitWord} (${totalGrams.toLocaleString('es-CO')} g exactos al vacío)`;
    }
    if (activeOption.cartUnit === 'Lb') {
      const unitWord = safeQty === 1 ? (isEn ? 'Pound' : 'Libra') : isEn ? 'Pounds' : 'Libras';
      return `${safeQty} ${unitWord} (~${totalGrams.toLocaleString('es-CO')} g aprox.)`;
    }
    if (totalWeightKg >= 1) {
      const labelKg = isEn ? totalWeightKg.toFixed(1).replace(/\.0$/, '') : totalWeightKg.toString().replace('.', ',');
      return `${safeQty} ${activeOption.cartUnit} (~${labelKg} kg aprox.)`;
    }
    if (totalGrams > 0) {
      return `${safeQty} ${activeOption.cartUnit} (~${totalGrams.toLocaleString('es-CO')} g aprox.)`;
    }
    return `${safeQty} ${activeOption.cartUnit}`;
  }, [safeQty, activeOption, isFriogan, isEn]);

  const title = isEn && product.name_en ? product.name_en : product.display_name || product.name;
  const description =
    (isEn && product.description_en ? product.description_en : product.description) ||
    (isEn ? 'Farm-direct fresh produce.' : 'Producto fresco de calidad seleccionada.');

  const commitQuantityInput = (raw: string) => {
    const clean = raw.replace(/[^0-9]/g, '');
    if (!clean) {
      setQuantity(1);
      setInputValue('1');
      return;
    }
    const parsed = Math.max(1, Math.floor(Number(clean)));
    setQuantity(parsed);
    setInputValue(String(parsed));
  };

  const buildCartPayload = () => {
    const item = buildStorefrontCartItem(
      product,
      activeOption,
      safeQty,
      sfPresentation.options.length,
      sfPresentation.kind,
      priceRes,
      locale
    );
    item.name = cartItemName;
    if (!isFriogan && Object.keys(extraSelections).length > 0) {
      item.selected_options = extraSelections;
    }
    return item;
  };

  const handleAdd = () => {
    if (!priceRes.isPriceAvailable) return;
    addItem(buildCartPayload());
    if (typeof window !== 'undefined') {
      const toastFn = (window as { showToast?: (msg: string, type: string) => void }).showToast;
      toastFn?.(t.addedToCart.replace('{name}', title), 'success');
    }
    openDrawer();
  };

  const handleBuyNow = () => {
    if (!priceRes.isPriceAvailable) return;
    addItem(buildCartPayload());
    router.push(isEn ? '/checkout?lang=en' : '/checkout');
  };

  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto', padding: '1rem 1rem 1.75rem' }}>
      <nav aria-label="Breadcrumb" style={{ marginBottom: '1rem', fontSize: '0.84rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <Link href={isEn ? '/?lang=en' : '/'} style={{ fontWeight: 500 }}>{t.navHome}</Link>
        <ChevronRight size={14} aria-hidden="true" />
        <Link href={isEn ? '/?lang=en#catalog' : '/#catalog'} style={{ fontWeight: 500 }}>{t.navCatalog || 'Catálogo'}</Link>
        <ChevronRight size={14} aria-hidden="true" />
        <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{title}</span>
      </nav>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', alignItems: 'stretch' }}>
        {/* Left Column: Compact 4:3 Image + Editorial Description Card */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <div style={{ borderRadius: '20px', overflow: 'hidden', border: '1px solid #E5DFD3', boxShadow: '0 10px 26px -14px rgba(8,28,21,0.14)', backgroundColor: '#FFFFFF', position: 'relative', aspectRatio: '4 / 3' }}>
            <Image src={product.image_url || '/placeholder_produce.png'} alt={title} fill style={{ objectFit: 'cover' }} priority />
            {product.image_url && (product.image_url.includes('clean') || product.image_url.includes('overlay')) && (
              <div style={{ position: 'absolute', bottom: '4%', right: '4%', width: '16%', height: '16%', pointerEvents: 'none' }}>
                <img src="/logo_simbolo.png" alt="FruFresco" style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              </div>
            )}
          </div>

          {description && (
            <div style={{ backgroundColor: '#FFFFFF', borderRadius: '18px', border: '1px solid #E5DFD3', padding: '0.95rem 1.15rem', flex: 1 }}>
              <h2 style={{ margin: '0 0 0.3rem', fontFamily: 'var(--font-outfit), sans-serif', fontSize: '0.84rem', fontWeight: 800, color: '#081C15' }}>
                {isEn ? 'About this product' : 'Sobre este producto'}
              </h2>
              <p style={{ margin: 0, color: '#475569', lineHeight: 1.45, fontSize: '0.82rem' }}>
                {description}
              </p>
            </div>
          )}
        </div>

        {/* Boutique Purchase Card */}
        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '24px', border: '1px solid #E5DFD3', padding: 'clamp(1.25rem, 3vw, 1.75rem)', boxShadow: '0 14px 34px -16px rgba(8,28,21,0.12)' }}>
          {existingInCart && (
            <div style={{ backgroundColor: '#FFFBEB', border: '1.5px solid #F59E0B', borderRadius: '14px', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.84rem', color: '#92400E', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <AlertTriangle size={18} color="#D97706" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <div style={{ fontWeight: 800, color: '#B45309' }}>{t.alreadyInCartTitle || 'Insumo ya incluido en tu pedido'}</div>
                <div style={{ marginTop: '2px', color: '#78350F' }}>
                  {(t.alreadyInCartMsg || 'Ya tienes {qty} {unit} de {name} en tu pedido.')
                    .replace('{qty}', String(existingInCart.quantity))
                    .replace('{unit}', existingInCart.unit || activeOption.cartUnit)
                    .replace('{name}', title)}
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: isFriogan ? '#7F1D1D' : '#0D7A57', backgroundColor: isFriogan ? '#FFF5F5' : '#ECFDF5', padding: '3px 10px', borderRadius: '9999px' }}>
              {CATEGORY_MAP[(product.category || '').trim().toUpperCase()] || (isEn ? 'Fresh Market' : 'Mercado Fresco')}
            </span>
            {Array.isArray(product.tags) && product.tags.map((tag) => {
              const lower = tag.toLowerCase();
              const isPromo = lower.includes('promo') || lower.includes('descuento') || lower.includes('oferta') || lower.includes('flash');
              const isHarvest = lower.includes('cosecha') || lower.includes('temporada') || lower.includes('fresco');
              const isBest = lower.includes('vendido') || lower.includes('best') || lower.includes('top');
              const tone = isPromo ? BADGE_STYLE_MAP.promo : isHarvest ? BADGE_STYLE_MAP.harvest : isBest ? BADGE_STYLE_MAP.best : BADGE_STYLE_MAP.plain;
              return (
                <span key={tag} style={{ backgroundColor: tone.bg, color: tone.color, border: tone.border, padding: '3px 9px', borderRadius: '8px', fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  {isPromo ? <Tag size={13} /> : isHarvest ? <Leaf size={13} /> : isBest ? <Flame size={13} /> : <Sparkles size={13} />}
                  <span>{tag}</span>
                </span>
              );
            })}
          </div>

          <h1 style={{ fontFamily: 'var(--font-outfit), sans-serif', fontSize: 'clamp(1.75rem, 3vw, 2.3rem)', fontWeight: 800, marginBottom: '0.45rem', color: '#081C15', lineHeight: 1.12 }}>
            {title}
          </h1>

          <div style={{ marginBottom: '1.1rem', fontVariantNumeric: 'tabular-nums' }}>
            {priceRes.isPriceAvailable ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--font-outfit), sans-serif', fontSize: '1.85rem', fontWeight: 800, color: priceRes.hasCampaignDiscount ? '#DC2626' : '#081C15' }}>
                    ${priceRes.displayPrice.toLocaleString('es-CO')}
                  </span>
                  {priceRes.hasCampaignDiscount && (
                    <span style={{ fontSize: '1.15rem', textDecoration: 'line-through', color: '#94A3B8' }}>
                      ${priceRes.originalDisplayPrice.toLocaleString('es-CO')}
                    </span>
                  )}
                  <span style={{ fontSize: '0.95rem', color: 'var(--text-muted)' }}>{t.perUnit} {activeOption.label}</span>
                </div>
                {product.campaign_info?.campaignName && (
                  <span style={{ fontSize: '0.8125rem', backgroundColor: '#FEE2E2', color: '#B91C1C', padding: '3px 10px', borderRadius: '8px', fontWeight: 700, alignSelf: 'flex-start' }}>
                    {product.campaign_info.campaignName}
                  </span>
                )}
              </div>
            ) : (
              <span style={{ fontSize: '1.15rem', color: '#64748B', fontWeight: 700 }}>
                {isEn ? 'Price on request' : 'Precio a consultar'} · {activeOption.label}
              </span>
            )}
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid #F1ECE1', marginBottom: '1rem' }} />

          {/* Full-width compact Selectors (no awkward wrapping) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginBottom: '1rem' }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: '0.35rem', textTransform: 'uppercase', fontSize: '0.73rem', letterSpacing: '0.04em', color: '#475569' }}>
                {isEn ? 'Presentation' : 'Presentación'}
              </div>
              <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '4px', padding: '4px', borderRadius: '11px', backgroundColor: '#F4F1EA', maxWidth: '100%' }}>
                {sfPresentation.options.map((opt) => {
                  const active = opt.key === activeOption.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setSelectedOptKey(opt.key)}
                      style={{
                        padding: '0.4rem 0.85rem',
                        borderRadius: '8px',
                        border: 'none',
                        backgroundColor: active ? '#FFFFFF' : 'transparent',
                        color: active ? (isFriogan ? '#7F1D1D' : '#081C15') : '#64748B',
                        fontWeight: active ? 800 : 600,
                        fontSize: '0.82rem',
                        whiteSpace: 'nowrap',
                        boxShadow: active ? '0 1px 4px rgba(8,28,21,0.12)' : 'none',
                        transition: 'background-color 140ms ease, color 140ms ease',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {extraOptionGroups.map((grp) => (
              <div key={grp.name}>
                <div style={{ fontWeight: 700, marginBottom: '0.35rem', textTransform: 'uppercase', fontSize: '0.73rem', letterSpacing: '0.04em', color: '#475569' }}>
                  {grp.name.toLowerCase().includes('madura') ? (isEn ? 'Ripeness level' : 'Punto de maduración') : grp.name}
                </div>
                <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '4px', padding: '4px', borderRadius: '11px', backgroundColor: '#F4F1EA', maxWidth: '100%' }}>
                  {grp.values.map((val) => {
                    const selected = extraSelections[grp.name] === val;
                    const label = val.includes('|') ? val.split('|')[0].trim() : val;
                    return (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setExtraSelections((p) => ({ ...p, [grp.name]: val }))}
                        style={{
                          padding: '0.4rem 0.85rem',
                          borderRadius: '8px',
                          border: 'none',
                          backgroundColor: selected ? '#FFFFFF' : 'transparent',
                          color: selected ? '#081C15' : '#64748B',
                          fontWeight: selected ? 800 : 600,
                          fontSize: '0.82rem',
                          whiteSpace: 'nowrap',
                          boxShadow: selected ? '0 1px 4px rgba(8,28,21,0.12)' : 'none',
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Standard 5B Quantity Input & Scale/Vacuum Notice */}
          <div style={{ marginBottom: '1.35rem' }}>
            <div style={{ fontWeight: 700, marginBottom: '0.5rem', textTransform: 'uppercase', fontSize: '0.8125rem', color: '#1F2937' }}>
              {t.quantity}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', border: '1px solid rgba(8,28,21,0.16)', padding: '5px', borderRadius: '12px', backgroundColor: '#FFFFFF' }}>
                <button
                  type="button"
                  aria-label={isEn ? 'Decrease quantity' : 'Disminuir cantidad'}
                  onClick={() => {
                    const next = Math.max(1, safeQty - 1);
                    setQuantity(next);
                    setInputValue(String(next));
                  }}
                  style={{ width: '36px', height: '36px', border: 'none', background: '#FAF9F6', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Minus size={17} />
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value.replace(/[^0-9]/g, ''))}
                  onBlur={() => commitQuantityInput(inputValue)}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
                  style={{ width: '52px', textAlign: 'center', fontWeight: 800, fontSize: '1.1rem', color: '#081C15', border: 'none', outline: 'none', background: 'transparent', fontVariantNumeric: 'tabular-nums' }}
                />
                <button
                  type="button"
                  aria-label={isEn ? 'Increase quantity' : 'Aumentar cantidad'}
                  onClick={() => {
                    const next = safeQty + 1;
                    setQuantity(next);
                    setInputValue(String(next));
                  }}
                  style={{ width: '36px', height: '36px', border: 'none', background: '#FAF9F6', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Plus size={17} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 800, color: isFriogan ? '#7F1D1D' : '#0D7A57', backgroundColor: isFriogan ? '#FFF5F5' : 'rgba(13,122,87,0.08)', padding: '6px 12px', borderRadius: '10px', border: `1px solid ${isFriogan ? 'rgba(127,29,29,0.2)' : 'rgba(13,122,87,0.18)'}` }}>
                  {quantityFeedback}
                </span>
                {isFriogan ? (
                  <span style={{ fontSize: '0.8125rem', color: '#7F1D1D', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    <Snowflake size={14} aria-hidden="true" />
                    <span>Empaque al vacío termoformado · Peso neto exacto · Control INVIMA 0°C–4°C</span>
                  </span>
                ) : activeOption.weightKg > 0 && (
                  <span style={{ fontSize: '0.8125rem', color: '#64748B' }}>
                    {isEn ? 'Approx. scale weight' : 'Peso aprox. en báscula'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Subtotal Box */}
          <div style={{ marginBottom: '0.9rem', padding: '0.75rem 1rem', backgroundColor: priceRes.isPriceAvailable ? '#F7F4ED' : '#FEF2F2', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
            <div>
              {!priceRes.isPriceAvailable && (
                <span style={{ color: '#DC2626', fontWeight: 800, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '2px' }}>
                  <AlertTriangle size={14} />
                  <span>{isEn ? 'Price on request' : 'Precio a consultar'}</span>
                </span>
              )}
              <span style={{ fontSize: '0.92rem', fontWeight: 700, color: '#475569' }}>{t.subtotal}:</span>
            </div>
            <span style={{ fontFamily: 'var(--font-outfit), sans-serif', fontSize: priceRes.isPriceAvailable ? '1.45rem' : '1rem', fontWeight: 800, color: priceRes.isPriceAvailable ? '#081C15' : '#94A3B8', fontVariantNumeric: 'tabular-nums' }}>
              {priceRes.isPriceAvailable ? `$${(priceRes.displayPrice * safeQty).toLocaleString('es-CO')}` : (isEn ? 'Price on request' : 'Precio a consultar')}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!priceRes.isPriceAvailable}
              style={{
                padding: '0.88rem 1rem',
                fontSize: '0.95rem',
                borderRadius: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.55rem',
                border: `2px solid ${priceRes.isPriceAvailable ? (isFriogan ? '#7F1D1D' : '#0D7A57') : '#CBD5E1'}`,
                backgroundColor: '#FFFFFF',
                color: priceRes.isPriceAvailable ? (isFriogan ? '#7F1D1D' : '#081C15') : '#94A3B8',
                fontWeight: 800,
                cursor: priceRes.isPriceAvailable ? 'pointer' : 'not-allowed',
                transition: 'background-color 180ms ease, border-color 180ms ease, color 180ms ease',
              }}
            >
              <ShoppingBag size={18} strokeWidth={2.4} />
              <span>{priceRes.isPriceAvailable ? t.addToOrder : (isEn ? 'Price on request' : 'Precio a consultar')}</span>
            </button>

            <button
              type="button"
              onClick={handleBuyNow}
              disabled={!priceRes.isPriceAvailable}
              style={{
                padding: '0.88rem 1rem',
                fontSize: '0.95rem',
                borderRadius: '14px',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.55rem',
                backgroundColor: priceRes.isPriceAvailable ? (isFriogan ? '#7F1D1D' : '#0D7A57') : '#E2E8F0',
                color: priceRes.isPriceAvailable ? '#FFFFFF' : '#94A3B8',
                border: 'none',
                cursor: priceRes.isPriceAvailable ? 'pointer' : 'not-allowed',
                transition: 'background-color 180ms ease',
              }}
            >
              <Zap size={18} strokeWidth={2.4} fill={priceRes.isPriceAvailable ? 'currentColor' : 'none'} />
              <span>{priceRes.isPriceAvailable ? t.payNow : (isEn ? 'Price on request' : 'Precio a consultar')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
