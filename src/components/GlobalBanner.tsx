'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSearchParams, usePathname } from 'next/navigation';
import { translations, Locale } from '../lib/translations';

import { ClipboardList, Truck, Clock, Headphones, Building2, PhoneCall, Sparkles, CalendarClock, BookmarkCheck } from 'lucide-react';
import { parseStoreVacationConfig, StoreVacationConfig, calculateStandardMinDeliveryDate, addDaysISO } from '../lib/colombianHolidays';

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
  const [cutoffHourPublic, setCutoffHourPublic] = useState(17);
  const [storeStatus, setStoreStatus] = useState<'open' | 'vacation_preorder' | 'closed'>('open');
  const [vacationConfig, setVacationConfig] = useState<StoreVacationConfig | null>(null);
  const [allowSundays, setAllowSundays] = useState(false);
  const [allowHolidays, setAllowHolidays] = useState(false);

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
          .in('key', [
            locale === 'en' ? 'global_banner_en' : 'global_banner',
            'enable_cutoff_rules',
            'cutoff_hour_public',
            'store_status',
            'store_vacation_config',
            'allow_sunday_deliveries',
            'allow_holiday_deliveries'
          ]); 
        
        if (!isMounted) return;

        if (data) {
          data.forEach(s => {
            if (s.key === 'enable_cutoff_rules') {
              setCutoffEnabled(s.value === 'true');
            }
            if (s.key === 'cutoff_hour_public') {
              const parsed = parseInt(s.value, 10);
              if (!isNaN(parsed) && parsed > 0) setCutoffHourPublic(parsed);
            }
            if (s.key === 'store_status') {
              if (s.value === 'closed' || s.value === 'vacation_preorder' || s.value === 'open') {
                setStoreStatus(s.value);
              }
            }
            if (s.key === 'store_vacation_config') {
              setVacationConfig(parseStoreVacationConfig(s.value));
            }
            if (s.key === 'allow_sunday_deliveries') {
              setAllowSundays(s.value === 'true');
            }
            if (s.key === 'allow_holiday_deliveries') {
              setAllowHolidays(s.value === 'true');
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

  // OVERRIDE 1: TIENDA CERRADA TEMPORALMENTE (MODO VITRINA / CARRITO GUARDADO - CERO WHATSAPP)
  if (storeStatus === 'closed') {
    const returnDayFormatted = vacationConfig?.endDate
      ? formatSpanishDate(addDaysISO(vacationConfig.endDate, 1))
      : null;

    return (
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 1100,
        background: 'linear-gradient(90deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)',
        color: '#F8FAFC',
        padding: '0.65rem 1rem',
        fontSize: '0.82rem',
        fontWeight: 600,
        letterSpacing: '0.01em',
        boxShadow: '0 4px 15px rgba(15, 23, 42, 0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        flexWrap: 'wrap',
        fontFamily: 'var(--font-outfit), var(--font-inter), sans-serif',
        borderBottom: '1.5px solid #F59E0B'
      }}>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          backgroundColor: 'rgba(245, 158, 11, 0.2)',
          border: '1px solid rgba(245, 158, 11, 0.45)',
          padding: '3px 10px',
          borderRadius: '20px',
          color: '#FDE68A',
          fontWeight: 800,
          fontSize: '0.73rem',
          letterSpacing: '0.05em',
          textTransform: 'uppercase'
        }}>
          <Sparkles size={13} strokeWidth={2.2} />
          Planta en Preparación
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#E2E8F0' }}>
          <BookmarkCheck size={14} style={{ color: '#38BDF8', flexShrink: 0 }} />
          <span>
            {vacationConfig?.customMessage || 'Estamos renovando inventario fresco directo del campo.'}{' '}
            <b>Puedes explorar el catálogo y guardar tu carrito</b>
            {returnDayFormatted ? (
              <> — Reabrimos toma de pedidos el <b>{returnDayFormatted} ({vacationConfig?.reopenTime || '06:00 AM'})</b>.</>
            ) : (
              <> para nuestra próxima apertura ({vacationConfig?.reopenTime || '06:00 AM'}).</>
            )}
          </span>
        </span>
      </div>
    );
  }

  // OVERRIDE 2: MODO PREVENTA / RECESO OPERATIVO ACTIVO (SEMANA SANTA / VACACIONES - CERO WHATSAPP)
  if (storeStatus === 'vacation_preorder' || (vacationConfig?.enabled && vacationConfig.startDate && vacationConfig.endDate)) {
    const nextValidDate = calculateStandardMinDeliveryDate(
      cutoffEnabled,
      cutoffHourPublic,
      allowSundays,
      allowHolidays,
      vacationConfig
    );
    const formattedReturnDelivery = formatSpanishDate(nextValidDate);

    if (storeStatus === 'vacation_preorder') {
      return (
        <div style={{
          position: 'sticky',
          top: 0,
          zIndex: 1100,
          background: 'linear-gradient(90deg, #064E3B 0%, #047857 50%, #064E3B 100%)',
          color: '#FFFFFF',
          padding: '0.65rem 1rem',
          fontSize: '0.82rem',
          fontWeight: 600,
          letterSpacing: '0.01em',
          boxShadow: '0 4px 15px rgba(6, 78, 59, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          flexWrap: 'wrap',
          fontFamily: 'var(--font-outfit), var(--font-inter), sans-serif',
          borderBottom: '1.5px solid #34D399'
        }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: 'rgba(254, 240, 138, 0.2)',
            border: '1px solid rgba(254, 240, 138, 0.5)',
            padding: '3px 10px',
            borderRadius: '20px',
            color: '#FEF08A',
            fontWeight: 900,
            fontSize: '0.73rem',
            letterSpacing: '0.05em',
            textTransform: 'uppercase'
          }}>
            <CalendarClock size={13} strokeWidth={2.2} />
            Preventa Activa · {vacationConfig?.reasonTitle || 'Receso Operativo'}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#ECFDF5' }}>
            <Truck size={14} style={{ color: '#A7F3D0', flexShrink: 0 }} />
            <span>
              {vacationConfig?.customMessage ? (
                <>{vacationConfig.customMessage} — Próxima ruta garantizada: <b>{formattedReturnDelivery}</b>.</>
              ) : (
                <>Tienda abierta 24/7 en preventa: Agenda tu pedido hoy y recíbelo con <b>Prioridad #1 de Abastecimiento</b> el <b>{formattedReturnDelivery}</b>.</>
              )}
            </span>
          </span>
        </div>
      );
    }
  }

  // MODE B2B INSTITUCIONAL (HEADER FIJO SUPERIOR CON MARQUEE CONTINUO)
  if (isB2B) {
    const isEn = locale === 'en';
    const messages = isEn ? [
      {
        tag: 'QUALITY & CLAIMS REPORT',
        color: '#FEF08A',
        icon: <ClipboardList size={15} strokeWidth={2.2} style={{ color: '#FEF08A' }} />,
        text: 'In case of any discrepancy in product quality or quantity, please record it physically on the delivery receipt and notify B2B Customer Service immediately.'
      },
      {
        tag: 'CARRIER ASSISTANCE',
        color: '#6EE7B7',
        icon: <Truck size={15} strokeWidth={2.2} style={{ color: '#6EE7B7' }} />,
        text: 'If you experience any issue with the driver during reception, please contact our priority support line directly.'
      },
      {
        tag: 'B2B CUTOFF SCHEDULE',
        color: '#FDE047',
        icon: <Clock size={15} strokeWidth={2.2} style={{ color: '#FDE047' }} />,
        text: 'Submit your orders before 5:00 p.m. to guarantee scheduling on the next day’s logistics route.'
      },
      {
        tag: 'DIRECT SUPPORT CHANNEL',
        color: '#93C5FD',
        icon: <Headphones size={15} strokeWidth={2.2} style={{ color: '#93C5FD' }} />,
        text: 'Preferential support line and PBX available Monday through Saturday for institutional clients.'
      }
    ] : [
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
          @media (max-width: 640px) {
            .b2b-banner-badge-text {
              display: none;
            }
          }
        `}} />

        <div style={{
          position: 'sticky',
          top: 0,
          zIndex: 1100,
          background: 'linear-gradient(90deg, #044E38 0%, #065F46 45%, #044E38 100%)',
          color: '#FFFFFF',
          padding: '0.55rem 0.75rem',
          fontSize: '0.82rem',
          fontWeight: '600',
          letterSpacing: '0.01em',
          boxShadow: '0 4px 15px rgba(4, 78, 56, 0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.65rem',
          fontFamily: 'var(--font-outfit), var(--font-inter), sans-serif',
          borderBottom: '1.5px solid #10B981',
          overflow: 'hidden',
          maxWidth: '100vw'
        }}>
          {/* Left Static Badge */}
          <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, zIndex: 2 }}>
            <span style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '6px', 
              backgroundColor: 'rgba(16, 185, 129, 0.25)',
              border: '1px solid rgba(52, 211, 153, 0.45)',
              padding: '4px 10px', 
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
              <span className="b2b-banner-badge-text">{isEn ? 'Institutional Portal' : 'Portal Institucional'}</span>
            </span>
          </div>

          {/* Center Continuous Infinite Marquee Track */}
          <div className="b2b-marquee-container" style={{ flex: 1, minWidth: 0, overflow: 'hidden', position: 'relative', cursor: 'pointer' }}>
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
              <Headphones size={14} strokeWidth={2.2} /> {isEn ? 'B2B Support' : 'Soporte B2B'}
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
    const isAfterCutoff = cutoffEnabled && currentHour >= cutoffHourPublic;

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
          <Truck size={14} strokeWidth={2.5} />
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
              <Clock size={14} strokeWidth={2} style={{ color: '#A7F3D0' }} />
              <span>
                {customDeliveryDate ? (
                  <>Tu pedido llegará el <b>{formatSpanishDate(customDeliveryDate)}</b> de <b>8:00 a.m. a 5:00 p.m.</b></>
                ) : cutoffEnabled && !isAfterCutoff ? (
                  <>¡Pide antes de las <b>5:00 p.m.</b> y recibe <b>MAÑANA ({formattedDefaultDate})</b> de <b>8:00 a.m. a 5:00 p.m.</b>!</>
                ) : cutoffEnabled && isAfterCutoff ? (
                  <>Corte de las 5:00 p.m. cerrado: Tu pedido llegará <b>PASADO MAÑANA ({formattedDefaultDate})</b> de <b>8:00 a.m. a 5:00 p.m.</b></>
                ) : (
                  <>Tu pedido llegará <b>MAÑANA ({formattedDefaultDate})</b> de <b>8:00 a.m. a 5:00 p.m.</b></>
                )}
              </span>
            </>
          ) : (
            <>
              <PhoneCall size={14} strokeWidth={2} style={{ color: '#FEF08A' }} />
              <span>
                Nos pondremos en contacto contigo <b>1 hora antes</b> de la entrega de tu pedido.
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
