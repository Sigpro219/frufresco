'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import {
  Apple,
  Beef,
  Carrot,
  Eye,
  Leaf,
  Milk,
  Minus,
  Package,
  Plus,
  Snowflake,
  Sprout,
  Tag,
  Utensils,
} from 'lucide-react';
import type { Product } from '../lib/supabase';
import { useCart } from '../lib/cartContext';
import { CATEGORY_MAP } from '../lib/constants';
import { translations, type Locale } from '../lib/translations';
import {
  buildCartItemName,
  buildStorefrontCartItem,
  isOfferOrPromoProduct,
  resolveProductStorefrontPresentation,
  resolveStorefrontPrice,
} from '@/lib/storefront/storefrontEngine';

const QuickViewModal = dynamic(() => import('./QuickViewModal'), { ssr: false });

function CategoryPlaceholder({ code }: { code?: string }) {
  const props = { size: 38, strokeWidth: 1.5, color: '#0D7A57' };
  switch ((code || '').toUpperCase()) {
    case 'FR': return <Apple {...props} />;
    case 'VE': return <Carrot {...props} />;
    case 'HO': return <Leaf {...props} />;
    case 'TU': return <Sprout {...props} />;
    case 'LA': return <Milk {...props} />;
    case 'CO': return <Snowflake {...props} color="#0284C7" />;
    case 'PR': return <Utensils {...props} />;
    case 'CP': return <Beef {...props} color="#7F1D1D" />;
    default: return <Package {...props} />;
  }
}

