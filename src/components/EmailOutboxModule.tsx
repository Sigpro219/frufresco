'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { THEME, formatMoney } from '@/lib/adminTheme';
import { Mail, Search, RefreshCw, Eye, X, Send } from 'lucide-react';

export default function EmailOutboxModule() {
  const [emails, setEmails] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmail, setSelectedEmail] = useState<any | null>(null);

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
      setEmails(data || []);
    } catch (err) {
      console.error('Error fetching outbox emails:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredEmails = emails.filter(email => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      (email.to_email || '').toLowerCase().includes(query) ||
      (email.subject || '').toLowerCase().includes(query) ||
      (email.status || '').toLowerCase().includes(query)
    );
  });

  return (
    <div>
      {/* Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
          <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', display: 'flex', alignItems: 'center' }}>
            <Search size={16} />
          </span>
          <input
            type="text"
            placeholder="Buscar por destinatario, asunto..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.6rem 1rem 0.6rem 2.2rem',
              borderRadius: '10px',
              border: `1.5px solid ${THEME.colors.border}`,
              fontSize: '0.85rem',
              fontWeight: 600,
              outline: 'none',
              transition: 'border-color 0.2s',
              backgroundColor: 'white',
              color: '#111827'
            }}
            onFocus={(e) => e.target.style.borderColor = THEME.colors.primary}
            onBlur={(e) => e.target.style.borderColor = THEME.colors.border}
          />
        </div>

        <button
          onClick={fetchEmails}
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '0.6rem 1.2rem',
            backgroundColor: 'white',
            border: `1.5px solid ${THEME.colors.border}`,
            borderRadius: '10px',
            fontWeight: 700,
            fontSize: '0.85rem',
            color: '#4B5563',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F9FAFB'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Cargando...' : 'Actualizar'}
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#6B7280', fontWeight: 600 }}>
          Cargando bandeja de salida...
        </div>
      ) : filteredEmails.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '4rem 2rem',
          backgroundColor: '#F9FAFB',
          borderRadius: '12px',
          border: '1px dashed #D1D5DB',
          color: '#9CA3AF'
        }}>
          <Mail size={40} style={{ opacity: 0.3, marginBottom: '1rem', color: '#9CA3AF' }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#4B5563', margin: '0 0 4px 0' }}>Bandeja de Salida Vacía</h3>
          <p style={{ margin: 0, fontSize: '0.85rem' }}>No se han encontrado correos enviados en el historial.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: `1px solid ${THEME.colors.border}`, borderRadius: '12px', backgroundColor: 'white' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8FAFB', borderBottom: `2px solid ${THEME.colors.border}` }}>
                <th style={{ padding: '1rem', fontWeight: 800, color: '#4B5563', width: '20%', fontSize: '0.75rem', letterSpacing: '0.05em' }}>FECHA / HORA</th>
                <th style={{ padding: '1rem', fontWeight: 800, color: '#4B5563', width: '25%', fontSize: '0.75rem', letterSpacing: '0.05em' }}>DESTINATARIO</th>
                <th style={{ padding: '1rem', fontWeight: 800, color: '#4B5563', width: '35%', fontSize: '0.75rem', letterSpacing: '0.05em' }}>ASUNTO</th>
                <th style={{ padding: '1rem', fontWeight: 800, color: '#4B5563', width: '12%', textAlign: 'center', fontSize: '0.75rem', letterSpacing: '0.05em' }}>ESTADO</th>
                <th style={{ padding: '1rem', fontWeight: 800, color: '#4B5563', width: '8%', textAlign: 'center' }}></th>
              </tr>
            </thead>
            <tbody>
              {filteredEmails.map((email) => {
                const date = new Date(email.sent_at || email.created_at || Date.now());
                const isSimulated = email.subject?.toLowerCase().includes('(simulado)') || email.message?.text?.includes('[SIMULADO]');
                const status = email.status || 'sent';

                return (
                  <tr key={email.id} style={{ borderBottom: `1px solid ${THEME.colors.border}`, transition: 'background-color 0.15s' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F9FAFB'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                    <td style={{ padding: '1rem', fontWeight: 600, color: '#374151' }}>
                      {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ padding: '1rem', fontWeight: 700, color: '#111827' }}>
                      {email.to_email}
                    </td>
                    <td style={{ padding: '1rem', color: '#4B5563', fontWeight: 500 }}>
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
            {/* Modal Header */}
            <div style={{ padding: '1.5rem', borderBottom: `1px solid ${THEME.colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#111827', fontWeight: 800 }}>{selectedEmail.subject}</h3>
                <p style={{ margin: '4px 0 0 0', color: '#6B7280', fontSize: '0.8rem', fontWeight: 600 }}>Para: {selectedEmail.to_email}</p>
              </div>
              <button onClick={() => setSelectedEmail(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', display: 'flex', alignItems: 'center' }}>
                <X size={24} />
              </button>
            </div>

            {/* Modal Body (Email HTML Preview) */}
            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, backgroundColor: '#F8FAFC' }}>
              {selectedEmail.message?.html ? (
                <div style={{ border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden', backgroundColor: 'white' }}>
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
                  border: '1px solid #E2E8F0',
                  borderRadius: '12px',
                  padding: '2rem',
                  fontSize: '0.9rem',
                  lineHeight: '1.6',
                  color: '#334155',
                  whiteSpace: 'pre-wrap',
                  minHeight: '200px'
                }}>
                  {selectedEmail.message?.text || 'Sin contenido de texto alternativo'}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '1.25rem 1.5rem', borderTop: `1px solid ${THEME.colors.border}`, display: 'flex', justifyContent: 'flex-end', backgroundColor: '#F9FAFB', borderBottomLeftRadius: '16px', borderBottomRightRadius: '16px' }}>
              <button
                onClick={() => setSelectedEmail(null)}
                style={{
                  padding: '0.5rem 1.25rem',
                  backgroundColor: 'white',
                  border: `1.5px solid ${THEME.colors.border}`,
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  color: '#4B5563',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F9FAFB'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'white'}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
