'use client';

import Link from 'next/link';
import OrderTracking from './OrderTracking';
import { MapPin, Phone, Mail, MessageCircle, ShieldCheck } from 'lucide-react';
import { config } from '@/lib/config';
import { useSearchParams } from 'next/navigation';
import { translations, Locale } from '../lib/translations';
import type { StorefrontRuntimeConfig } from '@/lib/storefront/storefrontContracts';

export default function Footer({ initialConfig }: { initialConfig?: StorefrontRuntimeConfig }) {
  const searchParams = useSearchParams();
  const locale = (searchParams.get('lang') === 'en' ? 'en' : 'es') as Locale;
  const t = translations[locale];

  const appName = config.brand.name;
  const phone = initialConfig?.contactPhone || '316 7022898';
  const ordersEmail = 'pedidos@frufresco.co';
  const contactEmail = 'contacto@frufresco.co';
  const address = 'CL 12 B # 71 D - 31 TO 4 AP 101, Bogotá D.C., Colombia';
  const description = t.footerDesc;
  const logoUrl = initialConfig?.logoUrl || '/logo.png';

  return (
    <footer className="site-footer-root" style={{ 
      background: 'linear-gradient(180deg, #05130e 0%, #020a07 100%)', 
      color: '#F9FAFB', 
      padding: '2.75rem 0 1.75rem',
      borderTop: '1px solid rgba(16, 185, 129, 0.22)'
    }}>
      <div className="container">
        {/* Compact Tracking in Footer */}
        {/* Compact Tracking in Footer */}
        {/* Hiding OrderTracking section as requested by user, keeping code intact for future use */}
        {false && (
          <div style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)', marginBottom: '1.5rem', paddingBottom: '1rem' }}>
               <OrderTracking />
           </div>
        )}

        <div className="footer-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '2rem', marginBottom: '2rem' }}>
          
          {/* Brand */}
          <div>
            <div className="footer-logo-wrap" style={{ display: 'inline-flex', alignItems: 'center', backgroundColor: '#FAF9F6', padding: '6px 14px', borderRadius: '12px', marginBottom: '1rem' }}>
              <img 
                src={logoUrl || '/logo.png'} 
                alt={appName} 
                className="footer-brand-logo"
                style={{ height: '42px', width: 'auto', objectFit: 'contain', display: 'block' }} 
                onError={(e) => {
                  if (!e.currentTarget.src.endsWith('/logo.png')) {
                    e.currentTarget.src = '/logo.png';
                  }
                }}
              />
            </div>
            <p className="footer-desc" style={{ opacity: 0.78, lineHeight: 1.55, fontSize: '0.9rem', margin: '0 0 0.75rem' }}>
              {description}
            </p>
            <p className="footer-delivery-note" style={{ fontSize: '0.78rem', color: '#6EE7B7', fontWeight: 600, margin: 0 }}>
              {locale === 'en'
                ? 'AM Deliveries · Bogota & Sabana · Cash on delivery or B2B credit'
                : 'Despachos AM · Bogotá, Chía, Cajicá, Cota y Sabana · Contraentrega o crédito B2B'}
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="footer-heading" style={{ 
              fontFamily: 'var(--font-outfit), sans-serif',
              fontSize: '1.1rem', 
              fontWeight: '800', 
              marginBottom: '1.2rem', 
              color: 'white',
              letterSpacing: '0.15em',
              textTransform: 'uppercase'
            }}>{t.quickLinks}</h4>
            <ul className="footer-links-list" style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <li><Link href={locale === 'en' ? '/?lang=en' : '/'} className="footer-link">{t.navHome}</Link></li>
              <li><Link href={locale === 'en' ? '/?lang=en#catalog' : '/#catalog'} className="footer-link">{t.navCatalog}</Link></li>
              <li><Link href={locale === 'en' ? '/b2b/register?lang=en' : '/b2b/register'} className="footer-link">{t.navInstitutional}</Link></li>
              <li>
                <Link href={locale === 'en' ? '/pqrs?lang=en' : '/pqrs'} className="footer-link" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#34D399', fontWeight: '700' }}>
                  <ShieldCheck size={15} strokeWidth={2.2} /> {locale === 'en' ? 'Warranty & Claims (PQRS)' : 'Garantía & PQRS'}
                </Link>
              </li>
              <li><Link href="/privacidad" className="footer-link">{locale === 'en' ? 'Privacy Policy' : 'Política de Privacidad'}</Link></li>
              <li><Link href="/terminos" className="footer-link">{locale === 'en' ? 'Terms & Conditions' : 'Términos y Condiciones'}</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="footer-heading" style={{ 
              fontFamily: 'var(--font-outfit), sans-serif',
              fontSize: '1.1rem', 
              fontWeight: '800', 
              marginBottom: '1.2rem', 
              color: 'white',
              letterSpacing: '0.15em',
              textTransform: 'uppercase'
            }}>{t.contact}</h4>
            <ul className="footer-contact-list" style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <li style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', color: '#94a3b8', fontSize: '0.95rem', minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                <MapPin size={18} strokeWidth={1.5} color="var(--primary)" style={{ flexShrink: 0, marginTop: '3px' }} /> <span>{address}</span>
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#94a3b8', fontSize: '0.95rem', minWidth: 0 }}>
                <Phone size={18} strokeWidth={1.5} color="var(--primary)" style={{ flexShrink: 0 }} /> <span>{phone}</span>
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#94a3b8', fontSize: '0.95rem', minWidth: 0 }}>
                <Mail size={18} strokeWidth={1.5} color="var(--primary)" style={{ flexShrink: 0 }} />
                <a href={`mailto:${ordersEmail}`} style={{ color: '#94a3b8', textDecoration: 'none', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{ordersEmail}</a>
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#94a3b8', fontSize: '0.95rem', minWidth: 0 }}>
                <Mail size={18} strokeWidth={1.5} color="var(--primary)" style={{ flexShrink: 0 }} />
                <a href={`mailto:${contactEmail}`} style={{ color: '#94a3b8', textDecoration: 'none', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{contactEmail}</a>
              </li>
              <li style={{ marginTop: '0.25rem' }}>
                <a 
                  href="https://wa.me/573167022898?text=Hola%20FruFresco%20Calidad,%20necesito%20asistencia%20sobre%20mi%20pedido%20entregado.%20Mi%20n%C3%BAmero%20de%20remisi%C3%B3n/pedido%20es:%20"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: '#34D399',
                    fontWeight: '700',
                    textDecoration: 'none',
                    backgroundColor: 'rgba(52, 211, 153, 0.1)',
                    border: '1px solid rgba(52, 211, 153, 0.25)',
                    padding: '10px 14px',
                    minHeight: '44px',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <MessageCircle size={16} strokeWidth={2.2} style={{ flexShrink: 0 }} /> {locale === 'en' ? 'Customer Care & Quality (WhatsApp)' : 'SAC & Calidad (WhatsApp)'}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom-bar" style={{ 
          borderTop: '1px solid rgba(255, 255, 255, 0.05)', 
          paddingTop: '2rem', 
          display: 'flex', 
          flexDirection: 'row', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          flexWrap: 'wrap', 
          gap: '1.25rem',
          fontSize: '0.85rem'
        }}>
          <span style={{ color: '#94a3b8', opacity: 0.7 }}>
            © {new Date().getFullYear()} {appName}. {t.allRightsReserved}.
          </span>
          <div className="delta-badge" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: 'rgba(18, 18, 20, 0.85)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '4px 11px',
            borderRadius: '9999px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
            backdropFilter: 'blur(8px)',
            transition: 'border-color 0.25s ease',
            cursor: 'default'
          }}>
            <span style={{ fontSize: '9px', color: '#94a3b8', letterSpacing: '0.04em' }}>
              Powered by
            </span>
            <img 
              src="/assets/images/delta_symbol_white.png" 
              alt="Delta CoreTech Icon" 
              style={{
                width: '14px',
                height: '14px',
                objectFit: 'contain',
                opacity: 0.9,
                transition: 'transform 0.2s ease'
              }}
              className="delta-icon" 
            />
            <span style={{ fontSize: '10.5px', fontWeight: '700', color: '#E2E8F0', letterSpacing: '0.04em', textTransform: 'uppercase', fontFamily: 'var(--font-outfit), sans-serif' }}>
              Delta <span style={{ color: '#FBD007' }}>CoreTech</span>
            </span>
          </div>
        </div>
      </div>
      <style jsx>{`
        .footer-link {
          color: #94a3b8;
          text-decoration: none;
          font-size: 0.95rem;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          display: inline-block;
        }
        .footer-link:hover {
          transform: translateX(4px);
          color: #a7f3d0 !important;
        }
        .delta-badge:hover {
          border-color: rgba(251, 208, 7, 0.5) !important;
        }
        .delta-badge:hover .delta-icon {
          transform: scale(1.1);
        }
        @media (max-width: 768px) {
          .site-footer-root {
            padding: 1.5rem 0 1.15rem !important;
          }
          .footer-grid {
            grid-template-columns: 1fr !important;
            gap: 1.15rem !important;
            margin-bottom: 1.1rem !important;
          }
          .footer-logo-wrap {
            padding: 4px 10px !important;
            margin-bottom: 0.65rem !important;
          }
          .footer-brand-logo {
            height: 32px !important;
          }
          .footer-desc {
            font-size: 0.82rem !important;
            line-height: 1.45 !important;
            margin-bottom: 0.45rem !important;
          }
          .footer-delivery-note {
            font-size: 0.74rem !important;
          }
          .footer-heading {
            font-size: 0.82rem !important;
            margin-bottom: 0.55rem !important;
            letter-spacing: 0.1em !important;
          }
          .footer-links-list {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 0.45rem 0.75rem !important;
          }
          .footer-link {
            font-size: 0.84rem !important;
          }
          .footer-contact-list {
            gap: 0.5rem !important;
          }
          .footer-contact-list li {
            font-size: 0.83rem !important;
          }
          .footer-bottom-bar {
            padding-top: 1rem !important;
            gap: 0.65rem !important;
            justify-content: center !important;
            text-align: center;
          }
        }
      `}</style>
    </footer>
  );
}
