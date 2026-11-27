'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useCart } from '@/lib/cartContext';
import { getFriendlyOrderId } from '@/lib/orderUtils';
import {
    Copy,
    Check,
    CheckCircle2,
    Clock,
    XCircle,
    Banknote,
    ShoppingBag,
    Sparkles,
    MessageCircle,
    Calendar,
    CreditCard,
    RefreshCw
} from 'lucide-react';

const TRANSIENT_CHECKOUT_KEYS = [
    'checkout_specialNotes',
    'checkout_is_gift',
    'checkout_recipient_name',
    'checkout_recipient_phone',
    'checkout_address_details',
    'checkout_building_complex',
    'checkout_unit_details',
    'checkout_selected_beneficiary_idx'
];

function formatPaymentMethodLabel(raw?: string | null): string {
    const val = String(raw || '').toUpperCase();
    if (!val || val === 'ONLINE' || val === 'WOMPI') return 'Wompi en línea';
    if (val === 'PSE') return 'PSE (Débito bancario)';
    if (val === 'NEQUI') return 'Nequi';
    if (val === 'BANCOLOMBIA_TRANSFER' || val === 'BANCOLOMBIA_QR') return 'Botón Bancolombia';
    if (val === 'CARD') return 'Tarjeta Crédito / Débito';
    if (val === 'DAVIPLATA') return 'Daviplata';
    return val;
}

