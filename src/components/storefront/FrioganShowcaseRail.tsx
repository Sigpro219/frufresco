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
    <section aria-label={locale === 'en' ? 'Friogan Certified Proteins' : 'Carnicería Friogan'} style={{ maxWidth: '1440px', margin: '14px auto 6px', padding: '0 16px' }}>
      <div style={{ backgroundColor: '#1C1917', border: '1px solid rgba(127, 29, 29, 0.55)', borderRadius: '20px', padding: '16px 18px', color: '#FAF9F6' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: '#7F1D1D', color: '#FFFFFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Snowflake size={18} aria-hidden="true" />
            </span>
            <div>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 800, fontSize: '1.1rem', color: '#FFFFFF' }}>
                {locale === 'en' ? 'Friogan Butcher Showcase · Vacuum Sealed' : 'Carnicería Friogan · Sellado al Vacío'}
              </h2>
              <p style={{ margin: 0, fontSize: '0.84rem', color: '#FCA5A5' }}>
                {locale === 'en' ? 'Exact sealed weight · Cold-chain 0°C–4°C' : 'Peso neto exacto en planta · Cadena de frío 0°C–4°C'}
              </p>
            </div>
          </div>

          <Link href={locale === 'en' ? '/?lang=en&category=CP#catalog' : '/?category=CP#catalog'} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#7F1D1D', color: '#FFFFFF', padding: '8px 14px', borderRadius: '9999px', fontWeight: 700, fontSize: '0.84rem' }}>
            <span>{locale === 'en' ? 'View all cuts' : 'Ver todos los cortes'}</span>
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(215px, 1fr))', gap: '12px' }}>
          {pricedProteins.map((product) => {
            const presentation = resolveProductStorefrontPresentation(product, locale);
            const opt = presentation.defaultOption;
            const priceRes = resolveStorefrontPrice(product, opt);
            const cartName = buildCartItemName(product, opt, presentation.options.length > 1 || presentation.kind === 'FIXED_VACUUM_PACK', locale);
            const qtyInCart = hydrated ? (items.find((i) => i.id === product.id && i.name === cartName)?.quantity || 0) : 0;
            const title = locale === 'en' && product.name_en ? product.name_en : product.display_name || product.name;

            return (
              <article key={product.id} style={{ backgroundColor: '#FFFFFF', color: '#081C15', borderRadius: '14px', border: '1px solid rgba(127, 29, 29, 0.28)', padding: '11px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '8px' }}>
                <div>
                  <Link href={`/products/${product.id}${locale === 'en' ? '?lang=en' : ''}`} style={{ display: 'block', marginBottom: '7px' }}>
                    <div style={{ height: '122px', borderRadius: '10px', backgroundColor: '#FAF9F6', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                      {product.image_url ? (
                        <Image
                          src={product.image_url}
                          alt={title}
                          fill
                          sizes="(max-width: 640px) 50vw, 240px"
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
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#7F1D1D', color: '#FFFFFF', borderRadius: '9999px', padding: '4px 8px' }}>
                      <button type="button" aria-label={`Disminuir ${title}`} onClick={() => updateItemQuantity(product.id, cartName, qtyInCart - 1)} style={{ background: 'transparent', border: 'none', color: '#FFFFFF', display: 'inline-flex', padding: '2px' }}>
                        <Minus size={14} />
                      </button>
                      <span style={{ minWidth: '18px', textAlign: 'center', fontWeight: 800, fontSize: '0.84rem', fontVariantNumeric: 'tabular-nums' }}>{qtyInCart}</span>
                      <button type="button" aria-label={`Aumentar ${title}`} onClick={() => updateItemQuantity(product.id, cartName, qtyInCart + 1)} style={{ background: 'transparent', border: 'none', color: '#FFFFFF', display: 'inline-flex', padding: '2px' }}>
                        <Plus size={14} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => addItem(buildStorefrontCartItem(product, opt, 1, presentation.options.length, presentation.kind, priceRes, locale))}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#7F1D1D', color: '#FFFFFF', border: 'none', borderRadius: '9999px', padding: '6px 12px', fontWeight: 700, fontSize: '0.82rem', transition: 'background-color 150ms ease' }}
                    >
                      <Plus size={14} />
                      <span>Agregar</span>
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
