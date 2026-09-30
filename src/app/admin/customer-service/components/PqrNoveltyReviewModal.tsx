'use client';

import React from 'react';
import { X, Check, PackageMinus, Loader2 } from 'lucide-react';
import { formatMoney } from '@/lib/adminTheme';
import { formatDateFriendly } from '../utils';

interface PqrNoveltyReviewModalProps {
    novelty: any | null;
    isOpen: boolean;
    onClose: () => void;
    onProcessed: (novelty: any, decision: 'approved' | 'rejected') => Promise<void>;
    actionLoading: boolean;
}

export default function PqrNoveltyReviewModal({
    novelty,
    isOpen,
    onClose,
    onProcessed,
    actionLoading
}: PqrNoveltyReviewModalProps) {
    if (!isOpen || !novelty) return null;

    const unitPrice = novelty.products?.base_price || 0;
    const qty = Number(novelty.quantity_returned) || 0;
    const totalImpact = unitPrice * qty;

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
        }}>
            <div style={{
                position: 'relative',
                width: '100%',
                maxWidth: '520px',
                backgroundColor: 'white',
                borderRadius: '16px',
                boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                border: '1px solid #E2E8F0',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column'
            }}>
                {/* Header */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '1rem 1.5rem',
                    backgroundColor: '#0F172A',
                    color: 'white',
                    borderBottom: '1px solid #1E293B'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            padding: '8px',
                            backgroundColor: 'rgba(217, 119, 6, 0.2)',
                            color: '#FBBF24',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <PackageMinus size={20} />
                        </div>
                        <div>
                            <h2 style={{ fontSize: '0.95rem', fontWeight: '800', color: 'white', margin: 0 }}>
                                Auditoría de Novedad de Línea
                            </h2>
                            <p style={{ fontSize: '0.72rem', color: '#94A3B8', margin: '2px 0 0 0' }}>
                                Pedido #{novelty.orders?.sequence_id || 'N/A'} • {formatDateFriendly(novelty.created_at)}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{ padding: '6px', color: '#94A3B8', background: 'transparent', border: 'none', cursor: 'pointer' }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Client & Order Summary */}
                    <div style={{ padding: '10px 12px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ color: '#64748B', fontWeight: '700', textTransform: 'uppercase', fontSize: '0.65rem' }}>Cliente</span>
                            <strong style={{ color: '#0F172A' }}>
                                {novelty.orders?.profiles?.company_name || novelty.orders?.profiles?.contact_name || 'Cliente'}
                            </strong>
                        </div>
                        {novelty.orders?.profiles?.nit && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#64748B', fontSize: '0.7rem' }}>
                                <span>NIT</span>
                                <span>{novelty.orders.profiles.nit}</span>
                            </div>
                        )}
                    </div>

                    {/* Product & Quantity Box */}
                    <div style={{ padding: '12px 14px', backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#0F172A', display: 'block' }}>
                                    {novelty.products?.name || 'Producto No Identificado'}
                                </span>
                                <span style={{ fontSize: '0.68rem', color: '#64748B', fontFamily: 'monospace' }}>
                                    SKU: {novelty.products?.sku || 'N/A'}
                                </span>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#BE123C', backgroundColor: '#FFF1F2', padding: '3px 8px', borderRadius: '6px', border: '1px solid #FECDD3' }}>
                                    -{qty} {novelty.products?.unit_of_measure || 'Und'}
                                </span>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', paddingTop: '8px', borderTop: '1px solid #A7F3D0', fontSize: '0.75rem' }}>
                            <div>
                                <span style={{ color: '#065F46', fontSize: '0.65rem', display: 'block' }}>Precio Unitario Base</span>
                                <strong style={{ color: '#047857' }}>{formatMoney(unitPrice)}</strong>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <span style={{ color: '#065F46', fontSize: '0.65rem', display: 'block' }}>Impacto Financiero</span>
                                <strong style={{ color: '#BE123C', fontSize: '0.85rem' }}>{formatMoney(totalImpact)}</strong>
                            </div>
                        </div>
                    </div>

                    {/* Reason Text */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase' }}>
                            Motivo Declarado
                        </span>
                        <p style={{ fontSize: '0.75rem', color: '#334155', padding: '10px 12px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', margin: 0, lineHeight: '1.4' }}>
                            {novelty.reason || 'Sin justificación ingresada.'}
                        </p>
                    </div>

                    {/* RCA Metadata if present */}
                    {novelty.defect_category_l1 && (
                        <div style={{ padding: '8px 10px', backgroundColor: '#F1F5F9', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '0.72rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ color: '#64748B' }}>Diagnóstico RCA:</span>
                            <strong style={{ color: '#1E293B' }}>
                                {novelty.defect_category_l1} • {novelty.imputed_responsible || 'transporte'}
                            </strong>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '1rem 1.5rem',
                    backgroundColor: '#F8FAFC',
                    borderTop: '1px solid #E2E8F0'
                }}>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{ padding: '7px 14px', fontSize: '0.75rem', color: '#334155', backgroundColor: 'transparent', border: 'none', fontWeight: '600', cursor: 'pointer' }}
                    >
                        Cerrar
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                            type="button"
                            onClick={() => onProcessed(novelty, 'rejected')}
                            disabled={actionLoading}
                            style={{
                                padding: '8px 14px',
                                backgroundColor: '#FFF1F2',
                                color: '#BE123C',
                                border: '1px solid #FECDD3',
                                borderRadius: '10px',
                                fontSize: '0.75rem',
                                fontWeight: '700',
                                cursor: 'pointer'
                            }}
                        >
                            Rechazar Novedad
                        </button>
                        <button
                            type="button"
                            onClick={() => onProcessed(novelty, 'approved')}
                            disabled={actionLoading}
                            style={{
                                padding: '8px 18px',
                                backgroundColor: '#0D7A57',
                                color: 'white',
                                borderRadius: '10px',
                                fontSize: '0.75rem',
                                fontWeight: '800',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                boxShadow: '0 2px 6px rgba(13, 122, 87, 0.3)'
                            }}
                        >
                            {actionLoading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />}
                            <span>Aprobar Novedad</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
