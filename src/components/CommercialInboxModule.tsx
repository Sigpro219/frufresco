'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { THEME, formatMoney } from '@/lib/adminTheme';
import { 
    Mail, Search, Paperclip, Send, Plus, CornerUpLeft, 
    Sparkles, RefreshCw, X, FileSpreadsheet, FileText, 
    Download, ShieldCheck, ZoomIn, ZoomOut
} from 'lucide-react';
import * as XLSX from 'xlsx';

export default function CommercialInboxModule() {
    const [emails, setEmails] = useState<any[]>([]);
    const [selectedEmail, setSelectedEmail] = useState<any>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [replyText, setReplyText] = useState('');
    const [sendingReply, setSendingReply] = useState(false);
    const [loading, setLoading] = useState(true);

    const [isProposalModalOpen, setIsProposalModalOpen] = useState(false);
    const [analyzingProposal, setAnalyzingProposal] = useState(false);
    const [proposalData, setProposalData] = useState<any | null>(null);
    const [activeVersion, setActiveVersion] = useState<1 | 2>(1);
    const [editableItems, setEditableItems] = useState<any[]>([]);
    const [validityStart, setValidityStart] = useState<string>('');
    const [validityEnd, setValidityEnd] = useState<string>('');
    const [selectedClientProfileId, setSelectedClientProfileId] = useState<string>('');

    const [isCounterOfferModalOpen, setIsCounterOfferModalOpen] = useState(false);
    const [counterOfferMessage, setCounterOfferMessage] = useState('');
    const [sendingCounterOffer, setSendingCounterOffer] = useState(false);

    const [isAgreementModalOpen, setIsAgreementModalOpen] = useState(false);
    const [activatingAgreement, setActivatingAgreement] = useState(false);

    const [excelSheets, setExcelSheets] = useState<{ name: string; rows: any[] }[]>([]);
    const [activeSheetIndex, setActiveSheetIndex] = useState(0);
    const [excelZoom, setExcelZoom] = useState(100);

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
    };

    const handleSendReply = async () => {
        if (!replyText.trim() || !selectedEmail) return;
        setSendingReply(true);

        try {
            const to = selectedEmail.message?.sender_email || selectedEmail.to_email || 'cliente@empresa.com';
            const response = await fetch('/api/mail/send-reply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    originalMailId: selectedEmail.id,
                    toEmail: to,
                    subject: selectedEmail.subject?.startsWith('Re:') ? selectedEmail.subject : `Re: ${selectedEmail.subject || ''}`,
                    message: replyText
                })
            });

            const resData = await response.json();
            if (!response.ok) {
                throw new Error(resData.error || 'Fallo al enviar respuesta');
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

    const handleOpenProposalManager = async () => {
        if (!selectedEmail) return;
        setIsProposalModalOpen(true);
        setAnalyzingProposal(true);
        setProposalData(null);
        setActiveVersion(1);

        try {
            const response = await fetch('/api/commercial/analyze-proposal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mailId: selectedEmail.id,
                    clientProfileId: selectedClientProfileId || null
                })
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Error al analizar la propuesta');
            }

            setProposalData(data);
            setEditableItems(data.items || []);
            setValidityStart(data.validity?.start || new Date().toISOString().split('T')[0]);
            setValidityEnd(data.validity?.end || '');

            if (data.client?.id) {
                setSelectedClientProfileId(data.client.id);
            }

            const attachments = selectedEmail.message?.attachments || selectedEmail.payload?.attachments || [];
            const excelAtt = attachments.find((a: any) => {
                const name = (a.name || a.filename || '').toLowerCase();
                return name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv');
            });

            if (excelAtt && excelAtt.url) {
                loadExcelForViewer(excelAtt.url);
            }

        } catch (err: any) {
            console.error('Error analyzing proposal:', err);
            alert('Error al analizar propuesta: ' + err.message);
        } finally {
            setAnalyzingProposal(false);
        }
    };

    const loadExcelForViewer = async (url: string) => {
        try {
            const res = await fetch(url);
            const arrayBuf = await res.arrayBuffer();
            const workbook = XLSX.read(new Uint8Array(arrayBuf), { type: 'array' });
            
            const sheetsData = workbook.SheetNames.map(name => {
                const ws = workbook.Sheets[name];
                const rows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
                return { name, rows };
            });

            setExcelSheets(sheetsData);
            setActiveSheetIndex(0);
        } catch (e) {
            console.error('Error loading excel for viewer:', e);
        }
    };

    const handleCounterPriceChange = (index: number, newPriceStr: string) => {
        const val = parseFloat(newPriceStr.replace(/[^0-9.]/g, '')) || 0;
        setEditableItems(prev => {
            const updated = [...prev];
            const item = { ...updated[index] };
            item.counter_price = val;
            item.is_counter_offered = Math.abs(val - item.client_proposed_price) > 0.01;

            if (val > 0 && item.cost_basis > 0) {
                item.margin_percent = Math.round(((val - item.cost_basis) / val) * 100);
            }

            updated[index] = item;
            return updated;
        });
    };

    const handleSendCounterOfferSubmit = async () => {
        if (!selectedEmail) return;
        setSendingCounterOffer(true);

        try {
            const accepted = editableItems.filter(i => !i.is_counter_offered);
            const counterOffered = editableItems.filter(i => i.is_counter_offered);
            const to = selectedEmail.message?.sender_email || selectedEmail.to_email;

            const res = await fetch('/api/commercial/send-counter-offer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mailId: selectedEmail.id,
                    toEmail: to,
                    clientName: proposalData?.client?.name || 'Cliente',
                    validityStart,
                    validityEnd,
                    acceptedItems: accepted,
                    counterOfferedItems: counterOffered,
                    customMessage: counterOfferMessage
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al enviar contraoferta');

            alert('🎉 ¡Contraoferta enviada con éxito al cliente!');
            setIsCounterOfferModalOpen(false);
            setActiveVersion(2);
            await fetchEmails();
        } catch (err: any) {
            console.error('Error sending counter offer:', err);
            alert('Error: ' + err.message);
        } finally {
            setSendingCounterOffer(false);
        }
    };

    const handleActivateAgreementSubmit = async () => {
        if (!proposalData) return;
        setActivatingAgreement(true);

        try {
            const res = await fetch('/api/commercial/activate-agreement', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientId: selectedClientProfileId || null,
                    clientName: proposalData?.client?.name || 'Cliente',
                    validityStart,
                    validityEnd,
                    agreementItems: editableItems
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al fijar acuerdo');

            alert('🎉 ¡Acuerdo Comercial fijado y activado exitosamente!');
            setIsAgreementModalOpen(false);
            setIsProposalModalOpen(false);
            await fetchEmails();
        } catch (err: any) {
            console.error('Error activating agreement:', err);
            alert('Error: ' + err.message);
        } finally {
            setActivatingAgreement(false);
        }
    };

    const counterOfferedCount = editableItems.filter(i => i.is_counter_offered).length;
    const acceptedCount = editableItems.length - counterOfferedCount;
    const averageMargin = editableItems.length > 0 
        ? Math.round(editableItems.reduce((acc, i) => acc + (i.margin_percent || 0), 0) / editableItems.length) 
        : 0;

    const filteredEmails = emails.filter(m => {
        const term = searchTerm.toLowerCase();
        const sender = (m.message?.sender_email || m.to_email || '').toLowerCase();
        const subj = (m.subject || '').toLowerCase();
        const body = (m.message?.text || '').toLowerCase();
        return sender.includes(term) || subj.includes(term) || body.includes(term);
    });

    const getInitials = (emailStr: string) => {
        if (!emailStr) return 'C';
        const clean = emailStr.split('@')[0].split(/[._-]/);
        return clean.map(p => p[0]?.toUpperCase()).slice(0, 2).join('');
    };

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', height: '100%', backgroundColor: '#F8FAFC' }}>
            
            <div style={{ borderRight: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', backgroundColor: 'white', height: '100%' }}>
                <div style={{ padding: '1rem', borderBottom: '1px solid #E2E8F0' }}>
                    <div style={{ position: 'relative' }}>
                        <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                        <input 
                            type="text" 
                            placeholder="Buscar por cliente, asunto o correo..." 
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', fontSize: '0.75rem', color: '#64748B' }}>
                        <span style={{ fontWeight: '700' }}>{filteredEmails.length} correos</span>
                        <button 
                            onClick={fetchEmails}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: THEME.colors.primary, display: 'flex', alignItems: 'center', gap: '4px', fontWeight: '700' }}
                        >
                            <RefreshCw size={12} /> Actualizar
                        </button>
                    </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {loading ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: '#64748B', fontSize: '0.9rem' }}>Cargando correos comerciales...</div>
                    ) : filteredEmails.length === 0 ? (
                        <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: '#94A3B8', fontSize: '0.85rem' }}>
                            <Mail size={36} style={{ margin: '0 auto 10px auto', opacity: 0.3 }} />
                            <p style={{ margin: 0, fontWeight: '600' }}>No se encontraron correos comerciales.</p>
                            <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem' }}>Buzón conectado: <strong>investcortes@gmail.com</strong></p>
                        </div>
                    ) : (
                        filteredEmails.map((email) => {
                            const isSelected = selectedEmail?.id === email.id;
                            const sender = email.message?.sender_email || email.to_email || 'Sin remitente';
                            const attachments = email.message?.attachments || email.payload?.attachments || [];
                            const hasProposalDoc = attachments.some((a: any) => {
                                const n = (a.name || a.filename || '').toLowerCase();
                                return n.endsWith('.xlsx') || n.endsWith('.xls') || n.endsWith('.csv') || n.endsWith('.pdf');
                            });

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
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#1E293B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }}>
                                            {email.message?.sender_name || sender}
                                        </span>
                                        <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>
                                            {new Date(email.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                        </span>
                                    </div>
                                    
                                    <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#334155', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {email.subject || '(Sin Asunto)'}
                                    </div>

                                    <div style={{ fontSize: '0.75rem', color: '#64748B', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: '1.4' }}>
                                        {email.message?.text || ''}
                                    </div>

                                    <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                        {hasProposalDoc && (
                                            <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#FEF3C7', color: '#B45309', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                <Sparkles size={10} /> PROPUESTA ADJUNTA
                                            </span>
                                        )}
                                        {attachments.length > 0 && (
                                            <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#F1F5F9', color: '#475569', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                <Paperclip size={10} /> {attachments.length}
                                            </span>
                                        )}
                                        {email.is_inbound ? (
                                            <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#ECFDF5', color: '#047857', fontWeight: '800' }}>
                                                ENTRANTE
                                            </span>
                                        ) : (
                                            <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#EFF6FF', color: '#1D4ED8', fontWeight: '800' }}>
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

            <div style={{ backgroundColor: '#F8FAFC', display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
                {!selectedEmail ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: '#94A3B8' }}>
                        <Mail size={48} strokeWidth={1} style={{ marginBottom: '1rem', color: '#CBD5E1' }} />
                        <h3 style={{ margin: 0, fontWeight: '700', fontSize: '1.1rem', color: '#64748B' }}>Bandeja Comercial Activa</h3>
                        <p style={{ margin: '6px 0 0 0', fontSize: '0.85rem', textAlign: 'center', maxWidth: '320px', color: '#94A3B8' }}>
                            Selecciona cualquier conversación para leer su detalle, responder o abrir el <strong>Gestor de Propuestas Comerciales</strong>.
                        </p>
                    </div>
                ) : (
                    <div style={{ padding: '2rem', maxWidth: '960px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        
                        <div style={{ backgroundColor: 'white', borderRadius: '20px', padding: '1.8rem', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.2rem' }}>
                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                    <div style={{ 
                                        width: '46px', 
                                        height: '46px', 
                                        borderRadius: '50%', 
                                        backgroundColor: '#F0FDF4', 
                                        color: '#16A34A',
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'center',
                                        fontWeight: '800',
                                        fontSize: '1rem',
                                        border: '1px solid #BBF7D0'
                                    }}>
                                        {getInitials(selectedEmail.message?.sender_email || selectedEmail.to_email)}
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '1.05rem', fontWeight: '800', color: '#1E293B' }}>
                                            {selectedEmail.message?.sender_name || selectedEmail.message?.sender_email || selectedEmail.to_email}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: '#64748B', display: 'flex', gap: '8px' }}>
                                            <span>Para: {selectedEmail.to_email || 'investcortes@gmail.com'}</span>
                                            <span>•</span>
                                            <span>{new Date(selectedEmail.created_at).toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <button 
                                        onClick={handleOpenProposalManager}
                                        style={{ 
                                            padding: '10px 18px', 
                                            backgroundColor: '#111827', 
                                            color: 'white', 
                                            border: 'none', 
                                            borderRadius: '12px', 
                                            fontWeight: '800', 
                                            fontSize: '0.85rem', 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: '8px', 
                                            cursor: 'pointer',
                                            boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
                                        }}
                                    >
                                        <Sparkles size={16} color="#FBBF24" /> ABRIR GESTOR DE PROPUESTAS
                                    </button>
                                </div>
                            </div>

                            <h1 style={{ fontSize: '1.35rem', fontWeight: '900', color: '#1E293B', margin: '0 0 1rem 0' }}>
                                {selectedEmail.subject || '(Sin Asunto)'}
                            </h1>

                            {(selectedEmail.message?.attachments?.length > 0 || selectedEmail.payload?.attachments?.length > 0) && (
                                <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '1rem', marginTop: '1rem' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Paperclip size={12} /> Documentos Adjuntos ({selectedEmail.message?.attachments?.length || selectedEmail.payload?.attachments?.length})
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        {(selectedEmail.message?.attachments || selectedEmail.payload?.attachments || []).map((att: any, idx: number) => {
                                            const isExcel = (att.name || att.filename || '').toLowerCase().includes('xls') || (att.name || att.filename || '').toLowerCase().includes('csv');
                                            return (
                                                <a 
                                                    key={idx} 
                                                    href={att.url} 
                                                    download={att.name || att.filename || 'adjunto'}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    style={{ 
                                                        display: 'flex', 
                                                        alignItems: 'center', 
                                                        gap: '8px', 
                                                        padding: '8px 14px', 
                                                        backgroundColor: isExcel ? '#F0FDF4' : '#F8FAFC', 
                                                        border: `1px solid ${isExcel ? '#86EFAC' : '#E2E8F0'}`, 
                                                        borderRadius: '10px', 
                                                        color: isExcel ? '#166534' : '#334155', 
                                                        fontSize: '0.8rem', 
                                                        fontWeight: '700', 
                                                        textDecoration: 'none'
                                                    }}
                                                >
                                                    {isExcel ? <FileSpreadsheet size={16} color="#16A34A" /> : <FileText size={16} color="#64748B" />}
                                                    <span>{att.name || att.filename}</span>
                                                    <Download size={13} style={{ opacity: 0.6 }} />
                                                </a>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div style={{ backgroundColor: 'white', borderRadius: '20px', padding: '2rem', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)', minHeight: '220px' }}>
                            {selectedEmail.message?.html ? (
                                <div 
                                    dangerouslySetInnerHTML={{ __html: selectedEmail.message.html }} 
                                    style={{ fontSize: '0.95rem', lineHeight: '1.6', color: '#334155' }}
                                />
                            ) : (
                                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'sans-serif', fontSize: '0.95rem', lineHeight: '1.6', color: '#334155', margin: 0 }}>
                                    {selectedEmail.message?.text || '(Este correo no contiene texto en el cuerpo)'}
                                </pre>
                            )}
                        </div>

                        <div style={{ backgroundColor: 'white', borderRadius: '20px', padding: '1.8rem', border: '1px solid #E2E8F0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
                                <CornerUpLeft size={18} color="#16A34A" />
                                <h3 style={{ margin: 0, fontWeight: '800', color: '#1E293B', fontSize: '0.95rem' }}>
                                    Responder correo a {selectedEmail.message?.sender_email || selectedEmail.to_email}
                                </h3>
                            </div>
                            <textarea
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                                placeholder="Redacta una respuesta rápida aquí..."
                                style={{
                                    width: '100%',
                                    height: '110px',
                                    padding: '1rem',
                                    borderRadius: '12px',
                                    border: '1px solid #D1D5DB',
                                    outline: 'none',
                                    fontSize: '0.9rem',
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
                                        padding: '10px 20px',
                                        backgroundColor: '#16A34A',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '10px',
                                        fontWeight: '800',
                                        fontSize: '0.85rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        cursor: 'pointer',
                                        opacity: (!replyText.trim() || sendingReply) ? 0.6 : 1
                                    }}
                                >
                                    <Send size={14} /> {sendingReply ? 'Enviando...' : 'Enviar Respuesta'}
                                </button>
                            </div>
                        </div>

                    </div>
                )}
            </div>

            {isProposalModalOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(15, 23, 42, 0.7)',
                    backdropFilter: 'blur(5px)',
                    zIndex: 99999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '1rem'
                }}>
                    <div style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '24px',
                        width: '98%',
                        maxWidth: '1440px',
                        height: '94vh',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)',
                        overflow: 'hidden'
                    }}>
                        
                        <div style={{ padding: '1.2rem 2rem', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#111827', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Sparkles size={20} color="#FBBF24" />
                                </div>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '900', color: '#1E293B' }}>
                                            Gestor de Propuestas & Acuerdos Comerciales
                                        </h2>
                                        <span style={{ fontSize: '0.75rem', padding: '3px 8px', borderRadius: '12px', backgroundColor: '#DCFCE7', color: '#15803D', fontWeight: '800' }}>
                                            investcortes@gmail.com
                                        </span>
                                    </div>
                                    <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                                        Cliente: <strong>{proposalData?.client?.name || 'Cliente'}</strong> ({proposalData?.client?.email || selectedEmail?.to_email})
                                    </p>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{ display: 'flex', backgroundColor: '#E2E8F0', padding: '4px', borderRadius: '12px' }}>
                                    <button
                                        onClick={() => setActiveVersion(1)}
                                        style={{
                                            padding: '6px 14px',
                                            borderRadius: '8px',
                                            border: 'none',
                                            cursor: 'pointer',
                                            fontSize: '0.8rem',
                                            fontWeight: '800',
                                            backgroundColor: activeVersion === 1 ? 'white' : 'transparent',
                                            color: activeVersion === 1 ? '#1E293B' : '#64748B',
                                            boxShadow: activeVersion === 1 ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                                        }}
                                    >
                                        📌 Versión 1: Propuesta Cliente
                                    </button>
                                    <button
                                        onClick={() => setActiveVersion(2)}
                                        style={{
                                            padding: '6px 14px',
                                            borderRadius: '8px',
                                            border: 'none',
                                            cursor: 'pointer',
                                            fontSize: '0.8rem',
                                            fontWeight: '800',
                                            backgroundColor: activeVersion === 2 ? '#111827' : 'transparent',
                                            color: activeVersion === 2 ? '#FFFFFF' : '#64748B',
                                            boxShadow: activeVersion === 2 ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                                        }}
                                    >
                                        ✏️ Versión 2: Contraoferta FruFresco
                                    </button>
                                </div>

                                <button
                                    onClick={() => setIsProposalModalOpen(false)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', padding: '4px' }}
                                >
                                    <X size={24} />
                                </button>
                            </div>
                        </div>

                        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: excelSheets.length > 0 ? '420px 1fr' : '1fr', overflow: 'hidden' }}>
                            
                            {excelSheets.length > 0 && (
                                <div style={{ borderRight: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', backgroundColor: '#F8FAFC' }}>
                                    <div style={{ padding: '0.8rem 1rem', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: '800', color: '#166534' }}>
                                            <FileSpreadsheet size={16} /> Visor de Anexo Excel
                                        </div>
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                            <button onClick={() => setExcelZoom(z => Math.max(70, z - 10))} style={{ padding: '3px 6px', border: '1px solid #CBD5E1', borderRadius: '4px', background: 'white', cursor: 'pointer' }}><ZoomOut size={12} /></button>
                                            <span style={{ fontSize: '0.75rem', padding: '3px 6px', fontWeight: '700' }}>{excelZoom}%</span>
                                            <button onClick={() => setExcelZoom(z => Math.min(150, z + 10))} style={{ padding: '3px 6px', border: '1px solid #CBD5E1', borderRadius: '4px', background: 'white', cursor: 'pointer' }}><ZoomIn size={12} /></button>
                                        </div>
                                    </div>

                                    {excelSheets.length > 1 && (
                                        <div style={{ display: 'flex', gap: '4px', padding: '4px 8px', backgroundColor: '#E2E8F0', overflowX: 'auto' }}>
                                            {excelSheets.map((s, idx) => (
                                                <button 
                                                    key={idx}
                                                    onClick={() => setActiveSheetIndex(idx)}
                                                    style={{
                                                        padding: '4px 10px',
                                                        borderRadius: '6px',
                                                        border: 'none',
                                                        fontSize: '0.7rem',
                                                        fontWeight: '700',
                                                        cursor: 'pointer',
                                                        backgroundColor: activeSheetIndex === idx ? 'white' : 'transparent',
                                                        color: activeSheetIndex === idx ? '#0F172A' : '#64748B'
                                                    }}
                                                >
                                                    {s.name}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    <div style={{ flex: 1, overflow: 'auto', padding: '0.5rem' }}>
                                        <div style={{ transform: `scale(${excelZoom / 100})`, transformOrigin: 'top left', minWidth: '100%' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', backgroundColor: 'white' }}>
                                                <tbody>
                                                    {excelSheets[activeSheetIndex]?.rows.map((row: any, rIdx: number) => (
                                                        <tr key={rIdx} style={{ backgroundColor: rIdx === 0 ? '#F1F5F9' : 'white', borderBottom: '1px solid #E2E8F0' }}>
                                                            {Array.isArray(row) && row.map((cell: any, cIdx: number) => (
                                                                <td key={cIdx} style={{ padding: '5px 8px', borderRight: '1px solid #F1F5F9', whiteSpace: 'nowrap', fontWeight: rIdx === 0 ? '700' : '400' }}>
                                                                    {String(cell || '')}
                                                                </td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'white' }}>
                                
                                <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF', flexWrap: 'wrap', gap: '1rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#64748B' }}>VIGENCIA:</span>
                                            <input 
                                                type="date" 
                                                value={validityStart} 
                                                onChange={(e) => setValidityStart(e.target.value)}
                                                style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem', fontWeight: '700' }}
                                            />
                                            <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>hasta</span>
                                            <input 
                                                type="date" 
                                                value={validityEnd} 
                                                onChange={(e) => setValidityEnd(e.target.value)}
                                                style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem', fontWeight: '700' }}
                                            />
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.8rem', padding: '4px 10px', borderRadius: '8px', backgroundColor: '#DCFCE7', color: '#15803D', fontWeight: '800' }}>
                                            ✓ {acceptedCount} Aceptados
                                        </span>
                                        {counterOfferedCount > 0 && (
                                            <span style={{ fontSize: '0.8rem', padding: '4px 10px', borderRadius: '8px', backgroundColor: '#FFF7ED', color: '#C2410C', fontWeight: '800' }}>
                                                ⚠️ {counterOfferedCount} Contraofertados
                                            </span>
                                        )}
                                        <span style={{ fontSize: '0.8rem', padding: '4px 10px', borderRadius: '8px', backgroundColor: '#F1F5F9', color: '#334155', fontWeight: '800' }}>
                                            Margen Promedio: {averageMargin}%
                                        </span>
                                    </div>
                                </div>

                                <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                                    {analyzingProposal ? (
                                        <div style={{ padding: '4rem', textAlign: 'center', color: '#64748B' }}>
                                            <Sparkles size={32} style={{ margin: '0 auto 10px auto', color: '#F59E0B' }} />
                                            <p style={{ margin: 0, fontWeight: '700' }}>Analizando tarifas con Inteligencia Artificial...</p>
                                            <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#94A3B8' }}>Cruzando catálogo, costos base, último precio aplicado y General Institucional.</p>
                                        </div>
                                    ) : editableItems.length === 0 ? (
                                        <div style={{ padding: '3rem', textAlign: 'center', color: '#94A3B8' }}>
                                            No se detectaron productos en esta propuesta.
                                        </div>
                                    ) : (
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                            <thead>
                                                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', color: '#475569', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                    <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: '800' }}>Accounting ID</th>
                                                    <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: '800' }}>Producto Solicitado / Catálogo</th>
                                                    <th style={{ padding: '12px 10px', textAlign: 'right', fontWeight: '800' }}>Precio Cliente (V1)</th>
                                                    <th style={{ padding: '12px 10px', textAlign: 'right', fontWeight: '800' }}>Último Aplicado</th>
                                                    <th style={{ padding: '12px 10px', textAlign: 'right', fontWeight: '800' }}>Gral. Institucional</th>
                                                    <th style={{ padding: '12px 14px', textAlign: 'right', fontWeight: '800', backgroundColor: activeVersion === 2 ? '#FEF3C7' : 'transparent' }}>
                                                        Contrapropuesta (V2)
                                                    </th>
                                                    <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: '800' }}>Margen Real</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {editableItems.map((item, idx) => {
                                                    const isModified = item.is_counter_offered;
                                                    const isLowMargin = (item.margin_percent || 0) < 10;
                                                    const isMediumMargin = (item.margin_percent || 0) >= 10 && (item.margin_percent || 0) < 18;

                                                    return (
                                                        <tr 
                                                            key={idx} 
                                                            style={{ 
                                                                borderBottom: '1px solid #F1F5F9',
                                                                backgroundColor: isModified ? '#FFFDF5' : 'white'
                                                            }}
                                                        >
                                                            <td style={{ padding: '10px 14px', fontWeight: '700', color: '#64748B', fontFamily: 'monospace' }}>
                                                                {item.accounting_id || '—'}
                                                            </td>

                                                            <td style={{ padding: '10px 14px' }}>
                                                                <div style={{ fontWeight: '800', color: '#1E293B' }}>
                                                                    {item.matched_product?.name || item.client_product_name}
                                                                </div>
                                                                <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                                                                    Texto cliente: <em>"{item.client_product_name}"</em> ({item.unit})
                                                                </div>
                                                            </td>

                                                            <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: '800', color: '#0F172A', fontSize: '14px' }}>
                                                                {formatMoney(item.client_proposed_price)}
                                                            </td>

                                                            <td style={{ padding: '10px 10px', textAlign: 'right', color: '#64748B', fontWeight: '600' }}>
                                                                {formatMoney(item.last_applied_price)}
                                                            </td>

                                                            <td style={{ padding: '10px 10px', textAlign: 'right', color: '#64748B', fontWeight: '600' }}>
                                                                {formatMoney(item.general_institutional_price)}
                                                            </td>

                                                            <td style={{ padding: '10px 14px', textAlign: 'right', backgroundColor: activeVersion === 2 ? '#FFFDF5' : 'transparent' }}>
                                                                {activeVersion === 2 ? (
                                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                                                        <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#94A3B8' }}>$</span>
                                                                        <input
                                                                            type="number"
                                                                            value={item.counter_price || item.client_proposed_price}
                                                                            onChange={(e) => handleCounterPriceChange(idx, e.target.value)}
                                                                            style={{
                                                                                width: '100px',
                                                                                padding: '6px 8px',
                                                                                borderRadius: '8px',
                                                                                border: isModified ? '2px solid #F59E0B' : '1px solid #CBD5E1',
                                                                                fontWeight: '800',
                                                                                fontSize: '13px',
                                                                                textAlign: 'right',
                                                                                backgroundColor: isModified ? '#FFFBEB' : 'white',
                                                                                outline: 'none'
                                                                            }}
                                                                        />
                                                                    </div>
                                                                ) : (
                                                                    <span style={{ fontWeight: '800', color: isModified ? '#C2410C' : '#16A34A' }}>
                                                                        {formatMoney(item.counter_price || item.client_proposed_price)}
                                                                    </span>
                                                                )}
                                                            </td>

                                                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                                                <span style={{
                                                                    fontSize: '11px',
                                                                    padding: '3px 8px',
                                                                    borderRadius: '12px',
                                                                    fontWeight: '800',
                                                                    backgroundColor: isLowMargin ? '#FEE2E2' : isMediumMargin ? '#FEF3C7' : '#DCFCE7',
                                                                    color: isLowMargin ? '#991B1B' : isMediumMargin ? '#92400E' : '#15803D'
                                                                }}>
                                                                    {item.margin_percent || 0}% Margen
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    )}
                                </div>

                                <div style={{ padding: '1.2rem 2rem', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC' }}>
                                    <button
                                        onClick={() => setIsProposalModalOpen(false)}
                                        style={{ padding: '10px 18px', borderRadius: '10px', border: '1px solid #CBD5E1', backgroundColor: 'white', fontWeight: '700', fontSize: '0.85rem', cursor: 'pointer' }}
                                    >
                                        Cerrar
                                    </button>

                                    <div style={{ display: 'flex', gap: '12px' }}>
                                        <button
                                            onClick={() => setIsCounterOfferModalOpen(true)}
                                            style={{
                                                padding: '10px 20px',
                                                backgroundColor: '#C2410C',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '10px',
                                                fontWeight: '800',
                                                fontSize: '0.85rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                cursor: 'pointer',
                                                boxShadow: '0 2px 6px rgba(194, 65, 12, 0.2)'
                                            }}
                                        >
                                            <Send size={15} /> ENVIAR CONTRAOFERTA POR EMAIL
                                        </button>

                                        <button
                                            onClick={() => setIsAgreementModalOpen(true)}
                                            style={{
                                                padding: '10px 22px',
                                                backgroundColor: '#15803D',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '10px',
                                                fontWeight: '800',
                                                fontSize: '0.85rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                cursor: 'pointer',
                                                boxShadow: '0 2px 6px rgba(21, 128, 61, 0.25)'
                                            }}
                                        >
                                            <ShieldCheck size={16} /> FIJAR ACUERDO COMERCIAL
                                        </button>
                                    </div>
                                </div>

                            </div>
                        </div>

                    </div>
                </div>
            )}

            {isCounterOfferModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div style={{ backgroundColor: 'white', borderRadius: '20px', maxWidth: '600px', width: '100%', padding: '2rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
                        <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.2rem', fontWeight: '900', color: '#1E293B' }}>
                            Enviar Contraoferta Formal al Cliente
                        </h3>
                        <p style={{ fontSize: '0.85rem', color: '#64748B', lineHeight: '1.5' }}>
                            Se enviará un correo formal a <strong>{selectedEmail?.message?.sender_email || selectedEmail?.to_email}</strong> con el desglose de los <strong>{acceptedCount} productos aceptados</strong> y la tabla destacada de los <strong>{counterOfferedCount} productos con contrapropuesta</strong>.
                        </p>
                        
                        <div style={{ margin: '1rem 0' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#475569', display: 'block', marginBottom: '6px' }}>
                                Mensaje personalizado adicional (opcional):
                            </label>
                            <textarea
                                value={counterOfferMessage}
                                onChange={(e) => setCounterOfferMessage(e.target.value)}
                                placeholder="Ej: Apreciado cliente, nos ajustamos al 90% de sus precios solicitados..."
                                style={{ width: '100%', height: '80px', padding: '10px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
                            />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button onClick={() => setIsCounterOfferModalOpen(false)} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #CBD5E1', background: 'white', cursor: 'pointer', fontWeight: '700' }}>Cancelar</button>
                            <button 
                                onClick={handleSendCounterOfferSubmit} 
                                disabled={sendingCounterOffer}
                                style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', background: '#C2410C', color: 'white', cursor: 'pointer', fontWeight: '800' }}
                            >
                                {sendingCounterOffer ? 'Despachando...' : 'Confirmar y Enviar Correo'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isAgreementModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div style={{ backgroundColor: 'white', borderRadius: '20px', maxWidth: '550px', width: '100%', padding: '2rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
                            <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#DCFCE7', color: '#15803D', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <ShieldCheck size={24} />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '900', color: '#1E293B' }}>Fijar Acuerdo Comercial</h3>
                                <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: '#64748B' }}>Activación inmediata de tarifas pactadas</p>
                            </div>
                        </div>

                        <p style={{ fontSize: '0.85rem', color: '#475569', lineHeight: '1.5' }}>
                            Al confirmar, estas <strong>{editableItems.length} tarifas</strong> se guardarán como el Acuerdo Comercial oficial para <strong>{proposalData?.client?.name}</strong> con vigencia hasta el <strong>{validityEnd || 'indefinida'}</strong>.
                        </p>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '1.5rem' }}>
                            <button onClick={() => setIsAgreementModalOpen(false)} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #CBD5E1', background: 'white', cursor: 'pointer', fontWeight: '700' }}>Cancelar</button>
                            <button 
                                onClick={handleActivateAgreementSubmit} 
                                disabled={activatingAgreement}
                                style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', background: '#15803D', color: 'white', cursor: 'pointer', fontWeight: '800' }}
                            >
                                {activatingAgreement ? 'Activando...' : 'Activar Acuerdo Comercial'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