export default function ProductCard({ product, locale = 'es' }: { product: Product; locale?: Locale }) {
  const isEn = locale === 'en';
  const t = translations[locale];

  const { items, addItem, updateItemQuantity, isCartLoaded } = useCart();
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [showQuickView, setShowQuickView] = useState(false);

  const presentation = useMemo(
    () => resolveProductStorefrontPresentation(product, locale),
    [product, locale]
  );
  const activeOption = presentation.options[selectedIdx] || presentation.defaultOption;
  const priceRes = useMemo(
    () => resolveStorefrontPrice(product, activeOption),
    [product, activeOption]
  );
  const includeSuffix = presentation.options.length > 1 || presentation.kind === 'FIXED_VACUUM_PACK';
  const cartItemName = buildCartItemName(product, activeOption, includeSuffix, locale);

  const cartEntry = items.find((i) => i.id === product.id && i.name === cartItemName);
  const qtyInCart = isCartLoaded ? (cartEntry?.quantity || 0) : 0;

  const isFriogan = presentation.kind === 'FIXED_VACUUM_PACK';
  const isPromo = isOfferOrPromoProduct(product);
  const title = isEn && product.name_en ? product.name_en : product.display_name || product.name;
  const catCode = (product.category || '').trim().toUpperCase();
  const categoryName = isEn
    ? t.categories[catCode as keyof typeof t.categories] || CATEGORY_MAP[catCode] || 'Market'
    : CATEGORY_MAP[catCode] || 'Mercado';
  const hasImage = Boolean(product.image_url && product.image_url.trim().startsWith('http'));
  const detailHref = `/products/${product.id}${isEn ? '?lang=en' : ''}`;

  const handleAdd = () => {
    if (!priceRes.isPriceAvailable) return;
    addItem(
      buildStorefrontCartItem(
        product,
        activeOption,
        1,
        presentation.options.length,
        presentation.kind,
        priceRes,
        locale
      )
    );
  };

  return (
    <>
      <article className={`sf-card ${isFriogan ? 'sf-card-friogan' : ''}`}>
        <div>
          <div style={{ position: 'relative', borderRadius: '14px', overflow: 'hidden', backgroundColor: '#F7F4ED', width: '100%', aspectRatio: '4 / 3', marginBottom: '11px' }}>
            <Link href={detailHref} style={{ position: 'relative', display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
              {hasImage && product.image_url ? (
                <Image
                  src={product.image_url}
                  alt={title}
                  fill
                  sizes="(max-width: 640px) 50vw, 240px"
                  unoptimized={!product.image_url.startsWith('/') && !product.image_url.includes('.supabase.co/storage/v1/object/public/')}
                  className="sf-card-img"
                  style={{ objectFit: 'cover' }}
                />
              ) : (
                <CategoryPlaceholder code={catCode} />
              )}
            </Link>

            <button
              type="button"
              onClick={() => setShowQuickView(true)}
              aria-label={isEn ? `Quick view ${title}` : `Vista rápida de ${title}`}
              style={{
                position: 'absolute',
                top: '6px',
                right: '6px',
                width: '44px',
                height: '44px',
                borderRadius: '9999px',
                border: '1px solid rgba(8,28,21,0.1)',
                backgroundColor: 'rgba(255,255,255,0.94)',
                color: '#081C15',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 6px rgba(8,28,21,0.08)',
              }}
            >
              <Eye size={16} aria-hidden="true" />
            </button>

            {isPromo && (
              <span style={{ position: 'absolute', top: '8px', left: '8px', display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#F59E0B', color: '#081C15', borderRadius: '9999px', padding: '3px 9px', fontSize: '0.8125rem', fontWeight: 800 }}>
                <Tag size={12} aria-hidden="true" />
                <span>{isEn ? 'Deal' : 'Oferta'}</span>
              </span>
            )}

            {presentation.sealedWeightLabel && (
              <span style={{ position: 'absolute', bottom: '8px', left: '8px', display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: 'rgba(127,29,29,0.92)', color: '#FFFFFF', borderRadius: '9999px', padding: '3px 9px', fontSize: '0.8125rem', fontWeight: 700 }}>
                <Snowflake size={12} aria-hidden="true" />
                <span>{presentation.sealedWeightLabel}</span>
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', marginBottom: '4px' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: isFriogan ? '#7F1D1D' : '#0D7A57' }}>
              {categoryName}
            </span>
          </div>

          <Link href={detailHref} style={{ display: 'block', fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 700, fontSize: 'clamp(0.92rem, 2.4vw, 1.02rem)', lineHeight: 1.25, color: '#081C15', marginBottom: '10px' }}>
            {title}
          </Link>

          {/* Boutique Integrated Segmented Presentation Selector */}
          {presentation.options.length > 1 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', padding: '3px', borderRadius: '10px', backgroundColor: '#F4F1EA', marginBottom: '12px' }}>
              {presentation.options.map((opt, idx) => {
                const active = idx === selectedIdx;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setSelectedIdx(idx)}
                    style={{
                      flex: '1 1 auto',
                      minHeight: '44px',
                      padding: '6px 8px',
                      borderRadius: '8px',
                      fontSize: '0.8125rem',
                      fontWeight: active ? 700 : 600,
                      border: 'none',
                      backgroundColor: active ? '#FFFFFF' : 'transparent',
                      color: active ? (isFriogan ? '#7F1D1D' : '#081C15') : '#64748B',
                      boxShadow: active ? '0 1px 3px rgba(8,28,21,0.1)' : 'none',
                      transition: 'background-color 180ms cubic-bezier(0.16, 1, 0.3, 1), color 180ms cubic-bezier(0.16, 1, 0.3, 1)',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: '0.8125rem', color: '#64748B', marginBottom: '12px', padding: '4px 0' }}>
              {activeOption.label}
            </div>
          )}
        </div>

        <div className="sf-card-footer">
          <div style={{ display: 'flex', flexDirection: 'column', fontVariantNumeric: 'tabular-nums' }}>
            {priceRes.isPriceAvailable ? (
              <>
                {priceRes.hasCampaignDiscount && (
                  <span style={{ fontSize: '0.8125rem', color: '#94A3B8', textDecoration: 'line-through' }}>
                    ${priceRes.originalDisplayPrice.toLocaleString('es-CO')}
                  </span>
                )}
                <span style={{ fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 800, fontSize: 'clamp(1.02rem, 2.5vw, 1.16rem)', color: isFriogan ? '#7F1D1D' : '#081C15' }}>
                  ${priceRes.displayPrice.toLocaleString('es-CO')}
                </span>
              </>
            ) : (
              <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#64748B' }}>
                {isEn ? 'Price on request' : 'Precio a consultar'}
              </span>
            )}
          </div>

          {!priceRes.isPriceAvailable ? (
            <button
              type="button"
              disabled
              style={{
                minHeight: '44px',
                padding: '8px 12px',
                borderRadius: '9999px',
                border: '1px solid rgba(8,28,21,0.12)',
                backgroundColor: '#F1F5F9',
                color: '#64748B',
                fontSize: '0.8125rem',
                fontWeight: 700,
                cursor: 'not-allowed',
              }}
            >
              {isEn ? 'Price on request' : 'Precio a consultar'}
            </button>
          ) : qtyInCart > 0 ? (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px',
                backgroundColor: isFriogan ? '#7F1D1D' : '#081C15',
                color: '#FFFFFF',
                borderRadius: '9999px',
                padding: '0 4px',
                minHeight: '44px',
              }}
            >
              <button
                type="button"
                aria-label={isEn ? `Decrease ${title}` : `Disminuir ${title}`}
                onClick={() => updateItemQuantity(product.id, cartItemName, qtyInCart - 1)}
                style={{ background: 'transparent', border: 'none', color: '#FFFFFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '34px', minHeight: '44px' }}
              >
                <Minus size={14} />
              </button>
              <span style={{ minWidth: '20px', textAlign: 'center', fontWeight: 800, fontSize: '0.875rem', fontVariantNumeric: 'tabular-nums' }}>
                {qtyInCart}
              </span>
              <button
                type="button"
                aria-label={isEn ? `Increase ${title}` : `Aumentar ${title}`}
                onClick={() => updateItemQuantity(product.id, cartItemName, qtyInCart + 1)}
                style={{ background: 'transparent', border: 'none', color: '#FFFFFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '34px', minHeight: '44px' }}
              >
                <Plus size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleAdd}
              className={`sf-add-btn ${isFriogan ? 'sf-add-btn-friogan' : ''}`}
            >
              <Plus size={15} strokeWidth={2.6} aria-hidden="true" />
              <span>{isEn ? 'Add' : 'Agregar'}</span>
            </button>
          )}
        </div>
      </article>

      {showQuickView && (
        <QuickViewModal
          product={product}
          onClose={() => setShowQuickView(false)}
          initialQuantity={qtyInCart > 0 ? qtyInCart : undefined}
        />
      )}

      <style jsx>{`
        .sf-card {
          background-color: #FFFFFF;
          border-radius: 18px;
          border: 1px solid #EAE5DC;
          padding: 13px;
          width: 100%;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 220ms cubic-bezier(0.16, 1, 0.3, 1), border-color 220ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        .sf-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 14px 28px -12px rgba(8, 28, 21, 0.14);
          border-color: rgba(13, 122, 87, 0.34);
        }
        :global(.sf-card-img) {
          transition: transform 260ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        .sf-card:hover :global(.sf-card-img) {
          transform: scale(1.03);
        }
        .sf-card-friogan {
          border-color: rgba(127, 29, 29, 0.22);
          background-color: #FFFDFD;
        }
        .sf-card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding-top: 10px;
          border-top: 1px solid #EFECE6;
        }
        .sf-add-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          min-height: 44px;
          background-color: #0D7A57;
          color: #FFFFFF;
          border: none;
          border-radius: 9999px;
          padding: 10px 16px;
          font-weight: 800;
          font-size: 0.84rem;
          transition: background-color 200ms cubic-bezier(0.16, 1, 0.3, 1), transform 200ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        .sf-add-btn:hover {
          background-color: #081C15;
        }
        .sf-add-btn-friogan {
          background-color: #7F1D1D;
        }
        .sf-add-btn-friogan:hover {
          background-color: #450A0A;
        }
        @media (max-width: 480px) {
          .sf-card {
            padding: 11px;
            border-radius: 16px;
          }
          .sf-card-footer {
            flex-wrap: wrap;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .sf-card,
          :global(.sf-card-img),
          .sf-add-btn {
            transition: none;
          }
          .sf-card:hover,
          .sf-card:hover :global(.sf-card-img) {
            transform: none;
          }
        }
      `}</style>
    </>
  );
}
