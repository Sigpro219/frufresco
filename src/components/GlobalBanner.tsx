'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function GlobalBanner() {
  const [bannerText, setBannerText] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchBanner() {
      try {
        // Query the app_settings table
        const { data, error } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'global_banner')
          .maybeSingle(); // Use maybeSingle to avoid error if 0 rows
        
        if (!isMounted) return;

        if (error) {
            // Only log if it's not a known "no rows" error (though maybeSingle handles that)
            // and not an abort error
            console.warn('GlobalBanner: Error fetching banner config', error.message);
            return;
        }

        if (data?.value) {
          let text = data.value;
          
          // Environment-based branding override
          const isLocal = typeof window !== 'undefined' && 
                          (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
          
          if (isLocal) {
            // In CORE (Localhost), we always maintain origin branding
            text = text.replace(/Logistic\s*Pro/gi, 'FruFresco');
          }
          
          setBannerText(text);
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
