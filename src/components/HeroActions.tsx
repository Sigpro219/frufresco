'use client';

import { LayoutGrid, Building2, ShoppingCart, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface HeroActionsProps {
  t: any;
  isB2bEnabled: boolean;
}

export default function HeroActions({ t, isB2bEnabled }: HeroActionsProps) {
  const scrollToCatalog = (e: React.MouseEvent) => {
    e.preventDefault();
    const catalogElement = document.getElementById('catalog');
    if (catalogElement) {
      catalogElement.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column',
      gap: '2.5rem', 
      justifyContent: 'center', 
      alignItems: 'center',
      marginTop: '1rem'
    }}>
      {/* Main CTA: Catalog */}
      <button 
        onClick={scrollToCatalog}
        className="btn-premium" 
        style={{
          fontSize: '1.4rem',
          padding: '1.2rem 4.5rem',
          fontWeight: '900',
          borderRadius: 'var(--radius-full)',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          backgroundColor: 'var(--primary)',
          border: 'none',
          cursor: 'pointer',
          color: 'white',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <LayoutGrid size={28} strokeWidth={2.5} /> 
        {t.navCatalog || 'Nuestro Catálogo'}
        <ArrowRight size={20} style={{ opacity: 0.7 }} />
      </button>

      <div style={{ 
        display: 'flex', 
        gap: '1.5rem', 
        justifyContent: 'center', 
        flexWrap: 'wrap',
        padding: '0.5rem'
      }}>
        {isB2bEnabled && (
          <Link href="/b2b/register" style={{ textDecoration: 'none' }}>
            <button className="btn-glass" style={{
              fontSize: '1.1rem',
              padding: '0.9rem 2.8rem',
              fontWeight: '700',
              borderRadius: 'var(--radius-full)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.8rem',
              color: 'white',
              border: '1px solid rgba(255,255,255,0.4)',
              cursor: 'pointer',
              backgroundColor: 'rgba(255,255,255,0.12)',
              backdropFilter: 'blur(15px)',
              transition: 'all 0.3s ease',
              boxShadow: '0 4px 15px rgba(0,0,0,0.1)'
            }}>
              <Building2 size={22} strokeWidth={2} /> 
              {t.btnInstitutional}
            </button>
          </Link>
        )}
        
        <Link href="/register" style={{ textDecoration: 'none' }}>
          <button className="btn-glass" style={{
            fontSize: '1.1rem',
            padding: '0.9rem 2.8rem',
            fontWeight: '700',
            borderRadius: 'var(--radius-full)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.8rem',
            color: 'white',
            border: '1px solid rgba(255,255,255,0.4)',
            cursor: 'pointer',
            backgroundColor: 'rgba(255,255,255,0.12)',
            backdropFilter: 'blur(15px)',
            transition: 'all 0.3s ease',
            boxShadow: '0 4px 15px rgba(0,0,0,0.1)'
          }}>
            <ShoppingCart size={22} strokeWidth={2} /> 
            {t.btnHome}
          </button>
        </Link>
      </div>
    </div>
  );
}
