'use client';

import { LayoutGrid, Building2, ArrowRight, Bot, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '../lib/authContext';

interface HeroActionsProps {
  t: any;
  isB2bEnabled: boolean;
}

export default function HeroActions({ t, isB2bEnabled }: HeroActionsProps) {
  const { user } = useAuth();

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
      flexDirection: 'row',
      gap: '1rem', 
      justifyContent: 'flex-start', 
      alignItems: 'center',
      marginTop: '0.5rem',
      flexWrap: 'wrap'
    }}>
      {/* Main CTA: Catalog */}
      <button 
        onClick={scrollToCatalog}
        className="btn-premium" 
        style={{
          fontSize: '1.15rem',
          padding: '0.95rem 2.2rem',
          fontWeight: '800',
          borderRadius: 'var(--radius-full)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.75rem',
          backgroundColor: '#0D7A57',
          border: 'none',
          cursor: 'pointer',
          color: 'white',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 8px 24px rgba(13, 122, 87, 0.4)'
        }}
      >
        <LayoutGrid size={22} strokeWidth={2.4} /> 
        {t.navCatalog || 'Nuestro Catálogo'}
        <ArrowRight size={18} style={{ opacity: 0.8 }} />
      </button>

      {/* HORECA Institutional CTA */}
      <Link href="/b2b/register" style={{ textDecoration: 'none' }}>
        <button className="btn-glass" style={{
          fontSize: '0.98rem',
          padding: '0.9rem 1.6rem',
          fontWeight: '700',
          borderRadius: 'var(--radius-full)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.6rem',
          color: '#A7F3D0',
          border: '1px solid rgba(167, 243, 208, 0.35)',
          cursor: 'pointer',
          backgroundColor: 'rgba(6, 78, 59, 0.35)',
          backdropFilter: 'blur(15px)',
          transition: 'all 0.3s ease',
          boxShadow: '0 4px 15px rgba(0,0,0,0.12)'
        }}>
          <Building2 size={19} strokeWidth={2.2} />
          <span>Cotizador Institucional HORECA</span>
          <Sparkles size={15} />
        </button>
      </Link>
    </div>
  );
}

