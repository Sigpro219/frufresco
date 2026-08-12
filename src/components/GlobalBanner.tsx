'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSearchParams, usePathname } from 'next/navigation';
import { translations, Locale } from '../lib/translations';

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
  }, [isCheckout, isB2B]);

  // MODE B2B INSTITUCIONAL (HEADER FIJO SUPERIOR CON MENSAJES OPERATIVOS)
  if (isB2B) {
    const b2bMessages = [
      {
        icon: (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FEF08A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
        ),
        text: (
          <>
            <b>Reporte de Novedades:</b> Ante cualquier diferencia de especificación o cantidad, <b>regístrela físicamente en la remisión</b> y notifique de inmediato a Servicio al Cliente B2B.
          </>
        )
      },
      {
        icon: (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6EE7B7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="3" width="15" height="13" rx="2" />
            <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
            <circle cx="5.5" cy="18.5" r="2.5" />
            <circle cx="18.5" cy="18.5" r="2.5" />
          </svg>
        ),
        text: (
          <>
            <b>Atención al Transportista:</b> Si se presenta algún inconveniente con el conductor durante la recepción, <b>contacte inmediatamente a nuestra línea de atención prioritaria</b>.
          </>
        )
      },
      {
        icon: (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FDE047" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        ),
        text: (
          <>
            <b>Horario de Corte B2B:</b> Transmita sus pedidos antes de las <b>5:00 p.m.</b> para garantizar su despacho en el siguiente ciclo logístico.
          </>
        )
      }
    ];

    const currentMsg = b2bMessages[messageIndex % b2bMessages.length];

    return (
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 1100,
        background: 'linear-gradient(90deg, #044E38 0%, #065F46 45%, #044E38 100%)',
        color: '#FFFFFF',
        textAlign: 'center',
        padding: '0.6rem 1.25rem',
        fontSize: '0.83rem',
        fontWeight: '600',
        letterSpacing: '0.01em',
        boxShadow: '0 4px 15px rgba(4, 78, 56, 0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        flexWrap: 'wrap',
        fontFamily: 'var(--font-outfit), var(--font-inter), sans-serif',
        borderBottom: '1.5px solid #10B981'
      }}>
        {/* Badge Institucional B2B */}
        <span style={{ 
          display: 'inline-flex', 
          alignItems: 'center', 
          gap: '6px', 
          backgroundColor: 'rgba(16, 185, 129, 0.25)',
          border: '1px solid rgba(52, 211, 153, 0.4)',
          padding: '3px 10px', 
          borderRadius: '20px', 
          color: '#FEF08A', 
          fontWeight: '900', 
          fontSize: '0.73rem',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          boxShadow: '0 0 10px rgba(16, 185, 129, 0.2)'
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
            <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
            <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
            <path d="M10 6h4" />
            <path d="M10 10h4" />
            <path d="M10 14h4" />
            <path d="M10 18h4" />
          </svg>
          Portal Institucional
        </span>

        {/* Mensaje Rotativo Animado */}
        <div style={{ 
          display: 'inline-flex', 
          alignItems: 'center', 
          gap: '8px',
          opacity: fadeState ? 1 : 0,
          transform: fadeState ? 'translateY(0)' : 'translateY(-2px)',
          transition: 'all 0.3s ease-in-out',
          color: '#F8FAFC'
        }}>
          {currentMsg.icon}
          <span>{currentMsg.text}</span>
        </div>

        {/* Botón de Contacto Preferencial B2B */}
        <a 
          href="https://wa.me/573001234567?text=Hola%20FruFresco%20B2B,%20requiero%20asistencia%20institucional" 
          target="_blank" 
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            backgroundColor: 'rgba(255, 255, 255, 0.15)',
            color: '#FFFFFF',
            textDecoration: 'none',
            fontSize: '0.74rem',
            fontWeight: '800',
            padding: '3px 10px',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            transition: 'all 0.2s ease',
            marginLeft: '6px'
          }}
        >
          📱 Soporte B2B
        </a>
      </div>
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
