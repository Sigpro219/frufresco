'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
    X, 
    FileSpreadsheet, 
    ShoppingCart, 
    Search, 
    RefreshCw, 
    CheckCircle2, 
    AlertCircle,
    Calendar
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface AdditionalSaleRecord {
    id: string;
    product_id: string;
    quantity: number;
    notes?: string | null;
    created_at: string;
    admin_decision?: string | null;
    products?: {
        name: string;
        sku?: string;
        accounting_id?: number | null;
        unit_of_measure: string;
        base_price?: number;
    } | null;
}

interface InventoryAdditionalSalesModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function InventoryAdditionalSalesModal({ isOpen, onClose }: InventoryAdditionalSalesModalProps) {
    const [records, setRecords] = useState<AdditionalSaleRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const todayStr = now.toISOString().split('T')[0];

    const [startDate, setStartDate] = useState(firstDayOfMonth);
    const [endDate, setEndDate] = useState(todayStr);

    const fetchAdditionalSales = async () => {
        setLoading(true);
        try {
            const startIso = `${startDate}T00:00:00.000Z`;
            const endIso = `${endDate}T23:59:59.999Z`;

            const { data, error } = await supabase
                .from('inventory_movements')
                .select(`
                    id, product_id, quantity, notes, created_at, admin_decision,
                    products (name, sku, accounting_id, unit_of_measure, base_price)
                `)
                .eq('reference_type', 'additional_sale')
                .gte('created_at', startIso)
                .lte('created_at', endIso)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setRecords((data as any) || []);
        } catch (err: any) {
            console.error('Error fetching additional sales for billing:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchAdditionalSales();
        }
    }, [isOpen, startDate, endDate]);

    if (!isOpen) return null;

