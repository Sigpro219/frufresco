'use client';

import { LayoutGrid, Building2, ShoppingCart } from 'lucide-react';
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
      gap: '2rem', 
      justifyContent: 'center', 
      alignItems: 'center' 
    }}>
      <style jsx>{`
        .hero-btn-main:hover {
          transform: scale(1.05) translateY(-5px) !important;
          box-shadow: 0 25px 50px rgba(0,0,0,0.4) !important;
          filter: brightness(1.1);
        }
        .hero-btn-secondary:hover {
          background-color: rgba(255,255,255,0.2) !important;
          transform: translateY(-3px) !important;
          border-color: rgba(255,255,255,0.5) !important;
        }
      `}</style>
      {/* Main CTA: Catalog */}
      <button 
        onClick={scrollToCatalog}
        className="btn btn-primary hero-btn-main" 
        style={{
          fontSize: '1.4rem',
          padding: '1.2rem 4rem',
          fontWeight: '900',
          borderRadius: 'var(--radius-full)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.8rem',
          backgroundColor: 'var(--primary)',
          boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          border: 'none',
          cursor: 'pointer',
          color: 'white'
        }}
      >
        <LayoutGrid size={28} strokeWidth={2.5} /> {t.navCatalog || 'Nuestro Catálogo'}
      </button>

      <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        {isB2bEnabled && (
          <Link href="/b2b/register">
            <button className="btn-glass hero-btn-secondary" style={{
              fontSize: '1.1rem',
              padding: '1rem 2.5rem',
              fontWeight: '700',
              borderRadius: 'var(--radius-full)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              color: 'white',
              border: '1px solid rgba(255,255,255,0.3)',
              cursor: 'pointer',
              backgroundColor: 'rgba(255,255,255,0.1)',
              backdropFilter: 'blur(10px)',
              transition: 'all 0.3s ease'
            }}>
              <Building2 size={22} /> {t.btnInstitutional}
            </button>
          </Link>
        )}
        <Link href="/register">
          <button className="btn-glass hero-btn-secondary" style={{
            fontSize: '1.1rem',
            padding: '1rem 2.5rem',
            fontWeight: '700',
            borderRadius: 'var(--radius-full)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            color: 'white',
            border: '1px solid rgba(255,255,255,0.3)',
            cursor: 'pointer',
            backgroundColor: 'rgba(255,255,255,0.1)',
            backdropFilter: 'blur(10px)',
            transition: 'all 0.3s ease'
          }}>
            <ShoppingCart size={22} /> {t.btnHome}
          </button>
        </Link>
      </div>
    </div>
  );
}
