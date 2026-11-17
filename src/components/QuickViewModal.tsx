'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  Flame,
  Leaf,
  Minus,
  Plus,
  ShoppingCart,
  Snowflake,
  Sparkles,
  Tag,
  X,
  Zap,
} from 'lucide-react';
import { supabase, type Product } from '../lib/supabase';
import { useCart } from '../lib/cartContext';
import { translations, type Locale } from '../lib/translations';
import { useAuth } from '../lib/authContext';
import { resolvePricingModelId } from '../lib/pricingUtils';
import {
  buildStorefrontCartItem,
  isFrioganProteinProduct,
  resolveProductStorefrontPresentation,
  resolveStorefrontPrice,
} from '@/lib/storefront/storefrontEngine';

interface QuickViewModalProps {
  product: Product;
  onClose: () => void;
  initialQuantity?: number;
  onUpdateQuantity?: (qty: number) => void;
}

function ModalContent({
  product: initialProduct,
  onClose,
  initialQuantity,
  onUpdateQuantity,
}: QuickViewModalProps) {
  const { addItem, openDrawer } = useCart();
  const { profile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = (searchParams.get('lang') === 'en' ? 'en' : 'es') as Locale;
  const isEn = locale === 'en';
  const t = translations[locale];

  const [product, setProduct] = useState<Product>(initialProduct);
  const [quantity, setQuantity] = useState<number>(initialQuantity ?? 1);
  const [inputValue, setInputValue] = useState<string>(String(initialQuantity ?? 1));
  const [extraSelections, setExtraSelections] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchFresh = async () => {
      const modelId = resolvePricingModelId(profile);
      const { data, error } = await supabase
        .from('products')
        .select('*, pricing_model_prices(price, model_id)')
        .eq('id', initialProduct.id)
        .eq('pricing_model_prices.model_id', modelId)
        .single();
      if (!error && data) {
        setProduct((prev) => ({
          ...(data as Product),
          display_name: prev.display_name || (data as Product).display_name,
          pricing_model_prices:
            prev.pricing_model_prices && prev.pricing_model_prices.length > 0
              ? prev.pricing_model_prices
              : (data as Product).pricing_model_prices,
          campaign_info: prev.campaign_info ?? (data as Product).campaign_info,
        }));
      }
    };
    fetchFresh();
  }, [initialProduct.id, profile?.pricing_model_id, profile]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const presentation = useMemo(
    () => resolveProductStorefrontPresentation(product, locale),
    [product, locale]
  );
  const [selectedOptKey, setSelectedOptKey] = useState<string>(presentation.defaultOption.key);

  useEffect(() => {
    if (!presentation.options.some((o) => o.key === selectedOptKey)) {
      setSelectedOptKey(presentation.defaultOption.key);
    }
  }, [presentation, selectedOptKey]);

  const activeOption =
    presentation.options.find((o) => o.key === selectedOptKey) || presentation.defaultOption;
  const priceResolution = resolveStorefrontPrice(product, activeOption);
  const isFriogan = presentation.kind === 'FIXED_VACUUM_PACK' || isFrioganProteinProduct(product);

  // Non-presentation attributes (e.g. ripeness) for non-Friogan items
  const extraOptionGroups = useMemo(() => {
    if (isFriogan || !Array.isArray(product.options_config)) return [];
    return product.options_config.filter((grp: { name?: string; values?: string[] }) => {
      const nameLower = String(grp?.name || '').toLowerCase();
      return (
        !nameLower.includes('presentaci') &&
        !nameLower.includes('gramaje') &&
        Array.isArray(grp?.values) &&
        grp.values.length > 0
      );
    });
  }, [isFriogan, product.options_config]);

  useEffect(() => {
    if (extraOptionGroups.length === 0) return;
    setExtraSelections((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const grp of extraOptionGroups) {
        const cleanVals = (grp.values || []).filter((v: string) => {
          const clean = (v.includes('|') ? v.split('|')[0] : v).trim().toLowerCase();
          return !String(grp.name || '').toLowerCase().includes('madura') || (clean !== 'maduro' && clean !== 'madura');
        });
        if (grp.name && cleanVals.length > 0 && !next[grp.name]) {
          next[grp.name] = cleanVals[0];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [extraOptionGroups]);

  const title = isEn && product.name_en ? product.name_en : product.display_name || product.name;
  const safeQty = Math.max(1, Math.round(quantity || 1));
  const totalAmount = priceResolution.displayPrice * safeQty;
  const weightSummaryKg = Math.round(activeOption.weightKg * safeQty * 100) / 100;

  const commitInput = (raw: string) => {
    const cleaned = raw.replace(/[^0-9]/g, '');
    if (!cleaned) {
      setQuantity(1);
      setInputValue('1');
      return;
    }
    const parsed = Math.max(1, Math.floor(Number(cleaned)));
    setQuantity(parsed);
    setInputValue(String(parsed));
  };

  const handleAddToCart = () => {
    if (!priceResolution.isPriceAvailable) return;
    if (onUpdateQuantity) {
      onUpdateQuantity(safeQty);
    } else {
      const item = buildStorefrontCartItem(
        product,
        activeOption,
        safeQty,
        presentation.options.length,
        presentation.kind,
        priceResolution,
        locale
      );
      if (Object.keys(extraSelections).length > 0) {
        item.selected_options = extraSelections;
      }
      addItem(item);
      openDrawer();
    }
    onClose();
  };

  const handleBuyNow = () => {
    if (!priceResolution.isPriceAvailable) return;
    const item = buildStorefrontCartItem(
      product,
      activeOption,
      safeQty,
      presentation.options.length,
      presentation.kind,
      priceResolution,
      locale
    );
    if (Object.keys(extraSelections).length > 0) {
      item.selected_options = extraSelections;
    }
    addItem(item);
    onClose();
    router.push(isEn ? '/checkout?lang=en' : '/checkout');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(8, 28, 21, 0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '16px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '22px',
          width: '100%',
          maxWidth: '500px',
          maxHeight: 'min(90dvh, 720px)',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          padding: '20px',
          boxShadow: '0 24px 48px -12px rgba(8, 28, 21, 0.35)',
        }}
      >
        {/* Top Row: Image + Meta */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', minWidth: 0 }}>
            <div style={{ width: '76px', height: '76px', borderRadius: '14px', overflow: 'hidden', backgroundColor: '#FAF9F6', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {product.image_url ? (
                <img src={product.image_url} alt={title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <Sparkles size={26} color="#0D7A57" />
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: '2px 0 4px', fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 800, fontSize: '1.15rem', color: '#081C15', lineHeight: 1.2 }}>
                {title}
              </h3>
              <div style={{ fontSize: '1.08rem', fontWeight: 800, color: isFriogan ? '#7F1D1D' : '#0D7A57', fontVariantNumeric: 'tabular-nums' }}>
                {priceResolution.isPriceAvailable ? (
                  <>
                    ${priceResolution.displayPrice.toLocaleString('es-CO')}{' '}
                    <span style={{ fontSize: '0.82rem', color: '#475569', fontWeight: 600 }}>
                      / {activeOption.label}
                    </span>
                  </>
                ) : (
                  <span style={{ color: '#64748B' }}>{isEn ? 'Price on request' : 'Precio a consultar'}</span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={isEn ? 'Close quick view' : 'Cerrar vista rápida'}
            style={{ width: '34px', height: '34px', borderRadius: '9999px', border: '1px solid rgba(8,28,21,0.14)', backgroundColor: '#FAF9F6', color: '#081C15', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <X size={17} />
          </button>
        </div>

        {/* Tags */}
        {Array.isArray(product.tags) && product.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
            {product.tags.slice(0, 4).map((tag) => (
              <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 9px', borderRadius: '9999px', backgroundColor: '#FEF3C7', color: '#92400E', fontSize: '0.76rem', fontWeight: 700 }}>
                {String(tag).toLowerCase().includes('promo') ? <Flame size={12} /> : String(tag).toLowerCase().includes('org') ? <Leaf size={12} /> : <Tag size={12} />}
                <span>{tag}</span>
              </span>
            ))}
          </div>
        )}

        {/* Presentation Selector */}
        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
            {isEn ? 'Presentation' : 'Presentación'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
            {presentation.options.map((opt) => {
              const active = opt.key === activeOption.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setSelectedOptKey(opt.key)}
                  style={{
                    padding: '7px 12px',
                    borderRadius: '10px',
                    border: `1.5px solid ${active ? (isFriogan ? '#7F1D1D' : '#0D7A57') : 'rgba(8,28,21,0.14)'}`,
                    backgroundColor: active ? (isFriogan ? '#FFF5F5' : '#ECFDF5') : '#FFFFFF',
                    color: active ? (isFriogan ? '#7F1D1D' : '#065F46') : '#334155',
                    fontWeight: 700,
                    fontSize: '0.84rem',
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Extra Physical Attributes (Agricultural only) */}
        {extraOptionGroups.map((grp: { name?: string; values?: string[] }) => {
          const vals = (grp.values || []).filter((v: string) => {
            const clean = (v.includes('|') ? v.split('|')[0] : v).trim().toLowerCase();
            return !String(grp.name || '').toLowerCase().includes('madura') || (clean !== 'maduro' && clean !== 'madura');
          });
          if (!grp.name || vals.length === 0) return null;
          return (
            <div key={grp.name} style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                {grp.name}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {vals.map((val) => {
                  const selected = extraSelections[grp.name!] === val;
                  const label = val.includes('|') ? val.split('|')[0] : val;
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setExtraSelections((p) => ({ ...p, [grp.name!]: val }))}
                      style={{
                        padding: '6px 11px',
                        borderRadius: '9px',
                        border: `1px solid ${selected ? '#0D7A57' : 'rgba(8,28,21,0.14)'}`,
                        backgroundColor: selected ? '#ECFDF5' : '#FFFFFF',
                        color: selected ? '#065F46' : '#334155',
                        fontWeight: 600,
                        fontSize: '0.82rem',
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Quantity + Weight Notice */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '12px', borderRadius: '14px', backgroundColor: '#FAF9F6', border: '1px solid rgba(8,28,21,0.08)', marginBottom: '14px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid rgba(8,28,21,0.16)', borderRadius: '9999px', backgroundColor: '#FFFFFF', padding: '3px' }}>
              <button
                type="button"
                aria-label="Disminuir cantidad"
                onClick={() => {
                  const next = Math.max(1, safeQty - 1);
                  setQuantity(next);
                  setInputValue(String(next));
                }}
                style={{ width: '30px', height: '30px', borderRadius: '9999px', border: 'none', backgroundColor: '#FAF9F6', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Minus size={14} />
              </button>
              <input
                type="text"
                inputMode="numeric"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value.replace(/[^0-9]/g, ''))}
                onBlur={() => commitInput(inputValue)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
                }}
                style={{ width: '42px', textAlign: 'center', border: 'none', background: 'transparent', fontWeight: 800, fontSize: '0.95rem', fontVariantNumeric: 'tabular-nums', outline: 'none' }}
              />
              <button
                type="button"
                aria-label="Aumentar cantidad"
                onClick={() => {
                  const next = safeQty + 1;
                  setQuantity(next);
                  setInputValue(String(next));
                }}
                style={{ width: '30px', height: '30px', borderRadius: '9999px', border: 'none', backgroundColor: '#FAF9F6', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Plus size={14} />
              </button>
            </div>

            <div style={{ fontSize: '0.8125rem', color: isFriogan ? '#7F1D1D' : '#475569', fontWeight: 600 }}>
              {isFriogan ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Snowflake size={14} />
                  <span>{presentation.sealedWeightLabel || 'Empaque exacto al vacío'}</span>
                </span>
              ) : (
                <span>
                  {weightSummaryKg > 0 ? `${weightSummaryKg} kg · Peso aprox. en báscula` : activeOption.label}
                </span>
              )}
            </div>
          </div>

          <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            <div style={{ fontSize: '0.78rem', color: '#64748B' }}>{t.total}</div>
            <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#081C15' }}>
              {priceResolution.isPriceAvailable ? `$${totalAmount.toLocaleString('es-CO')}` : '—'}
            </div>
          </div>
        </div>

        {/* Actions */}
        {!priceResolution.isPriceAvailable && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 12px', borderRadius: '10px', backgroundColor: '#FEF2F2', color: '#991B1B', fontSize: '0.83rem', fontWeight: 700, marginBottom: '12px' }}>
            <AlertTriangle size={16} />
            <span>{isEn ? 'Price on request for this account' : 'Producto sin tarifa vigente para tu lista (Precio a consultar)'}</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            disabled={!priceResolution.isPriceAvailable}
            onClick={handleAddToCart}
            style={{
              flex: 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '7px',
              padding: '11px 14px',
              borderRadius: '12px',
              border: 'none',
              backgroundColor: priceResolution.isPriceAvailable ? (isFriogan ? '#7F1D1D' : '#0D7A57') : '#CBD5E1',
              color: '#FFFFFF',
              fontWeight: 800,
              fontSize: '0.9rem',
              cursor: priceResolution.isPriceAvailable ? 'pointer' : 'not-allowed',
            }}
          >
            <ShoppingCart size={16} />
            <span>{priceResolution.isPriceAvailable ? t.addToOrder || 'Agregar al carrito' : 'Precio a consultar'}</span>
          </button>

          <button
            type="button"
            disabled={!priceResolution.isPriceAvailable}
            onClick={handleBuyNow}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '11px 14px',
              borderRadius: '12px',
              border: `1.5px solid ${priceResolution.isPriceAvailable ? '#081C15' : '#CBD5E1'}`,
              backgroundColor: '#FFFFFF',
              color: priceResolution.isPriceAvailable ? '#081C15' : '#94A3B8',
              fontWeight: 700,
              fontSize: '0.88rem',
              cursor: priceResolution.isPriceAvailable ? 'pointer' : 'not-allowed',
            }}
          >
            <Zap size={15} />
            <span>{t.payNow || 'Pagar'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function QuickViewModal(props: QuickViewModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || typeof document === 'undefined') return null;
  return createPortal(<ModalContent {...props} />, document.body);
}
