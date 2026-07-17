'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { THEME } from '@/lib/adminTheme';
import { Mail, Search, Paperclip, Send, UserCheck, Plus, CornerUpLeft, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function CommercialInboxModule() {
    const [emails, setEmails] = useState<any[]>([]);
    const [selectedEmail, setSelectedEmail] = useState<any>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [replyText, setReplyText] = useState('');
    const [sendingReply, setSendingReply] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchEmails();
    }, []);

    const fetchEmails = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('mail')
                .select('*')
                .eq('inbox_type', 'commercial')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setEmails(data || []);
            
            // If there's an email selected already, refresh its reference
            if (selectedEmail) {
                const refreshed = data?.find(m => m.id === selectedEmail.id);
                if (refreshed) setSelectedEmail(refreshed);
            }
        } catch (err) {
            console.error('Error fetching commercial emails:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectEmail = async (email: any) => {
        setSelectedEmail(email);
        setReplyText('');

        // Mark as read (status: 'read') if it is currently 'pending' or 'received'
        if (email.status === 'pending' || email.status === 'received') {
            try {
                const { error } = await supabase
                    .from('mail')
                    .update({ status: 'read' })
                    .eq('id', email.id);

                if (!error) {
                    // Update locally
                    setEmails(prev => prev.map(m => m.id === email.id ? { ...m, status: 'read' } : m));
                }
            } catch (err) {
                console.error('Error marking email as read:', err);
            }
        }
    };

    const handleSendReply = async () => {
        if (!replyText.trim() || !selectedEmail) return;
        setSendingReply(true);

        try {
            const response = await fetch('/api/mail/send-reply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    originalMailId: selectedEmail.id,
                    toEmail: selectedEmail.sender_email,
                    subject: selectedEmail.subject.startsWith('Re:') ? selectedEmail.subject : `Re: ${selectedEmail.subject}`,
                    message: replyText
                })
            });

            const resData = await response.json();

            if (!response.ok) {
                throw new Error(resData.error || 'Failed to send reply');
            }

            alert('🎉 Respuesta enviada con éxito');
            setReplyText('');
            await fetchEmails();
        } catch (err: any) {
            console.error('Error sending reply:', err);
            alert('Error al enviar respuesta: ' + err.message);
        } finally {
            setSendingReply(false);
        }
    };

    // Filtered list
    const filteredEmails = emails.filter(m => {
        const term = searchTerm.toLowerCase();
        return (
            m.sender_email?.toLowerCase().includes(term) ||
            m.subject?.toLowerCase().includes(term) ||
            (m.message?.text || m.payload?.plain)?.toLowerCase().includes(term)
        );
    });

    // Helper to get initials
    const getInitials = (emailStr: string) => {
        if (!emailStr) return 'C';
        const parts = emailStr.split('@')[0].split(/[._-]/);
        return parts.map(p => p[0]?.toUpperCase()).slice(0, 2).join('');
    };

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', height: '100%', backgroundColor: '#F8FAFC' }}>
            
            {/* EMAIL LIST SIDEBAR */}
            <div style={{ borderRight: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', backgroundColor: 'white', height: '100%' }}>
                <div style={{ padding: '1rem', borderBottom: '1px solid #E2E8F0' }}>
                    <div style={{ position: 'relative' }}>
                        <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                        <input 
                            type="text" 
                            placeholder="Buscar en el buzón..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ 
                                width: '100%', 
                                padding: '10px 12px 10px 36px', 
                                borderRadius: '12px', 
                                border: '1px solid #E2E8F0', 
                                outline: 'none',
                                fontSize: '0.85rem',
                                backgroundColor: '#F8FAFC'
                            }} 
                        />
                    </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {loading ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: '#64748B', fontSize: '0.9rem' }}>Cargando correos...</div>
                    ) : filteredEmails.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: '#94A3B8', fontSize: '0.85rem', fontStyle: 'italic' }}>
                            No se encontraron correos comerciales.
                        </div>
                    ) : (
                        filteredEmails.map((email) => {
                            const isSelected = selectedEmail?.id === email.id;
                            const isUnread = email.status === 'pending' || email.status === 'received';
                            return (
                                <div
                                    key={email.id}
                                    onClick={() => handleSelectEmail(email)}
                                    style={{
                                        padding: '1.2rem',
                                        borderBottom: '1px solid #F1F5F9',
                                        cursor: 'pointer',
                                        backgroundColor: isSelected ? '#F0FDF4' : 'transparent',
                                        transition: 'background-color 0.2s',
                                        position: 'relative'
                                    }}
                                >
                                    {isUnread && (
                                        <div style={{ 
                                            position: 'absolute', 
                                            left: '4px', 
                                            top: '50%', 
                                            transform: 'translateY(-50%)', 
                                            width: '6px', 
                                            height: '6px', 
                                            borderRadius: '50%', 
                                            backgroundColor: '#16A34A' 
                                        }} />
                                    )}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <span style={{ 
                                            fontSize: '0.85rem', 
                                            fontWeight: isUnread ? '700' : '600', 
                                            color: isUnread ? '#1E293B' : '#475569',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            maxWidth: '180px'
                                        }}>
                                            {email.sender_email}
                                        </span>
                                        <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>
                                            {new Date(email.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                        </span>
                                    </div>
                                    <div style={{ 
                                        fontSize: '0.8rem', 
                                        fontWeight: isUnread ? '700' : '500', 
                                        color: '#334155',
                                        marginBottom: '6px',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis'
                                    }}>
                                        {email.subject || '(Sin Asunto)'}
                                    </div>
                                    <div style={{ 
                                        fontSize: '0.75rem', 
                                        color: '#64748B', 
                                        display: '-webkit-box',
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        lineHeight: '1.4'
                                    }}>
                                        {email.message?.text || email.payload?.plain || ''}
                                    </div>
                                    
                                    {/* Action tags */}
                                    <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                                        {email.inbox_type && (
                                            <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#F1F5F9', color: '#475569', fontWeight: 'bold' }}>
                                                {email.inbox_type.toUpperCase()}
                                            </span>
                                        )}
                                        {email.status === 'replied' && (
                                            <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#ECFDF5', color: '#047857', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                                <CheckCircle2 size={10} /> RESPONDIDO
                                            </span>
                                        )}
                                        {!email.is_inbound && (
                                            <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#EFF6FF', color: '#1D4ED8', fontWeight: 'bold' }}>
                                                SALIENTE
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* DETAIL & REPLY VIEW */}
            <div style={{ backgroundColor: '#F8FAFC', display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
                {!selectedEmail ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: '#94A3B8' }}>
                        <Mail size={48} strokeWidth={1} style={{ marginBottom: '1rem', color: '#CBD5E1' }} />
                        <h3 style={{ margin: 0, fontWeight: '700', fontSize: '1.1rem', color: '#64748B' }}>Bandeja Comercial Activa</h3>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', textAlign: 'center', maxWidth: '300px' }}>
                            Selecciona cualquier conversación de la izquierda para ver su detalle, descargar adjuntos o redactar respuestas comerciales.
                        </p>
                    </div>
                ) : (
                    <div style={{ padding: '2rem', maxWidth: '900px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                        
                        {/* EMAIL HEADER */}
                        <div style={{ backgroundColor: 'white', borderRadius: '24px', padding: '2rem', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                    <div style={{ 
                                        width: '48px', 
                                        height: '48px', 
                                        borderRadius: '50%', 
                                        backgroundColor: selectedEmail.is_inbound ? '#F0FDF4' : '#EFF6FF', 
                                        color: selectedEmail.is_inbound ? '#16A34A' : '#1D4ED8',
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'center',
                                        fontWeight: '800',
                                        fontSize: '1rem',
                                        border: `1px solid ${selectedEmail.is_inbound ? '#BBF7D0' : '#DBEAFE'}`
                                    }}>
                                        {getInitials(selectedEmail.sender_email)}
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '1rem', fontWeight: '800', color: '#1E293B' }}>{selectedEmail.sender_email}</div>
                                        <div style={{ fontSize: '0.8rem', color: '#64748B', display: 'flex', gap: '8px' }}>
                                            <span>Para: {selectedEmail.to_email || 'Buzón Comercial'}</span>
                                            <span>•</span>
                                            <span>{new Date(selectedEmail.created_at).toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>
                                
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    {selectedEmail.lead_id ? (
                                        <Link href={`/admin/commercial/quotes/create?leadId=${selectedEmail.lead_id}`} style={{ textDecoration: 'none' }}>
                                            <button style={{ padding: '8px 16px', backgroundColor: '#111827', color: 'white', border: 'none', borderRadius: '12px', fontWeight: '800', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                                                <Plus size={14} /> CREAR COTIZACIÓN
                                            </button>
                                        </Link>
                                    ) : (
                                        <button 
                                            onClick={() => alert('Para crear una cotización directa, vincula este remitente a un Prospecto/Lead del CRM.')}
                                            style={{ padding: '8px 16px', backgroundColor: '#F1F5F9', color: '#94A3B8', border: '1px solid #E2E8F0', borderRadius: '12px', fontWeight: '800', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'not-allowed' }}
                                        >
                                            <Plus size={14} /> CREAR COTIZACIÓN
                                        </button>
                                    )}
                                </div>
                            </div>

                            <h1 style={{ fontSize: '1.4rem', fontWeight: '900', color: '#1E293B', margin: '0 0 1rem 0', lineHeight: '1.3' }}>
                                {selectedEmail.subject || '(Sin Asunto)'}
                            </h1>

                            {/* ATTACHMENTS SECTION */}
                            {selectedEmail.payload?.attachments && selectedEmail.payload.attachments.length > 0 && (
                                <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '1rem', marginTop: '1rem' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Paperclip size={12} /> Adjuntos ({selectedEmail.payload.attachments.length})
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        {selectedEmail.payload.attachments.map((att: any, idx: number) => {
                                            const hasBase64 = !!att.content;
                                            const downloadUrl = hasBase64 
                                                ? `data:${att.content_type || 'application/octet-stream'};base64,${att.content}`
                                                : att.url;

                                            return (
                                                <a 
                                                    key={idx} 
                                                    href={downloadUrl} 
                                                    download={att.filename || 'adjunto'}
                                                    style={{ 
                                                        display: 'flex', 
                                                        alignItems: 'center', 
                                                        gap: '8px', 
                                                        padding: '8px 12px', 
                                                        backgroundColor: '#F8FAFC', 
                                                        border: '1px solid #E2E8F0', 
                                                        borderRadius: '8px', 
                                                        color: '#334155', 
                                                        fontSize: '0.8rem', 
                                                        fontWeight: '700', 
                                                        textDecoration: 'none',
                                                        transition: 'border-color 0.2s'
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.borderColor = THEME.colors.primary}
                                                    onMouseLeave={(e) => e.currentTarget.style.borderColor = '#E2E8F0'}
                                                >
                                                    <Paperclip size={14} style={{ color: '#94A3B8' }} />
                                                    <span>{att.filename}</span>
                                                    <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>
                                                        ({att.size ? `${Math.round(att.size / 1024)} KB` : 'Descargar'})
                                                    </span>
                                                </a>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* EMAIL BODY */}
                        <div style={{ backgroundColor: 'white', borderRadius: '24px', padding: '2rem', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)', minHeight: '300px' }}>
                            {selectedEmail.message?.html || selectedEmail.payload?.html ? (
                                <div 
                                    dangerouslySetInnerHTML={{ __html: selectedEmail.message?.html || selectedEmail.payload?.html }} 
                                    style={{ 
                                        fontSize: '0.95rem', 
                                        lineHeight: '1.6', 
                                        color: '#334155',
                                        fontFamily: 'sans-serif'
                                    }}
                                />
                            ) : (
                                <pre style={{ 
                                    whiteSpace: 'pre-wrap', 
                                    wordBreak: 'break-word', 
                                    fontFamily: 'sans-serif', 
                                    fontSize: '0.95rem', 
                                    lineHeight: '1.6', 
                                    color: '#334155',
                                    margin: 0
                                }}>
                                    {selectedEmail.message?.text || selectedEmail.payload?.plain || '(Este correo no tiene cuerpo de texto)'}
                                </pre>
                            )}
                        </div>

                        {/* REPLY FORM */}
                        {selectedEmail.is_inbound && (
                            <div style={{ backgroundColor: 'white', borderRadius: '24px', padding: '2rem', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.2rem' }}>
                                    <CornerUpLeft size={18} style={{ color: '#16A34A' }} />
                                    <h3 style={{ margin: 0, fontWeight: '900', color: '#1E293B', fontSize: '1rem' }}>
                                        Responder a {selectedEmail.sender_email}
                                    </h3>
                                </div>
                                
                                <textarea
                                    value={replyText}
                                    onChange={(e) => setReplyText(e.target.value)}
                                    placeholder="Redacta la oferta comercial, cotización formal o respuesta de negociación aquí..."
                                    style={{
                                        width: '100%',
                                        height: '150px',
                                        padding: '1rem',
                                        borderRadius: '16px',
                                        border: '1px solid #D1D5DB',
                                        outline: 'none',
                                        fontSize: '0.9rem',
                                        lineHeight: '1.5',
                                        color: '#1E293B',
                                        resize: 'vertical',
                                        marginBottom: '1rem'
                                    }}
                                />

                                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                    <button
                                        onClick={handleSendReply}
                                        disabled={sendingReply || !replyText.trim()}
                                        style={{
                                            padding: '12px 24px',
                                            backgroundColor: '#16A34A',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '12px',
                                            fontWeight: '800',
                                            fontSize: '0.85rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            cursor: 'pointer',
                                            opacity: (!replyText.trim() || sendingReply) ? 0.6 : 1,
                                            transition: 'opacity 0.2s'
                                        }}
                                    >
                                        <Send size={14} /> {sendingReply ? 'Enviando...' : 'Enviar Respuesta'}
                                    </button>
                                </div>
                            </div>
                        )}

                    </div>
                )}
            </div>

        </div>
    );
}
