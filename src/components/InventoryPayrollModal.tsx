'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
    X, 
    FileSpreadsheet, 
    Download, 
    Calendar, 
    User, 
    DollarSign, 
    Layers, 
    Search,
    RefreshCw
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface EmployeeSaleRecord {
    id: string;
    product_id: string;
    quantity: number;
    notes?: string | null;
    created_at: string;
    products?: {
        name: string;
        sku?: string;
        accounting_id?: number | null;
        unit_of_measure: string;
        base_price?: number;
    } | null;
}

interface InventoryPayrollModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function InventoryPayrollModal({ isOpen, onClose }: InventoryPayrollModalProps) {
    const [sales, setSales] = useState<EmployeeSaleRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Rango de fechas por defecto: Mes actual
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const todayStr = now.toISOString().split('T')[0];

    const [startDate, setStartDate] = useState(firstDayOfMonth);
    const [endDate, setEndDate] = useState(todayStr);

    const fetchEmployeeSales = async () => {
        setLoading(true);
        try {
            const startIso = `${startDate}T00:00:00.000Z`;
            const endIso = `${endDate}T23:59:59.999Z`;

            const { data, error } = await supabase
                .from('inventory_movements')
                .select(`
                    id, product_id, quantity, notes, created_at,
                    products (name, sku, accounting_id, unit_of_measure, base_price)
                `)
                .eq('reference_type', 'employee_sale')
                .gte('created_at', startIso)
                .lte('created_at', endIso)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setSales((data as any) || []);
        } catch (err: any) {
            console.error('Error fetching employee sales for payroll:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchEmployeeSales();
        }
    }, [isOpen, startDate, endDate]);

    if (!isOpen) return null;

