'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import Link from 'next/link';
import { config } from '@/lib/config';
import OrderTracking from './OrderTracking';
import { MapPin, Phone, Mail } from 'lucide-react';

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
  const email = getSetting('contact_email', `contacto@${config.brand.name.toLowerCase().replace(/\s/g, '')}.com`);
  const address = getSetting('contact_address', 'Corabastos Bodega 123, Bogotá');
  const description = getSetting('footer_description', config.brand.footerDescription);

  return (
    <footer style={{ 
      backgroundColor: '#0a1a0f', 
      color: '#F9FAFB', 
      padding: '1.5rem 0 1rem',
      borderTop: '1px solid rgba(255,255,255,0.05)'
    }}>
      <div className="container">
        {/* Compact Tracking in Footer */}
        {/* Compact Tracking in Footer */}
        <div style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)', marginBottom: '1.5rem', paddingBottom: '1rem' }}>
             <OrderTracking />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '3rem', marginBottom: '3rem' }}>
          
          {/* Brand */}
          <div>
            <h3 style={{ 
              fontFamily: 'var(--font-outfit), sans-serif',
              fontSize: '1.8rem', 
              fontWeight: '900', 
              marginBottom: '1rem', 
              color: 'white',
              letterSpacing: '-0.04em'
            }}>{config.brand.name}</h3>
            <p style={{ opacity: 0.7, lineHeight: 1.6, fontSize: '0.95rem' }}>
              {description}
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 style={{ 
              fontFamily: 'var(--font-outfit), sans-serif',
              fontSize: '1.1rem', 
              fontWeight: '800', 
              marginBottom: '1.2rem', 
              color: 'white',
              letterSpacing: '-0.02em'
            }}>Enlaces Rápidos</h4>
            <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <li><Link href="/" style={{ color: '#94a3b8', textDecoration: 'none', fontSize: '0.95rem', transition: 'color 0.2s' }}>Inicio</Link></li>
              <li><Link href="/catalog" style={{ color: '#94a3b8', textDecoration: 'none', fontSize: '0.95rem', transition: 'color 0.2s' }}>Catálogo</Link></li>
              <li><Link href="/b2b/register" style={{ color: '#94a3b8', textDecoration: 'none', fontSize: '0.95rem', transition: 'color 0.2s' }}>Institucional</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 style={{ 
              fontFamily: 'var(--font-outfit), sans-serif',
              fontSize: '1.1rem', 
              fontWeight: '800', 
              marginBottom: '1.2rem', 
              color: 'white',
              letterSpacing: '-0.02em'
            }}>Contacto</h4>
            <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <li style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#94a3b8', fontSize: '0.95rem' }}>
                <MapPin size={18} strokeWidth={1.5} color="var(--primary)" /> {address}
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#94a3b8', fontSize: '0.95rem' }}>
                <Phone size={18} strokeWidth={1.5} color="var(--primary)" /> {phone}
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#94a3b8', fontSize: '0.95rem' }}>
                <Mail size={18} strokeWidth={1.5} color="var(--primary)" /> {email}
              </li>
            </ul>
          </div>
        </div>

        <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '2rem', textAlign: 'center', fontSize: '0.9rem', opacity: 0.5 }}>
          © {new Date().getFullYear()} {config.brand.name}. Todos los derechos reservados.
        </div>
      </div>
    </footer>
  );
}
