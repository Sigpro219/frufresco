'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { Trash2, Inbox, Plus, ChevronRight, FileText } from 'lucide-react';
import { THEME, formatMoney } from '@/lib/adminTheme';

export default function QuotesListPage() {
    const [quotes, setQuotes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

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

        // 2. Heartbeat de sincronización silenciosa en segundo plano (cada 8s)
        const pollingInterval = setInterval(() => {
            fetchQuotes(false);
        }, 8000);

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

    const formatQuoteNumber = (seq: number, status?: string, dateStr?: string) => {
        const date = dateStr ? new Date(dateStr) : new Date();
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const paddedSeq = String(seq).padStart(4, '0');
        const prefix = status === 'agreement' ? 'ACI' : 'COT';
        return `${prefix} ${day}${month} ${paddedSeq}`;
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'draft': return <span style={{ backgroundColor: '#F3F4F6', color: '#4B5563', padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold', display: 'inline-block', whiteSpace: 'nowrap' }}>Borrador</span>;
            case 'sent': return <span style={{ backgroundColor: '#DBEAFE', color: '#1E40AF', padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold', display: 'inline-block', whiteSpace: 'nowrap' }}>Enviada</span>;
            case 'accepted': return <span style={{ backgroundColor: '#D1FAE5', color: '#065F46', padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold', display: 'inline-block', whiteSpace: 'nowrap' }}>Aceptada</span>;
            case 'converted': return <span style={{ backgroundColor: '#ECFDF5', color: '#047857', padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold', border: '1px solid #10B981', display: 'inline-block', whiteSpace: 'nowrap' }}>Pedido Creado</span>;
            case 'agreement': return <span style={{ backgroundColor: '#EFF6FF', color: '#1D4ED8', padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold', border: '1px solid #3B82F6', display: 'inline-block', whiteSpace: 'nowrap' }}>Acuerdo Comercial</span>;
            case 'rejected': return <span style={{ backgroundColor: '#FEE2E2', color: '#991B1B', padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold', display: 'inline-block', whiteSpace: 'nowrap' }}>Rechazada</span>;
            default: return status;
        }
    };

    return (
        <main style={{ minHeight: '100vh', backgroundColor: THEME.colors.background, fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif' }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
                <div style={{ marginBottom: '1rem' }}>
                    <Link href="/admin/commercial" style={{ textDecoration: 'none', color: THEME.colors.textSecondary, fontWeight: '600', fontSize: '0.85rem' }}>
                        ← Volver al Panel
                    </Link>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <h1 style={{ fontSize: '2rem', fontWeight: '900', color: THEME.colors.textMain, margin: 0, letterSpacing: '-0.025em' }}>Historial de Cotizaciones</h1>
                    <Link href="/admin/commercial/quotes/create">
                        <button 
                            style={{ 
                                padding: '0.75rem 1.5rem', 
                                backgroundColor: THEME.colors.primary, 
                                color: 'white', 
                                border: 'none', 
                                borderRadius: THEME.radius.md, 
                                fontWeight: '700', 
                                cursor: 'pointer', 
                                fontSize: '0.9rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                transition: 'all 0.2s',
                                boxShadow: THEME.shadow.sm
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = THEME.colors.primaryHover;
                                e.currentTarget.style.transform = 'translateY(-1px)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = THEME.colors.primary;
                                e.currentTarget.style.transform = 'translateY(0)';
                            }}
                        >
                            <Plus size={16} strokeWidth={1.5} /> Nueva Cotización
                        </button>
                    </Link>
                </div>

                <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm, overflow: 'hidden' }}>
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
                                color: THEME.colors.primary,
                                marginBottom: '1.5rem'
                            }}>
                                <Inbox size={32} strokeWidth={1.5} />
                            </div>
                            <h3 style={{ color: THEME.colors.textMain, margin: '0 0 0.5rem 0', fontWeight: '700' }}>No hay cotizaciones registradas</h3>
                            <p style={{ color: THEME.colors.textSecondary, margin: 0, fontSize: '0.9rem', fontWeight: '500' }}>Crea la primera para empezar a vender.</p>
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#F9FAFB', borderBottom: `1px solid ${THEME.colors.border}`, textAlign: 'left' }}>
                                    <th style={{ padding: '0.65rem 1.25rem', ...THEME.typography?.tableHeader }}>ID</th>
                                    <th style={{ padding: '0.65rem 1.25rem', ...THEME.typography?.tableHeader }}>Fecha</th>
                                    <th style={{ padding: '0.65rem 1.25rem', ...THEME.typography?.tableHeader }}>Cliente</th>
                                    <th style={{ padding: '0.65rem 1.25rem', ...THEME.typography?.tableHeader }}>Modelo</th>
                                    <th style={{ padding: '0.65rem 1.25rem', ...THEME.typography?.tableHeader }}>Total</th>
                                    <th style={{ padding: '0.65rem 1.25rem', ...THEME.typography?.tableHeader }}>Estado</th>
                                    <th style={{ padding: '0.65rem 1.25rem' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {quotes.map(quote => (
                                    <tr 
                                        key={quote.id} 
                                        style={{ borderBottom: `1px solid ${THEME.colors.border}`, transition: 'background 0.2s ease' }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F8FAF9'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                    >
                                        <td style={{ padding: '0.75rem 1.25rem', whiteSpace: 'nowrap' }}>
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
                                                {quote.quote_number ? formatQuoteNumber(quote.quote_number, quote.status, quote.created_at) : '---'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.75rem 1.25rem', color: THEME.colors.textSecondary, fontSize: '0.85rem' }}>
                                            {formatDate(quote.created_at)}
                                        </td>
                                        <td style={{ padding: '0.75rem 1.25rem', verticalAlign: 'middle' }}>
                                             <div style={{ fontWeight: 'bold', color: THEME.colors.textMain, fontSize: '0.9rem' }}>
                                                 {quote.client_name}
                                             </div>
                                             {renderClientTypeBadge(quote)}
                                         </td>
                                         <td style={{ padding: '0.75rem 1.25rem', color: THEME.colors.textSecondary, fontSize: '0.85rem', verticalAlign: 'middle' }}>
                                             {quote.model_snapshot_name || '---'}
                                         </td>
                                         <td style={{ padding: '0.75rem 1.25rem', fontWeight: 'bold', color: THEME.colors.primary, fontSize: '0.9rem', verticalAlign: 'middle' }}>
                                             {formatMoney(quote.total_amount || 0)}
                                         </td>
                                         <td style={{ padding: '0.75rem 1.25rem', verticalAlign: 'middle' }}>
                                             {getStatusBadge(quote.status)}
                                         </td>
                                         <td style={{ padding: '0.75rem 1.25rem', textAlign: 'right', verticalAlign: 'middle' }}>
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
        </main>
    );
}
