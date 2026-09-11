'use client';

import React from 'react';
import Link from 'next/link';
import { 
  Building2, 
  UtensilsCrossed, 
  Hotel, 
  Factory, 
  Coffee, 
  Clock, 
  ShieldCheck, 
  TrendingUp, 
  FileCheck2, 
  MessageSquare, 
  ArrowRight,
  Sparkles,
  CheckCircle2
} from 'lucide-react';
import { Locale } from '@/lib/translations';

interface HorecaShowcaseProps {
  locale?: Locale;
}

export default function HorecaShowcase({ locale = 'es' }: HorecaShowcaseProps) {
  const isEn = locale === 'en';

  const pillars = [
    {
      icon: Clock,
      title: isEn ? 'Morning Delivery (5:00 - 8:00 AM)' : 'Despacho Madrugada (5:00 - 8:00 AM)',
      desc: isEn 
        ? 'Your kitchen opens with fresh produce already received, checked, and ready for mise en place.'
        : 'Tu cocina abre con el producto ya recibido, verificado y listo para el inicio del mise en place.'
    },
    {
      icon: ShieldCheck,
      title: isEn ? 'Packhouse Grading & Selection' : 'Selección y Calibración en Acopio',
      desc: isEn
        ? 'Manual sorting by size and ripeness. No hidden shrinkage or rotten product in your crates.'
        : 'Clasificación manual por calibre y maduración. Cero mermas ocultas en tus canastillas.'
    },
    {
      icon: TrendingUp,
      title: isEn ? 'Volume-Based Wholesale Pricing' : 'Precios Mayoristas Estables',
      desc: isEn
        ? 'Direct farm and central market sourcing for margin optimization and steady ingredient costs.'
        : 'Conexión directa con productores y Corabastos para proteger tus márgenes y costos operativos.'
    },
    {
      icon: FileCheck2,
      title: isEn ? 'DIAN Invoicing & 15/30 Day Credit' : 'Factura DIAN y Crédito a 15/30 Días',
      desc: isEn
        ? 'Formal tax compliance, electronic credit notes, and flexible payment terms for qualified accounts.'
        : 'Soporte tributario formal, notas crédito ágiles y líneas de pago comercial para empresas aliadas.'
    }
  ];

  const sectors = [
    {
      icon: UtensilsCrossed,
      title: isEn ? 'Restaurants & Chains' : 'Restaurantes y Cadenas',
      detail: isEn ? 'Uniform portions, recipe consistency' : 'Homogeneidad de gramajes y recetas estándar'
    },
    {
      icon: Hotel,
      title: isEn ? 'Hotels & Private Clubs' : 'Hoteles y Clubes',
      detail: isEn ? 'Top tier aesthetics for buffets & banquets' : 'Presentación impecable en buffets y eventos'
    },
    {
      icon: Factory,
      title: isEn ? 'Corporate Catering & Canteens' : 'Casinos y Catering',
      detail: isEn ? 'Bulk consolidated volumes & food safety' : 'Consolidación por toneladas e inocuidad'
    },
    {
      icon: Coffee,
      title: isEn ? 'Cafes & Ghost Kitchens' : 'Cafés y Dark Kitchens',
      detail: isEn ? 'Fast daily replenishment & zero dead stock' : 'Rotación rápida sin acumular inventario'
    }
  ];

  return (
    <section 
      id="horeca-solutions" 
      style={{ 
        padding: '5rem 0', 
        backgroundColor: '#071A12',
        position: 'relative',
        overflow: 'hidden',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        borderBottom: '1px solid rgba(255,255,255,0.06)'
      }}
    >
      {/* Subtle background ambient glows */}
      <div 
        style={{
          position: 'absolute',
          top: '-150px',
          right: '-100px',
          width: '500px',
          height: '500px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(16,185,129,0.12) 0%, rgba(0,0,0,0) 70%)',
          pointerEvents: 'none'
        }} 
      />
      <div 
        style={{
          position: 'absolute',
          bottom: '-150px',
          left: '-100px',
          width: '500px',
          height: '500px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(52,211,153,0.08) 0%, rgba(0,0,0,0) 70%)',
          pointerEvents: 'none'
        }} 
      />

      <div className="container" style={{ position: 'relative', zIndex: 2 }}>
        
        {/* Header Badge & Title */}
        <div style={{ textAlign: 'center', maxWidth: '820px', margin: '0 auto 3.5rem' }}>
          <div 
            style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '8px', 
              padding: '0.45rem 1.1rem', 
              borderRadius: '9999px', 
              backgroundColor: 'rgba(16, 185, 129, 0.12)', 
              border: '1px solid rgba(16, 185, 129, 0.28)',
              color: '#34d399',
              fontSize: '0.82rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              marginBottom: '1rem'
            }}
          >
            <Building2 size={16} strokeWidth={2.4} />
            {isEn ? 'B2B HORECA Institutional Solutions' : 'Canal Institucional B2B · HORECA'}
          </div>

          <h2 
            style={{ 
              fontFamily: 'var(--font-outfit), sans-serif', 
              fontSize: '2.8rem', 
              fontWeight: '900', 
              color: '#ffffff', 
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
              margin: '0 0 1rem 0'
            }}
          >
            {isEn 
              ? 'Institutional Fresh Supply for Demanding Food Operations' 
              : 'Abastecimiento de Alimentos Frescos para la Alta Exigencia Gastronómica'}
          </h2>

          <p 
            style={{ 
              fontSize: '1.1rem', 
              color: 'rgba(255, 255, 255, 0.78)', 
              lineHeight: 1.65,
              margin: 0
            }}
          >
            {isEn
              ? 'We are the strategic logistics partner for top restaurants, hotels, and corporate dining facilities in Bogotá and the Sabana region. Zero dead weight, on-time schedules, and formal invoicing.'
              : 'El aliado logístico estratégico de los mejores restaurantes, hoteles y casinos corporativos de Bogotá y Sabana. Despachos consolidados, puntualidad matutina y facturación electrónica formal.'}
          </p>
        </div>

        {/* 4 Pillars Grid */}
        <div 
          style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', 
            gap: '1.5rem',
            marginBottom: '3.5rem'
          }}
        >
          {pillars.map((pillar, idx) => {
            const Icon = pillar.icon;
            return (
              <div 
                key={idx}
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.09)',
                  borderRadius: '20px',
                  padding: '1.8rem 1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                  transition: 'all 0.3s ease',
                  backdropFilter: 'blur(10px)'
                }}
              >
                <div 
                  style={{
                    width: '52px',
                    height: '52px',
                    borderRadius: '16px',
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    color: '#34d399',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <Icon size={26} strokeWidth={2.2} />
                </div>
                <div>
                  <h3 
                    style={{ 
                      fontFamily: 'var(--font-outfit), sans-serif', 
                      fontSize: '1.25rem', 
                      fontWeight: '800', 
                      color: '#ffffff',
                      marginBottom: '0.5rem',
                      lineHeight: 1.3
                    }}
                  >
                    {pillar.title}
                  </h3>
                  <p 
                    style={{ 
                      fontSize: '0.92rem', 
                      color: 'rgba(255, 255, 255, 0.68)', 
                      lineHeight: 1.55,
                      margin: 0
                    }}
                  >
                    {pillar.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Sectors Served + B2B CTA Banner Box */}
        <div 
          style={{
            backgroundColor: 'rgba(13, 122, 87, 0.12)',
            border: '1.5px solid rgba(16, 185, 129, 0.35)',
            borderRadius: '24px',
            padding: '2.5rem 2rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '2rem'
          }}
        >
          {/* Sectors title */}
          <div>
            <span 
              style={{ 
                fontSize: '0.8rem', 
                fontWeight: '800', 
                color: '#34d399', 
                textTransform: 'uppercase', 
                letterSpacing: '0.12em',
                display: 'block',
                marginBottom: '0.5rem'
              }}
            >
              {isEn ? 'SECTORS OPERATING WITH FRUFRESCO' : 'SECTORES QUE OPERAN CON FRUFRESCO'}
            </span>
            <h4 
              style={{ 
                fontFamily: 'var(--font-outfit), sans-serif', 
                fontSize: '1.6rem', 
                fontWeight: '800', 
                color: '#ffffff', 
                margin: 0 
              }}
            >
              {isEn 
                ? 'Tailored to each kitchen’s rhythm and volume requirements' 
                : 'Adaptado al ritmo, volumen y gramaje de cada cocina profesional'}
            </h4>
          </div>

          {/* Sectors 4-items */}
          <div 
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1rem'
            }}
          >
            {sectors.map((sec, idx) => {
              const SecIcon = sec.icon;
              return (
                <div 
                  key={idx}
                  style={{
                    backgroundColor: 'rgba(6, 26, 18, 0.7)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '16px',
                    padding: '1.2rem 1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                  }}
                >
                  <div 
                    style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '12px',
                      backgroundColor: 'rgba(16, 185, 129, 0.1)',
                      color: '#6ee7b7',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}
                  >
                    <SecIcon size={22} />
                  </div>
                  <div>
                    <div style={{ fontWeight: '800', fontSize: '0.95rem', color: '#ffffff', fontFamily: 'var(--font-outfit), sans-serif' }}>
                      {sec.title}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)', marginTop: '2px' }}>
                      {sec.detail}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action CTAs: Register B2B + WhatsApp */}
          <div 
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1.5rem',
              flexWrap: 'wrap',
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              paddingTop: '1.75rem'
            }}
          >
            <div style={{ maxWidth: '550px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#34d399', fontWeight: '800', fontSize: '0.95rem', marginBottom: '4px' }}>
                <CheckCircle2 size={18} />
                {isEn ? 'Consolidate all food supply with a single provider' : 'Consolida tu compra de frutas y verduras con un solo proveedor'}
              </div>
              <p style={{ margin: 0, fontSize: '0.88rem', color: 'rgba(255, 255, 255, 0.72)', lineHeight: 1.45 }}>
                {isEn
                  ? 'Access customized pricing, payment terms, and early morning deliveries before your breakfast or lunch rush.'
                  : 'Accede a listas de precios institucionales, plazos de pago y despachos puntuales antes de abrir tu servicio.'}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <Link href="/b2b/register" style={{ textDecoration: 'none' }}>
                <button 
                  className="btn-premium"
                  style={{
                    backgroundColor: '#10b981',
                    color: '#062619',
                    fontWeight: '900',
                    fontSize: '1rem',
                    padding: '0.9rem 1.8rem',
                    borderRadius: '9999px',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 8px 24px rgba(16, 185, 129, 0.35)'
                  }}
                >
                  <Building2 size={20} strokeWidth={2.4} />
                  {isEn ? 'Open Corporate B2B Account' : 'Abrir Cuenta Institucional'}
                  <ArrowRight size={18} />
                </button>
              </Link>

              <a 
                href="https://wa.me/573167022898?text=Hola%20FruFresco%2C%20quisiera%20cotizar%20el%20abastecimiento%20institucional%20para%20mi%20negocio" 
                target="_blank" 
                rel="noopener noreferrer"
                style={{ textDecoration: 'none' }}
              >
                <button 
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                    color: '#ffffff',
                    fontWeight: '800',
                    fontSize: '0.95rem',
                    padding: '0.85rem 1.5rem',
                    borderRadius: '9999px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <MessageSquare size={18} color="#34d399" />
                  {isEn ? 'Talk to a Commercial Advisor' : 'Hablar con Asesor Comercial'}
                </button>
              </a>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
