'use client';

import { useState } from 'react';
import type { Product } from '../lib/supabase';
import ProductCard from './ProductCard';

interface Props {
  products: Product[];
  noProductsText: string;
}

export default function ProductGridClient({ products, noProductsText }: Props) {
  if (products.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
        <p style={{ fontSize: '1.2rem', color: 'var(--text-muted)' }}>
          {noProductsText}
        </p>
      </div>
    );
  }

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
          backgroundColor: '#ffffff',
          maxHeight: '1650px', /* Aproximadamente 4 filas de altura */
          overflowY: 'auto'
        }}
        className="custom-scrollbar"
      >
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}
