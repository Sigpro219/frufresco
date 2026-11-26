'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Minus, Plus, Snowflake } from 'lucide-react';
import { useCart } from '@/lib/cartContext';
import type { Product } from '@/lib/supabase';
import type { Locale } from '@/lib/translations';
import type { StorefrontRuntimeConfig } from '@/lib/storefront/storefrontContracts';
import {
  buildCartItemName,
  buildStorefrontCartItem,
  isFrioganProteinProduct,
  resolveProductStorefrontPresentation,
  resolveStorefrontPrice,
} from '@/lib/storefront/storefrontEngine';

interface FrioganShowcaseRailProps {
  products: Product[];
  config: StorefrontRuntimeConfig;
  locale: Locale;
}

export default function FrioganShowcaseRail({ products, config, locale }: FrioganShowcaseRailProps) {
  const { items, addItem, updateItemQuantity } = useCart();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  if (config.frioganMode !== 'LIVE') return null;

  const pricedProteins = products
    .filter((p) => {
      if (!isFrioganProteinProduct(p)) return false;
      const pres = resolveProductStorefrontPresentation(p, locale);
      return resolveStorefrontPrice(p, pres.defaultOption).isPriceAvailable;
    })
    .slice(0, 12);

  if (pricedProteins.length === 0) return null;

  return (
    <section aria-label={locale === 'en' ? 'Friogan Certified Proteins' : 'Carnicería Friogan'} className="sf-friogan-section">
      <div className="sf-friogan-shell">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <span style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: '#7F1D1D', color: '#FFFFFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Snowflake size={18} aria-hidden="true" />
            </span>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 800, fontSize: 'clamp(1rem, 2.2vw, 1.18rem)', color: '#FFFFFF' }}>
                {locale === 'en' ? 'Friogan Butcher Showcase · Vacuum Sealed' : 'Carnicería Friogan · Sellado al Vacío'}
              </h2>
              <p style={{ margin: 0, fontSize: 'clamp(0.78rem, 1.8vw, 0.84rem)', color: '#FCA5A5' }}>
                {locale === 'en' ? 'Exact sealed weight · Cold-chain 0°C–4°C' : 'Peso neto exacto en planta · Cadena de frío 0°C–4°C'}
              </p>
            </div>
          </div>

          <Link
            href={locale === 'en' ? '/?lang=en&category=CP#catalog' : '/?category=CP#catalog'}
            className="sf-friogan-cta"
          >
            <span>{locale === 'en' ? 'View all cuts' : 'Ver todos los cortes'}</span>
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>

        <div className="sf-friogan-rail">
          {pricedProteins.map((product) => {
            const presentation = resolveProductStorefrontPresentation(product, locale);
            const opt = presentation.defaultOption;
            const priceRes = resolveStorefrontPrice(product, opt);
            const cartName = buildCartItemName(product, opt, presentation.options.length > 1 || presentation.kind === 'FIXED_VACUUM_PACK', locale);
            const qtyInCart = hydrated ? (items.find((i) => i.id === product.id && i.name === cartName)?.quantity || 0) : 0;
            const title = locale === 'en' && product.name_en ? product.name_en : product.display_name || product.name;

            return (
              <article key={product.id} className="sf-friogan-card">
                <div>
                  <Link href={`/products/${product.id}${locale === 'en' ? '?lang=en' : ''}`} style={{ display: 'block', marginBottom: '7px' }}>
                    <div style={{ width: '100%', aspectRatio: '16 / 10', borderRadius: '10px', backgroundColor: '#FAF9F6', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                      {product.image_url ? (
                        <Image
                          src={product.image_url}
                          alt={title}
                          fill
                          sizes="(max-width: 640px) 75vw, 240px"
                          unoptimized={!product.image_url.startsWith('/') && !product.image_url.includes('.supabase.co/storage/v1/object/public/')}
                          style={{ objectFit: 'cover' }}
                        />
                      ) : (
                        <Snowflake size={28} color="#7F1D1D" />
                      )}
                      {presentation.sealedWeightLabel && (
                        <span style={{ position: 'absolute', bottom: '6px', left: '6px', backgroundColor: 'rgba(127, 29, 29, 0.92)', color: '#FFFFFF', padding: '2px 8px', borderRadius: '9999px', fontSize: '0.8125rem', fontWeight: 700 }}>
                          {presentation.sealedWeightLabel}
                        </span>
                      )}
                    </div>
                  </Link>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                    <span style={{ fontSize: '0.8125rem', color: '#64748B' }}>{opt.label}</span>
                  </div>

                  <Link href={`/products/${product.id}${locale === 'en' ? '?lang=en' : ''}`} style={{ fontWeight: 700, fontSize: '0.9rem', color: '#081C15', lineHeight: 1.25, display: 'block' }}>
                    {title}
                  </Link>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', paddingTop: '7px', borderTop: '1px solid rgba(8,28,21,0.06)' }}>
                  <span style={{ fontWeight: 800, fontSize: '0.98rem', color: '#450A0A', fontVariantNumeric: 'tabular-nums' }}>
                    ${priceRes.displayPrice.toLocaleString('es-CO')}
                  </span>

                  {qtyInCart > 0 ? (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', backgroundColor: '#7F1D1D', color: '#FFFFFF', borderRadius: '9999px', padding: '0 4px', minHeight: '44px' }}>
                      <button type="button" aria-label={`Disminuir ${title}`} onClick={() => updateItemQuantity(product.id, cartName, qtyInCart - 1)} style={{ background: 'transparent', border: 'none', color: '#FFFFFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '34px', minHeight: '44px' }}>
                        <Minus size={14} />
                      </button>
                      <span style={{ minWidth: '18px', textAlign: 'center', fontWeight: 800, fontSize: '0.84rem', fontVariantNumeric: 'tabular-nums' }}>{qtyInCart}</span>
                      <button type="button" aria-label={`Aumentar ${title}`} onClick={() => updateItemQuantity(product.id, cartName, qtyInCart + 1)} style={{ background: 'transparent', border: 'none', color: '#FFFFFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '34px', minHeight: '44px' }}>
                        <Plus size={14} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => addItem(buildStorefrontCartItem(product, opt, 1, presentation.options.length, presentation.kind, priceRes, locale))}
                      className="sf-friogan-add-btn"
                    >
                      <Plus size={14} />
                      <span>{locale === 'en' ? 'Add' : 'Agregar'}</span>
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <style jsx>{`
        .sf-friogan-section {
          max-width: 1440px;
          margin: 14px auto 6px;
          padding: 0 16px;
        }
        .sf-friogan-shell {
          background-color: #1C1917;
          border: 1px solid rgba(127, 29, 29, 0.55);
          border-radius: 20px;
          padding: 16px 18px;
          color: #FAF9F6;
        }
        .sf-friogan-cta {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          min-height: 44px;
          background-color: #7F1D1D;
          color: #FFFFFF;
          padding: 8px 14px;
          border-radius: 9999px;
          font-weight: 700;
          font-size: 0.84rem;
          transition: background-color 200ms cubic-bezier(0.16, 1, 0.3, 1), transform 200ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        .sf-friogan-rail {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(215px, 1fr));
          gap: 12px;
        }
        .sf-friogan-card {
          background-color: #FFFFFF;
          color: #081C15;
          border-radius: 14px;
          border: 1px solid rgba(127, 29, 29, 0.28);
          padding: 11px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 8px;
          transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 220ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        .sf-friogan-add-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          min-height: 44px;
          background-color: #7F1D1D;
          color: #FFFFFF;
          border: none;
          border-radius: 9999px;
          padding: 8px 14px;
          font-weight: 700;
          font-size: 0.82rem;
          transition: background-color 200ms cubic-bezier(0.16, 1, 0.3, 1), transform 200ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        @media (max-width: 768px) {
          .sf-friogan-section {
            padding: 0 12px;
          }
          .sf-friogan-shell {
            padding: 14px 12px;
            border-radius: 16px;
          }
          .sf-friogan-rail {
            display: flex;
            overflow-x: auto;
            scroll-snap-type: x mandatory;
            -webkit-overflow-scrolling: touch;
            overscroll-behavior-x: contain;
            scrollbar-width: none;
            gap: 10px;
            padding-bottom: 4px;
          }
          .sf-friogan-rail::-webkit-scrollbar {
            display: none;
          }
          .sf-friogan-card {
            flex: 0 0 76%;
            min-width: 224px;
            max-width: 264px;
            scroll-snap-align: start;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .sf-friogan-cta,
          .sf-friogan-card,
          .sf-friogan-add-btn {
            transition: none;
          }
        }
      `}</style>
    </section>
  );
}
