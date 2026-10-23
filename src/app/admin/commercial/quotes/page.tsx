'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { Trash2, Inbox, Plus, ChevronRight, FileText, Search, X, Filter, Handshake, Calendar, Building2, CheckCircle2, AlertCircle, Loader2, RefreshCw, Copy } from 'lucide-react';
import { THEME, formatMoney } from '@/lib/adminTheme';

export default function QuotesListPage({ embedded = false }: { embedded?: boolean } = {}) {
    const [quotes, setQuotes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState<string>('all');

    // Estado para aprobación ágil directa a Acuerdo Comercial (Escenario 269 SDD)
    const [quoteToApprove, setQuoteToApprove] = useState<any | null>(null);
    const [approving, setApproving] = useState(false);
    const [approvalStartDate, setApprovalStartDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [approvalValidUntil, setApprovalValidUntil] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        return d.toISOString().split('T')[0];
    });
    const [presetDays, setPresetDays] = useState<number>(30);

    const handleOpenApproveModal = (quote: any) => {
        setQuoteToApprove(quote);
        const today = new Date();
        const start = today.toISOString().split('T')[0];
        setApprovalStartDate(start);
        const until = new Date(today);
        until.setDate(until.getDate() + 30);
        setApprovalValidUntil(until.toISOString().split('T')[0]);
        setPresetDays(30);
    };

    const handleApplyPreset = (days: number) => {
        setPresetDays(days);
        const base = approvalStartDate ? new Date(approvalStartDate + 'T12:00:00') : new Date();
        base.setDate(base.getDate() + days);
        setApprovalValidUntil(base.toISOString().split('T')[0]);
    };

    const handleConfirmApprove = async () => {
        if (!quoteToApprove) return;
        setApproving(true);
        try {
            const today = new Date();
            const day = String(today.getDate()).padStart(2, '0');
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const yr = String(today.getFullYear()).slice(-2);
            const clientName = quoteToApprove.client_name || quoteToApprove.profiles?.company_name || 'Cliente';
            const snapshotName = `${clientName} - Acuerdo ${day}-${month}-${yr}`;

            const { error: updErr } = await supabase
                .from('quotes')
                .update({
                    status: 'agreement',
                    model_snapshot_name: snapshotName,
                    start_date: approvalStartDate,
                    valid_until: approvalValidUntil
                })
                .eq('id', quoteToApprove.id);

            if (updErr) throw updErr;

            try {
                await supabase.from('agreement_audit_logs').insert({
                    agreement_id: quoteToApprove.id,
                    action: 'ACTIVATE_commercial_agreement',
                    details: {
                        source: 'QUOTES_GALLERY_DIRECT_APPROVAL',
                        valid_until: approvalValidUntil,
                        start_date: approvalStartDate
                    }
                });
            } catch (auditErr) {
                console.warn('Notice: Could not log agreement activation:', auditErr);
            }

            alert(`¡Acuerdo Comercial activado exitosamente para ${clientName}! Precios congelados hasta el ${new Date(approvalValidUntil + 'T12:00:00').toLocaleDateString('es-CO')}.`);
            setQuoteToApprove(null);
            fetchQuotes(true);
        } catch (err: any) {
            console.error('Error aprobando acuerdo:', err);
            alert('Error al congelar acuerdo comercial: ' + (err.message || err));
        } finally {
            setApproving(false);
        }
    };

    const fetchQuotes = async (showSpinner = false) => {
        if (showSpinner) setLoading(true);
        try {
            const { data, error } = await supabase
                .from('quotes')
                .select('*, profiles:client_id(role, company_name, contact_name), leads:lead_id(company_name, contact_name, business_type, business_size)')
                .neq('status', 'agreement')
                .order('created_at', { ascending: false });

            if (data) setQuotes(data);
        } catch (err) {
            console.error('Error fetching quotes:', err);
        } finally {
            if (showSpinner) setLoading(false);
        }
    };

    const renderClientTypeBadge = (quote: any) => {
        if (quote.lead_id || quote.leads) {
            const bType = quote.leads?.business_type;
            return (
                <div style={{ marginTop: '3px' }}>
                    <span style={{ 
                        fontSize: '0.68rem', 
                        backgroundColor: '#DCFCE7', 
                        color: '#15803D', 
                        padding: '2px 6px', 
                        borderRadius: '4px', 
                        fontWeight: '800',
                        display: 'inline-block' 
                    }}>
                        Prospecto (Lead){bType ? ` • ${bType}` : ''}
                    </span>
                </div>
            );
        }
        
        if (quote.profiles?.role === 'b2c_client') {
            return (
                <div style={{ marginTop: '3px' }}>
                    <span style={{ 
                        fontSize: '0.68rem', 
                        backgroundColor: '#ECFDF5', 
                        color: '#047857', 
                        padding: '2px 6px', 
                        borderRadius: '4px', 
                        fontWeight: '800',
                        display: 'inline-block' 
                    }}>
                        Cliente Hogar
                    </span>
                </div>
            );
        }
        
        if (quote.profiles?.role === 'b2b_client' || quote.client_id) {
            return (
                <div style={{ marginTop: '3px' }}>
                    <span style={{ 
                        fontSize: '0.68rem', 
                        backgroundColor: '#E0F2FE', 
                        color: '#0369A1', 
                        padding: '2px 6px', 
                        borderRadius: '4px', 
                        fontWeight: '800',
                        display: 'inline-block' 
                    }}>
                        Cliente Institucional
                    </span>
                </div>
            );
        }

        return (
            <div style={{ marginTop: '3px' }}>
                <span style={{ 
                    fontSize: '0.68rem', 
                    backgroundColor: '#F1F5F9', 
                    color: '#64748B', 
                    padding: '2px 6px', 
                    borderRadius: '4px', 
                    fontWeight: '800',
                    display: 'inline-block' 
                }}>
                    Cliente Manual
                </span>
            </div>
        );
    };

    useEffect(() => {
        // Carga inicial con indicador de carga
        fetchQuotes(true);

        // 1. Suscripción en Tiempo Real (Supabase Realtime)
        const channel = supabase
            .channel('realtime_admin_quotes_list')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'quotes' },
                () => {
                    fetchQuotes(false);
                }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'leads' },
                () => {
                    fetchQuotes(false);
                }
            )
            .subscribe();

        // 2. Heartbeat de sincronización silenciosa en segundo plano (cada 30s)
        const pollingInterval = setInterval(() => {
            if (typeof document !== 'undefined' && document.hidden) return;
            fetchQuotes(false);
        }, 30000);

        return () => {
            supabase.removeChannel(channel);
            clearInterval(pollingInterval);
        };
    }, []);

    const handleDelete = async (id: string, quoteNumber: string) => {
        const formattedNum = quoteNumber ? formatQuoteNumber(Number(quoteNumber)) : '#' + quoteNumber;
        if (!window.confirm(`¿Estás seguro de ELIMINAR permanentemente la cotización ${formattedNum}?`)) return;

        try {
            const { error } = await supabase.from('quotes').delete().eq('id', id);
            if (error) throw error;
            
            setQuotes(prev => prev.filter(q => q.id !== id));
            alert('Cotización eliminada correctamente');
        } catch (err: any) {
            console.error('Error deleting quote:', err);
            alert('Error al eliminar: ' + err.message);
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('es-CO', {
            year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    };

    const getEffectiveStatus = (quote: any): string => {
        if (!quote) return 'draft';
        const raw = quote.status || 'draft';
        if (raw === 'expired' || raw === 'superseded' || raw === 'rejected' || raw === 'agreement' || raw === 'converted') {
            return raw;
        }
        // Si tiene valid_until explícito en el pasado, pasa a expired
        if (quote.valid_until) {
            const end = new Date(quote.valid_until.split('T')[0] + 'T23:59:59');
            if (end < new Date()) return 'expired';
        }
        return raw;
    };

    const isHistoricalAgreement = (quote: any): boolean => {
        if (!quote) return false;
        const eff = getEffectiveStatus(quote);
        if (eff !== 'expired' && eff !== 'superseded') return false;
        const snap = (quote.model_snapshot_name || '').toLowerCase();
        return !quote.model_id && (snap.includes('acuerdo') || snap.includes('convenio') || /\d{2}-\d{2}-\d{2}/.test(snap));
    };

    const formatQuoteNumber = (seq: number, status?: string, dateStr?: string, quote?: any) => {
        const date = dateStr ? new Date(dateStr) : new Date();
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const paddedSeq = String(seq).padStart(4, '0');
        const prefix = (status === 'agreement' || (quote && isHistoricalAgreement(quote))) ? 'ACI' : 'COT';
        return `${prefix} ${day}${month} ${paddedSeq}`;
    };

    const getStatusBadge = (status: string, quote?: any) => {
        const eff = quote ? getEffectiveStatus(quote) : status;
        const wasAgreement = quote ? isHistoricalAgreement(quote) : false;
        switch (eff) {
            case 'draft':
                return <span style={{ backgroundColor: '#F3F4F6', color: '#4B5563', border: '1px solid #E5E7EB', padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.74rem', fontWeight: '700', display: 'inline-block', whiteSpace: 'nowrap' }}>Borrador</span>;
            case 'sent':
                return <span style={{ backgroundColor: '#DBEAFE', color: '#1E40AF', border: '1px solid #BFDBFE', padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.74rem', fontWeight: '700', display: 'inline-block', whiteSpace: 'nowrap' }}>Enviada</span>;
            case 'accepted':
                return <span style={{ backgroundColor: '#D1FAE5', color: '#065F46', border: '1px solid #A7F3D0', padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.74rem', fontWeight: '700', display: 'inline-block', whiteSpace: 'nowrap' }}>Aceptada</span>;
            case 'expired':
                return <span style={{ backgroundColor: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A', padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.74rem', fontWeight: '700', display: 'inline-block', whiteSpace: 'nowrap' }}>{wasAgreement ? 'Acuerdo Vencido' : 'Vencida (8d)'}</span>;
            case 'superseded':
                return <span style={{ backgroundColor: '#F1F5F9', color: '#475569', border: '1px solid #CBD5E1', padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.74rem', fontWeight: '700', display: 'inline-block', whiteSpace: 'nowrap' }}>{wasAgreement ? 'Acuerdo Reemplazado' : 'Reemplazada'}</span>;
            case 'converted':
                return <span style={{ backgroundColor: '#ECFDF5', color: '#047857', border: '1px solid #10B981', padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.74rem', fontWeight: '700', display: 'inline-block', whiteSpace: 'nowrap' }}>Pedido Creado</span>;
            case 'agreement':
                return <span style={{ backgroundColor: '#EFF6FF', color: '#1D4ED8', border: '1px solid #3B82F6', padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.74rem', fontWeight: '700', display: 'inline-block', whiteSpace: 'nowrap' }}>Acuerdo Comercial</span>;
            case 'rejected':
                return <span style={{ backgroundColor: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA', padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.74rem', fontWeight: '700', display: 'inline-block', whiteSpace: 'nowrap' }}>Rechazada</span>;
            default:
                return <span style={{ backgroundColor: '#F1F5F9', color: '#64748B', padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.74rem', fontWeight: '700', display: 'inline-block', whiteSpace: 'nowrap' }}>{eff}</span>;
        }
    };

    const filteredQuotes = quotes.filter(q => {
        const effStatus = getEffectiveStatus(q);
        const term = searchTerm.toLowerCase();
        const matchesSearch = !term || 
            (q.client_name && q.client_name.toLowerCase().includes(term)) ||
            (q.quote_number && String(q.quote_number).toLowerCase().includes(term)) ||
            (q.model_snapshot_name && q.model_snapshot_name.toLowerCase().includes(term));
        const matchesStatus = filterStatus === 'all' || effStatus === filterStatus;
        return matchesSearch && matchesStatus;
    });

    return (
        <main style={{ minHeight: embedded ? 'auto' : '100vh', backgroundColor: THEME.colors.background, fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif' }}>
            <div style={{ maxWidth: '1600px', margin: '0 auto', padding: embedded ? '1.5rem 2rem 3rem 2rem' : '2rem' }}>
                {!embedded && (
                    <div style={{ marginBottom: '1rem' }}>
                        <Link href="/admin/commercial" style={{ textDecoration: 'none', color: THEME.colors.textSecondary, fontWeight: '600', fontSize: '0.85rem' }}>
                            ← Volver al Panel
                        </Link>
                    </div>
                )}

                {/* HEADER TITLE */}
                <div style={{ marginBottom: '1.25rem' }}>
                    <h1 style={{ fontSize: '2rem', fontWeight: '900', color: THEME.colors.textMain, margin: 0, letterSpacing: '-0.025em' }}>Historial de Cotizaciones</h1>
                    <p style={{ margin: '0.3rem 0 0 0', color: THEME.colors.textSecondary, fontSize: '0.9rem' }}>
                        Gestiona, edita e imprime las propuestas comerciales y acuerdos vigentes.
                    </p>
                </div>

                {/* BARRA FLOTANTE STICKY DE ACCIONES Y BÚSQUEDA (ESTÁNDAR CLIENTSMODULE) */}
                <div style={{ 
                    display: 'flex', 
                    gap: '0.8rem', 
                    alignItems: 'center', 
                    marginBottom: '1.2rem',
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    backdropFilter: 'blur(12px)',
                    padding: '0.65rem 1.2rem',
                    borderRadius: '20px',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.07), 0 1px 3px rgba(0, 0, 0, 0.05)',
                    border: '1px solid #E2E8F0',
                    position: 'sticky',
                    top: embedded ? '142px' : '85px',
                    zIndex: 70,
                    transition: 'all 0.2s ease-in-out',
                    flexWrap: 'wrap'
                }}>
                    {/* BOTÓN NUEVA COTIZACIÓN */}
                    <Link href="/admin/commercial/quotes/create" style={{ textDecoration: 'none' }}>
                        <button 
                            style={{ 
                                backgroundColor: THEME.colors.primary, 
                                color: 'white', 
                                padding: '0 1.2rem', 
                                borderRadius: '10px', 
                                border: 'none', 
                                fontWeight: '800', 
                                cursor: 'pointer', 
                                boxShadow: '0 4px 12px rgba(13, 122, 87, 0.2)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                whiteSpace: 'nowrap',
                                height: '40px',
                                fontSize: '0.85rem',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = THEME.colors.primaryHover}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = THEME.colors.primary}
                        >
                            <Plus size={16} strokeWidth={2} /> Nueva Cotización
                        </button>
                    </Link>

                    {/* BUSCADOR */}
                    <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
                        <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                        <input 
                            type="text"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            placeholder="Buscar por cliente, ID o modelo..."
                            style={{ 
                                width: '100%', 
                                height: '40px', 
                                paddingLeft: '38px', 
                                paddingRight: searchTerm ? '32px' : '12px', 
                                borderRadius: '10px', 
                                border: '1px solid #E2E8F0',
                                backgroundColor: '#F8FAFC',
                                fontSize: '0.85rem',
                                color: THEME.colors.textMain,
                                outline: 'none',
                                transition: 'all 0.2s'
                            }}
                            onFocus={e => {
                                e.currentTarget.style.borderColor = THEME.colors.primary;
                                e.currentTarget.style.backgroundColor = 'white';
                            }}
                            onBlur={e => {
                                e.currentTarget.style.borderColor = '#E2E8F0';
                                e.currentTarget.style.backgroundColor = '#F8FAFC';
                            }}
                        />
                        {searchTerm && (
                            <button 
                                onClick={() => setSearchTerm('')} 
                                style={{ 
                                    position: 'absolute', 
                                    right: '10px', 
                                    top: '50%', 
                                    transform: 'translateY(-50%)', 
                                    background: 'none', 
                                    border: 'none', 
                                    cursor: 'pointer', 
                                    color: '#94A3B8' 
                                }}
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* FILTROS RÁPIDOS DE ESTADO CANÓNICOS (Escenario 275 SDD) */}
                    <div style={{ display: 'flex', gap: '4px', backgroundColor: '#F1F5F9', padding: '3px', borderRadius: '10px', height: '40px', alignItems: 'center', flexWrap: 'wrap' }}>
                        {[
                            { id: 'all', label: `Todas (${quotes.length})` },
                            { id: 'draft', label: `Borrador (${quotes.filter(q => getEffectiveStatus(q) === 'draft').length})` },
                            { id: 'sent', label: `Enviadas (${quotes.filter(q => getEffectiveStatus(q) === 'sent').length})` },
                            { id: 'expired', label: `Vencidas (${quotes.filter(q => getEffectiveStatus(q) === 'expired').length})` },
                            { id: 'superseded', label: `Reemplazadas (${quotes.filter(q => getEffectiveStatus(q) === 'superseded').length})` },
                            { id: 'rejected', label: `Rechazadas (${quotes.filter(q => getEffectiveStatus(q) === 'rejected').length})` }
                        ].map(f => (
                            <button
                                key={f.id}
                                onClick={() => setFilterStatus(f.id)}
                                style={{
                                    padding: '0.35rem 0.75rem',
                                    borderRadius: '7px',
                                    border: 'none',
                                    backgroundColor: filterStatus === f.id ? 'white' : 'transparent',
                                    color: filterStatus === f.id ? THEME.colors.primary : '#64748B',
                                    fontWeight: filterStatus === f.id ? '800' : '600',
                                    fontSize: '0.75rem',
                                    cursor: 'pointer',
                                    boxShadow: filterStatus === f.id ? '0 2px 4px rgba(0,0,0,0.08)' : 'none',
                                    transition: 'all 0.15s'
                                }}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm, position: 'relative' }}>
                    {loading ? (
                        <div style={{ padding: '3rem', textAlign: 'center', color: THEME.colors.textSecondary, fontWeight: '500' }}>Cargando...</div>
                    ) : quotes.length === 0 ? (
                        <div style={{ padding: '4rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                            <div style={{ 
                                backgroundColor: THEME.colors.primaryLight, 
                                width: '64px', 
                                height: '64px', 
                                borderRadius: '50%', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                margin: '0 auto 1rem',
                                color: THEME.colors.primary
                            }}>
                                <FileText size={32} />
                            </div>
                            <h3 style={{ margin: '0 0 0.5rem 0', color: THEME.colors.textMain, fontSize: '1.2rem', fontWeight: '800' }}>No hay cotizaciones aún</h3>
                            <p style={{ color: THEME.colors.textSecondary, margin: '0 0 1.5rem 0', fontSize: '0.9rem', maxWidth: '400px', lineHeight: '1.5' }}>
                                Crea tu primera cotización institucional para empezar a generar acuerdos de precios con tus clientes.
                            </p>
                            <Link href="/admin/commercial/quotes/create" style={{ textDecoration: 'none' }}>
                                <button style={{
                                    backgroundColor: THEME.colors.primary,
                                    color: 'white',
                                    border: 'none',
                                    padding: '0.65rem 1.25rem',
                                    borderRadius: THEME.radius.md,
                                    fontWeight: '800',
                                    fontSize: '0.85rem',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: THEME.shadow.sm
                                }}>
                                    <Plus size={16} strokeWidth={2.5} /> Crear Primera Cotización
                                </button>
                            </Link>
                        </div>
                    ) : filteredQuotes.length === 0 ? (
                        <div style={{ padding: '3rem', textAlign: 'center', color: THEME.colors.textSecondary }}>
                            <Filter size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
                            <p style={{ fontWeight: 'bold', margin: '0 0 4px 0', color: THEME.colors.textMain }}>No se encontraron cotizaciones</p>
                            <p style={{ fontSize: '0.85rem', margin: 0 }}>Prueba con otros términos de búsqueda o cambia el filtro de estado.</p>
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left' }}>
                            <thead style={{ backgroundColor: '#F9FAFB' }}>
                                <tr style={{ backgroundColor: '#F9FAFB' }}>
                                    <th style={{ backgroundColor: '#F9FAFB', borderBottom: `1.5px solid ${THEME.colors.border}`, padding: '0.85rem 1.25rem', position: 'sticky', top: embedded ? '203px' : '146px', zIndex: 60, borderTopLeftRadius: THEME.radius.lg, ...THEME.typography?.tableHeader }}>ID</th>
                                    <th style={{ backgroundColor: '#F9FAFB', borderBottom: `1.5px solid ${THEME.colors.border}`, padding: '0.85rem 1.25rem', position: 'sticky', top: embedded ? '203px' : '146px', zIndex: 60, ...THEME.typography?.tableHeader }}>Fecha</th>
                                    <th style={{ backgroundColor: '#F9FAFB', borderBottom: `1.5px solid ${THEME.colors.border}`, padding: '0.85rem 1.25rem', position: 'sticky', top: embedded ? '203px' : '146px', zIndex: 60, ...THEME.typography?.tableHeader }}>Cliente</th>
                                    <th style={{ backgroundColor: '#F9FAFB', borderBottom: `1.5px solid ${THEME.colors.border}`, padding: '0.85rem 1.25rem', position: 'sticky', top: embedded ? '203px' : '146px', zIndex: 60, ...THEME.typography?.tableHeader }}>Modelo</th>
                                    <th style={{ backgroundColor: '#F9FAFB', borderBottom: `1.5px solid ${THEME.colors.border}`, padding: '0.85rem 1.25rem', textAlign: 'right', position: 'sticky', top: embedded ? '203px' : '146px', zIndex: 60, ...THEME.typography?.tableHeader }}>Total</th>
                                    <th style={{ backgroundColor: '#F9FAFB', borderBottom: `1.5px solid ${THEME.colors.border}`, padding: '0.85rem 1.25rem', position: 'sticky', top: embedded ? '203px' : '146px', zIndex: 60, ...THEME.typography?.tableHeader }}>Estado</th>
                                    <th style={{ backgroundColor: '#F9FAFB', borderBottom: `1.5px solid ${THEME.colors.border}`, padding: '0.85rem 1.25rem', textAlign: 'right', position: 'sticky', top: embedded ? '203px' : '146px', zIndex: 60, borderTopRightRadius: THEME.radius.lg }}></th>
                                </tr>
                            </thead>
                                <tbody>
                                {filteredQuotes.map(quote => (
                                    <tr 
                                        key={quote.id} 
                                        style={{ borderBottom: `1px solid ${THEME.colors.border}`, transition: 'background 0.2s ease' }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F8FAF9'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                    >
                                        <td style={{ padding: '0.75rem 1.25rem', whiteSpace: 'nowrap', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                            <span style={{ 
                                                fontFamily: 'monospace', 
                                                fontSize: '0.75rem', 
                                                backgroundColor: '#F1F5F9', 
                                                padding: '4px 8px', 
                                                borderRadius: '6px', 
                                                fontWeight: 'bold', 
                                                color: '#475569',
                                                border: '1px solid #E2E8F0'
                                            }}>
                                                {quote.quote_number ? formatQuoteNumber(quote.quote_number, quote.status, quote.created_at, quote) : '---'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.75rem 1.25rem', color: THEME.colors.textSecondary, fontSize: '0.85rem', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                            {formatDate(quote.created_at)}
                                        </td>
                                        <td style={{ padding: '0.75rem 1.25rem', verticalAlign: 'middle', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                             <div style={{ fontWeight: 'bold', color: THEME.colors.textMain, fontSize: '0.9rem' }}>
                                                 {quote.client_name}
                                             </div>
                                             {renderClientTypeBadge(quote)}
                                         </td>
                                         <td style={{ padding: '0.75rem 1.25rem', color: THEME.colors.textSecondary, fontSize: '0.85rem', verticalAlign: 'middle', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                             {quote.model_snapshot_name || '---'}
                                         </td>
                                         <td style={{ padding: '0.75rem 1.25rem', fontWeight: 'bold', color: THEME.colors.primary, fontSize: '0.92rem', verticalAlign: 'middle', textAlign: 'right', fontFamily: 'monospace', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                             {formatMoney(quote.total_amount || quote.total || 0)}
                                         </td>
                                         <td style={{ padding: '0.75rem 1.25rem', verticalAlign: 'middle', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                             {getStatusBadge(quote.status, quote)}
                                         </td>
                                         <td style={{ padding: '0.75rem 1.25rem', textAlign: 'right', verticalAlign: 'middle', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                             <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                                 <Link href={`/admin/commercial/quotes/${quote.id}/print`} target="_blank" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                                                     <button 
                                                         title="Descargar PDF / Imprimir"
                                                         style={{ 
                                                             height: '32px',
                                                             boxSizing: 'border-box',
                                                             border: '1px solid transparent',
                                                             backgroundColor: '#EFF6FF',
                                                             color: '#1D4ED8',
                                                             padding: '0 0.75rem',
                                                             borderRadius: THEME.radius.sm,
                                                             cursor: 'pointer', 
                                                             fontWeight: '700',
                                                             fontSize: '0.75rem',
                                                             display: 'inline-flex',
                                                             alignItems: 'center',
                                                             justifyContent: 'center',
                                                             gap: '4px',
                                                             transition: 'all 0.2s'
                                                         }}
                                                         onMouseEnter={(e) => {
                                                             e.currentTarget.style.backgroundColor = '#DBEAFE';
                                                         }}
                                                         onMouseLeave={(e) => {
                                                             e.currentTarget.style.backgroundColor = '#EFF6FF';
                                                         }}
                                                     >
                                                         <FileText size={12} strokeWidth={2} /> PDF
                                                     </button>
                                                 </Link>
                                                 {(() => {
                                                     const eff = getEffectiveStatus(quote);
                                                     if (eff === 'sent' || eff === 'draft' || eff === 'accepted') {
                                                         return (
                                                             <button 
                                                                 onClick={() => handleOpenApproveModal(quote)}
                                                                 title="Aprobar propuesta vigente y congelar acuerdo de precios"
                                                                 style={{ 
                                                                     height: '32px',
                                                                     boxSizing: 'border-box',
                                                                     border: '1px solid #A7F3D0',
                                                                     backgroundColor: '#ECFDF5',
                                                                     color: '#047857',
                                                                     padding: '0 0.75rem',
                                                                     borderRadius: THEME.radius.sm,
                                                                     cursor: 'pointer', 
                                                                     fontWeight: '700',
                                                                     fontSize: '0.75rem',
                                                                     display: 'inline-flex',
                                                                     alignItems: 'center',
                                                                     justifyContent: 'center',
                                                                     gap: '4px',
                                                                     transition: 'all 0.2s'
                                                                 }}
                                                                 onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#D1FAE5'; }}
                                                                 onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ECFDF5'; }}
                                                             >
                                                                 <Handshake size={13} strokeWidth={2} /> Aprobar y Congelar
                                                             </button>
                                                         );
                                                     }
                                                     if (eff === 'expired') {
                                                         return (
                                                             <Link href={`/admin/commercial/quotes/create?duplicate_from=${quote.id}`} style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                                                                 <button 
                                                                     title="Recotizar canasta actualizando a costos vivos de hoy"
                                                                     style={{ 
                                                                         height: '32px',
                                                                         boxSizing: 'border-box',
                                                                         border: '1px solid #FDE68A',
                                                                         backgroundColor: '#FFFBEB',
                                                                         color: '#B45309',
                                                                         padding: '0 0.75rem',
                                                                         borderRadius: THEME.radius.sm,
                                                                         cursor: 'pointer', 
                                                                         fontWeight: '700',
                                                                         fontSize: '0.75rem',
                                                                         display: 'inline-flex',
                                                                         alignItems: 'center',
                                                                         justifyContent: 'center',
                                                                         gap: '4px',
                                                                         transition: 'all 0.2s'
                                                                     }}
                                                                     onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#FEF3C7'; }}
                                                                     onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#FFFBEB'; }}
                                                                 >
                                                                     <RefreshCw size={12} strokeWidth={2} /> Recotizar Hoy
                                                                 </button>
                                                             </Link>
                                                         );
                                                     }
                                                     if (eff === 'superseded' || eff === 'rejected') {
                                                         return (
                                                             <Link href={`/admin/commercial/quotes/create?duplicate_from=${quote.id}`} style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                                                                 <button 
                                                                     title="Duplicar como nueva cotización con precios actualizados"
                                                                     style={{ 
                                                                         height: '32px',
                                                                         boxSizing: 'border-box',
                                                                         border: '1px solid #CBD5E1',
                                                                         backgroundColor: '#F8FAFC',
                                                                         color: '#475569',
                                                                         padding: '0 0.75rem',
                                                                         borderRadius: THEME.radius.sm,
                                                                         cursor: 'pointer', 
                                                                         fontWeight: '700',
                                                                         fontSize: '0.75rem',
                                                                         display: 'inline-flex',
                                                                         alignItems: 'center',
                                                                         justifyContent: 'center',
                                                                         gap: '4px',
                                                                         transition: 'all 0.2s'
                                                                     }}
                                                                     onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#F1F5F9'; }}
                                                                     onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#F8FAFC'; }}
                                                                 >
                                                                     <Copy size={12} strokeWidth={2} /> Duplicar
                                                                 </button>
                                                             </Link>
                                                         );
                                                     }
                                                     return null;
                                                 })()}
                                                 <Link href={`/admin/commercial/quotes/${quote.id}`} style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                                                     <button style={{ 
                                                         height: '32px',
                                                         boxSizing: 'border-box',
                                                         border: `1px solid ${THEME.colors.borderActive}`,
                                                         backgroundColor: 'white',
                                                         color: THEME.colors.textSecondary,
                                                         padding: '0 0.75rem',
                                                         borderRadius: THEME.radius.sm,
                                                         cursor: 'pointer', 
                                                         fontWeight: '600',
                                                         fontSize: '0.75rem',
                                                         display: 'inline-flex',
                                                         alignItems: 'center',
                                                         justifyContent: 'center',
                                                         gap: '4px',
                                                         transition: 'all 0.2s'
                                                     }}>
                                                         Ver Detalle <ChevronRight size={12} strokeWidth={1.5} />
                                                     </button>
                                                 </Link>
                                                 <button 
                                                     onClick={() => handleDelete(quote.id, quote.quote_number)}
                                                     style={{ 
                                                         height: '32px',
                                                         width: '32px',
                                                         boxSizing: 'border-box',
                                                         color: '#EF4444', 
                                                         backgroundColor: 'white', 
                                                         border: `1px solid ${THEME.colors.border}`, 
                                                         cursor: 'pointer', 
                                                         padding: 0, 
                                                         borderRadius: THEME.radius.sm, 
                                                         display: 'inline-flex', 
                                                         alignItems: 'center', 
                                                         justifyContent: 'center',
                                                         transition: 'all 0.2s' 
                                                     }}
                                                     onMouseEnter={(e) => {
                                                         e.currentTarget.style.backgroundColor = '#FEE2E2';
                                                         e.currentTarget.style.borderColor = '#EF4444';
                                                     }}
                                                     onMouseLeave={(e) => {
                                                         e.currentTarget.style.backgroundColor = 'white';
                                                         e.currentTarget.style.borderColor = THEME.colors.border;
                                                     }}
                                                     title="Eliminar permanentemente"
                                                 >
                                                     <Trash2 size={14} strokeWidth={1.5} />
                                                 </button>
                                             </div>
                                         </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
            {/* MODAL DE APROBACIÓN Y CONGELAMIENTO RÁPIDO DE ACUERDO (CANAL 2 SDD) */}
            {quoteToApprove && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(15, 23, 42, 0.65)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    padding: '1rem'
                }}>
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '16px',
                        maxWidth: '540px',
                        width: '100%',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                        border: '1px solid #E2E8F0',
                        overflow: 'hidden'
                    }}>
                        {/* Cabecera */}
                        <div style={{
                            padding: '1.25rem 1.5rem',
                            borderBottom: '1px solid #E2E8F0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            backgroundColor: '#F8FAFC'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{
                                    backgroundColor: '#ECFDF5',
                                    color: '#0D7A57',
                                    width: '38px',
                                    height: '38px',
                                    borderRadius: '10px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <Handshake size={20} strokeWidth={2.2} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                                        Aprobar y Congelar Acuerdo de Precios
                                    </h3>
                                    <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#64748B' }}>
                                        Cotización {quoteToApprove.quote_number ? formatQuoteNumber(quoteToApprove.quote_number, quoteToApprove.status, quoteToApprove.created_at) : '---'}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setQuoteToApprove(null)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '4px' }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Contenido */}
                        <div style={{ padding: '1.5rem' }}>
                            {/* Tarjeta de Cliente */}
                            <div style={{
                                backgroundColor: quoteToApprove.client_id ? '#F0FDF4' : '#FFFBEB',
                                border: `1px solid ${quoteToApprove.client_id ? '#86EFAC' : '#FCD34D'}`,
                                borderRadius: '10px',
                                padding: '1rem',
                                marginBottom: '1.25rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px'
                            }}>
                                <Building2 size={22} color={quoteToApprove.client_id ? '#166534' : '#B45309'} />
                                <div>
                                    <div style={{ fontSize: '0.92rem', fontWeight: 800, color: quoteToApprove.client_id ? '#166534' : '#92400E' }}>
                                        {quoteToApprove.client_name || quoteToApprove.profiles?.company_name || 'Cliente B2B'}
                                    </div>
                                    <div style={{ fontSize: '0.74rem', color: quoteToApprove.client_id ? '#15803D' : '#B45309', marginTop: '2px' }}>
                                        {quoteToApprove.client_id
                                            ? 'Cliente institucional formalizado. Se congelarán las tarifas vigentes.'
                                            : 'Prospecto comercial. Si requiere registrar RUT o dirección completa, ingresa a Ver Detalle.'}
                                    </div>
                                </div>
                            </div>

                            {/* Fechas de Vigencia */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                                        Presets de Vigencia Rápida
                                    </label>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                                        {[15, 30, 60, 90].map(days => (
                                            <button
                                                key={days}
                                                type="button"
                                                onClick={() => handleApplyPreset(days)}
                                                style={{
                                                    padding: '6px 8px',
                                                    borderRadius: '8px',
                                                    border: presetDays === days ? '1.5px solid #0D7A57' : '1px solid #CBD5E1',
                                                    backgroundColor: presetDays === days ? '#ECFDF5' : '#FFFFFF',
                                                    color: presetDays === days ? '#065F46' : '#64748B',
                                                    fontSize: '0.75rem',
                                                    fontWeight: '700',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s'
                                                }}
                                            >
                                                {days === 30 ? '1 mes' : days === 60 ? '2 meses' : days === 90 ? '3 meses' : `${days} días`}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#64748B', marginBottom: '4px' }}>
                                            Fecha de Inicio
                                        </label>
                                        <input
                                            type="date"
                                            value={approvalStartDate}
                                            onChange={e => setApprovalStartDate(e.target.value)}
                                            style={{
                                                width: '100%',
                                                padding: '8px 10px',
                                                borderRadius: '8px',
                                                border: '1px solid #CBD5E1',
                                                fontSize: '0.8rem',
                                                color: '#1E293B',
                                                outline: 'none'
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#64748B', marginBottom: '4px' }}>
                                            Fecha de Vencimiento
                                        </label>
                                        <input
                                            type="date"
                                            value={approvalValidUntil}
                                            onChange={e => {
                                                setApprovalValidUntil(e.target.value);
                                                setPresetDays(0);
                                            }}
                                            style={{
                                                width: '100%',
                                                padding: '8px 10px',
                                                borderRadius: '8px',
                                                border: '1px solid #CBD5E1',
                                                fontSize: '0.8rem',
                                                color: '#1E293B',
                                                outline: 'none'
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Botonera de Acciones */}
                        <div style={{
                            padding: '1rem 1.5rem',
                            borderTop: '1px solid #E2E8F0',
                            backgroundColor: '#F8FAFC',
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: '8px'
                        }}>
                            <button
                                type="button"
                                onClick={() => setQuoteToApprove(null)}
                                style={{
                                    padding: '8px 14px',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1',
                                    backgroundColor: 'white',
                                    color: '#475569',
                                    fontSize: '0.8rem',
                                    fontWeight: '600',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmApprove}
                                disabled={approving}
                                style={{
                                    padding: '8px 18px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    backgroundColor: '#0D7A57',
                                    color: 'white',
                                    fontSize: '0.8rem',
                                    fontWeight: '700',
                                    cursor: approving ? 'not-allowed' : 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: '0 2px 6px rgba(13, 122, 87, 0.25)'
                                }}
                            >
                                {approving ? <Loader2 size={14} className="animate-spin" /> : <Handshake size={14} />}
                                Confirmar y Congelar Acuerdo
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
