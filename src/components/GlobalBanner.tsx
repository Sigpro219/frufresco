'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSearchParams, usePathname } from 'next/navigation';
import { translations, Locale } from '../lib/translations';

import { ClipboardList, Truck, Clock, Headphones, Building2, PhoneCall } from 'lucide-react';

function formatSpanishDate(dateVal: string | Date): string {
    let d: Date;
    if (typeof dateVal === 'string') {
        const parts = dateVal.split('-');
        if (parts.length === 3) {
            d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        } else {
            d = new Date(dateVal);
        }
    } else {
        d = dateVal;
    }
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `${days[d.getDay()]} ${d.getDate()} de ${months[d.getMonth()]}`;
}

export default function GlobalBanner() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const locale = (searchParams.get('lang') === 'en' ? 'en' : 'es') as Locale;
  const t = translations[locale];
  const [bannerText, setBannerText] = useState<string | null>(null);
  const [customDeliveryDate, setCustomDeliveryDate] = useState<string | null>(null);
  const [cutoffEnabled, setCutoffEnabled] = useState(false);

  const [messageIndex, setMessageIndex] = useState(0);
  const [fadeState, setFadeState] = useState(true);

  const isCheckout = pathname === '/checkout';
  const isB2B = pathname?.startsWith('/b2b');

  useEffect(() => {
    let isMounted = true;
    async function fetchBanner() {
      try {
        const { data } = await supabase
          .from('app_settings')
          .select('key, value')
          .in('key', [locale === 'en' ? 'global_banner_en' : 'global_banner', 'enable_cutoff_rules']); 
        
        if (!isMounted) return;

        if (data) {
          data.forEach(s => {
            if (s.key === 'enable_cutoff_rules') {
              setCutoffEnabled(s.value === 'true');
            }
            if (s.key === (locale === 'en' ? 'global_banner_en' : 'global_banner')) {
              let text = s.value;
              if (text) text = text.replace(/Logistic\s*Pro/gi, 'FruFresco');
              setBannerText(text || t.bannerText);
            }
          });
        } else {
          setBannerText(t.bannerText);
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        setBannerText(t.bannerText);
      }
    }
    fetchBanner();
    return () => { isMounted = false; };
  }, [locale]);

  useEffect(() => {
    if (!isCheckout && !isB2B) return;
    if (isCheckout) {
      const checkDate = () => {
        const stored = localStorage.getItem('checkout_selected_delivery_date');
        setCustomDeliveryDate(stored || null);
      };
      checkDate();
      window.addEventListener('storage', checkDate);
    }

    const interval = setInterval(() => {
      setFadeState(false);
      setTimeout(() => {
        setMessageIndex(prev => (prev + 1) % (isB2B ? 3 : 2));
        setFadeState(true);
      }, 300);
    }, 6000);

    return () => {
      if (isCheckout) window.removeEventListener('storage', () => {});
      clearInterval(interval);
    };
  }, [pathname]);

  // MODE B2B INSTITUCIONAL (HEADER FIJO SUPERIOR CON MARQUEE CONTINUO)
  if (isB2B) {
    const messages = [
      {
        tag: 'REPORTE DE NOVEDADES',
        color: '#FEF08A',
        icon: <ClipboardList size={15} strokeWidth={2.2} style={{ color: '#FEF08A' }} />,
        text: 'Ante cualquier diferencia en características o cantidad de producto, por favor regístrela físicamente en la remisión de entrega y notifique inmediatamente a Servicio al Cliente B2B.'
      },
      {
        tag: 'ATENCIÓN AL TRANSPORTISTA',
        color: '#6EE7B7',
        icon: <Truck size={15} strokeWidth={2.2} style={{ color: '#6EE7B7' }} />,
        text: 'Si se presenta algún inconveniente con el conductor durante la recepción, contacte directamente a nuestra línea de atención prioritaria.'
      },
      {
        tag: 'HORARIO DE CORTE B2B',
        color: '#FDE047',
        icon: <Clock size={15} strokeWidth={2.2} style={{ color: '#FDE047' }} />,
        text: 'Transmita sus pedidos antes de las 5:00 p.m. para garantizar su programación en la ruta logística del día siguiente.'
      },
      {
        tag: 'CANAL DE ATENCIÓN DIRECTA',
        color: '#93C5FD',
        icon: <Headphones size={15} strokeWidth={2.2} style={{ color: '#93C5FD' }} />,
        text: 'Línea de soporte y PBX preferencial disponible de lunes a sábado para clientes institucionales.'
      }
    ];

    const marqueeList = [...messages, ...messages];

    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes b2bMarqueeScroll {
            0% { transform: translateX(0%); }
            100% { transform: translateX(-50%); }
          }
          .b2b-marquee-track {
            display: inline-flex;
            align-items: center;
            white-space: nowrap;
            animation: b2bMarqueeScroll 65s linear infinite;
          }
          .b2b-marquee-container:hover .b2b-marquee-track {
            animation-play-state: paused;
          }
        `}} />

        <div style={{
          position: 'sticky',
          top: 0,
          zIndex: 1100,
          background: 'linear-gradient(90deg, #044E38 0%, #065F46 45%, #044E38 100%)',
          color: '#FFFFFF',
          padding: '0.55rem 1rem',
          fontSize: '0.82rem',
          fontWeight: '600',
          letterSpacing: '0.01em',
          boxShadow: '0 4px 15px rgba(4, 78, 56, 0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          fontFamily: 'var(--font-outfit), var(--font-inter), sans-serif',
          borderBottom: '1.5px solid #10B981',
          overflow: 'hidden'
        }}>
          {/* Left Static Badge */}
          <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, zIndex: 2 }}>
            <span style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '6px', 
              backgroundColor: 'rgba(16, 185, 129, 0.25)',
              border: '1px solid rgba(52, 211, 153, 0.45)',
              padding: '4px 12px', 
              borderRadius: '20px', 
              color: '#FEF08A', 
              fontWeight: '900', 
              fontSize: '0.73rem',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              boxShadow: '0 0 12px rgba(16, 185, 129, 0.25)',
              backdropFilter: 'blur(4px)'
            }}>
              <Building2 size={13} strokeWidth={2.2} />
              Portal Institucional
            </span>
          </div>

          {/* Center Continuous Infinite Marquee Track */}
          <div className="b2b-marquee-container" style={{ flex: 1, overflow: 'hidden', position: 'relative', cursor: 'pointer' }}>
            <div className="b2b-marquee-track">
              {marqueeList.map((item, idx) => (
                <div key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', paddingRight: '3.5rem' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center' }}>{item.icon}</span>
                  <span style={{ color: item.color, fontWeight: '800', fontSize: '0.78rem', letterSpacing: '0.03em' }}>
                    [{item.tag}]
                  </span>
                  <span style={{ color: '#F8FAFC', fontWeight: '500' }}>
                    {item.text}
                  </span>
                  <span style={{ color: '#10B981', opacity: 0.6, fontSize: '0.8rem', paddingLeft: '1.75rem' }}>◆</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right Static Action Chip */}
          <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, zIndex: 2 }}>
            <a 
              href="https://wa.me/573015421761?text=Hola%20Servicio%20al%20Cliente%20FruFresco%20B2B,%20requiero%20asistencia%20institucional" 
              target="_blank" 
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: 'rgba(255, 255, 255, 0.16)',
                color: '#FFFFFF',
                textDecoration: 'none',
                fontSize: '0.75rem',
                fontWeight: '800',
                padding: '4px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                backdropFilter: 'blur(4px)',
                whiteSpace: 'nowrap'
              }}
            >
              <Headphones size={14} strokeWidth={2.2} /> Soporte B2B
            </a>
          </div>
        </div>
      </>
    );
  }

  if (isCheckout) {
    // Calculate Bogota hour (UTC-5)
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const bogotaNow = new Date(utc + (3600000 * -5));
    const currentHour = bogotaNow.getHours();
    const isAfterCutoff = cutoffEnabled && currentHour >= 17;

    const daysToAdd = isAfterCutoff ? 2 : 1;
    const defaultTargetDate = new Date(bogotaNow);
    defaultTargetDate.setDate(defaultTargetDate.getDate() + daysToAdd);
    const formattedDefaultDate = formatSpanishDate(defaultTargetDate);

    return (
      <div style={{
        background: 'linear-gradient(90deg, #044E38 0%, #0D7A57 50%, #056848 100%)',
        color: '#FFFFFF',
        textAlign: 'center',
        padding: '0.65rem 1rem',
        fontSize: '0.85rem',
        fontWeight: '700',
        letterSpacing: '0.02em',
        boxShadow: '0 2px 10px rgba(13, 122, 87, 0.25)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        flexWrap: 'wrap',
        fontFamily: 'var(--font-outfit), var(--font-inter), sans-serif',
        borderBottom: '1px solid rgba(255, 255, 255, 0.15)'
      }}>
        <span style={{ 
          display: 'inline-flex', 
          alignItems: 'center', 
          gap: '6px', 
          backgroundColor: 'rgba(255, 255, 255, 0.18)', 
          padding: '3px 10px', 
          borderRadius: '20px', 
          color: '#FEF08A', 
          fontWeight: '900', 
          fontSize: '0.75rem',
          letterSpacing: '0.05em'
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
            <path d="M15 18H9" />
            <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14v10" />
            <circle cx="17" cy="18" r="2" />
            <circle cx="7" cy="18" r="2" />
          </svg>
          ENTREGAS HOGAR
        </span>
        <div style={{ 
          display: 'inline-flex', 
          alignItems: 'center', 
          gap: '6px',
          opacity: fadeState ? 1 : 0,
          transform: fadeState ? 'translateY(0)' : 'translateY(-3px)',
          transition: 'all 0.3s ease-in-out'
        }}>
          {messageIndex === 0 ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#A7F3D0' }}>
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>
                {customDeliveryDate ? (
                  <>Tu pedido llegará el <b>{formatSpanishDate(customDeliveryDate)}</b> de <b>8:00 a.m. a 5:00 p.m.</b></>
                ) : cutoffEnabled && !isAfterCutoff ? (
                  <>⚡ ¡Pide antes de las <b>5:00 p.m.</b> y recibe <b>MAÑANA ({formattedDefaultDate})</b> de <b>8:00 a.m. a 5:00 p.m.</b>!</>
                ) : cutoffEnabled && isAfterCutoff ? (
                  <>🕒 Corte de las 5:00 p.m. cerrado: Tu pedido llegará <b>PASADO MAÑANA ({formattedDefaultDate})</b> de <b>8:00 a.m. a 5:00 p.m.</b></>
                ) : (
                  <>🚚 Tu pedido llegará <b>MAÑANA ({formattedDefaultDate})</b> de <b>8:00 a.m. a 5:00 p.m.</b></>
                )}
              </span>
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#FEF08A' }}>
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              <span>
                📱 Nos pondremos en contacto contigo <b>1 hora antes</b> de la entrega de tu pedido.
              </span>
            </>
          )}
        </div>
      </div>
    );
  }

  if (!bannerText) return null;

  return (
    <div style={{
      backgroundColor: '#0a1a0f',
      color: 'rgba(255, 255, 255, 0.95)',
      textAlign: 'center',
      padding: '0.7rem',
      fontSize: '0.85rem',
      fontWeight: '600',
      letterSpacing: '0.04em',
      borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
      fontFamily: 'var(--font-inter), sans-serif'
    }}>
      {bannerText}
    </div>
  );
}
