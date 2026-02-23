'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import Link from 'next/link';

export default function QuotesListPage() {
    const [quotes, setQuotes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchQuotes();
    }, []);

    const fetchQuotes = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('quotes')
            .select('*')
            .order('created_at', { ascending: false });

        if (data) setQuotes(data);
        setLoading(false);
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
            case 'converted': return <span style={{ backgroundColor: '#ECFDF5', color: '#047857', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold', border: '1px solid #10B981' }}>COMPLETADA</span>;
            case 'rejected': return <span style={{ backgroundColor: '#FEE2E2', color: '#991B1B', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>Rechazada</span>;
            default: return status;
        }
    };

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F3F4F6', fontFamily: 'Inter, sans-serif' }}>
            <Navbar />
            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
                <div style={{ marginBottom: '1rem' }}>
                    <Link href="/admin/commercial" style={{ textDecoration: 'none', color: '#6B7280', fontWeight: '600' }}>← Volver al Panel</Link>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <h1 style={{ fontSize: '2rem', fontWeight: '900', color: '#111827', margin: 0 }}>Historial de Cotizaciones</h1>
                    <Link href="/admin/commercial/quotes/create">
                        <button style={{ padding: '0.8rem 1.5rem', backgroundColor: '#111827', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '1rem' }}>
                            + Nueva Cotización
                        </button>
                    </Link>
                </div>

                <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                    {loading ? (
                        <div style={{ padding: '3rem', textAlign: 'center', color: '#6B7280' }}>Cargando...</div>
                    ) : quotes.length === 0 ? (
                        <div style={{ padding: '4rem', textAlign: 'center' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
                            <h3 style={{ color: '#374151' }}>No hay cotizaciones registradas</h3>
                            <p style={{ color: '#9CA3AF' }}>Crea la primera para empezar a vender.</p>
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB', textAlign: 'left' }}>
                                    <th style={{ padding: '1rem', color: '#6B7280', fontSize: '0.8rem', textTransform: 'uppercase' }}>ID</th>
                                    <th style={{ padding: '1rem', color: '#6B7280', fontSize: '0.8rem', textTransform: 'uppercase' }}>Fecha</th>
                                    <th style={{ padding: '1rem', color: '#6B7280', fontSize: '0.8rem', textTransform: 'uppercase' }}>Cliente</th>
                                    <th style={{ padding: '1rem', color: '#6B7280', fontSize: '0.8rem', textTransform: 'uppercase' }}>Modelo</th>
                                    <th style={{ padding: '1rem', color: '#6B7280', fontSize: '0.8rem', textTransform: 'uppercase' }}>Total</th>
                                    <th style={{ padding: '1rem', color: '#6B7280', fontSize: '0.8rem', textTransform: 'uppercase' }}>Estado</th>
                                    <th style={{ padding: '1rem' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {quotes.map(quote => (
                                    <tr key={quote.id} style={{ borderBottom: '1px solid #F3F4F6', transition: 'background 0.2s' }}>
                                        <td style={{ padding: '1rem', fontWeight: 'bold', color: '#111827', fontSize: '0.9rem' }}>
                                            {quote.quote_number || '#'}
                                        </td>
                                        <td style={{ padding: '1rem', fontWeight: '500', color: '#374151' }}>
                                            {formatDate(quote.created_at)}
                                        </td>
                                        <td style={{ padding: '1rem', fontWeight: 'bold', color: '#111827' }}>
                                            {quote.client_name}
                                        </td>
                                        <td style={{ padding: '1rem', color: '#4B5563' }}>
                                            {quote.model_snapshot_name || 'N/A'}
                                        </td>
                                        <td style={{ padding: '1rem', fontWeight: 'bold', color: '#059669' }}>
                                            ${quote.total_amount?.toLocaleString()}
                                        </td>
                                        <td style={{ padding: '1rem' }}>
                                            {getStatusBadge(quote.status)}
                                        </td>
                                        <td style={{ padding: '1rem', textAlign: 'right' }}>
                                            <Link href={`/admin/commercial/quotes/${quote.id}`}>
                                                <button style={{ color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
                                                    Ver Detalle →
                                                </button>
                                            </Link>
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
