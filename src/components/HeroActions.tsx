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
      flexDirection: 'column',
      gap: '1rem', 
      justifyContent: 'flex-start', 
      alignItems: 'stretch',
      marginTop: '1.2rem',
      maxWidth: '480px',
      width: '100%'
    }}>
      {/* Main CTA: Catalog */}
      <button 
        onClick={scrollToCatalog}
        className="btn-premium" 
        style={{
          fontSize: '1.25rem',
          padding: '1.1rem 2.2rem',
          fontWeight: '900',
          borderRadius: 'var(--radius-full)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.85rem',
          backgroundColor: '#0D7A57',
          border: 'none',
          cursor: 'pointer',
          color: 'white',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 10px 28px rgba(13, 122, 87, 0.4)'
        }}
      >
        <LayoutGrid size={24} strokeWidth={2.5} /> 
        <span>{t.navCatalog || 'Nuestro Catálogo'}</span>
        <ArrowRight size={18} style={{ opacity: 0.8 }} />
      </button>

      {/* HORECA Institutional CTA */}
      <div style={{ 
        display: 'flex', 
        gap: '0.75rem', 
        alignItems: 'center',
        width: '100%'
      }}>
        <Link href="/b2b/register" style={{ textDecoration: 'none', width: '100%' }}>
          <button className="btn-glass" style={{
            fontSize: '1.02rem',
            padding: '0.9rem 1.6rem',
            fontWeight: '800',
            borderRadius: 'var(--radius-full)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.65rem',
            color: '#A7F3D0',
            border: '1px solid rgba(167, 243, 208, 0.4)',
            cursor: 'pointer',
            backgroundColor: 'rgba(6, 78, 59, 0.45)',
            backdropFilter: 'blur(15px)',
            transition: 'all 0.3s ease',
            boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
            width: '100%'
          }}>
            <Building2 size={20} strokeWidth={2.2} />
            <span>Cotizador Institucional HORECA</span>
            <Sparkles size={16} />
          </button>
        </Link>
      </div>
    </div>
  );
}

