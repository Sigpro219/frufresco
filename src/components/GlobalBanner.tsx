'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSearchParams, usePathname } from 'next/navigation';
import { translations, Locale } from '../lib/translations';

export default function GlobalBanner() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const locale = (searchParams.get('lang') === 'en' ? 'en' : 'es') as Locale;
  const t = translations[locale];
  const [bannerText, setBannerText] = useState<string | null>(null);
  const [customDeliveryDate, setCustomDeliveryDate] = useState<string | null>(null);

  const isCheckout = pathname === '/checkout';

  useEffect(() => {
    let isMounted = true;
    async function fetchBanner() {
      try {
        const { data, error } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', locale === 'en' ? 'global_banner_en' : 'global_banner')
          .maybeSingle(); 
        
        if (!isMounted) return;

        if (error) {
            console.warn('GlobalBanner: Error fetching banner config', error.message);
            setBannerText(t.bannerText);
            return;
        }

        if (data?.value) {
          let text = data.value;
          text = text.replace(/Logistic\s*Pro/gi, 'FruFresco');
          setBannerText(text);
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
    if (!isCheckout) return;
    const checkDate = () => {
      const stored = localStorage.getItem('checkout_selected_delivery_date');
      setCustomDeliveryDate(stored || null);
    };
    checkDate();
    window.addEventListener('storage', checkDate);
    return () => window.removeEventListener('storage', checkDate);
  }, [isCheckout]);

  if (isCheckout) {
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
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#A7F3D0' }}>
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span>
            {customDeliveryDate ? (
              <>Tu pedido llegará el <b>{customDeliveryDate}</b> de <b>8:00 a.m. a 5:00 p.m.</b></>
            ) : (
              <>Tu pedido llegará <b>mañana de 8:00 a.m. a 5:00 p.m.</b> <span style={{ opacity: 0.85, fontWeight: '500' }}>(a menos que elijas una fecha diferente)</span></>
            )}
          </span>
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
