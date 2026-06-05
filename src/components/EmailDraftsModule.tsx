'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { THEME, formatMoney } from '@/lib/adminTheme';
import { Mail, CheckCircle2, AlertTriangle, FileText, ArrowRight, Trash2 } from 'lucide-react';

export default function EmailDraftsModule() {
  const [drafts, setDrafts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDrafts();
  }, []);

  const fetchDrafts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('order_drafts')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDrafts(data || []);
    } catch (err) {
      console.error('Error fetching drafts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('¿Estás seguro de que deseas rechazar y eliminar este borrador de pedido?')) return;
    try {
      const { error } = await supabase
        .from('order_drafts')
        .update({ status: 'rejected' })
        .eq('id', id);

      if (error) throw error;
      setDrafts(prev => prev.filter(d => d.id !== id));
    } catch (err) {
      console.error('Error deleting draft:', err);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: THEME.colors.textMain, margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Mail size={28} style={{ color: THEME.colors.primary }} /> Pedidos por Procesar (Email Inbound)
          </h1>
          <p style={{ color: THEME.colors.textSecondary, marginTop: '4px' }}>
            Bandeja de entrada de correos recibidos y analizados automáticamente con Inteligencia Artificial.
          </p>
        </div>
        <button 
          onClick={fetchDrafts}
          style={{
            padding: '0.6rem 1.2rem',
            backgroundColor: 'white',
            border: `1px solid ${THEME.colors.border}`,
            borderRadius: THEME.radius.md,
            fontWeight: '600',
            cursor: 'pointer',
            fontSize: '0.85rem'
          }}
        >
          Actualizar Bandeja
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: THEME.colors.textSecondary }}>Cargando borradores...</div>
      ) : drafts.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '4rem 2rem', 
          backgroundColor: 'white', 
          borderRadius: THEME.radius.lg, 
          border: `1px solid ${THEME.colors.border}`,
          color: '#9CA3AF'
        }}>
          <Mail size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
          <h3 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#4B5563', margin: '0 0 4px 0' }}>Bandeja Vacía</h3>
          <p style={{ margin: 0, fontSize: '0.9rem' }}>No hay correos pendientes de procesamiento en este momento.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
          {drafts.map(draft => (
            <div 
              key={draft.id}
              style={{
                backgroundColor: 'white',
                border: `1px solid ${THEME.colors.border}`,
                borderRadius: THEME.radius.lg,
                padding: '1.5rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                boxShadow: THEME.shadow.sm,
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = THEME.shadow.md}
              onMouseLeave={e => e.currentTarget.style.boxShadow = THEME.shadow.sm}
            >
              <div style={{ flex: 1, marginRight: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.5rem' }}>
                  <span style={{ 
                    padding: '4px 10px', 
                    borderRadius: '100px', 
                    fontSize: '0.7rem', 
                    fontWeight: '800', 
                    backgroundColor: '#F3F4F6', 
                    color: '#4B5563',
                    border: '1px solid rgba(0,0,0,0.05)'
                  }}>
                    DE: {draft.source_email}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
                    {new Date(draft.created_at).toLocaleString()}
                  </span>
                </div>
                
                <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: '#1F2937', margin: '0 0 6px 0' }}>
                  {draft.email_subject || '(Sin Asunto)'}
                </h3>
                
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.85rem' }}>
                  <div style={{ color: '#047857', fontWeight: '600' }}>
                    👤 Cliente Detectado: <span style={{ textDecoration: 'underline' }}>{draft.client_detected_name}</span>
                  </div>
                  <div style={{ color: '#4B5563' }}>
                    📦 Items Extraídos por IA: <b>{draft.extracted_items?.length || 0} productos</b>
                  </div>
                </div>

                {draft.email_body && (
                  <div style={{ 
                    marginTop: '10px', 
                    padding: '10px', 
                    backgroundColor: '#F9FAFB', 
                    borderRadius: '8px', 
                    fontSize: '0.8rem', 
                    color: '#6B7280',
                    maxHeight: '60px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    "{draft.email_body}"
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button
                  onClick={(e) => handleDelete(draft.id, e)}
                  style={{
                    padding: '0.6rem',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: '#FEE2E2',
                    color: '#DC2626',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  title="Rechazar y borrar"
                >
                  <Trash2 size={16} />
                </button>
                <a 
                  href={`/admin/orders/create?draft_id=${draft.id}`}
                  style={{
                    padding: '0.75rem 1.5rem',
                    backgroundColor: THEME.colors.primary,
                    color: 'white',
                    borderRadius: '10px',
                    fontWeight: '700',
                    fontSize: '0.9rem',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.2)',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#059669'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = THEME.colors.primary}
                >
                  Procesar Pedido <ArrowRight size={16} />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
