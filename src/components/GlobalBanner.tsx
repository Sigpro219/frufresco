'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSearchParams } from 'next/navigation';

export default function GlobalBanner() {
  const searchParams = useSearchParams();
  const locale = searchParams.get('lang') === 'en' ? 'en' : 'es';
  const [bannerText, setBannerText] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchBanner() {
      try {
        // Query the app_settings table
        const { data, error } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', locale === 'en' ? 'global_banner_en' : 'global_banner')
          .maybeSingle(); 
        
        if (!isMounted) return;

        if (error) {
            // Only log if it's not a known "no rows" error (though maybeSingle handles that)
            // and not an abort error
            console.warn('GlobalBanner: Error fetching banner config', error.message);
            return;
        }

        if (data?.value) {
          let text = data.value;
          text = text.replace(/Logistic\s*Pro/gi, 'FruFresco');
          setBannerText(text);
        } else if (locale === 'en') {
          // Fallback to Spanish banner if English one is not defined yet
          const { data: esData } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'global_banner')
            .maybeSingle();
          if (esData?.value) setBannerText(esData.value.replace(/Logistic\s*Pro/gi, 'FruFresco'));
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        // console.error('GlobalBanner exception:', err); 
      }
    }
    fetchBanner();
    return () => { isMounted = false; };
  }, []);

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
