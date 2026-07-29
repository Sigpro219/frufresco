'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSearchParams, usePathname } from 'next/navigation';
import { translations, Locale } from '../lib/translations';
import { Truck, Clock, Calendar } from 'lucide-react';

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
          gap: '5px', 
          backgroundColor: 'rgba(255, 255, 255, 0.18)', 
          padding: '3px 10px', 
          borderRadius: '20px', 
          color: '#FEF08A', 
          fontWeight: '900', 
          fontSize: '0.75rem',
          letterSpacing: '0.05em'
        }}>
          <Truck size={13} strokeWidth={2.5} /> ENTREGAS HOGAR
        </span>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <Clock size={14} strokeWidth={2} style={{ color: '#A7F3D0' }} />
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