function ResultContent() {
    const searchParams = useSearchParams();
    const { clearCart } = useCart();
    const hasClearedCartRef = useRef(false);

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
        amount_in_cents?: number;
        delivery_date?: string | null;
        payment_method_type?: string | null;
    } | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (codStatus === 'cod_success' && reference) {
            setStatus('success');
            setTransactionData({
                status: 'APPROVED',
                order_id: reference,
                order_sequence: sequence ? parseInt(sequence, 10) : 0,
                order_created_at: createdAt || new Date().toISOString()
            });
            return;
        }

        let cancelled = false;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        const maxAttempts = 10;

        const checkStatus = async (attempt: number) => {
            if (!transactionId) {
                if (!cancelled) setStatus('error');
                return;
            }
            try {
                const response = await fetch(`/api/payments/status?id=${encodeURIComponent(transactionId)}`, {
                    cache: 'no-store'
                });
                const responseBody = await response.json();
                const data = responseBody?.data;
                if (cancelled) return;

                if (data) setTransactionData(data);

                const txStatus = String(data?.status || '').toUpperCase();
                if (txStatus === 'APPROVED') {
                    setStatus('success');
                    if (!hasClearedCartRef.current) {
                        hasClearedCartRef.current = true;
                        clearCart();
                        if (typeof window !== 'undefined') {
                            TRANSIENT_CHECKOUT_KEYS.forEach((k) => localStorage.removeItem(k));
                        }
                    }
                    return;
                }

                if (txStatus === 'DECLINED' || txStatus === 'VOIDED' || txStatus === 'ERROR') {
                    setStatus('error');
                    return;
                }

                setStatus('pending');
                if (attempt < maxAttempts) {
                    timeoutId = setTimeout(() => {
                        if (!cancelled) checkStatus(attempt + 1);
                    }, 3000);
                }
            } catch (error) {
                console.error('Error fetching transaction:', error);
                if (cancelled) return;
                setStatus('pending');
                if (attempt < maxAttempts) {
                    timeoutId = setTimeout(() => {
                        if (!cancelled) checkStatus(attempt + 1);
                    }, 3000);
                }
            }
        };

        checkStatus(1);

        return () => {
            cancelled = true;
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [transactionId, codStatus, reference, sequence, createdAt, clearCart]);

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
            case 'pending': return 'Confirmando pago con tu banco...';
            case 'error': return 'No se pudo completar el pago';
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

    const paidAmountCop = transactionData?.amount_in_cents
        ? Math.round(transactionData.amount_in_cents / 100)
        : 0;

    const whatsappHref = `https://wa.me/573167022898?text=${encodeURIComponent(
        `Hola FruFresco, acabo de realizar mi pedido${friendlyId ? ` ${friendlyId}` : ''} y necesito soporte/seguimiento.`
    )}`;

    return (
        <div className="result-card" style={{
            maxWidth: '600px',
            margin: '4rem auto',
            padding: '3rem',
            textAlign: 'center',
            backgroundColor: 'white',
            borderRadius: '24px',
            boxShadow: 'var(--shadow-lg)',
            border: '1px solid var(--border)',
            transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>{renderIconStatus()}</div>
            <h1 className="result-title" style={{ fontSize: '2rem', fontWeight: '900', marginBottom: '1rem', color: '#0F172A', fontFamily: 'var(--font-outfit), sans-serif' }}>{renderMessage()}</h1>

            <p style={{ color: 'var(--text-muted)', marginBottom: '2.2rem', fontSize: '1.05rem', lineHeight: '1.5' }}>
                {codStatus === 'cod_success'
                    ? 'Tu pedido ha sido guardado exitosamente con modalidad de Pago Contra Entrega. Iniciaremos el alistamiento de tus alimentos frescos inmediatamente.'
                    : status === 'success'
                        ? 'Tu pago fue confirmado y tu pedido ya está en manos de nuestro equipo de alistamiento.'
                        : status === 'pending'
                            ? 'Confirmando pago con tu banco... esto toma unos segundos. No cierres esta ventana.'
                            : 'Tu carrito sigue intacto para que puedas intentarlo de nuevo con otro medio de pago.'}
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
                    marginBottom: '2rem',
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.65rem'
                }}>
                    <div className="result-tx-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <CreditCard size={14} /> {codStatus === 'cod_success' ? 'Método de Pago' : 'Referencia / Medio'}
                        </span>
                        <span style={{ fontSize: '0.88rem', fontWeight: '700', color: '#334155', wordBreak: 'break-all' }}>
                            {codStatus === 'cod_success'
                                ? 'Contra Entrega (Efectivo / Transferencia)'
                                : `${formatPaymentMethodLabel(transactionData?.payment_method_type)} · ${transactionId}`}
                        </span>
                    </div>

                    {paidAmountCop > 0 && (
                        <div className="result-tx-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', borderTop: '1px solid #E2E8F0', paddingTop: '0.65rem' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase' }}>Monto</span>
                            <span style={{ fontSize: '1rem', fontWeight: '900', color: '#0F172A' }}>
                                ${paidAmountCop.toLocaleString('es-CO')} COP
                            </span>
                        </div>
                    )}

                    {transactionData?.delivery_date && (
                        <div className="result-tx-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', borderTop: '1px solid #E2E8F0', paddingTop: '0.65rem' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                <Calendar size={14} /> Fecha de Entrega
                            </span>
                            <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#0F172A' }}>
                                {transactionData.delivery_date}
                            </span>
                        </div>
                    )}

                    {friendlyId && (
                        <div className="result-tx-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', borderTop: '1px solid #E2E8F0', paddingTop: '0.75rem', marginTop: '0.15rem' }}>
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

            {(status === 'success' || codStatus === 'cod_success') && (
                <div style={{
                    backgroundColor: '#F0FDF4',
                    border: '1.5px solid #86EFAC',
                    borderRadius: '20px',
                    padding: '1.4rem 1.6rem',
                    marginBottom: '2rem',
                    textAlign: 'left'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                        <Sparkles size={20} color="#16A34A" />
                        <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: '800', color: '#166534', fontFamily: 'var(--font-outfit), sans-serif' }}>
                            ¡Tus datos de entrega han sido recordados de forma segura!
                        </h4>
                    </div>
                    <p style={{ margin: '0 0 0.8rem 0', fontSize: '0.84rem', color: '#15803D', lineHeight: '1.45' }}>
                        En tu próxima compra no tendrás que ingresar direcciones ni recordar contraseñas. Podrás repetir este mismo mercado con 1 solo clic desde nuestro portal.
                    </p>
                    <div style={{ fontSize: '0.78rem', color: '#166534', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <CheckCircle2 size={15} color="#16A34A" /> Recibirás el comprobante y el seguimiento en vivo a tu WhatsApp y correo electrónico.
                    </div>
                </div>
            )}

            <div className="result-actions" style={{ display: 'flex', gap: '0.85rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                {status === 'error' ? (
                    <Link href="/checkout" className="btn btn-primary result-cta" style={{ padding: '0.85rem 2rem', minHeight: '46px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', borderRadius: '14px', fontWeight: '800', transition: 'all 0.2s ease' }}>
                        <RefreshCw size={18} /> Reintentar pago
                    </Link>
                ) : (
                    <Link href="/" className="btn btn-primary result-cta" style={{ padding: '0.85rem 2rem', minHeight: '46px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', borderRadius: '14px', fontWeight: '800', transition: 'all 0.2s ease' }}>
                        <ShoppingBag size={18} /> Volver al Inicio
                    </Link>
                )}

                <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn result-cta"
                    style={{
                        padding: '0.85rem 1.5rem',
                        minHeight: '46px',
                        border: '1.5px solid #16A34A',
                        color: '#15803D',
                        backgroundColor: '#F0FDF4',
                        borderRadius: '14px',
                        fontWeight: '800',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        textDecoration: 'none'
                    }}
                >
                    <MessageCircle size={18} /> WhatsApp SAC
                </a>
            </div>

            <style jsx>{`
                @keyframes resultFadeIn {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .result-card {
                    animation: resultFadeIn 0.35s cubic-bezier(0.16, 1, 0.3, 1);
                }
                @media (max-width: 768px) {
                    .result-card {
                        margin: 1.25rem 0.75rem !important;
                        padding: 1.75rem 1.25rem !important;
                        border-radius: 20px !important;
                    }
                    .result-title {
                        font-size: 1.55rem !important;
                    }
                    .result-tx-row {
                        flex-direction: column !important;
                        align-items: flex-start !important;
                    }
                    .result-actions {
                        flex-direction: column !important;
                        width: 100%;
                    }
                    .result-cta {
                        width: 100% !important;
                    }
                }
            `}</style>
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
