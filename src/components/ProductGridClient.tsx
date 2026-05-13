'use client';

import { useState, useEffect } from 'react';
import type { Product } from '../lib/supabase';
import ProductCard from './ProductCard';
import { translations, Locale } from '../lib/translations';
import { useSearchParams } from 'next/navigation';

interface Props {
  products: Product[];
  noProductsText: string;
}

export default function ProductGridClient({ products, noProductsText }: Props) {
  const [visibleCount, setVisibleCount] = useState(20);
  const searchParams = useSearchParams();
  const locale = (searchParams.get('lang') === 'en' ? 'en' : 'es') as Locale;
  const t = translations[locale];

  // Reset visible count when products change (e.g. on search or category filter)
  useEffect(() => {
    setVisibleCount(20);
  }, [products]);

  if (products.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
        <p style={{ fontSize: '1.2rem', color: 'var(--text-muted)' }}>
          {noProductsText}
        </p>
      </div>
    );
  }

  const displayedProducts = products.slice(0, visibleCount);
  const hasMore = visibleCount < products.length;

  return (
    <div>
      <div 
        id="catalog-scroll-area"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: '2rem',
          padding: '1.5rem',
          borderRadius: 'var(--radius-lg)',
          backgroundColor: '#ffffff'
          // Removed maxHeight and overflowY for better UX: the page expands naturally
        }}
      >
        {displayedProducts.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
      
      {hasMore && (
        <div style={{ textAlign: 'center', marginTop: '2.5rem' }}>
          <button 
            onClick={() => setVisibleCount(prev => prev + 24)}
            className="btn btn-secondary"
            style={{
              padding: '0.8rem 3rem',
              fontSize: '1.1rem',
              fontWeight: '700',
              borderRadius: 'var(--radius-full)',
              border: '2px solid var(--primary)',
              color: 'var(--primary)',
              backgroundColor: 'white',
              cursor: 'pointer',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--primary)';
              e.currentTarget.style.color = 'white';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'white';
              e.currentTarget.style.color = 'var(--primary)';
            }}
          >
            {t.loadMore || 'Ver más productos'}
          </button>
        </div>
      )}
    </div>
  );
}
