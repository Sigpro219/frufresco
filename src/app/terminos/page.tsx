import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, FileText } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Términos y Condiciones de Uso y Compra | FruFresco',
  description: 'Términos y Condiciones comerciales de FruFresco conforme a la Ley 1480 de 2011 (Estatuto del Consumidor) en Colombia.',
};

export default function TerminosPage() {
  return (
    <main style={{ backgroundColor: '#FAF9F6', minHeight: '100vh', padding: 'clamp(16px, 4vw, 32px) clamp(12px, 3.5vw, 16px) 48px', color: '#081C15', overflowX: 'hidden' }}>
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
            marginBottom: '16px',
            minHeight: '44px',
            padding: '4px 0',
          }}
        >
          <ArrowLeft size={16} />
          <span>Volver al inicio</span>
        </Link>

        <article
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 'clamp(14px, 3vw, 18px)',
            border: '1px solid rgba(8, 28, 21, 0.1)',
            padding: 'clamp(20px, 5vw, 32px) clamp(16px, 4.5vw, 28px)',
            boxShadow: '0 8px 30px rgba(8, 28, 21, 0.04)',
            lineHeight: 1.7,
            overflowWrap: 'anywhere',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
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
                flexShrink: 0,
              }}
            >
              <FileText size={22} />
            </div>
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              <h1 style={{ margin: 0, fontFamily: 'var(--font-outfit), sans-serif', fontSize: 'clamp(1.25rem, 4.5vw, 1.65rem)', fontWeight: 800, lineHeight: 1.25 }}>
                Términos y Condiciones de Uso y Compra
              </h1>
              <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#475569' }}>
                FruFresco · NIT 901.393.217 · Ley 1480 de 2011 (Estatuto del Consumidor)
              </p>
            </div>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid #E2E8F0', margin: '20px 0' }} />

          <section style={{ marginBottom: '20px' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '8px' }}>1. Objeto y Cobertura</h2>
            <p style={{ margin: 0, color: '#334155' }}>
              Los presentes Términos y Condiciones regulan el acceso y las compras realizadas en{' '}
              <strong>frufresco.co</strong> para abastecimiento de frutas, verduras, abarrotes y proteínas frescas en{' '}
              <strong>Bogotá D.C., Chía, Cajicá, Cota y municipios de la Sabana</strong> bajo modalidad de despachos AM.
            </p>
          </section>

          <section style={{ marginBottom: '20px' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '8px' }}>2. Naturaleza Perecedera y Pesaje</h2>
            <p style={{ margin: 0, color: '#334155' }}>
              Por tratarse de alimentos frescos y productos agrícolas de peso variable, el pesaje final en alistamiento
              puede presentar variaciones menores respecto a la unidad de referencia solicitada; la liquidación final se
              refleja en la remisión o factura correspondiente.
            </p>
          </section>

          <section style={{ marginBottom: '20px' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '8px' }}>3. Precios, Acuerdos B2B y Pagos</h2>
            <p style={{ margin: 0, color: '#334155' }}>
              Los precios se expresan en pesos colombianos (COP) y responden al perfil comercial vigente (hogar o acuerdo
              institucional B2B). El pago puede realizarse contraentrega o mediante cupo de crédito B2B previamente
              aprobado.
            </p>
          </section>

          <section style={{ marginBottom: '20px' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '8px' }}>4. Garantía, Cambios y PQRS</h2>
            <p style={{ margin: 0, color: '#334155' }}>
              Si algún producto presenta novedad de calidad o cantidad al momento de la entrega, el cliente podrá
              reportarlo el mismo día a través de nuestro portal{' '}
              <Link href="/pqrs" style={{ color: '#0D7A57', fontWeight: 700 }}>Garantía &amp; PQRS</Link> o por WhatsApp al{' '}
              <strong>316 7022898</strong> para su reposición o nota de ajuste.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '8px' }}>5. Contacto</h2>
            <p style={{ margin: 0, color: '#334155' }}>
              Pedidos:{' '}
              <a href="mailto:pedidos@frufresco.co" style={{ color: '#0D7A57', fontWeight: 600 }}>pedidos@frufresco.co</a>{' '}
              · Atención general:{' '}
              <a href="mailto:contacto@frufresco.co" style={{ color: '#0D7A57', fontWeight: 600 }}>contacto@frufresco.co</a>
            </p>
          </section>
        </article>
      </div>
    </main>
  );
}