    // Parser para extraer nombre de empleado y valor desde notes
    const parseEmployeeSale = (item: EmployeeSaleRecord) => {
        const notes = item.notes || '';
        let employee = 'Empleado no especificado';
        const empMatch = notes.match(/Empleado:\s*([^|]+)/i);
        if (empMatch) {
            employee = empMatch[1].trim();
        }

        const qty = Math.abs(item.quantity || 0);
        const basePrice = item.products?.base_price || 0;
        
        let totalVal = Math.round(qty * basePrice);
        const valMatch = notes.match(/Valor Nómina:\s*\$([0-9.,]+)/i);
        if (valMatch) {
            const parsed = parseInt(valMatch[1].replace(/\./g, ''), 10);
            if (!isNaN(parsed)) totalVal = parsed;
        }

        return {
            employee,
            qty,
            uom: item.products?.unit_of_measure || 'KG',
            productName: item.products?.name || 'Producto Desconocido',
            accountingId: item.products?.accounting_id || 'S/N',
            unitPrice: basePrice,
            totalVal,
            date: new Date(item.created_at).toLocaleDateString('es-CO', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            })
        };
    };

    const parsedRows = sales.map(s => ({ raw: s, ...parseEmployeeSale(s) }));

    const filteredRows = parsedRows.filter(r => {
        if (!searchTerm.trim()) return true;
        const q = searchTerm.toLowerCase();
        return (
            r.employee.toLowerCase().includes(q) ||
            r.productName.toLowerCase().includes(q) ||
            r.accountingId.toString().includes(q)
        );
    });

    const totalDeduction = filteredRows.reduce((acc, r) => acc + r.totalVal, 0);
    const totalKilos = filteredRows.reduce((acc, r) => acc + r.qty, 0);
    const uniqueEmployees = new Set(filteredRows.map(r => r.employee.toLowerCase())).size;

    const handleExportExcel = () => {
        try {
            const exportData = filteredRows.map(r => ({
                'Fecha / Hora': r.date,
                'Colaborador (Nómina)': r.employee,
                'ID Contable': r.accountingId,
                'Producto': r.productName,
                'Cantidad Vendida': r.qty,
                'Unidad Medida': r.uom,
                'Precio Unitario COP': r.unitPrice,
                'Total a Descontar Nómina COP': r.totalVal,
                'Notas': r.raw.notes || ''
            }));

            // Fila de totales
            exportData.push({
                'Fecha / Hora': 'TOTAL GENERAL',
                'Colaborador (Nómina)': `${uniqueEmployees} colaboradores`,
                'ID Contable': '',
                'Producto': '',
                'Cantidad Vendida': totalKilos,
                'Unidad Medida': '',
                'Precio Unitario COP': 0,
                'Total a Descontar Nómina COP': totalDeduction,
                'Notas': ''
            });

            const ws = XLSX.utils.json_to_sheet(exportData);
            ws['!cols'] = [
                { wch: 18 },
                { wch: 28 },
                { wch: 12 },
                { wch: 32 },
                { wch: 16 },
                { wch: 14 },
                { wch: 18 },
                { wch: 26 },
                { wch: 35 }
            ];

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Deducciones_Nomina');
            XLSX.writeFile(wb, `Reporte_Nomina_Ventas_Empleados_${startDate}_al_${endDate}.xlsx`);
        } catch (err: any) {
            console.error('Error exportando Excel nómina:', err);
            alert('Error al exportar reporte de nómina: ' + err.message);
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
                            backgroundColor: '#EFF6FF',
                            color: '#1D4ED8',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <User size={22} />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '800', color: '#0F172A' }}>
                                Deducciones de Nómina • Ventas a Empleados (Col N)
                            </h3>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748B' }}>
                                Reporte auditado para el área de Talento Humano y Nómina
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

                {/* KPI Bar & Date Filters */}
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
                    {/* Filtros de Fecha */}
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
                            onClick={fetchEmployeeSales}
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

                    {/* Botón Exportar */}
                    <button
                        type="button"
                        onClick={handleExportExcel}
                        disabled={filteredRows.length === 0}
                        style={{
                            padding: '0.55rem 1.1rem',
                            borderRadius: '8px',
                            border: 'none',
                            backgroundColor: '#0D7A57',
                            color: '#FFFFFF',
                            fontSize: '0.82rem',
                            fontWeight: '700',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                            cursor: filteredRows.length === 0 ? 'not-allowed' : 'pointer',
                            opacity: filteredRows.length === 0 ? 0.6 : 1,
                            boxShadow: '0 2px 4px rgba(13, 122, 87, 0.2)'
                        }}
                    >
                        <FileSpreadsheet size={16} />
                        Exportar a Excel (.xlsx)
                    </button>
                </div>

                {/* KPIs Cards */}
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
                            Total a Descontar Nómina
                        </div>
                        <div style={{ fontSize: '1.35rem', fontWeight: '900', color: '#0D7A57', marginTop: '2px' }}>
                            ${totalDeduction.toLocaleString('es-CO')}
                        </div>
                    </div>
                    <div style={{ backgroundColor: '#FFFFFF', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', color: '#64748B' }}>
                            Kilos / Unidades Vendidas
                        </div>
                        <div style={{ fontSize: '1.35rem', fontWeight: '900', color: '#1E293B', marginTop: '2px' }}>
                            {totalKilos.toFixed(2)}
                        </div>
                    </div>
                    <div style={{ backgroundColor: '#FFFFFF', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', color: '#64748B' }}>
                            Colaboradores con Compras
                        </div>
                        <div style={{ fontSize: '1.35rem', fontWeight: '900', color: '#2563EB', marginTop: '2px' }}>
                            {uniqueEmployees}
                        </div>
                    </div>
                </div>

                {/* Table & Search */}
                <div style={{ padding: '1rem 1.75rem', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
                        <Search size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94A3B8' }} />
                        <input
                            type="text"
                            placeholder="Buscar por colaborador o producto..."
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
                                    <th style={{ padding: '0.65rem 1rem', textAlign: 'left', fontWeight: '700', color: '#475569' }}>Colaborador</th>
                                    <th style={{ padding: '0.65rem 1rem', textAlign: 'left', fontWeight: '700', color: '#475569' }}>Producto</th>
                                    <th style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: '700', color: '#475569' }}>Cantidad</th>
                                    <th style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: '700', color: '#475569' }}>Total Deducir</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#64748B' }}>
                                            Cargando registros de nómina...
                                        </td>
                                    </tr>
                                ) : filteredRows.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#94A3B8' }}>
                                            No se registran compras a empleados en este período.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredRows.map((r, idx) => (
                                        <tr key={r.raw.id || idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                            <td style={{ padding: '0.65rem 1rem', color: '#64748B' }}>{r.date}</td>
                                            <td style={{ padding: '0.65rem 1rem', fontWeight: '700', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                <User size={14} color="#2563EB" />
                                                <span>{r.employee}</span>
                                            </td>
                                            <td style={{ padding: '0.65rem 1rem', color: '#1E293B' }}>
                                                <span style={{ fontWeight: '600' }}>{r.productName}</span>
                                                <span style={{ fontSize: '0.7rem', color: '#64748B', marginLeft: '6px' }}>
                                                    #{r.accountingId}
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: '700', color: '#0F172A' }}>
                                                {r.qty.toFixed(2)} {r.uom}
                                            </td>
                                            <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: '800', color: '#0D7A57' }}>
                                                ${r.totalVal.toLocaleString('es-CO')}
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
