'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, PackageSearch } from 'lucide-react';
import type { Product } from '../lib/supabase';
import ProductCard from './ProductCard';
import { translations, type Locale } from '../lib/translations';

interface Props {
  products: Product[];
  totalCount?: number;
  category?: string;
  q?: string;
  noProductsText: string;
}

export default function ProductGridClient({ products, totalCount, category, q, noProductsText }: Props) {
  const [items, setItems] = useState<Product[]>(products);
  const [loadingMore, setLoadingMore] = useState(false);
  const searchParams = useSearchParams();
  const locale = (searchParams.get('lang') === 'en' ? 'en' : 'es') as Locale;
  const t = translations[locale];

  useEffect(() => {
    setItems(products);
  }, [products]);

  if (products.length === 0) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '3rem 1.25rem',
          backgroundColor: '#FFFFFF',
          borderRadius: '20px',
          border: '1px solid rgba(8, 28, 21, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <span
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '14px',
            backgroundColor: '#FAF9F6',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#0D7A57',
          }}
        >
          <PackageSearch size={24} aria-hidden="true" />
        </span>
        <p style={{ margin: 0, fontSize: '1.02rem', fontWeight: 700, color: '#081C15' }}>
          {noProductsText}
        </p>
        <Link
          href={locale === 'en' ? '/?lang=en#catalog' : '/#catalog'}
          style={{
            marginTop: '4px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: '#0D7A57',
            color: '#FFFFFF',
            padding: '10px 18px',
            borderRadius: '9999px',
            fontWeight: 700,
            fontSize: '0.875rem',
          }}
        >
          <span>{locale === 'en' ? 'Explore full catalog' : 'Explorar todo el catálogo'}</span>
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </div>
    );
  }

  const total = totalCount ?? items.length;
  const hasMore = items.length < total;

  const handleLoadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams();
      params.set('offset', String(items.length));
      params.set('limit', '24');
      if (category) params.set('category', category);
      if (q) params.set('q', q);
      const res = await fetch(`/api/storefront/products?${params.toString()}`);
      if (res.ok) {
        const json = (await res.json()) as { items?: Product[] };
        if (Array.isArray(json.items) && json.items.length > 0) {
          setItems((prev) => {
            const seen = new Set(prev.map((p) => p.id));
            const next = json.items!.filter((p) => !seen.has(p.id));
            return [...prev, ...next];
          });
        }
      }
    } catch {
      // Safe fallback
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div>
      <div
        id="catalog-scroll-area"
        className="sf-product-grid"
      >
        {items.map((product) => (
          <ProductCard key={product.id} product={product} locale={locale} />
        ))}
      </div>

      {hasMore && (
        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <button
            type="button"
            disabled={loadingMore}
            onClick={handleLoadMore}
            className="sf-load-more-btn"
          >
            {loadingMore ? (locale === 'en' ? 'Loading...' : 'Cargando...') : (t.loadMore || 'Ver más productos')}
          </button>
        </div>
      )}

      <style jsx>{`
        .sf-product-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(225px, 1fr));
          gap: 14px;
          padding: 4px 0;
        }
        .sf-load-more-btn {
          padding: 0.78rem 2.4rem;
          font-size: 0.95rem;
          font-weight: 700;
          border-radius: 9999px;
          border: 1.5px solid #0D7A57;
          color: #0D7A57;
          background-color: #FFFFFF;
          cursor: pointer;
          transition: background-color 160ms ease, color 160ms ease, border-color 160ms ease;
        }
        .sf-load-more-btn:hover {
          background-color: #0D7A57;
          color: #FFFFFF;
        }
      `}</style>
    </div>
  );
}
