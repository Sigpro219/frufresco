'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { THEME, formatMoney } from '@/lib/adminTheme';
import { Mail, Search, RefreshCw, Eye, X, Send, Calendar, Trash2 } from 'lucide-react';

interface EmailOutboxModuleProps {
  onOutboxChange?: (count: number) => void;
}

export default function EmailOutboxModule({ onOutboxChange }: EmailOutboxModuleProps = {}) {
  const [emails, setEmails] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedEmail, setSelectedEmail] = useState<any | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; emailId: string | null }>({ isOpen: false, emailId: null });
  const [deleting, setDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const handleDeleteEmail = async () => {
    if (!deleteConfirm.emailId) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('mail')
        .delete()
        .eq('id', deleteConfirm.emailId);

      if (error) throw error;

      const updatedList = emails.filter(email => email.id !== deleteConfirm.emailId);
      setEmails(updatedList);
      if (onOutboxChange) {
        onOutboxChange(updatedList.length);
      }

      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast('Correo eliminado con éxito de la bandeja de salida', 'success');
      }
    } catch (err: any) {
      console.error('Error deleting email:', err);
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast('Error al eliminar el correo: ' + (err.message || err), 'error');
      }
    } finally {
      setDeleting(false);
      setDeleteConfirm({ isOpen: false, emailId: null });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    setBulkDeleting(true);
    try {
      const { error } = await supabase
        .from('mail')
        .delete()
        .in('id', selectedIds);

      if (error) throw error;

      const updatedList = emails.filter(email => !selectedIds.includes(email.id));
      setEmails(updatedList);
      setSelectedIds([]);
      if (onOutboxChange) {
        onOutboxChange(updatedList.length);
      }

      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast(`${selectedIds.length} correos eliminados de la bandeja de salida`, 'success');
      }
    } catch (err: any) {
      console.error('Error bulk deleting emails:', err);
      if (typeof window !== 'undefined' && (window as any).showToast) {
        (window as any).showToast('Error al eliminar los correos: ' + (err.message || err), 'error');
      }
    } finally {
      setBulkDeleting(false);
      setBulkDeleteConfirm(false);
    }
  };
 
  useEffect(() => {
    fetchEmails();
  }, []);

  const fetchEmails = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('mail')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const list = data || [];
      setEmails(list);
      if (onOutboxChange) {
        onOutboxChange(list.length);
      }
    } catch (err) {
      console.error('Error fetching outbox emails:', err);
    } finally {
      setLoading(false);
    }
  };

  const stateRef = useRef({
    selectedEmail,
    deleteConfirm,
    bulkDeleteConfirm,
    selectedIds
  });

  useEffect(() => {
    stateRef.current = {
      selectedEmail,
      deleteConfirm,
      bulkDeleteConfirm,
      selectedIds
    };
  }, [selectedEmail, deleteConfirm, bulkDeleteConfirm, selectedIds]);

  const actionsRef = useRef({ handleDeleteEmail, handleBulkDelete });
  useEffect(() => {
    actionsRef.current = { handleDeleteEmail, handleBulkDelete };
  }, [handleDeleteEmail, handleBulkDelete]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;

      const {
        selectedEmail,
        deleteConfirm,
        bulkDeleteConfirm,
        selectedIds
      } = stateRef.current;

      const isTextInput = (target.tagName === 'INPUT' && (
        (target as HTMLInputElement).type === 'text' ||
        (target as HTMLInputElement).type === 'number' ||
        (target as HTMLInputElement).type === 'search' ||
        (target as HTMLInputElement).type === 'email' ||
        (target as HTMLInputElement).type === 'password'
      )) || target.tagName === 'TEXTAREA';

      const isBypassKey = e.key === 'Escape' ||
        (e.key === 'Enter' && (!!selectedEmail || deleteConfirm.isOpen || bulkDeleteConfirm)) ||
        (e.key === 'Delete' && !isTextInput && (deleteConfirm.isOpen || bulkDeleteConfirm || selectedIds.length > 0 || !!selectedEmail));

      if ((target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') && !isBypassKey) return;

      if (e.key === 'Escape') {
        if (bulkDeleteConfirm) { setBulkDeleteConfirm(false); return; }
        if (deleteConfirm.isOpen) { setDeleteConfirm({ isOpen: false, emailId: null }); return; }
        if (selectedEmail) { setSelectedEmail(null); return; }
      }

      if (e.key === 'Enter') {
        if (bulkDeleteConfirm) {
          e.preventDefault();
          actionsRef.current.handleBulkDelete();
          return;
        }
        if (deleteConfirm.isOpen) {
          e.preventDefault();
          actionsRef.current.handleDeleteEmail();
          return;
        }
        if (selectedEmail) {
          e.preventDefault();
          setSelectedEmail(null);
          return;
        }
      }

      if (e.key === 'Delete') {
        if (bulkDeleteConfirm) {
          e.preventDefault();
          actionsRef.current.handleBulkDelete();
          return;
        }
        if (deleteConfirm.isOpen) {
          e.preventDefault();
          actionsRef.current.handleDeleteEmail();
          return;
        }
        if (selectedEmail) {
          e.preventDefault();
          setSelectedEmail(null);
          return;
        }
        if (selectedIds.length > 0 && !deleteConfirm.isOpen && !bulkDeleteConfirm) {
          e.preventDefault();
          setBulkDeleteConfirm(true);
          return;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const filteredEmails = emails.filter(email => {
    // 1. Search Query
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch = !query || 
      (email.to_email || '').toLowerCase().includes(query) ||
      (email.subject || '').toLowerCase().includes(query) ||
      (email.status || '').toLowerCase().includes(query);

    // 2. Date Filter
    let matchesDate = true;
    if (selectedDate) {
      const emailDate = new Date(email.sent_at || email.created_at || Date.now()).toISOString().split('T')[0];
      matchesDate = emailDate === selectedDate;
    }

    return matchesSearch && matchesDate;
  });

  return (
    <div>
      {/* Controls */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flex: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Date Filter */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            backgroundColor: 'white', 
            border: `1px solid ${THEME.colors.border}`, 
            borderRadius: '10px',
            padding: '0.5rem 0.8rem',
            gap: '8px',
            height: '38px',
            boxSizing: 'border-box'
          }}>
            <Calendar size={16} color={THEME.colors.textSecondary} />
            <input 
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{
                border: 'none',
                outline: 'none',
                fontWeight: 800,
                fontSize: '0.85rem',
                color: THEME.colors.textMain,
                fontFamily: 'inherit',
                cursor: 'pointer'
              }}
            />
            {selectedDate && (
              <button 
                onClick={() => setSelectedDate('')}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: THEME.colors.textSecondary,
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Search Input */}
          <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: THEME.colors.textSecondary, display: 'flex', alignItems: 'center' }}>
              <Search size={16} />
            </span>
            <input
              type="text"
              placeholder="Buscar por destinatario, asunto..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 1rem 0.5rem 2.2rem',
                borderRadius: '10px',
                border: `1.5px solid ${THEME.colors.border}`,
                fontSize: '0.85rem',
                fontWeight: 600,
                outline: 'none',
                transition: 'border-color 0.2s',
                backgroundColor: 'white',
                color: THEME.colors.textMain,
                height: '38px',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => e.target.style.borderColor = THEME.colors.primary}
              onBlur={(e) => e.target.style.borderColor = THEME.colors.border}
            />             {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: THEME.colors.textSecondary,
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {selectedIds.length > 0 && (
            <button
              onClick={() => setBulkDeleteConfirm(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '0.5rem 1.2rem',
                backgroundColor: '#FEF2F2',
                border: '1.5px solid #FCA5A5',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '0.85rem',
                color: '#EF4444',
                cursor: 'pointer',
                transition: 'all 0.2s',
                height: '38px',
                boxSizing: 'border-box'
              }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#FEE2E2'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = '#FEF2F2'}
            >
              <Trash2 size={14} />
              Eliminar seleccionados ({selectedIds.length})
            </button>
          )}
        </div>

        <button
          onClick={fetchEmails}
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '0.5rem 1.2rem',
            backgroundColor: 'white',
            border: `1.5px solid ${THEME.colors.border}`,
            borderRadius: '10px',
            fontWeight: 700,
            fontSize: '0.85rem',
            color: THEME.colors.textSecondary,
            cursor: 'pointer',
            transition: 'all 0.2s',
            height: '38px',
            boxSizing: 'border-box'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = THEME.colors.background}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Cargando...' : 'Actualizar'}
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: THEME.colors.textSecondary, fontWeight: 600 }}>
          Cargando bandeja de salida...
        </div>
      ) : filteredEmails.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '4rem 2rem',
          backgroundColor: THEME.colors.background,
          borderRadius: '12px',
          border: `1px dashed ${THEME.colors.border}`,
          color: THEME.colors.textSecondary
        }}>
          <Mail size={40} style={{ opacity: 0.3, marginBottom: '1rem', color: THEME.colors.textSecondary }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: THEME.colors.textSecondary, margin: '0 0 4px 0' }}>Bandeja de Salida Vacía</h3>
          <p style={{ margin: 0, fontSize: '0.85rem' }}>No se han encontrado correos enviados en el historial.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: `1px solid ${THEME.colors.border}`, borderRadius: '12px', backgroundColor: 'white' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', textAlign: 'left' }}>             <thead>
              <tr style={{ backgroundColor: THEME.colors.background, borderBottom: `2px solid ${THEME.colors.border}` }}>
                <th style={{ padding: '1rem', width: '40px', textAlign: 'center' }}>
                  <input 
                    type="checkbox"
                    checked={filteredEmails.length > 0 && selectedIds.length === filteredEmails.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(filteredEmails.map(email => email.id));
                      } else {
                        setSelectedIds([]);
                      }
                    }}
                    style={{ transform: 'scale(1.2)', cursor: 'pointer' }}
                  />
                </th>
                <th style={{ padding: '1rem', fontWeight: 800, color: THEME.colors.textSecondary, width: '20%', fontSize: '0.75rem', letterSpacing: '0.05em' }}>FECHA / HORA</th>
                <th style={{ padding: '1rem', fontWeight: 800, color: THEME.colors.textSecondary, width: '25%', fontSize: '0.75rem', letterSpacing: '0.05em' }}>DESTINATARIO</th>
                <th style={{ padding: '1rem', fontWeight: 800, color: THEME.colors.textSecondary, width: '35%', fontSize: '0.75rem', letterSpacing: '0.05em' }}>ASUNTO</th>
                <th style={{ padding: '1rem', fontWeight: 800, color: THEME.colors.textSecondary, width: '12%', textAlign: 'center', fontSize: '0.75rem', letterSpacing: '0.05em' }}>ESTADO</th>
                <th style={{ padding: '1rem', fontWeight: 800, color: THEME.colors.textSecondary, width: '8%', textAlign: 'center' }}></th>
              </tr>
            </thead>
            <tbody>
              {filteredEmails.map((email) => {
                const date = new Date(email.sent_at || email.created_at || Date.now());
                const isSimulated = email.subject?.toLowerCase().includes('(simulado)') || email.message?.text?.includes('[SIMULADO]');
                const status = email.status || 'sent';

                return (                   <tr key={email.id} style={{ borderBottom: `1px solid ${THEME.colors.border}`, transition: 'background-color 0.15s' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = THEME.colors.background} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      <input 
                        type="checkbox"
                        checked={selectedIds.includes(email.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds(prev => [...prev, email.id]);
                          } else {
                            setSelectedIds(prev => prev.filter(id => id !== email.id));
                          }
                        }}
                        style={{ transform: 'scale(1.2)', cursor: 'pointer' }}
                      />
                    </td>
                    <td style={{ padding: '1rem', fontWeight: 600, color: THEME.colors.textMain }}>
                      {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ padding: '1rem', fontWeight: 700, color: THEME.colors.textMain }}>
                      {email.to_email}
                    </td>
                    <td style={{ padding: '1rem', color: THEME.colors.textSecondary, fontWeight: 500 }}>
                      {email.subject}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      {status === 'failed' ? (
                        <span style={{ backgroundColor: '#FDE8E8', color: '#9B1C1C', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 800 }}>FALLIDO</span>
                      ) : isSimulated ? (
                        <span style={{ backgroundColor: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 800 }}>SIMULADO</span>
                      ) : (
                        <span style={{ backgroundColor: '#DEF7EC', color: '#03543F', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 800 }}>ENVIADO</span>
                      )}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
                        <button
                          onClick={() => setSelectedEmail(email)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: THEME.colors.primary,
                            cursor: 'pointer',
                            padding: '4px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            borderRadius: '4px',
                            transition: 'background-color 0.2s'
                          }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#ECFDF5'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                          title="Ver correo enviado"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm({ isOpen: true, emailId: email.id })}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#EF4444',
                            cursor: 'pointer',
                            padding: '4px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            borderRadius: '4px',
                            transition: 'background-color 0.2s'
                          }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#FEF2F2'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                          title="Eliminar registro"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Modal */}
      {selectedEmail && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '2rem'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '700px',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            textAlign: 'left'
          }}>
            {/* Modal Header */}             <div style={{ padding: '1.5rem', borderBottom: `1px solid ${THEME.colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', color: THEME.colors.textMain, fontWeight: 800 }}>{selectedEmail.subject}</h3>
                <p style={{ margin: '4px 0 0 0', color: THEME.colors.textSecondary, fontSize: '0.8rem', fontWeight: 600 }}>Para: {selectedEmail.to_email}</p>
              </div>
              <button onClick={() => setSelectedEmail(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: THEME.colors.textSecondary, display: 'flex', alignItems: 'center' }}>
                <X size={24} />
              </button>
            </div>

            {/* Modal Body (Email HTML Preview) */}
            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, backgroundColor: THEME.colors.background }}>
              {selectedEmail.message?.html ? (
                <div style={{ border: `1px solid ${THEME.colors.border}`, borderRadius: '12px', overflow: 'hidden', backgroundColor: 'white' }}>
                  <iframe
                    srcDoc={selectedEmail.message.html}
                    title="Vista previa del correo"
                    style={{
                      width: '100%',
                      height: '500px',
                      border: 'none',
                      display: 'block'
                    }}
                  />
                </div>
              ) : (
                <div style={{
                  backgroundColor: 'white',
                  border: `1px solid ${THEME.colors.border}`,
                  borderRadius: '12px',
                  padding: '2rem',
                  fontSize: '0.9rem',
                  lineHeight: '1.6',
                  color: THEME.colors.textMain,
                  whiteSpace: 'pre-wrap',
                  minHeight: '200px'
                }}>
                  {selectedEmail.message?.text || 'Sin contenido de texto alternativo'}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '1.25rem 1.5rem', borderTop: `1px solid ${THEME.colors.border}`, display: 'flex', justifyContent: 'flex-end', backgroundColor: THEME.colors.background, borderBottomLeftRadius: '16px', borderBottomRightRadius: '16px' }}>
              <button
                onClick={() => setSelectedEmail(null)}
                style={{
                  padding: '0.5rem 1.25rem',
                  backgroundColor: 'white',
                  border: `1.5px solid ${THEME.colors.border}`,
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  color: THEME.colors.textSecondary,
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = THEME.colors.background}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'white'}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm.isOpen && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '2rem'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '450px',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            textAlign: 'left',
            padding: '1.5rem'
          }}>             <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.2rem', color: THEME.colors.textMain, fontWeight: 800 }}>
              ¿Eliminar registro de correo?
            </h3>
            <p style={{ margin: '0 0 1.5rem 0', color: THEME.colors.textSecondary, fontSize: '0.9rem', lineHeight: '1.5' }}>
              Esta acción eliminará de forma permanente el registro de este correo enviado de la bandeja de salida. No se puede deshacer.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                onClick={() => setDeleteConfirm({ isOpen: false, emailId: null })}
                disabled={deleting}
                style={{
                  padding: '0.5rem 1.25rem',
                  backgroundColor: 'white',
                  border: `1.5px solid ${THEME.colors.border}`,
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  color: THEME.colors.textSecondary,
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s'
                }}
                onMouseEnter={e => !deleting && (e.currentTarget.style.backgroundColor = THEME.colors.background)}
                onMouseLeave={e => !deleting && (e.currentTarget.style.backgroundColor = 'white')}
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteEmail}
                disabled={deleting}
                style={{
                  padding: '0.5rem 1.25rem',
                  backgroundColor: deleting ? '#FDA4AF' : '#EF4444',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  color: 'white',
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s'
                }}
                onMouseEnter={e => !deleting && (e.currentTarget.style.backgroundColor = '#DC2626')}
                onMouseLeave={e => !deleting && (e.currentTarget.style.backgroundColor = '#EF4444')}
              >
                {deleting ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {bulkDeleteConfirm && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '2rem'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '450px',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            textAlign: 'left',
            padding: '1.5rem'
          }}>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.2rem', color: THEME.colors.textMain, fontWeight: 800 }}>
              ¿Eliminar correos seleccionados?
            </h3>
            <p style={{ margin: '0 0 1.5rem 0', color: THEME.colors.textSecondary, fontSize: '0.9rem', lineHeight: '1.5' }}>
              Esta acción eliminará de forma permanente los <strong>{selectedIds.length}</strong> correos seleccionados de la bandeja de salida. No se puede deshacer.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                onClick={() => setBulkDeleteConfirm(false)}
                disabled={bulkDeleting}
                style={{
                  padding: '0.5rem 1.25rem',
                  backgroundColor: 'white',
                  border: `1.5px solid ${THEME.colors.border}`,
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  color: THEME.colors.textSecondary,
                  cursor: bulkDeleting ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s'
                }}
                onMouseEnter={e => !bulkDeleting && (e.currentTarget.style.backgroundColor = THEME.colors.background)}
                onMouseLeave={e => !bulkDeleting && (e.currentTarget.style.backgroundColor = 'white')}
              >
                Cancelar
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                style={{
                  padding: '0.5rem 1.25rem',
                  backgroundColor: bulkDeleting ? '#FDA4AF' : '#EF4444',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  color: 'white',
                  cursor: bulkDeleting ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s'
                }}
                onMouseEnter={e => !bulkDeleting && (e.currentTarget.style.backgroundColor = '#DC2626')}
                onMouseLeave={e => !bulkDeleting && (e.currentTarget.style.backgroundColor = '#EF4444')}
              >
                {bulkDeleting ? 'Eliminando...' : 'Sí, eliminar seleccionados'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
