'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { getFriendlyOrderId } from '@/lib/orderUtils';
import { Copy, Check } from 'lucide-react';

function ResultContent() {
    const searchParams = useSearchParams();
    const transactionId = searchParams.get('id');
    const [status, setStatus] = useState<'loading' | 'success' | 'pending' | 'error'>('loading');
    const [transactionData, setTransactionData] = useState<{
        status: string;
        order_id: string;
        order_sequence: number;
        order_created_at: string;
    } | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        const checkStatus = async () => {
            if (!transactionId) {
                setStatus('error');
                return;
            }
            try {
                const response = await fetch(`/api/payments/status?id=${transactionId}`);
                const responseBody = await response.json();
                const data = responseBody.data;

                setTransactionData(data);

                if (data && data.status === 'APPROVED') setStatus('success');
                else if (data && data.status === 'PENDING') setStatus('pending');
                else setStatus('error');
            } catch (error) {
                console.error('Error fetching transaction:', error);
                setStatus('pending'); // Fallback a pendiente
            }
        };

        checkStatus();
    }, [transactionId]);

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const renderIconStatus = () => {
        switch (status) {
            case 'success': return '✅';
            case 'pending': return '⏳';
            case 'error': return '❌';
            default: return '🌀';
        }
    };

    const renderMessage = () => {
        switch (status) {
            case 'success': return '¡Pago Aprobado!';
            case 'pending': return 'Pago en Proceso';
            case 'error': return 'Hubo un problema con el pago';
            default: return 'Verificando transacción...';
        }
    };

    const friendlyId = transactionData?.order_id 
        ? getFriendlyOrderId({
            id: transactionData.order_id,
            sequence_id: transactionData.order_sequence,
            created_at: transactionData.order_created_at
        })
        : '';

    return (
        <div style={{
            maxWidth: '600px',
            margin: '4rem auto',
            padding: '3rem',
            textAlign: 'center',
            backgroundColor: 'white',
            borderRadius: '24px',
            boxShadow: 'var(--shadow-lg)',
            border: '1px solid var(--border)'
        }}>
            <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>{renderIconStatus()}</div>
            <h1 style={{ fontSize: '2rem', fontWeight: '900', marginBottom: '1rem' }}>{renderMessage()}</h1>

            <p style={{ color: 'var(--text-muted)', marginBottom: '2.5rem', fontSize: '1.1rem' }}>
                {status === 'success'
                    ? 'Tu pedido ha sido confirmado y está siendo preparado por nuestro equipo.'
                    : status === 'pending'
                        ? 'Estamos esperando la confirmación de tu banco. Te avisaremos cuando el estado cambie.'
                        : 'La transacción no pudo completarse. Por favor, intenta de nuevo o usa otro medio de pago.'}
            </p>

            {transactionId && (
                <div style={{
                    backgroundColor: '#F3F4F6',
                    padding: '1.25rem',
                    borderRadius: '16px',
                    marginBottom: '2.5rem',
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#6B7280', textTransform: 'uppercase' }}>ID de Transacción</span>
                        <span style={{ fontSize: '0.9rem', fontFamily: 'monospace', fontWeight: '600' }}>{transactionId}</span>
                    </div>
                    {friendlyId && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #E5E7EB', paddingTop: '0.75rem', marginTop: '0.25rem' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--primary)', textTransform: 'uppercase' }}>Número de Pedido</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ 
                                    fontSize: '1.3rem', 
                                    fontWeight: '900', 
                                    color: 'var(--primary)',
                                    letterSpacing: '0.05em'
                                }}>
                                    {friendlyId}
                                </span>
                                <button
                                    onClick={() => handleCopy(friendlyId)}
                                    title="Copiar Pedido"
                                    style={{
                                        background: copied ? '#F0FDF4' : 'white',
                                        border: `1px solid ${copied ? '#16A34A' : '#E5E7EB'}`,
                                        borderRadius: '8px',
                                        padding: '6px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'all 0.2s',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                    }}
                                >
                                    {copied ? <Check size={16} color="#16A34A" /> : <Copy size={16} color="#6B7280" />}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                <Link href="/" className="btn btn-primary" style={{ padding: '0.8rem 2rem' }}>
                    Volver al Inicio
                </Link>
                {status === 'error' && (
                    <Link href="/checkout" className="btn" style={{ padding: '0.8rem 2rem', border: '1px solid var(--border)' }}>
                        Reintentar
                    </Link>
                )}
            </div>
        </div>
    );
}

export default function CheckoutResultPage() {
    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F9FAFB' }}>
            <Navbar />
            <Suspense fallback={
                <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem' }}>
                    <p>Cargando resultado...</p>
                </div>
            }>
                <ResultContent />
            </Suspense>
        </main>
    );
}
