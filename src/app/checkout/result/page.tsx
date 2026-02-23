'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';

function ResultContent() {
    const searchParams = useSearchParams();
    const transactionId = searchParams.get('id');
    const [status, setStatus] = useState<'loading' | 'success' | 'pending' | 'error'>('loading');
    const [transactionData, setTransactionData] = useState<any>(null);

    useEffect(() => {
        if (!transactionId) {
            setStatus('error');
            return;
        }

        // Llamamos a nuestra API interna para verificar el estado en nuestra BD
        const checkStatus = async () => {
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

    const renderIcon = () => {
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
            <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>{renderIcon()}</div>
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
                    padding: '1rem',
                    borderRadius: '12px',
                    marginBottom: '2.5rem',
                    fontSize: '0.9rem',
                    fontFamily: 'monospace'
                }}>
                    ID de Transacción: {transactionId}
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
