import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Política de Privacidad y Tratamiento de Datos | FruFresco',
  description: 'Política de Tratamiento de Datos Personales de FruFresco conforme a la Ley 1581 de 2012 y el Decreto 1377 de 2013 de Colombia.',
};

export default function PrivacidadPage() {
  return (
    <main style={{ backgroundColor: '#FAF9F6', minHeight: '100vh', padding: '32px 16px 64px', color: '#081C15' }}>
      <div style={{ maxWidth: '860px', margin: '0 auto' }}>
        <Link
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            color: '#0D7A57',
            fontWeight: 700,
            fontSize: '0.92rem',
            textDecoration: 'none',
            marginBottom: '20px',
          }}
        >
          <ArrowLeft size={16} />
          <span>Volver al inicio</span>
        </Link>

        <article
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '18px',
            border: '1px solid rgba(8, 28, 21, 0.1)',
            padding: '32px 28px',
            boxShadow: '0 8px 30px rgba(8, 28, 21, 0.04)',
            lineHeight: 1.7,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                backgroundColor: '#ECFDF5',
                color: '#0D7A57',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ShieldCheck size={22} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontFamily: 'var(--font-outfit), sans-serif', fontSize: '1.65rem', fontWeight: 800 }}>
                Política de Privacidad y Tratamiento de Datos Personales
              </h1>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569' }}>
                Ley 1581 de 2012 · Decreto 1377 de 2013 · República de Colombia
              </p>
            </div>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid #E2E8F0', margin: '20px 0' }} />

          <section style={{ marginBottom: '20px' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '8px' }}>1. Responsable del Tratamiento</h2>
            <p style={{ margin: 0, color: '#334155' }}>
              <strong>FruFresco</strong> (NIT <strong>901.393.217</strong>), con domicilio en{' '}
              <strong>CL 12 B # 71 D - 31 TO 4 AP 101, Bogotá D.C., Colombia</strong>, teléfono{' '}
              <strong>316 7022898</strong> y correos oficiales{' '}
              <a href="mailto:contacto@frufresco.co" style={{ color: '#0D7A57', fontWeight: 600 }}>contacto@frufresco.co</a> y{' '}
              <a href="mailto:pedidos@frufresco.co" style={{ color: '#0D7A57', fontWeight: 600 }}>pedidos@frufresco.co</a>,
              actúa como responsable del tratamiento de los datos personales recolectados a través de{' '}
              <strong>frufresco.co</strong> y canales comerciales asociados.
            </p>
          </section>

          <section style={{ marginBottom: '20px' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '8px' }}>2. Finalidades del Tratamiento</h2>
            <ul style={{ margin: 0, paddingLeft: '20px', color: '#334155' }}>
              <li>Gestionar cotizaciones, acuerdos comerciales B2B, pedidos institucionales y órdenes de hogar.</li>
              <li>Coordinar la logística de alistamiento, despacho y entrega en Bogotá D.C. y Sabana.</li>
              <li>Emitir remisiones, facturación electrónica, gestión de cartera y pagos.</li>
              <li>Atender solicitudes, garantías y reclamos (PQRS) sobre calidad o entregas.</li>
              <li>Enviar confirmaciones operativas, catálogos actualizados y novedades comerciales autorizadas.</li>
            </ul>
          </section>

          <section style={{ marginBottom: '20px' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '8px' }}>3. Derechos de los Titulares (Derechos ARCO)</h2>
            <p style={{ margin: 0, color: '#334155' }}>
              Conforme a la Ley 1581 de 2012, el titular de los datos personales tiene derecho a conocer, actualizar,
              rectificar y solicitar la supresión de sus datos, así como revocar la autorización otorgada cuando no exista
              un deber legal o contractual que impida su eliminación.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '8px' }}>4. Canal de Atención y Vigencia</h2>
            <p style={{ margin: 0, color: '#334155' }}>
              Para ejercer sus derechos de consulta o reclamo sobre datos personales, puede escribirnos a{' '}
              <a href="mailto:contacto@frufresco.co" style={{ color: '#0D7A57', fontWeight: 600 }}>contacto@frufresco.co</a>{' '}
              o comunicarse al WhatsApp <strong>316 7022898</strong>. Los datos se conservarán durante el tiempo necesario
              para cumplir las finalidades operativas, contables y legales vigentes.
            </p>
          </section>
        </article>
      </div>
    </main>
  );
}
