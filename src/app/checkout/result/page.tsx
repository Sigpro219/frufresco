'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useCart } from '@/lib/cartContext';
import { getFriendlyOrderId } from '@/lib/orderUtils';
import { Copy, Check, CheckCircle2, Clock, XCircle, Banknote, ShoppingBag } from 'lucide-react';

function ResultContent() {
    const searchParams = useSearchParams();
    const transactionId = searchParams.get('id');
    const codStatus = searchParams.get('status');
    const reference = searchParams.get('reference');
    const sequence = searchParams.get('sequence');
    const createdAt = searchParams.get('created_at');
    
    const [status, setStatus] = useState<'loading' | 'success' | 'pending' | 'error'>('loading');
    const [transactionData, setTransactionData] = useState<{
        status: string;
        order_id: string;
        order_sequence: number;
        order_created_at: string;
    } | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (codStatus === 'cod_success' && reference) {
            setStatus('success');
            setTransactionData({
                status: 'APPROVED',
                order_id: reference,
                order_sequence: sequence ? parseInt(sequence) : 0,
                order_created_at: createdAt || new Date().toISOString()
            });
            return;
        }

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
    }, [transactionId, codStatus, reference, sequence, createdAt]);

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const renderIconStatus = () => {
        switch (status) {
            case 'success': 
                return <CheckCircle2 size={64} color="#10B981" />;
            case 'pending': 
                return <Clock size={64} color="#F59E0B" />;
            case 'error': 
                return <XCircle size={64} color="#EF4444" />;
            default: 
                return <Clock size={64} color="#94A3B8" />;
        }
    };

    const renderMessage = () => {
        if (codStatus === 'cod_success') return '¡Pedido Registrado con Éxito!';
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
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>{renderIconStatus()}</div>
            <h1 style={{ fontSize: '2rem', fontWeight: '900', marginBottom: '1rem', color: '#0F172A', fontFamily: 'var(--font-outfit), sans-serif' }}>{renderMessage()}</h1>

            <p style={{ color: 'var(--text-muted)', marginBottom: '2.5rem', fontSize: '1.05rem', lineHeight: '1.5' }}>
                {codStatus === 'cod_success'
                    ? 'Tu pedido ha sido guardado exitosamente con modalidad de Pago Contra Entrega. Iniciaremos el alistamiento de tus alimentos frescos inmediatamente.'
                    : status === 'success'
                        ? 'Tu pedido ha sido confirmado y está siendo preparado por nuestro equipo.'
                        : status === 'pending'
                            ? 'Estamos esperando la confirmación de tu banco. Te avisaremos cuando el estado cambie.'
                            : 'La transacción no pudo completarse. Por favor, intenta de nuevo o usa otro medio de pago.'}
            </p>

            {codStatus === 'cod_success' && (
                <div style={{
                    backgroundColor: '#FFFBEB',
                    border: '1px solid #FDE68A',
                    borderRadius: '18px',
                    padding: '1.25rem 1.5rem',
                    marginBottom: '2rem',
                    textAlign: 'left',
                    color: '#92400E',
                    fontSize: '0.9rem'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '800', fontSize: '1rem', color: '#B45309', marginBottom: '6px' }}>
                        <Banknote size={20} color="#D97706" /> Recordatorio de Pago al Recibir
                    </div>
                    <div style={{ color: '#78350F', lineHeight: '1.4' }}>
                        Al momento de la entrega en tu domicilio, recuerda cancelar el valor exacto de tu pedido en <strong>efectivo o transferencia (Nequi / Daviplata / PSE)</strong> al domiciliario.
                    </div>
                </div>
            )}

            {(transactionId || codStatus === 'cod_success') && (
                <div style={{
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    padding: '1.25rem 1.5rem',
                    borderRadius: '18px',
                    marginBottom: '2.5rem',
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase' }}>
                            {codStatus === 'cod_success' ? 'Método de Pago' : 'ID de Transacción'}
                        </span>
                        <span style={{ fontSize: '0.9rem', fontFamily: codStatus === 'cod_success' ? 'sans-serif' : 'monospace', fontWeight: '700', color: '#334155' }}>
                            {codStatus === 'cod_success' ? 'Contra Entrega (Efectivo / Transferencia)' : transactionId}
                        </span>
                    </div>
                    {friendlyId && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #E2E8F0', paddingTop: '0.75rem', marginTop: '0.25rem' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--primary)', textTransform: 'uppercase' }}>Número de Pedido</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ 
                                    fontSize: '1.3rem', 
                                    fontWeight: '900', 
                                    color: 'var(--primary)',
                                    letterSpacing: '0.05em',
                                    fontFamily: 'var(--font-outfit), sans-serif'
                                }}>
                                    {friendlyId}
                                </span>
                                <button
                                    onClick={() => handleCopy(friendlyId)}
                                    title="Copiar Pedido"
                                    style={{
                                        background: copied ? '#F0FDF4' : 'white',
                                        border: `1px solid ${copied ? '#16A34A' : '#E2E8F0'}`,
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

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <Link href="/" className="btn btn-primary" style={{ padding: '0.85rem 2rem', display: 'inline-flex', alignItems: 'center', gap: '8px', borderRadius: '14px', fontWeight: '800' }}>
                    <ShoppingBag size={18} /> Volver al Inicio
                </Link>
                {status === 'error' && (
                    <Link href="/checkout" className="btn" style={{ padding: '0.85rem 2rem', border: '1px solid var(--border)', borderRadius: '14px', fontWeight: '700' }}>
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
