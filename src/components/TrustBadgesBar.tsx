import React from 'react';
import { Clock, FileText, ShieldCheck, CreditCard } from 'lucide-react';
import { Locale } from '@/lib/translations';

interface TrustBadgesBarProps {
  locale?: Locale;
}

export default function TrustBadgesBar({ locale = 'es' }: TrustBadgesBarProps) {
  const isEn = locale === 'en';

  const badges = [
    {
      icon: Clock,
      title: '5:00 AM - 8:00 AM',
      subtitle: isEn ? 'Early morning delivery before kitchen prep' : 'Entregas a primera hora antes del mise en place',
      tag: isEn ? 'On-Time SLA' : 'Puntualidad'
    },
    {
      icon: FileText,
      title: isEn ? 'DIAN Electronic Invoicing' : 'Facturación Electrónica DIAN',
      subtitle: isEn ? 'Full tax traceability and accounting support' : 'Trazabilidad fiscal completa y soporte contable',
      tag: isEn ? 'Compliance' : 'Tributario'
    },
    {
      icon: ShieldCheck,
      title: isEn ? 'Packhouse Quality Control' : 'Control en Centro de Acopio',
      subtitle: isEn ? 'Rigorous manual calibration, zero hidden spoilage' : 'Calibración por maduración y cero mermas ocultas',
      tag: isEn ? 'Quality' : 'Calidad'
    },
    {
      icon: CreditCard,
      title: isEn ? '15 & 30-Day Credit Terms' : 'Crédito B2B a 15 y 30 Días',
      subtitle: isEn ? 'Commercial credit lines for qualified food businesses' : 'Líneas comerciales para restaurantes e industrias',
      tag: isEn ? 'Cashflow' : 'Financiación'
    }
  ];

  return (
    <div
      style={{
        backgroundColor: '#061a12',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
        padding: '1.25rem 1rem',
        position: 'relative',
        zIndex: 15
      }}
    >
      <div className="container">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '1rem',
            alignItems: 'stretch'
          }}
        >
          {badges.map((badge, idx) => {
            const IconComponent = badge.icon;
            return (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '0.85rem 1.1rem',
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.07)',
                  borderRadius: '16px',
                  transition: 'all 0.3s ease',
                  backdropFilter: 'blur(8px)'
                }}
              >
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '12px',
                    backgroundColor: 'rgba(16, 185, 129, 0.12)',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#34d399',
                    flexShrink: 0,
                    marginTop: '2px'
                  }}
                >
                  <IconComponent size={20} strokeWidth={2.2} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                    <span
                      style={{
                        fontFamily: 'var(--font-outfit), sans-serif',
                        fontWeight: 800,
                        fontSize: '0.92rem',
                        color: '#ffffff',
                        letterSpacing: '-0.01em',
                        lineHeight: 1.2
                      }}
                    >
                      {badge.title}
                    </span>
                  </div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '0.78rem',
                      color: 'rgba(255, 255, 255, 0.65)',
                      lineHeight: 1.35,
                      fontFamily: 'var(--font-inter), sans-serif'
                    }}
                  >
                    {badge.subtitle}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
