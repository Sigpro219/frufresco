'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Building2, CheckCircle2, Clock, FileCheck2, Loader2, Truck } from 'lucide-react';
import type { Locale } from '@/lib/translations';
import type { StorefrontRuntimeConfig } from '@/lib/storefront/storefrontContracts';
import { useAuth } from '@/lib/authContext';

interface HorecaExecutiveBandProps {
  config: StorefrontRuntimeConfig;
  locale: Locale;
}

const inputStyle = {
  padding: '10px 12px',
  borderRadius: '10px',
  border: '1px solid rgba(8,28,21,0.18)',
  fontSize: '0.9375rem',
  backgroundColor: '#FFFFFF',
  minHeight: '44px',
  width: '100%',
  boxSizing: 'border-box' as const,
};

export default function HorecaExecutiveBand({ config, locale }: HorecaExecutiveBandProps) {
  const { user } = useAuth();
  const [hydrated, setHydrated] = useState(false);
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [nit, setNit] = useState('');
  const [municipality, setMunicipality] = useState('Bogotá');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leadId, setLeadId] = useState<string | null>(null);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const savePrefill = () => {
    try {
      sessionStorage.setItem(
        'frufresco_b2b_prefill',
        JSON.stringify({
          contact_name: contactName.trim(),
          phone: phone.trim(),
          nit: nit.trim(),
          municipality,
        })
      );
    } catch {
      // Ignore storage quota issues
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    savePrefill();
    try {
      const res = await fetch('/api/storefront/lead-express', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'B2B_EXPRESS',
          segment: 'HORECA',
          contact_name: contactName,
          phone,
          nit,
          municipality,
          notes: 'Cotización express desde banda ejecutiva HORECA en Landing Storefront',
        }),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error || 'No pudimos registrar tu solicitud.');
      else {
        setLeadId(json.leadId || 'OK');
        setContactName('');
        setPhone('');
        setNit('');
      }
    } catch {
      setError('Error de conexión al enviar tu solicitud.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section aria-label={locale === 'en' ? 'B2B HORECA Supply' : 'Abastecimiento B2B HORECA'} className="sf-horeca-section">
      <div
        className="sf-horeca-grid"
        style={{
          background: 'radial-gradient(circle at 12% 18%, rgba(16, 185, 129, 0.22) 0%, rgba(8, 28, 21, 0) 48%), linear-gradient(135deg, #051610 0%, #0A271D 58%, #0E3527 100%)',
          color: '#FFFFFF',
          border: '1px solid rgba(110, 231, 183, 0.16)',
          boxShadow: '0 24px 48px -18px rgba(5, 22, 16, 0.45)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '18px', minWidth: 0 }}>
          <div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', backgroundColor: 'rgba(245, 158, 11, 0.14)', border: '1px solid rgba(245, 158, 11, 0.35)', color: '#FDE68A', padding: '5px 13px', borderRadius: '9999px', fontSize: '0.8125rem', fontWeight: 700, marginBottom: '12px' }}>
              <Building2 size={14} aria-hidden="true" />
              {locale === 'en' ? 'Restaurants · Hotels · Institutional Kitchens' : 'Restaurantes · Hoteles · Casinos y Catering'}
            </span>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 800, fontSize: 'clamp(1.38rem, 2.4vw, 2.05rem)', lineHeight: 1.13, letterSpacing: '-0.02em', color: '#FFFFFF' }}>
              {locale === 'en' ? 'Institutional supply locked by agreement pricing.' : 'Abastecimiento HORECA con precios por acuerdo y entrega 5:30 a. m.'}
            </h2>
            <p style={{ margin: '10px 0 0', color: '#D1FAE5', fontSize: 'clamp(0.88rem, 1.8vw, 0.95rem)', lineHeight: 1.5, maxWidth: '52ch' }}>
              {locale === 'en' ? 'Electronic invoicing, multi-branch pricing and traceable weighing across Bogota & Sabana.' : 'Factura electrónica DIAN, listas por sede y trazabilidad exacta de pesaje en Bogotá y Sabana.'}
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
            <div style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <FileCheck2 size={17} color="#FBBF24" aria-hidden="true" />
              <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#FFFFFF' }}>Acuerdos 15–30 días</span>
              <span style={{ fontSize: '0.78rem', color: '#A7F3D0' }}>Tarifa congelada mensual</span>
            </div>
            <div style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <Truck size={17} color="#6EE7B7" aria-hidden="true" />
              <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#FFFFFF' }}>Rutas AM multisede</span>
              <span style={{ fontSize: '0.78rem', color: '#A7F3D0' }}>Antes de abrir cocina</span>
            </div>
            <div style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <Clock size={17} color="#6EE7B7" aria-hidden="true" />
              <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#FFFFFF' }}>Cotización hoy mismo</span>
              <span style={{ fontSize: '0.78rem', color: '#A7F3D0' }}>Atención directa comercial</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <Link
              href={hydrated && user ? '/b2b/dashboard' : (locale === 'en' ? '/login?lang=en' : '/login')}
              className="sf-horeca-cta"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', minHeight: '44px', backgroundColor: '#10B981', padding: '10px 16px', borderRadius: '9999px', color: '#051610', fontWeight: 800, fontSize: '0.86rem' }}
            >
              <span>{locale === 'en' ? 'Enter Institutional Portal' : 'Ingresar al Portal Institucional'}</span>
              <ArrowRight size={15} />
            </Link>
            <Link
              href={locale === 'en' ? '/b2b/register?lang=en' : '/b2b/register'}
              onClick={savePrefill}
              className="sf-horeca-cta"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', minHeight: '44px', backgroundColor: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', padding: '10px 16px', borderRadius: '9999px', color: '#FFFFFF', fontWeight: 700, fontSize: '0.86rem' }}
            >
              <span>{locale === 'en' ? 'Open full B2B simulator & map' : 'Cotizar cuenta nueva B2B'}</span>
              <ArrowRight size={15} />
            </Link>
          </div>
        </div>

        <div className="sf-horeca-form-card" style={{ backgroundColor: '#FFFFFF', color: '#081C15', border: '1px solid rgba(245, 158, 11, 0.28)', boxShadow: '0 16px 32px -12px rgba(0, 0, 0, 0.35)' }}>
          {!config.isB2bLeadCaptureEnabled ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 800 }}>Atención Comercial HORECA</h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#475569' }}>Solicita la lista mayorista vigente con nuestro equipo institucional.</p>
              <Link href={locale === 'en' ? '/b2b/register?lang=en' : '/b2b/register'} style={{ backgroundColor: '#0D7A57', color: '#FFFFFF', minHeight: '44px', padding: '10px 14px', borderRadius: '11px', fontWeight: 700, textAlign: 'center', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                Ir al Portal Institucional
              </Link>
            </div>
          ) : leadId ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', padding: '8px 2px' }}>
              <CheckCircle2 size={30} color="#0D7A57" />
              <h3 style={{ margin: 0, fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 800 }}>¡Solicitud #{leadId} radicada!</h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#475569' }}>Un asesor preparará tu lista de precios mayoristas para tu operación.</p>
              <button type="button" onClick={() => setLeadId(null)} style={{ alignSelf: 'flex-start', minHeight: '44px', padding: '8px 14px', borderRadius: '9999px', border: '1px solid rgba(8,28,21,0.16)', backgroundColor: '#FAF9F6', fontWeight: 700, fontSize: '0.82rem' }}>
                Enviar otra consulta
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-outfit), sans-serif', fontWeight: 800, fontSize: '1.05rem', color: '#081C15' }}>
                {locale === 'en' ? 'Request Wholesale Price List' : 'Cotización Exprés para tu Negocio'}
              </h3>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '0.8125rem', fontWeight: 700 }}>
                <span>Nombre o Empresa *</span>
                <input type="text" required value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Ej. Restaurante La Plaza / Carlos Ruiz" style={inputStyle} />
              </label>
              <div className="sf-horeca-two-col">
                <label style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '0.8125rem', fontWeight: 700 }}>
                  <span>WhatsApp *</span>
                  <input type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="310 555 1234" style={inputStyle} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '0.8125rem', fontWeight: 700 }}>
                  <span>NIT (opcional)</span>
                  <input type="text" value={nit} onChange={(e) => setNit(e.target.value)} placeholder="900123456" style={inputStyle} />
                </label>
              </div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '0.8125rem', fontWeight: 700 }}>
                <span>Municipio de entrega</span>
                <select value={municipality} onChange={(e) => setMunicipality(e.target.value)} style={inputStyle}>
                  <option value="Bogotá">Bogotá</option>
                  <option value="Chía">Chía / Cajicá</option>
                  <option value="Cota">Cota / Siberia</option>
                  <option value="Funza">Funza / Mosquera / Madrid</option>
                  <option value="Soacha">Soacha</option>
                </select>
              </label>
              {error && <div style={{ fontSize: '0.8125rem', color: '#991B1B', fontWeight: 600 }}>{error}</div>}
              <button type="submit" disabled={loading} className="sf-horeca-cta" style={{ marginTop: '2px', minHeight: '44px', backgroundColor: '#0D7A57', color: '#FFFFFF', border: 'none', borderRadius: '11px', padding: '10px 14px', fontWeight: 800, fontSize: '0.88rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                {loading && <Loader2 size={16} className="animate-spin" />}
                <span>Solicitar Lista B2B</span>
              </button>
            </form>
          )}
        </div>
      </div>

      <style jsx>{`
        .sf-horeca-section {
          max-width: 1440px;
          margin: 32px auto 40px;
          padding: 0 16px;
        }
        .sf-horeca-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
          gap: 22px;
          align-items: center;
          border-radius: 26px;
          padding: 32px;
        }
        .sf-horeca-form-card {
          border-radius: 20px;
          padding: 22px;
          min-width: 0;
        }
        .sf-horeca-two-col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .sf-horeca-cta {
          transition: transform 200ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms cubic-bezier(0.16, 1, 0.3, 1), background-color 200ms ease;
        }
        @media (max-width: 900px) {
          .sf-horeca-grid {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 768px) {
          .sf-horeca-section {
            margin: 20px auto 28px;
            padding: 0 12px;
          }
          .sf-horeca-grid {
            padding: 20px 16px;
            border-radius: 20px;
            gap: 18px;
          }
          .sf-horeca-form-card {
            padding: 16px;
            border-radius: 16px;
          }
        }
        @media (max-width: 480px) {
          .sf-horeca-two-col {
            grid-template-columns: 1fr;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .sf-horeca-cta {
            transition: none;
          }
        }
      `}</style>
    </section>
  );
}
