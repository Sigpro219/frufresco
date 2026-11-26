'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  Building2,
  Minus,
  Package,
  Plus,
  ShoppingBag,
  Snowflake,
  Trash2,
  X,
} from 'lucide-react';
import { useCart, type CartItem } from '@/lib/cartContext';
import { useAuth } from '@/lib/authContext';
import type { Product } from '@/lib/supabase';
import {
  STOREFRONT_CRATE_PRODUCT_ID,
  type StorefrontRuntimeConfig,
} from '@/lib/storefront/storefrontContracts';
import {
  buildStorefrontCartItem,
  filterStorefrontProductsByFrioganMode,
  resolveProductStorefrontPresentation,
  resolveStorefrontPrice,
} from '@/lib/storefront/storefrontEngine';

interface CartDrawerProps {
  config: StorefrontRuntimeConfig;
  suggestions?: Product[];
}

export default function CartDrawer({ config, suggestions = [] }: CartDrawerProps) {
  const searchParams = useSearchParams();
  const isEn = searchParams.get('lang') === 'en';
  const locale = isEn ? 'en' : 'es';
  const { profile } = useAuth();
  const isB2bClient = (profile?.role || '').toLowerCase() === 'b2b_client';

  const {
    items,
    addItem,
    isDrawerOpen,
    closeDrawer,
    updateItemQuantity,
    removeItem,
    clearCart,
    hasFrioganItems,
    isCartLoaded,
    sanitizeForFrioganMode,
  } = useCart();

  const [draftQty, setDraftQty] = useState<Record<string, string>>({});
  const [shouldRender, setShouldRender] = useState(isDrawerOpen);
  const [isVisible, setIsVisible] = useState(isDrawerOpen);

  useEffect(() => {
    if (isDrawerOpen) {
      setShouldRender(true);
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsVisible(true));
      });
      return () => cancelAnimationFrame(raf);
    } else {
      setIsVisible(false);
      const timer = setTimeout(() => setShouldRender(false), 260);
      return () => clearTimeout(timer);
    }
  }, [isDrawerOpen]);

  useEffect(() => {
    if (isCartLoaded) sanitizeForFrioganMode(config.frioganMode);
  }, [isCartLoaded, isDrawerOpen, config.frioganMode, sanitizeForFrioganMode]);

  useEffect(() => {
    if (!isDrawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDrawerOpen, closeDrawer]);

  const merchandiseItems = useMemo(() => items.filter((i) => i.id !== STOREFRONT_CRATE_PRODUCT_ID), [items]);
  const merchandiseSubtotal = useMemo(
    () => merchandiseItems.reduce((sum, item) => sum + Math.ceil((item.price * item.quantity) / 50) * 50, 0),
    [merchandiseItems]
  );
  const merchandiseWeightKg = useMemo(
    () => merchandiseItems.reduce((sum, item) => sum + Number(item.weight_kg || 0) * item.quantity, 0),
    [merchandiseItems]
  );

  const drawerSuggestions = useMemo(() => {
    const existingIds = new Set(items.map((i) => i.id));
    const eligible = filterStorefrontProductsByFrioganMode(suggestions, config.frioganMode);
    const out: { product: Product; opt: ReturnType<typeof resolveProductStorefrontPresentation>['defaultOption']; price: ReturnType<typeof resolveStorefrontPrice>; kind: ReturnType<typeof resolveProductStorefrontPresentation>['kind']; optsLen: number }[] = [];
    for (const p of eligible) {
      if (existingIds.has(p.id)) continue;
      const pres = resolveProductStorefrontPresentation(p, locale);
      const price = resolveStorefrontPrice(p, pres.defaultOption);
      if (!price.isPriceAvailable) continue;
      out.push({ product: p, opt: pres.defaultOption, price, kind: pres.kind, optsLen: pres.options.length });
      if (out.length >= 2) break;
    }
    return out;
  }, [suggestions, items, config.frioganMode, locale]);

  if (!shouldRender) return null;

  const minHogar = config.minOrderHogar > 0 ? config.minOrderHogar : 150000;
  const remainingForMin = Math.max(0, minHogar - merchandiseSubtotal);
  const progressPct = Math.min(100, Math.round((merchandiseSubtotal / minHogar) * 100));
  const getKey = (item: CartItem) => `${item.id}::${item.name}`;

  const commitDraftQty = (item: CartItem) => {
    const key = getKey(item);
    const raw = draftQty[key];
    if (raw === undefined) return;
    setDraftQty((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    const trimmed = raw.trim();
    if (trimmed === '') return;
    const parsed = Math.floor(Number(trimmed));
    if (!Number.isFinite(parsed) || parsed <= 0) removeItem(item.id, item.name);
    else updateItemQuantity(item.id, item.name, parsed);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEn ? 'Shopping cart' : 'Tu carrito de mercado'}
      onClick={closeDrawer}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10050,
        backgroundColor: 'rgba(8,28,21,0.5)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        justifyContent: 'flex-end',
        opacity: isVisible ? 1 : 0,
        transition: 'opacity 220ms ease',
      }}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '420px',
          height: '100%',
          backgroundColor: '#FFFFFF',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-12px 0 36px rgba(8,28,21,0.2)',
          transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 260ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(8,28,21,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FAF9F6' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
            <ShoppingBag size={20} color="#0D7A57" />
            <div>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 800, fontSize: '1.1rem', color: '#081C15' }}>
                {isEn ? 'Your Basket' : 'Tu Mercado'}
              </h2>
              <span style={{ fontSize: '0.8125rem', color: '#475569' }}>
                {merchandiseItems.length} {merchandiseItems.length === 1 ? (isEn ? 'product line' : 'línea') : isEn ? 'product lines' : 'líneas'}
              </span>
            </div>
          </div>
          <button type="button" onClick={closeDrawer} aria-label={isEn ? 'Close cart' : 'Cerrar carrito'} style={{ width: '44px', height: '44px', borderRadius: '9999px', border: '1px solid rgba(8,28,21,0.12)', backgroundColor: '#FFFFFF', color: '#081C15', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '10px 18px', borderBottom: '1px solid rgba(8,28,21,0.06)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {isB2bClient ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderRadius: '10px', backgroundColor: '#ECFDF5', color: '#065F46', fontSize: '0.8125rem', fontWeight: 700 }}>
              <Building2 size={15} />
              <span>{isEn ? 'B2B Institutional Account · Direct dispatch included' : 'Cuenta Institucional B2B · Despacho directo según acuerdo'}</span>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                <span style={{ fontWeight: 600, color: '#081C15' }}>
                  {remainingForMin === 0
                    ? isEn ? 'Home delivery minimum reached' : 'Pedido mínimo Hogar completado'
                    : isEn ? `$${remainingForMin.toLocaleString('es-CO')} away from Home minimum` : `Te faltan $${remainingForMin.toLocaleString('es-CO')} para mínimo Hogar`}
                </span>
                <span style={{ fontWeight: 700, color: '#0D7A57', fontVariantNumeric: 'tabular-nums' }}>{progressPct}%</span>
              </div>
              <div style={{ height: '6px', borderRadius: '9999px', backgroundColor: '#E2E8F0', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progressPct}%`, backgroundColor: remainingForMin === 0 ? '#0D7A57' : '#D97706', transition: 'width 200ms ease' }} />
              </div>
            </>
          )}

          {config.frioganMode === 'LIVE' && hasFrioganItems && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 10px', borderRadius: '10px', backgroundColor: '#FFF5F5', border: '1px solid rgba(127,29,29,0.2)', color: '#7F1D1D', fontSize: '0.8125rem', fontWeight: 700 }}>
              <Snowflake size={15} />
              <span>Cadena de Frío Garantizada (0°C–4°C)</span>
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: '9px' }}>
          {merchandiseItems.length === 0 ? (
            <div style={{ margin: 'auto 0', textAlign: 'center', padding: '24px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <Package size={36} color="#94A3B8" />
              <p style={{ margin: 0, fontWeight: 700, color: '#081C15' }}>{isEn ? 'Your basket is empty' : 'Aún no has agregado productos'}</p>
              <p style={{ margin: 0, fontSize: '0.84rem', color: '#64748B' }}>
                {isEn ? 'Tap + Add on any product card to build your order.' : 'Pulsa + Agregar en cualquier producto del catálogo.'}
              </p>
              <button type="button" onClick={closeDrawer} style={{ marginTop: '4px', backgroundColor: '#0D7A57', color: '#FFFFFF', border: 'none', borderRadius: '9999px', padding: '10px 20px', minHeight: '44px', fontWeight: 700, fontSize: '0.875rem' }}>
                {isEn ? 'Browse catalog' : 'Explorar catálogo'}
              </button>
            </div>
          ) : (
            merchandiseItems.map((item) => {
              const key = getKey(item);
              const inputValue = draftQty[key] !== undefined ? draftQty[key] : String(item.quantity);
              const lineTotal = Math.ceil((item.price * item.quantity) / 50) * 50;

              return (
                <div key={key} style={{ display: 'flex', gap: '10px', padding: '9px', borderRadius: '12px', border: '1px solid rgba(8,28,21,0.08)', backgroundColor: item.is_friogan ? '#FFFBFB' : '#FFFFFF' }}>
                  <div style={{ width: '50px', height: '50px', borderRadius: '9px', backgroundColor: '#FAF9F6', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {item.image_url ? <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Package size={18} color="#94A3B8" />}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px', alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#081C15', lineHeight: 1.25 }}>{item.name}</div>
                        <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>
                          {item.variant_label || item.unit || 'Unidad'} · ${item.price.toLocaleString('es-CO')} c/u
                        </div>
                      </div>
                      <button type="button" onClick={() => removeItem(item.id, item.name)} aria-label={`Eliminar ${item.name}`} style={{ background: 'transparent', border: 'none', color: '#94A3B8', minWidth: '44px', minHeight: '44px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, margin: '-8px -8px 0 0' }}>
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '7px', gap: '8px' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid rgba(8,28,21,0.16)', borderRadius: '9999px', backgroundColor: '#FAF9F6', padding: '2px' }}>
                        <button type="button" aria-label={`Disminuir ${item.name}`} onClick={() => { setDraftQty((p) => { const n = { ...p }; delete n[key]; return n; }); updateItemQuantity(item.id, item.name, item.quantity - 1); }} style={{ width: '44px', height: '44px', borderRadius: '9999px', border: 'none', backgroundColor: '#FFFFFF', color: '#081C15', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Minus size={15} />
                        </button>
                        <input
                          type="text"
                          inputMode="numeric"
                          aria-label={`Cantidad para ${item.name}`}
                          value={inputValue}
                          onChange={(e) => setDraftQty((prev) => ({ ...prev, [key]: e.target.value.replace(/[^0-9]/g, '') }))}
                          onBlur={() => commitDraftQty(item)}
                          onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
                          style={{ width: '40px', minHeight: '44px', textAlign: 'center', border: 'none', background: 'transparent', fontWeight: 700, fontSize: '16px', color: '#081C15', fontVariantNumeric: 'tabular-nums', outline: 'none' }}
                        />
                        <button type="button" aria-label={`Aumentar ${item.name}`} onClick={() => { setDraftQty((p) => { const n = { ...p }; delete n[key]; return n; }); updateItemQuantity(item.id, item.name, item.quantity + 1); }} style={{ width: '44px', height: '44px', borderRadius: '9999px', border: 'none', backgroundColor: '#FFFFFF', color: '#081C15', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Plus size={15} />
                        </button>
                      </div>
                      <span style={{ fontWeight: 800, fontSize: '0.92rem', color: '#081C15', fontVariantNumeric: 'tabular-nums' }}>
                        ${lineTotal.toLocaleString('es-CO')}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {drawerSuggestions.length > 0 && (
            <div style={{ marginTop: '8px', paddingTop: '10px', borderTop: '1px dashed rgba(8,28,21,0.12)' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#475569', marginBottom: '7px' }}>
                {isEn ? 'Complete your order' : 'Sugeridos para completar tu mercado'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                {drawerSuggestions.map(({ product, opt, price, kind, optsLen }) => (
                  <div key={product.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '7px 10px', borderRadius: '10px', backgroundColor: '#FAF9F6', border: '1px solid rgba(8,28,21,0.08)' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '0.83rem', fontWeight: 700, color: '#081C15', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {product.display_name || product.name}
                      </div>
                      <div style={{ fontSize: '0.76rem', color: '#0D7A57', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                        {opt.label} · ${price.displayPrice.toLocaleString('es-CO')}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => addItem(buildStorefrontCartItem(product, opt, 1, optsLen, kind, price, locale))}
                      style={{ backgroundColor: '#0D7A57', color: '#FFFFFF', border: 'none', borderRadius: '9999px', padding: '8px 14px', minHeight: '44px', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0 }}
                    >
                      + Agregar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {merchandiseItems.length > 0 && (
          <div style={{ padding: '12px 18px 16px', borderTop: '1px solid rgba(8,28,21,0.08)', backgroundColor: '#FAF9F6', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', color: '#475569' }}>
              <span>{isEn ? 'Estimated net weight' : 'Peso neto estimado'}</span>
              <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{merchandiseWeightKg.toFixed(1)} kg</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontWeight: 700, fontSize: '0.94rem', color: '#081C15' }}>{isEn ? 'Subtotal' : 'Subtotal Productos'}</span>
              <span style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 800, fontSize: '1.25rem', color: '#081C15', fontVariantNumeric: 'tabular-nums' }}>
                ${merchandiseSubtotal.toLocaleString('es-CO')}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button type="button" onClick={clearCart} style={{ padding: '10px 14px', minHeight: '44px', borderRadius: '11px', border: '1px solid rgba(8,28,21,0.14)', backgroundColor: '#FFFFFF', color: '#64748B', fontWeight: 600, fontSize: '0.84rem' }}>
                {isEn ? 'Clear' : 'Vaciar'}
              </button>
              <Link href={isEn ? '/checkout?lang=en' : '/checkout'} onClick={closeDrawer} style={{ flex: 1, minHeight: '44px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '7px', backgroundColor: '#0D7A57', color: '#FFFFFF', borderRadius: '11px', padding: '11px 14px', fontWeight: 800, fontSize: '0.94rem' }}>
                <span>{isEn ? 'Go to Checkout' : 'Ir a Pagar'}</span>
                <ArrowRight size={17} />
              </Link>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
