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
  const [draftCoordinates, setDraftCoordinates] = useState<{lat: number, lng: number} | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const [editableItems, setEditableItems] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchDrafts();
    fetchProducts();
    fetchAliases();
  }, []);

  const fetchProducts = async () => {
    try {
      const { data } = await supabase.from('products').select('*').eq('is_active', true);
      if (data) setProducts(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAliases = async () => {
    try {
      const { data } = await supabase.from('app_settings').select('value').eq('key', 'ai_product_aliases').single();
      if (data && data.value) {
        setAliases(typeof data.value === 'string' ? JSON.parse(data.value) : data.value);
      }
    } catch (e) {
      console.error('Error fetching aliases', e);
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

  useEffect(() => {
    if (selectedDraft) {
      const meta = getDraftMetadata(selectedDraft);
      if (meta.address && meta.address !== 'No detectado') {
        setGeocoding(true);
        setDraftCoordinates(null);
        fetch(`/api/geocode?address=${encodeURIComponent(meta.address)}&city=Bogotá`)
          .then(res => res.json())
          .then(data => {
            if (data.status === 'OK' && data.results && data.results.length > 0) {
              const loc = data.results[0].geometry.location;
              setDraftCoordinates({ lat: loc.lat, lng: loc.lng });
            }
          })
          .catch(err => console.error("Geocode error", err))
          .finally(() => setGeocoding(false));
      } else {
        setDraftCoordinates(null);
        setGeocoding(false);
      }
      
      // Initialize editable items
      const rawItems = getDraftItems(selectedDraft);
      const initialEdits = rawItems.map((item: any) => {
        // Try to find a match using aliases first, then by name
        let matchedId = item.matched_product_id || null;
        if (!matchedId) {
            const aliasMatch = aliases[item.originalName?.toLowerCase()?.trim()];
            if (aliasMatch) {
                matchedId = aliasMatch;
            } else {
                const autoMatch = products.find((p: any) => 
                    item.originalName?.toLowerCase()?.includes(p.name.toLowerCase()) ||
                    p.name.toLowerCase().includes(item.originalName?.toLowerCase()?.split(' ')[0])
                );
                if (autoMatch) matchedId = autoMatch.id;
            }
        }
        return {
            ...item,
            originalQuantity: item.quantity || 1,
            quantity: item.quantity || 1,
            matched_product_id: matchedId
        };
      });
      setEditableItems(initialEdits);
      
    } else {
      setDraftCoordinates(null);
      setGeocoding(false);
      setEditableItems([]);
    }
  }, [selectedDraft, products, aliases]);

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

  const handleApprove = async () => {
    if (!selectedDraft) return;
    setSaving(true);
    
    // 1. Prepare new aliases to save
    const newAliases: Record<string, string> = {};
    editableItems.forEach(item => {
      const originalText = item.originalName?.toLowerCase()?.trim();
      if (originalText && item.matched_product_id) {
        // Solo guardamos si no estaba en la memoria o si cambió
        if (aliases[originalText] !== item.matched_product_id) {
          newAliases[originalText] = item.matched_product_id;
        }
      }
    });

    try {
      // 2. Save aliases via our new API
      if (Object.keys(newAliases).length > 0) {
        await fetch('/api/orders/aliases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newAliases })
        });
      }

      // 3. Update the draft's extracted_items to include our manual edits
      const metaItem = selectedDraft.extracted_items?.find((i: any) => i.isMetadata);
      const updatedExtractedItems = [
        ...(metaItem ? [metaItem] : []),
        ...editableItems
      ];

      await supabase
        .from('order_drafts')
        .update({ extracted_items: updatedExtractedItems })
        .eq('id', selectedDraft.id);

      // 4. Redirect
      window.location.href = `/admin/orders/create?draft_id=${selectedDraft.id}`;
    } catch (e) {
      console.error('Error in handleApprove:', e);
      alert('Error al guardar. Por favor intenta de nuevo.');
      setSaving(false);
    }
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
              
              {/* Encabezado Estilo Pedido */}
              <div style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <h2 style={{ margin: 0, fontSize: '1.4rem', color: '#111827', fontWeight: 900 }}>
                    Revisión de Pedido por Correo
                  </h2>
                  <span style={{ backgroundColor: '#FEF3C7', color: '#B45309', padding: '4px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 800 }}>NUEVO BORRADOR</span>
                </div>
                
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1E3A8A', textTransform: 'uppercase', marginBottom: '8px' }}>
                  {selectedDraft.client_detected_name || 'CLIENTE NO DETECTADO'} 
                  <span style={{ fontSize: '0.9rem', color: '#6B7280', fontWeight: 600 }}> (NIT: {getDraftMetadata(selectedDraft).nit || 'No detectado'})</span>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: '#4B5563', fontSize: '0.9rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><MapPin size={16} /> {getDraftMetadata(selectedDraft).address || 'Dirección no detectada'}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Phone size={16} /> {getDraftMetadata(selectedDraft).phone || 'Teléfono no detectado'}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Mail size={16} /> {selectedDraft.source_email}</div>
                  {geocoding && <div style={{ fontSize: '0.8rem', color: '#D97706', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={14}/> Buscando coordenadas...</div>}
                  {draftCoordinates && (
                    <div style={{ fontSize: '0.8rem', color: '#059669', fontWeight: 600, display: 'flex', gap: '12px', marginTop: '4px' }}>
                      <span>Lat: {draftCoordinates.lat.toFixed(6)}</span>
                      <span>Lng: {draftCoordinates.lng.toFixed(6)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Tabla de Productos Estilo Pedido */}
              <div style={{ marginBottom: '2rem' }}>
                <div style={{ overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #E5E7EB' }}>
                        <th style={{ padding: '1rem 0.5rem', textAlign: 'left', fontWeight: 800, color: '#4B5563', fontSize: '0.75rem', letterSpacing: '0.05em', backgroundColor: '#F3F4F6' }}>PRODUCTO ORIGINAL</th>
                        <th style={{ padding: '1rem 0.5rem', textAlign: 'center', fontWeight: 800, color: '#4B5563', fontSize: '0.75rem', letterSpacing: '0.05em', backgroundColor: '#F3F4F6' }}>CANT. ORIG.</th>
                        <th style={{ padding: '1rem 0.5rem', textAlign: 'left', fontWeight: 800, color: '#10B981', fontSize: '0.75rem', letterSpacing: '0.05em' }}>MATCH INVENTARIO</th>
                        <th style={{ padding: '1rem 0.5rem', textAlign: 'center', fontWeight: 800, color: '#10B981', fontSize: '0.75rem', letterSpacing: '0.05em' }}>CANTIDAD FINAL</th>
                        <th style={{ padding: '1rem 0.5rem', textAlign: 'right', fontWeight: 800, color: '#6B7280', fontSize: '0.75rem', letterSpacing: '0.05em' }}>PRECIO U.</th>
                        <th style={{ padding: '1rem 0.5rem', textAlign: 'right', fontWeight: 800, color: '#6B7280', fontSize: '0.75rem', letterSpacing: '0.05em' }}>SUBTOTAL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        let totalValue = 0;
                        return (
                          <>
                            {editableItems.map((item: any, i: number) => {
                              const matchedProd = products.find(p => p.id === item.matched_product_id);
                              const itemTotal = matchedProd ? ((matchedProd.base_price || 0) * (item.quantity || 0)) : 0;
                              totalValue += itemTotal;

                              return (
                                <tr key={i} style={{ borderBottom: `1px solid ${THEME.colors.border}` }}>
                                  <td style={{ padding: '1rem 0.5rem', width: '25%', backgroundColor: '#F9FAFB' }}>
                                    <div style={{ fontSize: '0.85rem', color: '#4B5563', textTransform: 'uppercase', fontWeight: 700 }}>
                                      {item.originalName}
                                    </div>
                                  </td>
                                  <td style={{ padding: '1rem 0.5rem', textAlign: 'center', width: '10%', backgroundColor: '#F9FAFB' }}>
                                    <div style={{ fontSize: '1rem', color: '#4B5563', fontWeight: 800 }}>
                                      {item.originalQuantity || item.quantity}
                                    </div>
                                  </td>
                                  <td style={{ padding: '1rem 0.5rem', width: '30%' }}>
                                    <input
                                      list={`products-list-${i}`}
                                      value={matchedProd ? matchedProd.name : (item.searchQuery || '')}
                                      placeholder="-- Buscar Producto --"
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        const found = products.find(p => p.name === val);
                                        const newEdits = [...editableItems];
                                        if (found) {
                                          newEdits[i].matched_product_id = found.id;
                                          newEdits[i].searchQuery = found.name;
                                        } else {
                                          newEdits[i].matched_product_id = null;
                                          newEdits[i].searchQuery = val;
                                        }
                                        setEditableItems(newEdits);
                                      }}
                                      style={{
                                        width: '100%',
                                        padding: '0.5rem',
                                        borderRadius: '6px',
                                        border: '1px solid #D1D5DB',
                                        fontSize: '0.9rem',
                                        backgroundColor: item.matched_product_id ? '#ECFDF5' : '#FEF2F2',
                                        fontWeight: 600,
                                        color: '#111827'
                                      }}
                                    />
                                    <datalist id={`products-list-${i}`}>
                                      {products.map(p => (
                                        <option key={p.id} value={p.name} />
                                      ))}
                                    </datalist>
                                  </td>
                                  <td style={{ padding: '1rem 0.5rem', textAlign: 'center', width: '15%' }}>
                                    <input 
                                      type="number"
                                      value={item.quantity === 0 ? '' : item.quantity}
                                      onChange={(e) => {
                                        const newEdits = [...editableItems];
                                        newEdits[i].quantity = parseFloat(e.target.value) || 0;
                                        setEditableItems(newEdits);
                                      }}
                                      style={{
                                        width: '60px',
                                        padding: '0.5rem',
                                        textAlign: 'center',
                                        borderRadius: '6px',
                                        border: '1px solid #10B981',
                                        fontWeight: 800,
                                        fontSize: '1rem'
                                      }}
                                    />
                                  </td>
                                  <td style={{ padding: '1.2rem 0.5rem', textAlign: 'right', color: '#4B5563', fontWeight: 600 }}>
                                    {matchedProd ? formatMoney(matchedProd.base_price || 0) : '-'}
                                  </td>
                                  <td style={{ padding: '1.2rem 0.5rem', textAlign: 'right', fontWeight: 800, color: '#059669', fontSize: '1.1rem' }}>
                                    {matchedProd ? formatMoney(itemTotal) : '-'}
                                  </td>
                                </tr>
                              );
                            })}
                            <tr style={{ backgroundColor: '#F8FAFC' }}>
                              <td colSpan={3} style={{ padding: '1.5rem 1rem', textAlign: 'right', fontWeight: 900, color: '#475569', fontSize: '0.85rem', letterSpacing: '0.05em' }}>
                                TOTAL ESTIMADO
                              </td>
                              <td style={{ padding: '1.5rem 1rem', textAlign: 'right', fontWeight: 900, color: '#059669', fontSize: '1.6rem' }}>
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

              {/* Cuerpo del correo oculto en un acordeón al final */}
              <details style={{ backgroundColor: '#F3F4F6', borderRadius: '8px', padding: '0.5rem 1rem', cursor: 'pointer', border: '1px solid #E5E7EB' }}>
                <summary style={{ fontWeight: 700, color: '#4B5563', fontSize: '0.85rem', outline: 'none' }}>Ver texto original del correo enviado por el cliente</summary>
                <div style={{ padding: '1rem 0 0.5rem 0', fontSize: '0.85rem', color: '#6B7280', whiteSpace: 'pre-wrap', cursor: 'text' }}>
                  {selectedDraft.email_body || '(Sin cuerpo)'}
                </div>
              </details>

            </div>

            {/* Modal Footer */}
            <div style={{ padding: '1.5rem', borderTop: `1px solid ${THEME.colors.border}`, display: 'flex', justifyContent: 'flex-end', gap: '1rem', backgroundColor: '#F9FAFB', borderBottomLeftRadius: THEME.radius.xl, borderBottomRightRadius: THEME.radius.xl }}>
              <button 
                onClick={() => setSelectedDraft(null)}
                style={{ padding: '0.75rem 1.5rem', backgroundColor: 'white', border: `1px solid ${THEME.colors.border}`, borderRadius: '10px', fontWeight: 600, color: '#4B5563', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button 
                onClick={handleApprove}
                disabled={saving}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: THEME.colors.primary,
                  color: 'white',
                  borderRadius: '10px',
                  fontWeight: '700',
                  border: 'none',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.7 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {saving ? 'Procesando...' : 'Aprobar y Procesar Pedido'} <ArrowRight size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
