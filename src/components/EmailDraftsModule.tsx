'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { THEME, formatMoney } from '@/lib/adminTheme';
import { Mail, ArrowRight, Trash2, MapPin, Phone, Hash, X, Check } from 'lucide-react';
import Link from 'next/link';

export default function EmailDraftsModule() {
  const [drafts, setDrafts] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDraft, setSelectedDraft] = useState<any>(null);

  useEffect(() => {
    fetchDrafts();
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const { data } = await supabase.from('products').select('*').eq('is_active', true);
      if (data) setProducts(data);
    } catch (e) {
      console.error(e);
    }
  };

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

  // Funciones de ayuda para extraer metadata (soportando ambas formas, DB column o JSON metadata)
  const getDraftItems = (draft: any) => {
    const raw = draft.extracted_items || [];
    return raw.filter((i: any) => !i.isMetadata);
  };
  
  const getDraftMetadata = (draft: any) => {
    const raw = draft.extracted_items || [];
    const meta = raw.find((i: any) => i.isMetadata);
    return {
      address: meta?.address || draft.extracted_address || 'No detectado',
      phone: meta?.phone || draft.extracted_phone || 'No detectado',
      nit: meta?.nit || draft.extracted_nit || 'No detectado'
    };
  };

  return (
    <div style={{ padding: '0', maxWidth: '100%', margin: '0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: '800', color: THEME.colors.textMain, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Mail size={20} style={{ color: THEME.colors.primary }} /> Pedidos por Procesar (Email Inbound)
          </h1>
        </div>
        <button 
          onClick={fetchDrafts}
          style={{
            padding: '0.5rem 1rem',
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
        <div style={{ textAlign: 'center', padding: '3rem', color: THEME.colors.textSecondary }}>Cargando correos...</div>
      ) : drafts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', backgroundColor: 'white', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}` }}>
          <Mail size={32} style={{ opacity: 0.3, marginBottom: '1rem', color: '#9CA3AF' }} />
          <h3 style={{ fontSize: '1.1rem', color: '#4B5563', margin: '0 0 4px 0' }}>Bandeja Vacía</h3>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#9CA3AF' }}>No hay correos pendientes.</p>
        </div>
      ) : (
        <div style={{ backgroundColor: 'white', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#F9FAFB', borderBottom: `1px solid ${THEME.colors.border}`, color: THEME.colors.textSecondary, fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem' }}>
                <th style={{ padding: '1rem', textAlign: 'left' }}>FECHA / TIPO</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>CLIENTE DETECTADO</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>DIRECCIÓN EXTRACT.</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>ASUNTO</th>
                <th style={{ padding: '1rem', textAlign: 'center' }}>ITEMS</th>
                <th style={{ padding: '1rem', textAlign: 'center' }}>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((draft) => {
                const meta = getDraftMetadata(draft);
                const itemsCount = getDraftItems(draft).length;
                return (
                <tr 
                  key={draft.id} 
                  onClick={() => setSelectedDraft(draft)}
                  style={{ borderBottom: `1px solid ${THEME.colors.border}`, cursor: 'pointer', transition: 'background-color 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F9FAFB'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <td style={{ padding: '1rem' }}>
                    <div style={{ fontWeight: 800, color: '#111827', fontSize: '0.9rem' }}>
                      {new Date(draft.created_at).toLocaleDateString()}
                    </div>
                    <span style={{ color: THEME.colors.primary, fontWeight: 700, fontSize: '0.75rem' }}>EMAIL B2C</span>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ fontWeight: 700, color: '#111827' }}>{draft.client_detected_name || 'Desconocido'}</div>
                    <div style={{ color: '#6B7280', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                      <Mail size={12} /> {draft.source_email}
                    </div>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ color: '#4B5563', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {meta.address !== 'No detectado' ? meta.address : '-'}
                    </div>
                  </td>
                  <td style={{ padding: '1rem', maxWidth: '250px' }}>
                    <div style={{ color: '#4B5563', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {draft.email_subject || '-'}
                    </div>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    <div style={{ fontWeight: 800, color: '#111827' }}>{itemsCount}</div>
                    <div style={{ fontSize: '0.7rem', color: '#6B7280' }}>prods</div>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    <button 
                      onClick={(e) => handleDelete(draft.id, e)}
                      style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '5px' }}
                      title="Rechazar"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de Aprobación */}
      {selectedDraft && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: THEME.radius.xl,
            width: '100%',
            maxWidth: '800px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
          }}>
            {/* Modal Header */}
            <div style={{ padding: '1.5rem', borderBottom: `1px solid ${THEME.colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#111827', fontWeight: 800 }}>Revisión de Correo</h2>
                <p style={{ margin: '4px 0 0 0', color: '#6B7280', fontSize: '0.85rem' }}>De: {selectedDraft.source_email}</p>
              </div>
              <button onClick={() => setSelectedDraft(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF' }}>
                <X size={24} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ backgroundColor: '#F9FAFB', padding: '1rem', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#6B7280', textTransform: 'uppercase', fontWeight: 700, marginBottom: '4px' }}>Cliente Detectado</div>
                  <div style={{ fontWeight: 600, color: '#111827' }}>{selectedDraft.client_detected_name || 'Desconocido'}</div>
                </div>
                <div style={{ backgroundColor: '#F9FAFB', padding: '1rem', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#6B7280', textTransform: 'uppercase', fontWeight: 700, marginBottom: '4px' }}>Datos Extraídos</div>
                  <div style={{ fontSize: '0.85rem', color: '#4B5563', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={14}/> {getDraftMetadata(selectedDraft).address}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Phone size={14}/> {getDraftMetadata(selectedDraft).phone}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Hash size={14}/> {getDraftMetadata(selectedDraft).nit}</span>
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '0.9rem', color: '#111827', fontWeight: 700, marginBottom: '0.5rem' }}>Cuerpo del Correo</h3>
                <div style={{ backgroundColor: '#F3F4F6', padding: '1rem', borderRadius: '8px', fontSize: '0.85rem', color: '#4B5563', whiteSpace: 'pre-wrap', maxHeight: '150px', overflowY: 'auto' }}>
                  {selectedDraft.email_body || '(Sin cuerpo)'}
                </div>
              </div>

              <div>
                <h3 style={{ fontSize: '0.9rem', color: '#111827', fontWeight: 700, marginBottom: '0.5rem' }}>Productos Reconocidos</h3>
                <div style={{ border: `1px solid ${THEME.colors.border}`, borderRadius: '8px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead style={{ backgroundColor: '#F9FAFB' }}>
                      <tr>
                        <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#4B5563' }}>CANTIDAD</th>
                        <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#4B5563' }}>TEXTO ORIGINAL (IA)</th>
                        <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#4B5563' }}>MATCH EN INVENTARIO</th>
                        <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600, color: '#4B5563' }}>VALOR EST.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        let totalValue = 0;
                        const actualItems = getDraftItems(selectedDraft);
                        
                        if (actualItems.length === 0) {
                          return <tr><td colSpan={4} style={{ padding: '1rem', textAlign: 'center', color: '#9CA3AF' }}>No se extrajeron productos</td></tr>;
                        }

                        return (
                          <>
                            {actualItems.map((item: any, i: number) => {
                              // Intentar match
                              const matchedProd = products.find((p: any) => 
                                item.originalName?.toLowerCase().includes(p.name.toLowerCase()) ||
                                p.name.toLowerCase().includes(item.originalName?.toLowerCase().split(' ')[0] || '')
                              );
                              
                              const itemTotal = matchedProd ? ((matchedProd.base_price || 0) * (item.quantity || 1)) : 0;
                              totalValue += itemTotal;

                              return (
                                <tr key={i} style={{ borderTop: `1px solid ${THEME.colors.border}` }}>
                                  <td style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>{item.quantity}</td>
                                  <td style={{ padding: '0.75rem 1rem', color: '#4B5563' }}>{item.originalName}</td>
                                  <td style={{ padding: '0.75rem 1rem' }}>
                                    {matchedProd ? (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#047857', fontWeight: 600 }}>
                                        <Check size={14} /> {matchedProd.name}
                                      </div>
                                    ) : (
                                      <span style={{ color: '#EF4444', fontSize: '0.75rem' }}>Sin coincidencia</span>
                                    )}
                                  </td>
                                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600, color: '#111827' }}>
                                    {matchedProd ? formatMoney(itemTotal) : '-'}
                                  </td>
                                </tr>
                              );
                            })}
                            <tr style={{ backgroundColor: '#F9FAFB', borderTop: `1px solid ${THEME.colors.border}` }}>
                              <td colSpan={3} style={{ padding: '1rem', textAlign: 'right', fontWeight: 800, color: '#111827' }}>TOTAL ESTIMADO:</td>
                              <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 800, color: THEME.colors.primary, fontSize: '1.1rem' }}>
                                {formatMoney(totalValue)}
                              </td>
                            </tr>
                          </>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div style={{ padding: '1.5rem', borderTop: `1px solid ${THEME.colors.border}`, display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
              <button 
                onClick={() => setSelectedDraft(null)}
                style={{ padding: '0.75rem 1.5rem', backgroundColor: 'white', border: `1px solid ${THEME.colors.border}`, borderRadius: '10px', fontWeight: 600, color: '#4B5563', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <Link 
                href={`/admin/orders/create?draft_id=${selectedDraft.id}`}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: THEME.colors.primary,
                  color: 'white',
                  borderRadius: '10px',
                  fontWeight: '700',
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                Aprobar y Procesar Pedido <ArrowRight size={18} />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
