'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { Trash2, Inbox, Plus, ChevronRight } from 'lucide-react';
import { THEME, formatMoney } from '@/lib/adminTheme';

export default function QuotesListPage() {
    const [quotes, setQuotes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchQuotes = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('quotes')
            .select('*')
            .order('created_at', { ascending: false });

        if (data) setQuotes(data);
        setLoading(false);
    };

    useEffect(() => {
        fetchQuotes();
    }, []);

    const handleDelete = async (id: string, quoteNumber: string) => {
        if (!window.confirm(`¿Estás seguro de ELIMINAR permanentemente la cotización #${quoteNumber}?`)) return;

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

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'draft': return <span style={{ backgroundColor: '#F3F4F6', color: '#4B5563', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>Borrador</span>;
            case 'sent': return <span style={{ backgroundColor: '#DBEAFE', color: '#1E40AF', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>Enviada</span>;
            case 'accepted': return <span style={{ backgroundColor: '#D1FAE5', color: '#065F46', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>Aceptada</span>;
            case 'converted': return <span style={{ backgroundColor: '#ECFDF5', color: '#047857', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold', border: '1px solid #10B981' }}>PEDIDO CREADO</span>;
            case 'agreement': return <span style={{ backgroundColor: '#EFF6FF', color: '#1D4ED8', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold', border: '1px solid #3B82F6' }}>ACUERDO COMERCIAL</span>;
            case 'rejected': return <span style={{ backgroundColor: '#FEE2E2', color: '#991B1B', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>Rechazada</span>;
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
                                        <td style={{ padding: '0.65rem 1.25rem', fontWeight: 'bold', color: THEME.colors.textMain, fontSize: '0.9rem' }}>
                                            {quote.quote_number || '#'}
                                        </td>
                                        <td style={{ padding: '0.65rem 1.25rem', fontWeight: '500', color: THEME.colors.textSecondary }}>
                                            {formatDate(quote.created_at)}
                                        </td>
                                        <td style={{ padding: '0.65rem 1.25rem', fontWeight: 'bold', color: THEME.colors.textMain }}>
                                            {quote.client_name}
                                        </td>
                                        <td style={{ padding: '0.65rem 1.25rem', color: THEME.colors.textSecondary }}>
                                            {quote.model_snapshot_name || 'N/A'}
                                        </td>
                                        <td style={{ padding: '0.65rem 1.25rem', fontWeight: 'bold', color: THEME.colors.primary }}>
                                            {formatMoney(quote.total_amount || 0)}
                                        </td>
                                        <td style={{ padding: '0.65rem 1.25rem' }}>
                                            {getStatusBadge(quote.status)}
                                        </td>
                                        <td style={{ padding: '0.65rem 1.25rem', textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                                            <Link href={`/admin/commercial/quotes/${quote.id}`} style={{ textDecoration: 'none' }}>
                                                <button style={{ 
                                                    border: `1px solid ${THEME.colors.borderActive}`,
                                                    backgroundColor: 'transparent',
                                                    color: THEME.colors.textSecondary,
                                                    padding: '0.35rem 0.75rem',
                                                    borderRadius: THEME.radius.sm,
                                                    cursor: 'pointer', 
                                                    fontWeight: '600',
                                                    fontSize: '0.75rem',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    transition: 'all 0.2s'
                                                }}>
                                                    Ver Detalle <ChevronRight size={12} strokeWidth={1.5} />
                                                </button>
                                            </Link>
                                            <button 
                                                onClick={() => handleDelete(quote.id, quote.quote_number)}
                                                style={{ 
                                                    color: '#EF4444', 
                                                    background: 'none', 
                                                    border: `1px solid ${THEME.colors.border}`, 
                                                    cursor: 'pointer', 
                                                    padding: '0.35rem', 
                                                    borderRadius: THEME.radius.sm, 
                                                    display: 'flex', 
                                                    alignItems: 'center', 
                                                    transition: 'all 0.2s' 
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.backgroundColor = '#FEE2E2';
                                                    e.currentTarget.style.borderColor = '#EF4444';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.backgroundColor = 'transparent';
                                                    e.currentTarget.style.borderColor = THEME.colors.border;
                                                }}
                                                title="Eliminar permanentemente"
                                            >
                                                <Trash2 size={14} strokeWidth={1.5} />
                                            </button>
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
