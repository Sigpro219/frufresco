'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

function SimulatorContent() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const reference = searchParams.get('reference');
    const amountInCents = searchParams.get('amount-in-cents');
    const currency = searchParams.get('currency') || 'COP';

    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<'idle' | 'processing'>('idle');

    const amount = amountInCents ? parseInt(amountInCents) / 100 : 0;

    const handlePayment = async (finalStatus: 'APPROVED' | 'DECLINED' | 'ERROR') => {
        setLoading(true);
        setStatus('processing');

        try {
            // 1. Generar ID de transacción consistente
            const transactionId = `sim-${Math.random().toString(36).substr(2, 9)}`;

            // 2. Llamar al Webhook interno para simular la confirmación de Wompi
            const response = await fetch('/api/payments/wompi/webhook', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event: 'transaction.updated',
                    data: {
                        transaction: {
                            id: transactionId,
                            status: finalStatus,
                            reference: reference,
                            amount_in_cents: amountInCents,
                            currency: currency
                        }
                    },
                    timestamp: Math.floor(Date.now() / 1000)
                })
            });

            if (!response.ok) throw new Error('Error al notificar al webhook');

            // 3. Redirigir a la página de resultados usando EL MISMO ID
            router.push(`/checkout/result?id=${transactionId}`);

        } catch (error) {
            console.error('Simulation Error:', error);
            alert('Error en la simulación del pago');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            maxWidth: '500px',
            margin: '4rem auto',
            backgroundColor: 'white',
            borderRadius: '16px',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1px solid #E5E7EB'
        }}>
            {/* Header estilo Wompi */}
            <div style={{
                backgroundColor: '#3B0F6E',
                padding: '1.5rem',
                color: 'white',
                textAlign: 'center'
            }}>
                <div style={{ fontSize: '1.5rem', fontWeight: '800', marginBottom: '4px' }}>Wompi <span style={{ fontWeight: '300' }}>Mock</span></div>
                <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>ENTORNO DE SIMULACIÓN FRUBANA</div>
            </div>

            <div style={{ padding: '2rem' }}>
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <div style={{ fontSize: '0.9rem', color: '#6B7280', marginBottom: '0.5rem' }}>Estás pagando a</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: '700', color: '#111827' }}>FRUBANA EXPRESS</div>
                    <div style={{ fontSize: '2.5rem', fontWeight: '900', color: '#3B0F6E', marginTop: '1rem' }}>
                        ${amount.toLocaleString('es-CO')}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#9CA3AF', marginTop: '0.5rem' }}>Ref: {reference}</div>
                </div>

                {status === 'processing' ? (
                    <div style={{ textAlign: 'center', padding: '2rem' }}>
                        <div className="animate-spin" style={{
                            width: '40px',
                            height: '40px',
                            border: '4px solid #F3F4F6',
                            borderTopColor: '#3B0F6E',
                            borderRadius: '50%',
                            margin: '0 auto 1.5rem'
                        }}></div>
                        <p style={{ fontWeight: '600' }}>Procesando con el banco...</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <p style={{ fontSize: '0.9rem', color: '#4B5563', textAlign: 'center', marginBottom: '0.5rem' }}>
                            Selecciona el resultado que deseas simular para este pedido:
                        </p>

                        <button
                            onClick={() => handlePayment('APPROVED')}
                            disabled={loading}
                            style={{
                                width: '100%',
                                padding: '1rem',
                                backgroundColor: '#10B981',
                                color: 'white',
                                border: 'none',
                                borderRadius: '12px',
                                fontWeight: '700',
                                cursor: 'pointer',
                                transition: 'opacity 0.2s'
                            }}
                        >
                            ✅ Simular Pago Exitoso
                        </button>

                        <button
                            onClick={() => handlePayment('DECLINED')}
                            disabled={loading}
                            style={{
                                width: '100%',
                                padding: '1rem',
                                backgroundColor: '#EF4444',
                                color: 'white',
                                border: 'none',
                                borderRadius: '12px',
                                fontWeight: '700',
                                cursor: 'pointer',
                                transition: 'opacity 0.2s'
                            }}
                        >
                            ❌ Simular Pago Rechazado
                        </button>

                        <button
                            onClick={() => handlePayment('ERROR')}
                            disabled={loading}
                            style={{
                                width: '100%',
                                padding: '1rem',
                                backgroundColor: '#6B7280',
                                color: 'white',
                                border: 'none',
                                borderRadius: '12px',
                                fontWeight: '700',
                                cursor: 'pointer',
                                transition: 'opacity 0.2s'
                            }}
                        >
                            ⚠️ Simular Error Técnico
                        </button>
                    </div>
                )}
            </div>

            <div style={{
                padding: '1rem',
                backgroundColor: '#F9FAFB',
                textAlign: 'center',
                fontSize: '0.75rem',
                color: '#9CA3AF',
                borderTop: '1px solid #E5E7EB'
            }}>
                Este es un entorno de pruebas controlado y no procesa dinero real.
            </div>

            <style jsx>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                .animate-spin {
                    animation: spin 1s linear infinite;
                }
            `}</style>
        </div>
    );
}

export default function PaymentSimulatorPage() {
    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Suspense fallback={<div>Cargando simulador...</div>}>
                <SimulatorContent />
            </Suspense>
        </main>
    );
}
