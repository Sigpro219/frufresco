'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import Link from 'next/link';
import OrderTracking from './OrderTracking';

export default function Footer() {
  const [appSettings, setAppSettings] = useState<{key: string, value: string}[] | null>(null);

  useEffect(() => {
    async function fetchSettings() {
      const { data } = await supabase
        .from('app_settings')
        .select('key, value');
      setAppSettings(data);
    }
    fetchSettings();
  }, []);

  const getSetting = (key: string, defaultValue: string) => {
      const s = appSettings?.find(x => x.key === key);
      return s ? s.value : defaultValue;
  };

  const phone = getSetting('contact_phone', '+57 300 123 4567');
  const email = getSetting('contact_email', 'contacto@logisticspro.com');
  const address = getSetting('contact_address', 'Corabastos Bodega 123, Bogotá');
  const description = getSetting('footer_description', 'Llevando la frescura del campo a tu negocio con calidad garantizada y precios justos.');

  return (
    <footer style={{ backgroundColor: '#111827', color: '#F9FAFB', padding: '1.5rem 0 1rem' }}>
      <div className="container">
        {/* Compact Tracking in Footer */}
        {/* Compact Tracking in Footer */}
        <div style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', marginBottom: '1.5rem', paddingBottom: '1rem' }}>
             <OrderTracking />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '3rem', marginBottom: '3rem' }}>
          
          {/* Brand */}
          <div>
            <h3 style={{ fontSize: '1.5rem', fontWeight: '800', marginBottom: '1rem', color: 'white' }}>Logistics Pro</h3>
            <p style={{ opacity: 0.8, lineHeight: 1.6 }}>
              {description}
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '1rem', color: 'white' }}>Enlaces Rápidos</h4>
            <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <li><Link href="/" style={{ color: '#D1D5DB', textDecoration: 'none' }}>Inicio</Link></li>
              <li><Link href="/catalog" style={{ color: '#D1D5DB', textDecoration: 'none' }}>Catálogo</Link></li>
              <li><Link href="/b2b/register" style={{ color: '#D1D5DB', textDecoration: 'none' }}>Institucional</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '1rem', color: 'white' }}>Contacto</h4>
            <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.8rem', opacity: 0.9 }}>
              <li style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span>📍</span> {address}
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span>📞</span> {phone}
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span>✉️</span> {email}
              </li>
            </ul>
          </div>
        </div>

        <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '2rem', textAlign: 'center', fontSize: '0.9rem', opacity: 0.5 }}>
          © {new Date().getFullYear()} Logistics Pro. Todos los derechos reservados.
        </div>
      </div>
    </footer>
  );
}
