'use client';

import React, { useState, useMemo } from 'react';
import { 
    Calendar, Download, Printer, Filter, ShieldCheck, 
    AlertCircle, AlertTriangle, CheckCircle2, Package, 
    Users, DollarSign, FileText, Check, Search, FileSpreadsheet,
    Clock, Building2, ChevronRight, X
} from 'lucide-react';
import { formatMoney } from '@/lib/adminTheme';
import { PQR, formatPqrFolio } from '../utils';
import { parseRcaFromRecord } from '@/lib/rcaTaxonomy';
import { printViaNewWindow } from '@/components/print/printViaNewWindow';

interface PqrDailyShiftReportProps {
    pqrs: PQR[];
    novelties: any[];
    onRefresh?: () => void;
}

export default function PqrDailyShiftReport({
    pqrs,
    novelties,
    onRefresh
}: PqrDailyShiftReportProps) {
    // 1. Date selection: Default to today in Colombia time (YYYY-MM-DD)
    const getTodayBogota = () => {
        try {
            const now = new Date();
            const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' });
            return formatter.format(now);
        } catch {
            return new Date().toISOString().split('T')[0];
        }
    };

    const getYesterdayBogota = () => {
        try {
            const now = new Date(Date.now() - 86400000);
            const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' });
            return formatter.format(now);
        } catch {
            return new Date(Date.now() - 86400000).toISOString().split('T')[0];
        }
    };

    const [selectedDate, setSelectedDate] = useState<string>(getTodayBogota);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'resolved'>('all');

    // 2. Filter PQRs that occurred on the selected date (in Bogota timezone)
    const dayPqrs = useMemo(() => {
        return pqrs.filter(p => {
            if (!p.created_at) return false;
            let dateStr = '';
            try {
                const pDate = new Date(p.created_at);
                const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' });
                dateStr = formatter.format(pDate);
            } catch {
                dateStr = p.created_at.split('T')[0];
            }
            return dateStr === selectedDate;
        });
    }, [pqrs, selectedDate]);

    // Map of order_id -> list of novelties
    const noveltiesByOrderId = useMemo(() => {
        const map = new Map<string, any[]>();
        novelties.forEach(n => {
            if (n.order_id) {
                const current = map.get(n.order_id) || [];
                current.push(n);
                map.set(n.order_id, current);
            }
        });
        return map;
    }, [novelties]);

    // 3. Transform Day PQRs into detailed operational closing items
    const reportRows = useMemo(() => {
        return dayPqrs.map(p => {
            const rca = parseRcaFromRecord(p);
            const folio = formatPqrFolio(p);
            const clientName = p.profiles?.company_name || p.profiles?.contact_name || 'Cliente sin identificar';
            const orderSeq = p.orders?.sequence_id ? `#${p.orders.sequence_id}` : (p.order_id ? 'Vinculado' : 'Sin pedido');
            const orderTotal = p.orders?.total || 0;
            
            // Associated novelties
            const orderNovelties = p.order_id ? (noveltiesByOrderId.get(p.order_id) || []) : [];
            
            // Format time
            let timeStr = '';
            try {
                timeStr = new Date(p.created_at).toLocaleTimeString('es-CO', { 
                    timeZone: 'America/Bogota', 
                    hour: '2-digit', 
                    minute: '2-digit',
                    hour12: true 
                });
            } catch {
                timeStr = 'N/A';
            }

            // Financial impact & deductions
            const totalDeductions = rca.imputedEntities?.reduce((acc, e) => acc + (Number(e.deductionAmount) || 0), 0) || 0;
            
            // Solution concept
            let solutionConcept = 'Exonerado / Informativo';
            const notesUpper = (p.resolution_notes || '').toUpperCase();
            if (notesUpper.includes('OPCIÓN 4') || notesUpper.includes('AJUSTE FACTURA') || notesUpper.includes('AJUSTE DE FACTURA')) {
                solutionConcept = 'Ajuste de Factura (Recálculo)';
            } else if (notesUpper.includes('OPCIÓN 3') || notesUpper.includes('NOTA CRÉDITO') || notesUpper.includes('NOTA CREDITO')) {
                solutionConcept = 'Nota Crédito Comercial';
            } else if (notesUpper.includes('OPCIÓN 2') || notesUpper.includes('REPOSICIÓN') || notesUpper.includes('REPOSICION')) {
                solutionConcept = 'Reposición de Mercancía';
            } else if (p.status === 'resolved') {
                solutionConcept = 'Cerrado / Dictamen Conforme';
            } else {
                solutionConcept = 'Pendiente de Resolución';
            }

            // Products summary
            const productsList: { name: string; qty: number; unit: string; causal: string }[] = [];
            if (orderNovelties.length > 0) {
                orderNovelties.forEach(n => {
                    const prodName = n.products?.name || 'Producto con novedad';
                    const unit = n.products?.unit_of_measure || 'Kg';
                    const qty = Number(n.quantity_returned) || 0;
                    
                    let causal = 'Avería / Calidad';
                    const reason = (n.reason || '').toLowerCase();
                    if (reason.includes('faltante')) causal = 'Faltante en Báscula';
                    else if (reason.includes('escaso') || reason.includes('sin cargue')) causal = 'Producto Sin Cargue';
                    else if (reason.includes('digitación') || reason.includes('digitacion')) causal = 'Error Digitación';
                    else if (reason.includes('no solicitado')) causal = 'Producto No Solicitado';

                    productsList.push({ name: prodName, qty, unit, causal });
                });
            } else {
                // Fallback to PQR subject
                productsList.push({
                    name: p.subject || 'Novedad general declarada',
                    qty: 1,
                    unit: 'Reclamación',
                    causal: p.type === 'queja' ? 'Avería / Calidad' : 'Faltante / Desviación'
                });
            }

            return {
                id: p.id,
                folio,
                timeStr,
                clientName,
                nit: p.profiles?.nit || '',
                orderSeq,
                orderTotal,
                status: p.status,
                categoryL1: rca.categoryL1 || 'No definido',
                subtypeL2: rca.subtypeL2 || 'No clasificado',
                responsibleArea: rca.responsible || 'Operaciones',
                imputedEntities: rca.imputedEntities || [],
                totalDeductions,
                solutionConcept,
                productsList,
                subject: p.subject
            };
        });
    }, [dayPqrs, noveltiesByOrderId]);

    // 4. Apply search & status filter
    const filteredRows = useMemo(() => {
        const q = searchTerm.toLowerCase().trim();
        return reportRows.filter(r => {
            if (filterStatus === 'pending' && r.status === 'resolved') return false;
            if (filterStatus === 'resolved' && r.status !== 'resolved') return false;
            if (!q) return true;
            return (
                r.folio.toLowerCase().includes(q) ||
                r.clientName.toLowerCase().includes(q) ||
                r.orderSeq.toLowerCase().includes(q) ||
                r.responsibleArea.toLowerCase().includes(q) ||
                r.productsList.some(p => p.name.toLowerCase().includes(q) || p.causal.toLowerCase().includes(q))
            );
        });
    }, [reportRows, searchTerm, filterStatus]);

    // 5. Day Summary Metrics
    const dayMetrics = useMemo(() => {
        const totalPqrs = reportRows.length;
        const resolvedPqrs = reportRows.filter(r => r.status === 'resolved').length;
        const pendingPqrs = totalPqrs - resolvedPqrs;
        const uniqueClients = new Set(reportRows.map(r => r.clientName)).size;
        const totalFinancialImpact = reportRows.reduce((acc, r) => acc + r.totalDeductions, 0);
        const totalProductsAffected = reportRows.reduce((acc, r) => acc + r.productsList.length, 0);
        const resolvedPercent = totalPqrs > 0 ? Math.round((resolvedPqrs / totalPqrs) * 100) : 100;

        return {
            totalPqrs,
            resolvedPqrs,
            pendingPqrs,
            uniqueClients,
            totalFinancialImpact,
            totalProductsAffected,
            resolvedPercent
        };
    }, [reportRows]);

    // 6. Export to CSV (UTF-8 BOM for Microsoft Excel compatibility)
    const handleExportCsv = () => {
        if (reportRows.length === 0) {
            alert('No hay registros de PQR en la fecha seleccionada para exportar.');
            return;
        }

        const headers = [
            'Fecha',
            'Hora',
            'Folio PQR',
            'Pedido',
            'Cliente / Sede',
            'NIT',
            'Productos Afectados',
            'Cantidades y Unidades',
            'Causales Operativas',
            'Area Responsable',
            'Causa Raiz RCA',
            'Responsables Imputados',
            'Deducciones ($ COP)',
            'Solucion Contable',
            'Estado'
        ];

        const csvRows = reportRows.map(r => {
            const prodsStr = r.productsList.map(p => p.name).join('; ');
            const qtysStr = r.productsList.map(p => `${p.qty} ${p.unit}`).join('; ');
            const causalsStr = r.productsList.map(p => p.causal).join('; ');
            const imputedStr = r.imputedEntities.map(e => `${e.name} (${e.role || 'Resp'} - $${e.deductionAmount || 0})`).join('; ') || 'Sin imputar';

            return [
                `"${selectedDate}"`,
                `"${r.timeStr}"`,
                `"${r.folio}"`,
                `"${r.orderSeq}"`,
                `"${r.clientName.replace(/"/g, '""')}"`,
                `"${r.nit}"`,
                `"${prodsStr.replace(/"/g, '""')}"`,
                `"${qtysStr}"`,
                `"${causalsStr}"`,
                `"${r.responsibleArea}"`,
                `"${r.categoryL1} / ${r.subtypeL2}"`,
                `"${imputedStr.replace(/"/g, '""')}"`,
                r.totalDeductions,
                `"${r.solutionConcept}"`,
                `"${r.status === 'resolved' ? 'Resuelto' : 'Pendiente'}"`
            ].join(',');
        });

        const csvContent = '\uFEFF' + [headers.join(','), ...csvRows].join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `informe_cierre_pqr_${selectedDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // 7. Print via Golden Print (FruFresco Isolated New Window Standard)
    const handlePrintPdf = () => {
        if (reportRows.length === 0) {
            alert('No hay registros de PQR en la fecha seleccionada para generar el informe impreso.');
            return;
        }

        const formattedDate = new Date(selectedDate + 'T12:00:00Z').toLocaleDateString('es-CO', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        const tableRowsHtml = reportRows.map((r, idx) => {
            const prodsHtml = r.productsList.map(p => 
                `<div><strong>${p.name}</strong>: ${p.qty} ${p.unit} <span style="font-size:7.5pt; color:#64748B;">(${p.causal})</span></div>`
            ).join('');

            const imputedHtml = r.imputedEntities.length > 0 
                ? r.imputedEntities.map(e => `<div>${e.name} <span style="font-size:7.5pt; color:#0D7A57; font-weight:700;">($${Number(e.deductionAmount || 0).toLocaleString('es-CO')})</span></div>`).join('')
                : '<span style="color:#94A3B8;">Sin cobro imputado</span>';

            const statusBadge = r.status === 'resolved'
                ? '<span style="background-color:#DCFCE7; color:#166534; padding:2px 6px; border-radius:4px; font-weight:800; font-size:7pt;">RESUELTO</span>'
                : '<span style="background-color:#FEF3C7; color:#92400E; padding:2px 6px; border-radius:4px; font-weight:800; font-size:7pt;">PENDIENTE</span>';

            return `
                <tr style="border-bottom: 1px solid #E2E8F0; background-color: ${idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'};">
                    <td style="padding: 6px 8px; vertical-align: top; font-weight: 800; color: #0F172A;">
                        ${r.folio}<br/>
                        <span style="font-size: 7.5pt; color: #64748B; font-weight: 500;">${r.timeStr}</span>
                    </td>
                    <td style="padding: 6px 8px; vertical-align: top;">
                        <strong style="color: #0F172A;">${r.clientName}</strong><br/>
                        <span style="font-size: 7.5pt; color: #64748B;">Pedido ${r.orderSeq}</span>
                    </td>
                    <td style="padding: 6px 8px; vertical-align: top; font-size: 8pt;">
                        ${prodsHtml}
                    </td>
                    <td style="padding: 6px 8px; vertical-align: top; font-size: 8pt;">
                        <strong style="color: #1E293B;">${r.responsibleArea}</strong><br/>
                        <span style="font-size: 7.5pt; color: #64748B;">${r.categoryL1}</span>
                    </td>
                    <td style="padding: 6px 8px; vertical-align: top; font-size: 8pt;">
                        ${imputedHtml}
                    </td>
                    <td style="padding: 6px 8px; vertical-align: top; font-size: 8pt; color: #334155;">
                        ${r.solutionConcept}
                    </td>
                    <td style="padding: 6px 8px; vertical-align: top; text-align: right; font-weight: 900; color: #0D7A57;">
                        $${r.totalDeductions.toLocaleString('es-CO')}
                    </td>
                    <td style="padding: 6px 8px; vertical-align: top; text-align: center;">
                        ${statusBadge}
                    </td>
                </tr>
            `;
        }).join('');

        const printHtml = `
            <div class="letterhead-container" style="padding: 10mm 12mm; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                <!-- 1. HEADER INSTITUCIONAL FRUFRESCO -->
                <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0D7A57; padding-bottom: 8px; margin-bottom: 12px;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 16pt; font-weight: 900; color: #0D7A57; letter-spacing: -0.02em;">FRUFRESCO</span>
                            <span style="font-size: 8pt; font-weight: 700; background: #DCFCE7; color: #166534; padding: 2px 6px; borderRadius: 4px;">OPERATIONAL OS</span>
                        </div>
                        <div style="font-size: 7.5pt; color: #475569; margin-top: 2px;">
                            FRUFRESCO S.A.S. • NIT: 901.357.842-1 • Sistema de Aseguramiento de Calidad & SAC
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <h1 style="font-size: 12pt; font-weight: 900; color: #0F172A; margin: 0; text-transform: uppercase;">
                            Acta de Cierre Operativo Diario (PQR & Calidad)
                        </h1>
                        <div style="font-size: 8pt; font-weight: 700; color: #0D7A57; text-transform: capitalize; margin-top: 2px;">
                            ${formattedDate}
                        </div>
                        <div style="font-size: 7pt; color: #64748B;">
                            Hora de emisión: ${new Date().toLocaleTimeString('es-CO')}
                        </div>
                    </div>
                </div>

                <!-- 2. TELEMETRÍA DE LA JORNADA -->
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px;">
                    <div style="background-color: #F8FAFC; border: 1px solid #CBD5E1; padding: 6px 10px; border-radius: 6px;">
                        <span style="font-size: 7pt; font-weight: 800; color: #64748B; text-transform: uppercase; display: block;">Total Casos / PQRs</span>
                        <strong style="font-size: 12pt; color: #0F172A;">${dayMetrics.totalPqrs}</strong>
                    </div>
                    <div style="background-color: #F8FAFC; border: 1px solid #CBD5E1; padding: 6px 10px; border-radius: 6px;">
                        <span style="font-size: 7pt; font-weight: 800; color: #64748B; text-transform: uppercase; display: block;">Clientes Afectados</span>
                        <strong style="font-size: 12pt; color: #0F172A;">${dayMetrics.uniqueClients}</strong>
                    </div>
                    <div style="background-color: #F8FAFC; border: 1px solid #CBD5E1; padding: 6px 10px; border-radius: 6px;">
                        <span style="font-size: 7pt; font-weight: 800; color: #64748B; text-transform: uppercase; display: block;">Productos Afectados</span>
                        <strong style="font-size: 12pt; color: #0F172A;">${dayMetrics.totalProductsAffected}</strong>
                    </div>
                    <div style="background-color: #F0FDF4; border: 1px solid #86EFAC; padding: 6px 10px; border-radius: 6px;">
                        <span style="font-size: 7pt; font-weight: 800; color: #166534; text-transform: uppercase; display: block;">Costo de Calidad Liquidado</span>
                        <strong style="font-size: 12pt; color: #065F46;">$${dayMetrics.totalFinancialImpact.toLocaleString('es-CO')}</strong>
                    </div>
                </div>

                <!-- 3. TABLA CONSOLIDADA -->
                <table style="width: 100%; border-collapse: collapse; font-size: 8pt; margin-bottom: 20px;">
                    <thead>
                        <tr style="background-color: #0F172A; color: #FFFFFF; text-transform: uppercase; font-size: 7pt; letter-spacing: 0.03em;">
                            <th style="padding: 6px 8px; text-align: left;">Folio / Hora</th>
                            <th style="padding: 6px 8px; text-align: left;">Cliente / Sede</th>
                            <th style="padding: 6px 8px; text-align: left;">Productos Afectados & Causales</th>
                            <th style="padding: 6px 8px; text-align: left;">Área / Causa Raíz</th>
                            <th style="padding: 6px 8px; text-align: left;">Responsables Imputados</th>
                            <th style="padding: 6px 8px; text-align: left;">Solución Contable</th>
                            <th style="padding: 6px 8px; text-align: right;">Costo ($ COP)</th>
                            <th style="padding: 6px 8px; text-align: center;">Estado</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRowsHtml}
                    </tbody>
                </table>

                <!-- 4. BLOQUE DE FIRMAS Y CUSTODIA (ESTÁNDAR GOLDEN PRINT) -->
                <div style="margin-top: 30px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; page-break-inside: avoid;">
                    <div style="border-top: 1px solid #94A3B8; padding-top: 6px; text-align: center;">
                        <div style="font-size: 8pt; font-weight: 800; color: #0F172A;">Auditor de Calidad (SAC)</div>
                        <div style="font-size: 7pt; color: #64748B;">Revisión y Dictamen Causa Raíz</div>
                    </div>
                    <div style="border-top: 1px solid #94A3B8; padding-top: 6px; text-align: center;">
                        <div style="font-size: 8pt; font-weight: 800; color: #0F172A;">Jefe de Operaciones & Despachos</div>
                        <div style="font-size: 7pt; color: #64748B;">Conformidad de Muelle y Bodega</div>
                    </div>
                    <div style="border-top: 1px solid #94A3B8; padding-top: 6px; text-align: center;">
                        <div style="font-size: 8pt; font-weight: 800; color: #0F172A;">Líder de Cartera / Facturación</div>
                        <div style="font-size: 7pt; color: #64748B;">Conciliación de Ajustes y Notas Crédito</div>
                    </div>
                </div>
            </div>
        `;

        printViaNewWindow({
            content: printHtml,
            title: `Acta_Cierre_PQR_${selectedDate}`,
            paperSize: 'letter',
            orientation: 'landscape'
        });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* 1. TOP TOOLBAR: DATE SELECTION & EXPORT BUTTONS */}
            <div style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #CBD5E1',
                padding: '14px 18px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
            }}>
                {/* Date Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{
                        padding: '8px',
                        backgroundColor: '#DCFCE7',
                        color: '#0D7A57',
                        borderRadius: '10px',
                        border: '1px solid #86EFAC',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        <Calendar size={18} />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                            type="button"
                            onClick={() => setSelectedDate(getTodayBogota())}
                            style={{
                                padding: '6px 12px',
                                fontSize: '0.75rem',
                                fontWeight: selectedDate === getTodayBogota() ? '800' : '600',
                                color: selectedDate === getTodayBogota() ? '#FFFFFF' : '#334155',
                                backgroundColor: selectedDate === getTodayBogota() ? '#0D7A57' : '#F1F5F9',
                                border: '1px solid #CBD5E1',
                                borderRadius: '8px',
                                cursor: 'pointer'
                            }}
                        >
                            Hoy
                        </button>
                        <button
                            type="button"
                            onClick={() => setSelectedDate(getYesterdayBogota())}
                            style={{
                                padding: '6px 12px',
                                fontSize: '0.75rem',
                                fontWeight: selectedDate === getYesterdayBogota() ? '800' : '600',
                                color: selectedDate === getYesterdayBogota() ? '#FFFFFF' : '#334155',
                                backgroundColor: selectedDate === getYesterdayBogota() ? '#0D7A57' : '#F1F5F9',
                                border: '1px solid #CBD5E1',
                                borderRadius: '8px',
                                cursor: 'pointer'
                            }}
                        >
                            Ayer
                        </button>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#F8FAFC', padding: '4px 8px', borderRadius: '8px', border: '1px solid #CBD5E1' }}>
                            <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: '700' }}>Fecha:</span>
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={e => setSelectedDate(e.target.value)}
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    fontSize: '0.76rem',
                                    fontWeight: '800',
                                    color: '#0F172A',
                                    outline: 'none',
                                    cursor: 'pointer'
                                }}
                            />
                        </div>
                    </div>
                </div>

                {/* Export & Print Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                        type="button"
                        onClick={handleExportCsv}
                        style={{
                            padding: '7px 14px',
                            backgroundColor: '#FFFFFF',
                            border: '1px solid #CBD5E1',
                            borderRadius: '9px',
                            color: '#1E293B',
                            fontSize: '0.75rem',
                            fontWeight: '700',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                        }}
                    >
                        <Download size={14} color="#0D7A57" />
                        <span>Exportar CSV</span>
                    </button>

                    <button
                        type="button"
                        onClick={handlePrintPdf}
                        style={{
                            padding: '7px 16px',
                            backgroundColor: '#0D7A57',
                            border: 'none',
                            borderRadius: '9px',
                            color: '#FFFFFF',
                            fontSize: '0.75rem',
                            fontWeight: '800',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 2px 6px rgba(13, 122, 87, 0.3)'
                        }}
                    >
                        <Printer size={14} />
                        <span>Imprimir Acta (PDF)</span>
                    </button>
                </div>
            </div>

            {/* 2. DAY KPI TELEMETRY STRIP */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '12px'
            }}>
                <div style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '14px',
                    border: '1px solid #E2E8F0',
                    padding: '12px 16px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase' }}>
                        Casos del Día
                    </span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '2px' }}>
                        <span style={{ fontSize: '1.4rem', fontWeight: '900', color: '#0F172A' }}>
                            {dayMetrics.totalPqrs}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: dayMetrics.pendingPqrs > 0 ? '#D97706' : '#166534', fontWeight: '700' }}>
                            ({dayMetrics.resolvedPqrs} resueltos • {dayMetrics.pendingPqrs} pendientes)
                        </span>
                    </div>
                </div>

                <div style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '14px',
                    border: '1px solid #E2E8F0',
                    padding: '12px 16px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase' }}>
                        Clientes / Sedes Afectadas
                    </span>
                    <div style={{ fontSize: '1.4rem', fontWeight: '900', color: '#0F172A', marginTop: '2px' }}>
                        {dayMetrics.uniqueClients}
                    </div>
                </div>

                <div style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '14px',
                    border: '1px solid #E2E8F0',
                    padding: '12px 16px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase' }}>
                        Productos con Novedad
                    </span>
                    <div style={{ fontSize: '1.4rem', fontWeight: '900', color: '#0F172A', marginTop: '2px' }}>
                        {dayMetrics.totalProductsAffected}
                    </div>
                </div>

                <div style={{
                    backgroundColor: '#F0FDF4',
                    borderRadius: '14px',
                    border: '1.5px solid #86EFAC',
                    padding: '12px 16px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: '800', color: '#166534', textTransform: 'uppercase' }}>
                        Costo de Calidad Liquidado
                    </span>
                    <div style={{ fontSize: '1.4rem', fontWeight: '900', color: '#065F46', marginTop: '2px' }}>
                        {formatMoney(dayMetrics.totalFinancialImpact)}
                    </div>
                </div>
            </div>

            {/* 3. TABLE FILTER CONTROLS */}
            <div style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                padding: '8px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '260px', flex: 1 }}>
                    <Search size={15} style={{ color: '#64748B' }} />
                    <input
                        type="text"
                        placeholder="Filtrar por cliente, producto, causal, folio..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        style={{
                            border: 'none',
                            outline: 'none',
                            fontSize: '0.78rem',
                            color: '#0F172A',
                            width: '100%'
                        }}
                    />
                    {searchTerm && (
                        <button type="button" onClick={() => setSearchTerm('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                            <X size={14} color="#64748B" />
                        </button>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: '700', color: '#64748B' }}>Estado:</span>
                    {(['all', 'pending', 'resolved'] as const).map(st => (
                        <button
                            key={st}
                            type="button"
                            onClick={() => setFilterStatus(st)}
                            style={{
                                padding: '3px 8px',
                                fontSize: '0.68rem',
                                fontWeight: filterStatus === st ? '800' : '600',
                                borderRadius: '6px',
                                border: '1px solid #CBD5E1',
                                backgroundColor: filterStatus === st ? '#0F172A' : '#F8FAFC',
                                color: filterStatus === st ? '#FFFFFF' : '#475569',
                                cursor: 'pointer'
                            }}
                        >
                            {st === 'all' ? 'Todos' : st === 'pending' ? 'Pendientes' : 'Resueltos'}
                        </button>
                    ))}
                </div>
            </div>

            {/* 4. OPERATIONAL DETAIL TABLE */}
            <div style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #CBD5E1',
                overflow: 'hidden',
                boxShadow: '0 4px 12px rgba(15, 23, 42, 0.04)'
            }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#0F172A', color: '#FFFFFF', textAlign: 'left' }}>
                                <th style={{ padding: '10px 12px', fontWeight: '800', fontSize: '0.7rem', textTransform: 'uppercase' }}>Hora / Folio</th>
                                <th style={{ padding: '10px 12px', fontWeight: '800', fontSize: '0.7rem', textTransform: 'uppercase' }}>Cliente / Sede</th>
                                <th style={{ padding: '10px 12px', fontWeight: '800', fontSize: '0.7rem', textTransform: 'uppercase' }}>Productos Afectados & Causales</th>
                                <th style={{ padding: '10px 12px', fontWeight: '800', fontSize: '0.7rem', textTransform: 'uppercase' }}>Área / Causa Raíz</th>
                                <th style={{ padding: '10px 12px', fontWeight: '800', fontSize: '0.7rem', textTransform: 'uppercase' }}>Responsables Imputados</th>
                                <th style={{ padding: '10px 12px', fontWeight: '800', fontSize: '0.7rem', textTransform: 'uppercase' }}>Solución Contable</th>
                                <th style={{ padding: '10px 12px', fontWeight: '800', fontSize: '0.7rem', textTransform: 'uppercase', textAlign: 'right' }}>Deducción ($ COP)</th>
                                <th style={{ padding: '10px 12px', fontWeight: '800', fontSize: '0.7rem', textTransform: 'uppercase', textAlign: 'center' }}>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRows.length > 0 ? (
                                filteredRows.map((row, idx) => (
                                    <tr 
                                        key={row.id} 
                                        style={{ 
                                            borderBottom: '1px solid #F1F5F9',
                                            backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'
                                        }}
                                    >
                                        {/* Hora / Folio */}
                                        <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                                            <div style={{ fontWeight: '800', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Clock size={12} style={{ color: '#0D7A57' }} />
                                                <span>{row.timeStr}</span>
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: '700', marginTop: '2px' }}>
                                                {row.folio}
                                            </div>
                                        </td>

                                        {/* Cliente / Sede */}
                                        <td style={{ padding: '10px 12px', verticalAlign: 'top', maxWidth: '200px' }}>
                                            <strong style={{ color: '#0F172A', display: 'block', wordBreak: 'break-word' }}>
                                                {row.clientName}
                                            </strong>
                                            <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '2px' }}>
                                                Pedido {row.orderSeq}
                                                {row.orderTotal > 0 && ` (${formatMoney(row.orderTotal)})`}
                                            </div>
                                        </td>

                                        {/* Productos Afectados */}
                                        <td style={{ padding: '10px 12px', verticalAlign: 'top', maxWidth: '280px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                {row.productsList.map((prod, pIdx) => (
                                                    <div key={pIdx} style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                        <span style={{ fontWeight: '700', color: '#1E293B' }}>
                                                            {prod.name}
                                                        </span>
                                                        <span style={{ fontSize: '0.67rem', color: '#64748B', backgroundColor: '#F1F5F9', padding: '1px 5px', borderRadius: '4px' }}>
                                                            {prod.qty} {prod.unit}
                                                        </span>
                                                        <span style={{
                                                            fontSize: '0.62rem',
                                                            fontWeight: '800',
                                                            padding: '1px 6px',
                                                            borderRadius: '4px',
                                                            backgroundColor: prod.causal.includes('Avería') ? '#FEF2F2' : prod.causal.includes('Faltante') ? '#FEF3C7' : '#EFF6FF',
                                                            color: prod.causal.includes('Avería') ? '#991B1B' : prod.causal.includes('Faltante') ? '#92400E' : '#1D4ED8',
                                                            border: '1px solid rgba(0,0,0,0.06)'
                                                        }}>
                                                            {prod.causal}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </td>

                                        {/* Area / Causa Raiz */}
                                        <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                                            <strong style={{ color: '#1E293B', display: 'block' }}>
                                                {row.responsibleArea}
                                            </strong>
                                            <span style={{ fontSize: '0.68rem', color: '#64748B' }}>
                                                {row.categoryL1}
                                            </span>
                                        </td>

                                        {/* Responsables Imputados */}
                                        <td style={{ padding: '10px 12px', verticalAlign: 'top', maxWidth: '220px' }}>
                                            {row.imputedEntities.length > 0 ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                    {row.imputedEntities.map((ent: any, eIdx: number) => (
                                                        <div key={eIdx} style={{ fontSize: '0.7rem', display: 'flex', justifyContent: 'space-between', gap: '6px' }}>
                                                            <span style={{ color: '#334155', fontWeight: '600' }}>{ent.name}</span>
                                                            <strong style={{ color: '#0D7A57' }}>
                                                                {formatMoney(Number(ent.deductionAmount) || 0)}
                                                            </strong>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span style={{ color: '#94A3B8', fontSize: '0.7rem' }}>
                                                    Sin cobro imputado
                                                </span>
                                            )}
                                        </td>

                                        {/* Solucion Contable */}
                                        <td style={{ padding: '10px 12px', verticalAlign: 'top', fontSize: '0.72rem', color: '#334155' }}>
                                            {row.solutionConcept}
                                        </td>

                                        {/* Deduccion Total */}
                                        <td style={{ padding: '10px 12px', verticalAlign: 'top', textAlign: 'right', fontWeight: '900', color: row.totalDeductions > 0 ? '#0D7A57' : '#64748B' }}>
                                            {formatMoney(row.totalDeductions)}
                                        </td>

                                        {/* Estado */}
                                        <td style={{ padding: '10px 12px', verticalAlign: 'top', textAlign: 'center' }}>
                                            {row.status === 'resolved' ? (
                                                <span style={{
                                                    fontSize: '0.64rem',
                                                    fontWeight: '800',
                                                    backgroundColor: '#DCFCE7',
                                                    color: '#166534',
                                                    border: '1px solid #86EFAC',
                                                    padding: '2px 8px',
                                                    borderRadius: '6px'
                                                }}>
                                                    RESUELTO
                                                </span>
                                            ) : (
                                                <span style={{
                                                    fontSize: '0.64rem',
                                                    fontWeight: '800',
                                                    backgroundColor: '#FEF3C7',
                                                    color: '#92400E',
                                                    border: '1px solid #FDE68A',
                                                    padding: '2px 8px',
                                                    borderRadius: '6px'
                                                }}>
                                                    PENDIENTE
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={8} style={{ padding: '3rem 1rem', textAlign: 'center', color: '#64748B' }}>
                                        <Package size={28} style={{ color: '#94A3B8', margin: '0 auto 8px auto', display: 'block' }} />
                                        <strong style={{ display: 'block', color: '#334155' }}>No se registraron PQRs en esta fecha</strong>
                                        <span style={{ fontSize: '0.72rem' }}>
                                            Selecciona otro día en el calendario o verifica los filtros de búsqueda.
                                        </span>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
