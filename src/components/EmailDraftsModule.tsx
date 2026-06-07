'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { THEME, formatMoney } from '@/lib/adminTheme';
import { Mail, CheckCircle2, AlertTriangle, FileText, ArrowRight, Trash2, Phone, Globe, PackageOpen } from 'lucide-react';
import Link from 'next/link';

export default function EmailDraftsModule() {
  const [drafts, setDrafts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDraft, setSelectedDraft] = useState<any>(null);

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
      if (selectedDraft?.id === id) setSelectedDraft(null);
    } catch (err) {
      console.error('Error deleting draft:', err);
    }
  };

  const getFriendlyDraftId = (id: string) => {
    return 'EML-' + id.substring(0, 5).toUpperCase();
  };

  return (
    <div style={{ padding: '0', width: '100%' }}>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', backgroundColor: 'white', borderRadius: '12px' }}>
            <div style={{ color: THEME.colors.primary, marginBottom: '1rem', display: 'flex', justifyContent: 'center' }}><Mail size={48} strokeWidth={1.5} className="animate-pulse" /></div>
            <div style={{ color: '#64748B' }}>Cargando bandeja...</div>
        </div>
      ) : drafts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', backgroundColor: 'white', borderRadius: '12px' }}>
            <div style={{ color: THEME.colors.textSecondary, marginBottom: '1rem', display: 'flex', justifyContent: 'center' }}><PackageOpen size={48} strokeWidth={1.5} /></div>
            <div style={{ color: '#64748B', fontWeight: '600' }}>Bandeja Vacía. No hay correos pendientes.</div>
        </div>
      ) : (
        <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.lg, overflow: 'hidden', boxShadow: THEME.shadow.sm }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
                <tr style={{ backgroundColor: '#F8FAFB', borderBottom: '1px solid #E5E7EB' }}>
                    <th style={{ padding: '1rem', textAlign: 'left', ...THEME.typography?.tableHeader }}>ID / TIPO</th>
                    <th style={{ padding: '1rem', textAlign: 'left', ...THEME.typography?.tableHeader }}>CLIENTE</th>
                    <th style={{ padding: '1rem', textAlign: 'left', ...THEME.typography?.tableHeader }}>ASUNTO</th>
                    <th style={{ padding: '1rem', textAlign: 'center', ...THEME.typography?.tableHeader }}>ORIGEN</th>
                    <th style={{ padding: '1rem', textAlign: 'center', ...THEME.typography?.tableHeader }}>ITEMS IA</th>
                    <th style={{ padding: '1rem', textAlign: 'center', ...THEME.typography?.tableHeader }}>ESTADO</th>
                </tr>
            </thead>
            <tbody>
                {drafts.map((draft) => {
                    const friendlyId = getFriendlyDraftId(draft.id);
                    const itemsCount = draft.extracted_items?.length || 0;

                    return (
                        <tr key={draft.id} 
                            onClick={() => setSelectedDraft(draft)}
                            style={{ 
                                borderBottom: '1px solid #F1F5F9', 
                                transition: 'all 0.1s', 
                                cursor: 'pointer',
                                backgroundColor: 'transparent'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F9FAFB'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                            <td style={{ padding: '0.8rem 1rem' }}>
                                <div style={{ fontWeight: '900', fontSize: '0.85rem', color: '#111827' }}>{friendlyId}</div>
                                <div style={{ fontSize: '0.65rem', fontWeight: '800', color: '#6B21A8' }}>BORRADOR</div>
                            </td>
                            <td style={{ padding: '0.8rem 1rem' }}>
                                <div style={{ fontWeight: '800', fontSize: '0.9rem', color: '#111827' }}>{draft.client_detected_name || 'Desconocido'}</div>
                                <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, display: 'inline-flex', alignItems: 'center', gap: '2px' }}><Mail size={10} strokeWidth={1.5} /> {draft.source_email}</div>
                            </td>
                            <td style={{ padding: '0.8rem 1rem' }}>
                                <div style={{ fontSize: '0.8rem', color: '#374151', fontWeight: '600' }}>{draft.email_subject?.slice(0, 45) || '(Sin Asunto)'}...</div>
                                <span style={{ fontSize: '0.6rem', color: '#9CA3AF', fontWeight: '700' }}>{new Date(draft.created_at).toLocaleString()}</span>
                            </td>
                            <td style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>
                                <span style={{ backgroundColor: '#F3E8FF', color: '#6B21A8', padding: '2px 8px', borderRadius: '12px', fontSize: '0.65rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <Mail size={10} strokeWidth={1.5} /> Correo
                                </span>
                            </td>
                            <td style={{ padding: '0.8rem 1rem', textAlign: 'center', fontWeight: '800', color: '#4B5563', fontSize: '0.85rem' }}>
                                {itemsCount}
                            </td>
                            <td style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>
                                <div style={{
                                    padding: '2px 8px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: '900',
                                    backgroundColor: '#FEF3C7',
                                    color: '#92400E',
                                    display: 'inline-block'
                                }}>
                                    POR PROCESAR
                                </div>
                            </td>
                        </tr>
                    );
                })}
            </tbody>
          </table>
        </div>
      )}

      {/* Draft Details Modal */}
      {selectedDraft && (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            backdropFilter: 'blur(8px)',
            padding: '1rem'
        }} onClick={() => setSelectedDraft(null)}>
            <div style={{
                backgroundColor: 'white',
                borderRadius: '24px',
                width: '95%',
                maxWidth: '900px',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
                overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.2)'
            }} onClick={e => e.stopPropagation()}>
                {/* Modal Header */}
                <div style={{ 
                    padding: '2rem', 
                    borderBottom: '1px solid #F1F5F9', 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'flex-start',
                    background: 'linear-gradient(to right, #F8FAFC, #FFFFFF)'
                }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#6B21A8', backgroundColor: '#F3E8FF', padding: '2px 8px', borderRadius: '6px' }}>
                                BORRADOR EMAIL
                            </span>
                            <span style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: '600' }}>
                                {getFriendlyDraftId(selectedDraft.id)}
                            </span>
                        </div>
                        <h2 style={{ fontSize: '1.75rem', fontWeight: '900', color: '#0F172A', margin: '0 0 4px 0', letterSpacing: '-0.02em' }}>
                            {selectedDraft.client_detected_name || 'Cliente Desconocido'}
                        </h2>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: '#64748B', fontSize: '0.85rem' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Mail size={14} /> {selectedDraft.source_email}</span>
                        </div>
                    </div>
                    
                    <button 
                        onClick={(e) => handleDelete(selectedDraft.id, e)}
                        style={{
                            padding: '0.5rem 1rem',
                            borderRadius: '8px',
                            border: '1px solid #FECDD3',
                            backgroundColor: '#FFF1F2',
                            color: '#E11D48',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontWeight: '700',
                            fontSize: '0.8rem'
                        }}
                    >
                        <Trash2 size={16} /> Rechazar Borrador
                    </button>
                </div>

                {/* Modal Body */}
                <div style={{ padding: '2rem', overflowY: 'auto', flex: 1, backgroundColor: 'white', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                    
                    {/* Left: Email content */}
                    <div>
                        <h3 style={{ fontSize: '0.85rem', fontWeight: '900', color: '#64748B', letterSpacing: '0.05em', marginBottom: '1rem', textTransform: 'uppercase' }}>
                            Contenido Original
                        </h3>
                        <div style={{ backgroundColor: '#F8FAFC', borderRadius: '12px', padding: '1.5rem', border: '1px solid #E2E8F0' }}>
                            <div style={{ fontWeight: '800', color: '#1E293B', marginBottom: '1rem', fontSize: '1rem' }}>
                                Asunto: {selectedDraft.email_subject || '(Sin Asunto)'}
                            </div>
                            <div style={{ color: '#475569', fontSize: '0.9rem', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                                {selectedDraft.email_body || '(Sin cuerpo de mensaje)'}
                            </div>
                        </div>
                    </div>

                    {/* Right: Extracted Items */}
                    <div>
                        <h3 style={{ fontSize: '0.85rem', fontWeight: '900', color: '#64748B', letterSpacing: '0.05em', marginBottom: '1rem', textTransform: 'uppercase' }}>
                            Productos Extraídos (IA)
                        </h3>
                        <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '800', color: '#64748B' }}>PRODUCTO MENCIONADO</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: '800', color: '#64748B' }}>CANT.</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {selectedDraft.extracted_items && selectedDraft.extracted_items.length > 0 ? (
                                        selectedDraft.extracted_items.map((item: any, idx: number) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                <td style={{ padding: '1rem', color: '#1E293B', fontWeight: '600', fontSize: '0.9rem' }}>
                                                    {item.originalName || item.name}
                                                </td>
                                                <td style={{ padding: '1rem', textAlign: 'right', fontWeight: '800', color: '#059669' }}>
                                                    {item.quantity}
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={2} style={{ padding: '2rem', textAlign: 'center', color: '#94A3B8' }}>
                                                No se extrajeron productos
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>

                {/* Modal Footer */}
                <div style={{ 
                    padding: '2rem', 
                    borderTop: '1px solid #F1F5F9', 
                    backgroundColor: '#F8FAFC', 
                    display: 'flex', 
                    justifyContent: 'flex-end', 
                    alignItems: 'center' 
                }}>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button 
                            onClick={() => setSelectedDraft(null)}
                            style={{ padding: '0.8rem 1.5rem', borderRadius: '12px', border: '1px solid #CBD5E1', backgroundColor: 'white', fontWeight: '700', color: '#64748B', cursor: 'pointer' }}
                        >
                            Cerrar
                        </button>
                        <Link 
                            href={`/admin/orders/create?draft_id=${selectedDraft.id}`}
                            style={{ 
                                padding: '0.8rem 1.5rem', 
                                borderRadius: '12px', 
                                border: 'none', 
                                backgroundColor: THEME.colors.primary, 
                                color: 'white', 
                                fontWeight: '800', 
                                cursor: 'pointer', 
                                boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.2)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                textDecoration: 'none'
                            }}
                        >
                            Aprobar y Entrar a la Orden <ArrowRight size={18} />
                        </Link>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