    const parsedRows = records.map(r => {
        const qty = Math.abs(r.quantity || 0);
        const basePrice = r.products?.base_price || 0;
        const totalEstimated = Math.round(qty * basePrice);

        return {
            raw: r,
            id: r.id,
            productName: r.products?.name || 'Producto Desconocido',
            accountingId: r.products?.accounting_id || 'S/N',
            qty,
            uom: r.products?.unit_of_measure || 'KG',
            unitPrice: basePrice,
            totalEstimated,
            notes: r.notes || '',
            date: new Date(r.created_at).toLocaleDateString('es-CO', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            })
        };
    });

    const filteredRows = parsedRows.filter(r => {
        if (!searchTerm.trim()) return true;
        const q = searchTerm.toLowerCase();
        return (
            r.productName.toLowerCase().includes(q) ||
            r.accountingId.toString().includes(q) ||
            r.notes.toLowerCase().includes(q)
        );
    });

    const totalKilos = filteredRows.reduce((acc, r) => acc + r.qty, 0);
    const totalAmount = filteredRows.reduce((acc, r) => acc + r.totalEstimated, 0);

    const handleExportExcel = () => {
        try {
            const exportData = filteredRows.map(r => ({
                'Fecha / Hora': r.date,
                'ID Contable': r.accountingId,
                'Producto Despachado': r.productName,
                'Cantidad Adicional': r.qty,
                'Unidad Medida': r.uom,
                'Precio Unitario Est.': r.unitPrice,
                'Total Estimado COP': r.totalEstimated,
                'Notas y Cliente': r.notes
            }));

            exportData.push({
                'Fecha / Hora': 'TOTAL GENERAL',
                'ID Contable': '',
                'Producto Despachado': `${filteredRows.length} despachos adicionales`,
                'Cantidad Adicional': totalKilos,
                'Unidad Medida': '',
                'Precio Unitario Est.': 0,
                'Total Estimado COP': totalAmount,
                'Notas y Cliente': ''
            });

            const ws = XLSX.utils.json_to_sheet(exportData);
            ws['!cols'] = [
                { wch: 18 },
                { wch: 12 },
                { wch: 32 },
                { wch: 16 },
                { wch: 14 },
                { wch: 18 },
                { wch: 22 },
                { wch: 40 }
            ];

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Ventas_Adicionales_Facturacion');
            XLSX.writeFile(wb, `Reporte_Facturacion_Ventas_Adicionales_${startDate}_al_${endDate}.xlsx`);
        } catch (err: any) {
            console.error('Error exportando Excel facturación:', err);
            alert('Error exportando reporte: ' + err.message);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
            fontFamily: 'var(--font-outfit), sans-serif'
        }}>
            <div style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '16px',
                width: '100%',
                maxWidth: '900px',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                border: '1px solid #E2E8F0',
                overflow: 'hidden'
            }}>
                {/* Header */}
                <div style={{
                    padding: '1.25rem 1.75rem',
                    borderBottom: '1px solid #E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: '#F8FAFC'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '10px',
                            backgroundColor: '#F3E8FF',
                            color: '#7E22CE',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <ShoppingCart size={22} />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '800', color: '#0F172A' }}>
                                Ventas Adicionales de Cliente • Validación Facturación (Col M)
                            </h3>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748B' }}>
                                Notificaciones de despacho extraordinario para el área de Facturación (Anderson Cante)
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#64748B',
                            padding: '6px',
                            borderRadius: '8px'
                        }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Filters & Export */}
                <div style={{
                    padding: '1rem 1.75rem',
                    backgroundColor: '#FFFFFF',
                    borderBottom: '1px solid #F1F5F9',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#475569' }}>Rango:</span>
                        <input
                            type="date"
                            value={startDate}
                            onChange={e => setStartDate(e.target.value)}
                            style={{
                                padding: '0.4rem 0.6rem',
                                borderRadius: '6px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.8rem',
                                color: '#1E293B'
                            }}
                        />
                        <span style={{ fontSize: '0.78rem', color: '#94A3B8' }}>al</span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={e => setEndDate(e.target.value)}
                            style={{
                                padding: '0.4rem 0.6rem',
                                borderRadius: '6px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.8rem',
                                color: '#1E293B'
                            }}
                        />
                        <button
                            type="button"
                            onClick={fetchAdditionalSales}
                            title="Refrescar datos"
                            style={{
                                padding: '0.4rem 0.6rem',
                                borderRadius: '6px',
                                border: '1px solid #CBD5E1',
                                backgroundColor: '#F8FAFC',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '0.78rem',
                                fontWeight: '600'
                            }}
                        >
                            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                            Actualizar
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={handleExportExcel}
                        disabled={filteredRows.length === 0}
                        style={{
                            padding: '0.55rem 1.1rem',
                            borderRadius: '8px',
                            border: 'none',
                            backgroundColor: '#7E22CE',
                            color: '#FFFFFF',
                            fontSize: '0.82rem',
                            fontWeight: '700',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                            cursor: filteredRows.length === 0 ? 'not-allowed' : 'pointer',
                            opacity: filteredRows.length === 0 ? 0.6 : 1,
                            boxShadow: '0 2px 4px rgba(126, 34, 206, 0.2)'
                        }}
                    >
                        <FileSpreadsheet size={16} />
                        Exportar a Excel (.xlsx)
                    </button>
                </div>

                {/* KPI Cards */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '1rem',
                    padding: '1rem 1.75rem',
                    backgroundColor: '#F8FAFC',
                    borderBottom: '1px solid #E2E8F0'
                }}>
                    <div style={{ backgroundColor: '#FFFFFF', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', color: '#64748B' }}>
                            Despachos Adicionales
                        </div>
                        <div style={{ fontSize: '1.35rem', fontWeight: '900', color: '#7E22CE', marginTop: '2px' }}>
                            {filteredRows.length}
                        </div>
                    </div>
                    <div style={{ backgroundColor: '#FFFFFF', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', color: '#64748B' }}>
                            Total Kilos / Unidades Extra
                        </div>
                        <div style={{ fontSize: '1.35rem', fontWeight: '900', color: '#1E293B', marginTop: '2px' }}>
                            {totalKilos.toFixed(2)}
                        </div>
                    </div>
                    <div style={{ backgroundColor: '#FFFFFF', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', color: '#64748B' }}>
                            Monto Estimado Facturación
                        </div>
                        <div style={{ fontSize: '1.35rem', fontWeight: '900', color: '#0D7A57', marginTop: '2px' }}>
                            ${totalAmount.toLocaleString('es-CO')}
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div style={{ padding: '1rem 1.75rem', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
                        <Search size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94A3B8' }} />
                        <input
                            type="text"
                            placeholder="Buscar por producto o notas de cliente..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '0.5rem 0.75rem 0.5rem 2.1rem',
                                borderRadius: '8px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.82rem',
                                boxSizing: 'border-box',
                                outline: 'none'
                            }}
                        />
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: '10px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                            <thead style={{ position: 'sticky', top: 0, backgroundColor: '#F1F5F9', borderBottom: '1px solid #CBD5E1', zIndex: 10 }}>
                                <tr>
                                    <th style={{ padding: '0.65rem 1rem', textAlign: 'left', fontWeight: '700', color: '#475569' }}>Fecha</th>
                                    <th style={{ padding: '0.65rem 1rem', textAlign: 'left', fontWeight: '700', color: '#475569' }}>Producto</th>
                                    <th style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: '700', color: '#475569' }}>Cantidad</th>
                                    <th style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: '700', color: '#475569' }}>Valor Estimado</th>
                                    <th style={{ padding: '0.65rem 1rem', textAlign: 'left', fontWeight: '700', color: '#475569' }}>Notas / Cliente</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#64748B' }}>
                                            Cargando despachos adicionales...
                                        </td>
                                    </tr>
                                ) : filteredRows.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#94A3B8' }}>
                                            No se registran ventas adicionales de cliente en este período.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredRows.map((r, idx) => (
                                        <tr key={r.id || idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                            <td style={{ padding: '0.65rem 1rem', color: '#64748B' }}>{r.date}</td>
                                            <td style={{ padding: '0.65rem 1rem', color: '#1E293B' }}>
                                                <span style={{ fontWeight: '600' }}>{r.productName}</span>
                                                <span style={{ fontSize: '0.7rem', color: '#64748B', marginLeft: '6px' }}>
                                                    #{r.accountingId}
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: '700', color: '#0F172A' }}>
                                                {r.qty.toFixed(2)} {r.uom}
                                            </td>
                                            <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: '800', color: '#7E22CE' }}>
                                                ${r.totalEstimated.toLocaleString('es-CO')}
                                            </td>
                                            <td style={{ padding: '0.65rem 1rem', color: '#475569', fontSize: '0.75rem' }}>
                                                {r.notes || 'Despacho adicional regular'}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Footer */}
                <div style={{
                    padding: '0.85rem 1.75rem',
                    borderTop: '1px solid #E2E8F0',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    backgroundColor: '#F8FAFC'
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '0.55rem 1.25rem',
                            borderRadius: '8px',
                            border: '1px solid #CBD5E1',
                            backgroundColor: '#FFFFFF',
                            color: '#475569',
                            fontSize: '0.82rem',
                            fontWeight: '700',
                            cursor: 'pointer'
                        }}
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}
