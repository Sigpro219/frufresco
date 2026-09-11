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
      gap: '1.25rem', 
      justifyContent: 'flex-start', 
      alignItems: 'flex-start',
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

      {/* Chatbot HORECA CTA */}
      <div style={{ 
        display: 'flex', 
        gap: '1rem', 
        alignItems: 'center',
        flexWrap: 'wrap'
      }}>
        <Link href="/b2b/register" style={{ textDecoration: 'none' }}>
          <button className="btn-glass" style={{
            fontSize: '1.1rem',
            padding: '0.9rem 2rem',
            fontWeight: '700',
            borderRadius: 'var(--radius-full)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            color: '#A7F3D0',
            border: '1px solid rgba(167, 243, 208, 0.4)',
            cursor: 'pointer',
            backgroundColor: 'rgba(6, 78, 59, 0.4)',
            backdropFilter: 'blur(15px)',
            transition: 'all 0.3s ease',
            boxShadow: '0 4px 15px rgba(0,0,0,0.15)'
          }}>
            <Building2 size={22} strokeWidth={2.2} />
            <span>Cotizador Institucional HORECA</span>
            <Sparkles size={16} />
          </button>
        </Link>
      </div>
    </div>
  );
}

