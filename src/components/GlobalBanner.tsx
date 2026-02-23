'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { logError } from '../lib/errorUtils';

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
          setBannerText(data.value);
        }
      } catch (err: any) {
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
      backgroundColor: '#111827',
      color: 'white',
      textAlign: 'center',
      padding: '0.75rem',
      fontSize: '0.9rem',
      fontWeight: '600',
      letterSpacing: '0.05em'
    }}>
      {bannerText}
    </div>
  );
}
