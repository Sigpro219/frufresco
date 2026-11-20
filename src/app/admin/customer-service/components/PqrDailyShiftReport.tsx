'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
    Calendar, Download, Printer, Filter, ShieldCheck, 
    AlertCircle, AlertTriangle, CheckCircle2, Package, 
    Users, DollarSign, FileText, Check, Search, FileSpreadsheet,
    Clock, Building2, ChevronRight, X, Camera, Eye,
    TrendingUp, Layers, UserCheck, List
} from 'lucide-react';
import { formatMoney } from '@/lib/adminTheme';
import { PQR, formatPqrFolio, getPqrPhotos } from '../utils';
import { parseRcaFromRecord, RCA_CATEGORIES_L1, RESPONSIBLE_PARTIES } from '@/lib/rcaTaxonomy';
import { printViaNewWindow } from '@/components/print/printViaNewWindow';

interface PqrDailyShiftReportProps {
    pqrs: PQR[];
    novelties: any[];
    onRefresh?: () => void;
    onOpenAuditModal?: (pqr: PQR) => void;
    onZoomPhoto?: (url: string) => void;
}

export default function PqrDailyShiftReport({
    pqrs,
    novelties,
    onRefresh,
    onOpenAuditModal,
    onZoomPhoto
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
    const [viewMode, setViewMode] = useState<'executive' | 'table'>('executive');
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'resolved'>('all');
    const [isExportingExcel, setIsExportingExcel] = useState(false);

    // Sticky Magnetic Stacking Measurement (Zero Gap Protocol)
    const filterBarRef = useRef<HTMLDivElement>(null);
    const [filterBarHeight, setFilterBarHeight] = useState(50);

    useEffect(() => {
        if (!filterBarRef.current) return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const height = entry.borderBoxSize?.[0]?.blockSize || entry.contentRect?.height;
                if (height) setFilterBarHeight(Math.ceil(height));
            }
        });
        observer.observe(filterBarRef.current);
        return () => observer.disconnect();
    }, []);

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

    // Map of order_id -> list of active (non-rejected) novelties
    const noveltiesByOrderId = useMemo(() => {
        const map = new Map<string, any[]>();
        novelties.forEach(n => {
            if (n.order_id && n.status !== 'rejected') {
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
            const noveltiesDiscount = orderNovelties.reduce((acc, n) => {
                const qty = Number(n.quantity_returned) || 0;
                const orderItem = n.orders?.order_items?.find((oi: any) => oi.product_id === n.product_id);
                const unitPrice = Number(orderItem?.unit_price) || 0;
                return acc + (qty * unitPrice);
            }, 0);
            const clientDiscountAmount = noveltiesDiscount > 0
                ? noveltiesDiscount
                : (typeof rca.deductionAmount === 'number' ? rca.deductionAmount : 0);
            const photos = getPqrPhotos(p);
            
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
            const productsList: { name: string; accountingId: string; qty: number; unit: string; causal: string }[] = [];
            if (orderNovelties.length > 0) {
                orderNovelties.forEach(n => {
                    const prodName = n.products?.name || 'Producto con novedad';
                    const accountingId = n.products?.accounting_id || '';
                    const unit = n.products?.unit_of_measure || 'Kg';
                    const qty = Number(n.quantity_returned) || 0;
                    
                    let causal = 'Avería / Calidad';
                    const reason = (n.reason || '').toLowerCase();
                    if (reason.includes('faltante')) causal = 'Faltante en Báscula';
                    else if (reason.includes('escaso') || reason.includes('sin cargue')) causal = 'Producto Sin Cargue';
                    else if (reason.includes('digitación') || reason.includes('digitacion')) causal = 'Error Digitación';
                    else if (reason.includes('no solicitado')) causal = 'Producto No Solicitado';

                    productsList.push({ name: prodName, accountingId, qty, unit, causal });
                });
            } else {
                // Fallback to PQR subject
                productsList.push({
                    name: p.subject || 'Novedad general declarada',
                    accountingId: '',
                    qty: 1,
                    unit: 'Reclamación',
                    causal: p.type === 'queja' ? 'Avería / Calidad' : 'Faltante / Desviación'
                });
            }

            const categoryCode = rca.categoryL1 || 'no_definido';
            const responsibleCode = rca.responsible || 'no_definido';
            const categoryLabel = RCA_CATEGORIES_L1.find(c => c.code === categoryCode)?.label || (categoryCode === 'no_definido' || categoryCode === 'sin_clasificar' ? 'Sin Clasificar' : categoryCode);
            const responsibleLabel = RESPONSIBLE_PARTIES[responsibleCode]?.label || (responsibleCode === 'no_definido' ? 'Sin Definir' : responsibleCode);

            return {
                id: p.id,
                pqr: p,
                photos,
                folio,
                timeStr,
                clientName,
                nit: p.profiles?.nit || '',
                orderId: p.order_id || '',
                orderSeq,
                orderTotal,
                status: p.status,
                categoryL1: categoryCode,
                categoryLabel,
                subtypeL2: rca.subtypeL2 || 'No clasificado',
                responsibleArea: responsibleCode,
                responsibleLabel,
                auditedBy: rca.auditedBy || '',
                imputedEntities: rca.imputedEntities || [],
                totalDeductions,
                clientDiscountAmount,
                hasOrderNovelties: orderNovelties.length > 0,
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

    // 4B. Executive Consolidated Analytics (Deduplicated by billing_returns.id)
    const executiveData = useMemo(() => {
        const orderPqrCount = new Map<string, number>();
        reportRows.forEach(r => {
            if (r.orderId) {
                orderPqrCount.set(r.orderId, (orderPqrCount.get(r.orderId) || 0) + 1);
            }
        });

        // 1. Deduplicated products ranking from billing_returns
        const seenReturnIds = new Set<string>();
        const productMap = new Map<string, {
            key: string;
            accountingId: string;
            name: string;
            unit: string;
            totalQty: number;
            economicImpact: number;
            casesCount: number;
            unpricedLines: number;
        }>();

        let deduplicatedNoveltiesTotal = 0;
        let deduplicatedNoveltiesCount = 0;

        reportRows.forEach(r => {
            if (!r.orderId) return;
            const orderNovelties = noveltiesByOrderId.get(r.orderId) || [];
            orderNovelties.forEach(n => {
                const retId = String(n.id || `${r.orderId}-${n.product_id}-${n.quantity_returned}-${n.reason}`);
                if (seenReturnIds.has(retId)) return;
                seenReturnIds.add(retId);
                deduplicatedNoveltiesCount += 1;

                const qty = Number(n.quantity_returned) || 0;
                const orderItem = n.orders?.order_items?.find((oi: any) => oi.product_id === n.product_id);
                const unitPrice = Number(orderItem?.unit_price) || 0;
                const impact = qty * unitPrice;
                deduplicatedNoveltiesTotal += impact;

                const accountingId = n.products?.accounting_id || '';
                const name = n.products?.name || 'Producto con novedad';
                const unit = n.products?.unit_of_measure || 'Kg';
                const pKey = `${accountingId || n.product_id || name}::${unit}`;

                const curr = productMap.get(pKey) || {
                    key: pKey,
                    accountingId,
                    name,
                    unit,
                    totalQty: 0,
                    economicImpact: 0,
                    casesCount: 0,
                    unpricedLines: 0
                };
                curr.totalQty += qty;
                curr.economicImpact += impact;
                curr.casesCount += 1;
                if (impact === 0) curr.unpricedLines += 1;
                productMap.set(pKey, curr);
            });
        });

        // Add fallback RCA deductions only for PQRs without billing_returns
        let fallbackRcaTotal = 0;
        let pqrsWithoutProductCount = 0;
        reportRows.forEach(r => {
            if (!r.hasOrderNovelties) {
                pqrsWithoutProductCount += 1;
                fallbackRcaTotal += r.clientDiscountAmount;
            }
        });

        const totalClientDiscountsDeduplicated = deduplicatedNoveltiesTotal + fallbackRcaTotal;
        const totalImputedDeductions = reportRows.reduce((acc, r) => acc + r.totalDeductions, 0);
        const netCompanyCost = Math.max(0, totalClientDiscountsDeduplicated - totalImputedDeductions);

        const productRanking = Array.from(productMap.values())
            .sort((a, b) => b.economicImpact - a.economicImpact || b.totalQty - a.totalQty);

        // 2. Impact by Cause (Area + Category L1), prorating order novelties across multiple PQRs on same order
        const causeMap = new Map<string, {
            key: string;
            responsibleLabel: string;
            categoryLabel: string;
            casesCount: number;
            clientDiscount: number;
            imputedAmount: number;
        }>();

        reportRows.forEach(r => {
            const divisor = r.hasOrderNovelties && r.orderId ? (orderPqrCount.get(r.orderId) || 1) : 1;
            const attributedClientDiscount = r.clientDiscountAmount / divisor;
            const cKey = `${r.responsibleLabel}::${r.categoryLabel}`;
            const curr = causeMap.get(cKey) || {
                key: cKey,
                responsibleLabel: r.responsibleLabel,
                categoryLabel: r.categoryLabel,
                casesCount: 0,
                clientDiscount: 0,
                imputedAmount: 0
            };
            curr.casesCount += 1;
            curr.clientDiscount += attributedClientDiscount;
            curr.imputedAmount += r.totalDeductions;
            causeMap.set(cKey, curr);
        });

        const causeRanking = Array.from(causeMap.values())
            .sort((a, b) => b.clientDiscount - a.clientDiscount || b.casesCount - a.casesCount);

        // 3A. Imputed Users / Entities Ranking + Auditors
        const imputedMap = new Map<string, {
            name: string;
            role: string;
            casesCount: number;
            imputedAmount: number;
            waivedCount: number;
        }>();
        const auditorMap = new Map<string, number>();

        reportRows.forEach(r => {
            if (r.auditedBy) {
                auditorMap.set(r.auditedBy, (auditorMap.get(r.auditedBy) || 0) + 1);
            }
            r.imputedEntities.forEach((ent: any) => {
                const amt = Number(ent.deductionAmount) || 0;
                const roleLabel = RESPONSIBLE_PARTIES[ent.role]?.label || ent.role || 'Operación';
                const uKey = `${ent.name}::${roleLabel}`;
                const curr = imputedMap.get(uKey) || {
                    name: ent.name || 'Sin nombre',
                    role: roleLabel,
                    casesCount: 0,
                    imputedAmount: 0,
                    waivedCount: 0
                };
                curr.casesCount += 1;
                curr.imputedAmount += amt;
                if (amt === 0) curr.waivedCount += 1;
                imputedMap.set(uKey, curr);
            });
        });

        const imputedUsersRanking = Array.from(imputedMap.values())
            .sort((a, b) => b.imputedAmount - a.imputedAmount || b.casesCount - a.casesCount);
        const auditorsRanking = Array.from(auditorMap.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);

        // 3B. Affected Clients Ranking (deduplicated per order)
        const clientMap = new Map<string, {
            clientName: string;
            orders: Set<string>;
            casesCount: number;
            pendingCount: number;
            clientDiscount: number;
            imputedAmount: number;
        }>();

        reportRows.forEach(r => {
            const divisor = r.hasOrderNovelties && r.orderId ? (orderPqrCount.get(r.orderId) || 1) : 1;
            const attributedClientDiscount = r.clientDiscountAmount / divisor;
            const curr = clientMap.get(r.clientName) || {
                clientName: r.clientName,
                orders: new Set<string>(),
                casesCount: 0,
                pendingCount: 0,
                clientDiscount: 0,
                imputedAmount: 0
            };
            if (r.orderSeq && r.orderSeq !== 'Sin pedido') curr.orders.add(r.orderSeq);
            curr.casesCount += 1;
            if (r.status !== 'resolved') curr.pendingCount += 1;
            curr.clientDiscount += attributedClientDiscount;
            curr.imputedAmount += r.totalDeductions;
            clientMap.set(r.clientName, curr);
        });

        const clientsRanking = Array.from(clientMap.values())
            .map(c => ({
                clientName: c.clientName,
                ordersList: Array.from(c.orders),
                casesCount: c.casesCount,
                pendingCount: c.pendingCount,
                clientDiscount: c.clientDiscount,
                imputedAmount: c.imputedAmount
            }))
            .sort((a, b) => b.clientDiscount - a.clientDiscount || b.casesCount - a.casesCount);

        const unclassifiedCount = reportRows.filter(r => r.categoryL1 === 'no_definido' || r.categoryL1 === 'sin_clasificar' || r.responsibleArea === 'no_definido').length;

        return {
            totalClientDiscountsDeduplicated,
            totalImputedDeductions,
            netCompanyCost,
            deduplicatedNoveltiesCount,
            pqrsWithoutProductCount,
            unclassifiedCount,
            productRanking,
            causeRanking,
            imputedUsersRanking,
            auditorsRanking,
            clientsRanking
        };
    }, [reportRows, noveltiesByOrderId]);

    // 5. Day Summary Metrics (Deduplicated)
    const dayMetrics = useMemo(() => {
        const totalPqrs = reportRows.length;
        const resolvedPqrs = reportRows.filter(r => r.status === 'resolved').length;
        const pendingPqrs = totalPqrs - resolvedPqrs;
        const uniqueClients = new Set(reportRows.map(r => r.clientName)).size;
        const totalFinancialImpact = executiveData.totalImputedDeductions;
        const totalClientDiscounts = executiveData.totalClientDiscountsDeduplicated;
        const totalProductsAffected = executiveData.deduplicatedNoveltiesCount || reportRows.reduce((acc, r) => acc + r.productsList.length, 0);
        const resolvedPercent = totalPqrs > 0 ? Math.round((resolvedPqrs / totalPqrs) * 100) : 100;

        return {
            totalPqrs,
            resolvedPqrs,
            pendingPqrs,
            uniqueClients,
            totalFinancialImpact,
            totalClientDiscounts,
            netCompanyCost: executiveData.netCompanyCost,
            totalProductsAffected,
            resolvedPercent
        };
    }, [reportRows, executiveData]);

    // 6. Export to Native Excel (.xlsx via SheetJS)
    const handleExportExcel = async () => {
        if (reportRows.length === 0) {
            alert('No hay registros de PQR en la fecha seleccionada para exportar.');
            return;
        }

        setIsExportingExcel(true);
        try {
            const XLSX = await import('xlsx');

            const resolveMacroArea = (areaCode: string, entities: any[]) => {
                const effectiveCode = (areaCode && areaCode !== 'no_definido')
                    ? areaCode
                    : (entities[0]?.role || 'no_definido');
                if (['bodega', 'picking', 'transporte', 'alistamiento', 'planta'].includes(effectiveCode)) {
                    return 'Bodega';
                }
                if (['comercial', 'proveedor', 'cliente', 'administracion', 'admin', 'cartera', 'compras'].includes(effectiveCode)) {
                    return 'Administración';
                }
                return 'Sin Clasificar';
            };

            const excelRows = reportRows.map(r => {
                const prodsStr = r.productsList.map(p => `${p.accountingId ? `[#${p.accountingId}] ` : ''}${p.name} (${p.qty} ${p.unit})`).join(', ');
                const causalsStr = r.productsList.map(p => p.causal).join(', ');
                const responsibleNames = r.imputedEntities.length > 0
                    ? r.imputedEntities.map((e: any) => e.name).filter(Boolean).join(', ')
                    : 'Sin asignar';
                const responsibleMacroArea = resolveMacroArea(r.responsibleArea, r.imputedEntities);
                const imputedStr = r.imputedEntities.map(e => `${e.name} (${e.role || 'Resp'} - ${Number(e.deductionAmount || 0).toLocaleString('es-CO')})`).join('; ') || 'Sin cobro imputado';

                return {
                    'Fecha': selectedDate,
                    'Hora': r.timeStr,
                    'Folio PQR': r.folio,
                    'Pedido #': r.orderSeq,
                    'Cliente / Sede': r.clientName,
                    'NIT': r.nit,
                    'Productos con Novedad': prodsStr,
                    'Causales Operativas': causalsStr,
                    'Área Técnica RCA': r.responsibleLabel,
                    'Causa Raíz RCA': `${r.categoryLabel} / ${r.subtypeL2}`,
                    'Responsable': responsibleNames,
                    'Área del Responsable (Admin / Bodega)': responsibleMacroArea,
                    'Imputación Económica ($ COP)': r.totalDeductions,
                    'Detalle Imputados': imputedStr,
                    'Ajuste Cliente ($ COP)': r.clientDiscountAmount,
                    'Solución Contable': r.solutionConcept,
                    'Estado': r.status === 'resolved' ? 'Resuelto' : 'Pendiente'
                };
            });

            const worksheet = XLSX.utils.json_to_sheet(excelRows);
            
            // Auto column widths for clean readability
            worksheet['!cols'] = [
                { wch: 12 }, // Fecha
                { wch: 10 }, // Hora
                { wch: 12 }, // Folio PQR
                { wch: 12 }, // Pedido #
                { wch: 32 }, // Cliente / Sede
                { wch: 14 }, // NIT
                { wch: 40 }, // Productos con Novedad
                { wch: 24 }, // Causales
                { wch: 24 }, // Area Tecnica RCA
                { wch: 32 }, // Causa Raiz
                { wch: 30 }, // Responsable
                { wch: 28 }, // Area del Responsable (Admin / Bodega)
                { wch: 24 }, // Imputacion Economica ($ COP)
                { wch: 35 }, // Detalle Imputados
                { wch: 22 }, // Ajuste Cliente COP
                { wch: 28 }, // Solucion Contable
                { wch: 12 }  // Estado
            ];

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, `Cierre_${selectedDate}`);
            XLSX.writeFile(workbook, `Informe_Cierre_PQR_${selectedDate}.xlsx`);
        } catch (err) {
            console.error('Error al exportar Excel:', err);
            alert('Error al generar el archivo Excel. Por favor intenta de nuevo.');
        } finally {
            setIsExportingExcel(false);
        }
    };

    // 7. Print via Golden Print (FruFresco Executive Quality Report Standard)
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

        const topProd = executiveData.productRanking[0];
        const topCause = executiveData.causeRanking[0];
        const narrativeText = `Durante la jornada del ${formattedDate} se registraron <strong>${dayMetrics.totalPqrs} casos PQR</strong> (${dayMetrics.resolvedPqrs} resueltos y ${dayMetrics.pendingPqrs} pendientes) en <strong>${dayMetrics.uniqueClients} clientes/sedes</strong>, afectando <strong>${dayMetrics.totalProductsAffected} líneas de producto</strong>. El ajuste total facturado a clientes ascendió a <strong>$${dayMetrics.totalClientDiscounts.toLocaleString('es-CO')}</strong>, frente a una recuperación imputada a responsables de <strong>$${dayMetrics.totalFinancialImpact.toLocaleString('es-CO')}</strong> (brecha neta asumida por la operación: <strong>$${dayMetrics.netCompanyCost.toLocaleString('es-CO')}</strong>).${topProd ? ` El producto de mayor impacto fue <strong>${topProd.name}</strong> (${topProd.totalQty} ${topProd.unit} • $${topProd.economicImpact.toLocaleString('es-CO')}).` : ''}${topCause ? ` La principal causa concentrada correspondió a <strong>${topCause.responsibleLabel} — ${topCause.categoryLabel}</strong> (${topCause.casesCount} caso(s)).` : ''}${executiveData.unclassifiedCount > 0 ? ` Se mantienen <strong>${executiveData.unclassifiedCount} caso(s) sin clasificar</strong> pendientes de dictamen técnico.` : ''}`;

        const prodRowsHtml = executiveData.productRanking.length > 0
            ? executiveData.productRanking.map((p, idx) => {
                const sharePct = dayMetrics.totalClientDiscounts > 0 ? ((p.economicImpact / dayMetrics.totalClientDiscounts) * 100).toFixed(1) : '0.0';
                return `
                    <tr style="border-bottom: 1px solid #E2E8F0; background-color: ${idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'};">
                        <td style="padding: 5px 8px; font-family: monospace; color: #0D7A57; font-weight: 800;">${p.accountingId ? `#${p.accountingId}` : '—'}</td>
                        <td style="padding: 5px 8px; font-weight: 700; color: #0F172A;">${p.name}</td>
                        <td style="padding: 5px 8px; text-align: right;">${p.totalQty.toLocaleString('es-CO')} ${p.unit}</td>
                        <td style="padding: 5px 8px; text-align: center;">${p.casesCount}</td>
                        <td style="padding: 5px 8px; text-align: right; font-weight: 800; color: ${p.economicImpact > 0 ? '#B45309' : '#64748B'};">${p.economicImpact > 0 ? `$${p.economicImpact.toLocaleString('es-CO')}` : 'Sin valorizar ($0)'}</td>
                        <td style="padding: 5px 8px; text-align: right; color: #475569;">${sharePct}%</td>
                    </tr>
                `;
            }).join('')
            : '<tr><td colspan="6" style="padding: 10px; text-align: center; color: #64748B;">Sin líneas de producto en devoluciones para esta fecha.</td></tr>';

        const causeRowsHtml = executiveData.causeRanking.map((c, idx) => {
            const sharePct = dayMetrics.totalPqrs > 0 ? ((c.casesCount / dayMetrics.totalPqrs) * 100).toFixed(1) : '0.0';
            return `
                <tr style="border-bottom: 1px solid #E2E8F0; background-color: ${idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'};">
                    <td style="padding: 5px 8px; font-weight: 800; color: #0F172A;">${c.responsibleLabel}</td>
                    <td style="padding: 5px 8px; color: #334155;">${c.categoryLabel}</td>
                    <td style="padding: 5px 8px; text-align: center; font-weight: 700;">${c.casesCount} (${sharePct}%)</td>
                    <td style="padding: 5px 8px; text-align: right; font-weight: 800; color: #B45309;">$${Math.round(c.clientDiscount).toLocaleString('es-CO')}</td>
                    <td style="padding: 5px 8px; text-align: right; font-weight: 800; color: #0D7A57;">$${c.imputedAmount.toLocaleString('es-CO')}</td>
                </tr>
            `;
        }).join('');

        const imputedUsersHtml = executiveData.imputedUsersRanking.length > 0
            ? executiveData.imputedUsersRanking.map((u, idx) => `
                <tr style="border-bottom: 1px solid #E2E8F0; background-color: ${idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'};">
                    <td style="padding: 5px 8px; font-weight: 700; color: #0F172A;">${u.name}</td>
                    <td style="padding: 5px 8px; color: #475569;">${u.role}</td>
                    <td style="padding: 5px 8px; text-align: center;">${u.casesCount}</td>
                    <td style="padding: 5px 8px; text-align: right; font-weight: 800; color: ${u.imputedAmount > 0 ? '#0D7A57' : '#64748B'};">${u.imputedAmount > 0 ? `$${u.imputedAmount.toLocaleString('es-CO')}` : 'Exonerado ($0)'}</td>
                </tr>
            `).join('')
            : '<tr><td colspan="4" style="padding: 8px; text-align: center; color: #64748B;">Sin responsables imputados en la jornada.</td></tr>';

        const clientsUsersHtml = executiveData.clientsRanking.map((cl, idx) => `
            <tr style="border-bottom: 1px solid #E2E8F0; background-color: ${idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'};">
                <td style="padding: 5px 8px; font-weight: 700; color: #0F172A;">${cl.clientName}</td>
                <td style="padding: 5px 8px; color: #475569;">${cl.ordersList.join(', ') || 'Sin pedido'}</td>
                <td style="padding: 5px 8px; text-align: center;">${cl.casesCount}${cl.pendingCount > 0 ? ` (${cl.pendingCount} pend.)` : ''}</td>
                <td style="padding: 5px 8px; text-align: right; font-weight: 800; color: #B45309;">$${Math.round(cl.clientDiscount).toLocaleString('es-CO')}</td>
            </tr>
        `).join('');

        const printHtml = `
            <div class="letterhead-container" style="padding: 8mm 10mm; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                <!-- 1. HEADER INSTITUCIONAL FRUFRESCO -->
                <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0D7A57; padding-bottom: 8px; margin-bottom: 10px;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 16pt; font-weight: 900; color: #0D7A57; letter-spacing: -0.02em;">FRUFRESCO</span>
                            <span style="font-size: 8pt; font-weight: 700; background: #DCFCE7; color: #166534; padding: 2px 6px; border-radius: 4px;">OPERATIONAL OS</span>
                        </div>
                        <div style="font-size: 7.5pt; color: #475569; margin-top: 2px;">
                            Investments Cortés S.A.S. • NIT: 901.393.217-5 • Sistema de Aseguramiento de Calidad & SAC
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <h1 style="font-size: 11.5pt; font-weight: 900; color: #0F172A; margin: 0; text-transform: uppercase;">
                            Informe Ejecutivo Diario de Calidad (PQR & SAC)
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
                <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 10px;">
                    <div style="background-color: #F8FAFC; border: 1px solid #CBD5E1; padding: 6px 8px; border-radius: 6px;">
                        <span style="font-size: 6.5pt; font-weight: 800; color: #64748B; text-transform: uppercase; display: block;">Casos PQR</span>
                        <strong style="font-size: 11pt; color: #0F172A;">${dayMetrics.totalPqrs}</strong>
                        <span style="font-size: 6.5pt; color: #475569;"> (${dayMetrics.resolvedPqrs} res • ${dayMetrics.pendingPqrs} pend)</span>
                    </div>
                    <div style="background-color: #F8FAFC; border: 1px solid #CBD5E1; padding: 6px 8px; border-radius: 6px;">
                        <span style="font-size: 6.5pt; font-weight: 800; color: #64748B; text-transform: uppercase; display: block;">Clientes / Productos</span>
                        <strong style="font-size: 11pt; color: #0F172A;">${dayMetrics.uniqueClients} / ${dayMetrics.totalProductsAffected}</strong>
                    </div>
                    <div style="background-color: #FFFBEB; border: 1px solid #FDE68A; padding: 6px 8px; border-radius: 6px;">
                        <span style="font-size: 6.5pt; font-weight: 800; color: #92400E; text-transform: uppercase; display: block;">Ajuste Clientes</span>
                        <strong style="font-size: 11pt; color: #B45309;">$${Math.round(dayMetrics.totalClientDiscounts).toLocaleString('es-CO')}</strong>
                    </div>
                    <div style="background-color: #F0FDF4; border: 1px solid #86EFAC; padding: 6px 8px; border-radius: 6px;">
                        <span style="font-size: 6.5pt; font-weight: 800; color: #166534; text-transform: uppercase; display: block;">Recuperado Imputado</span>
                        <strong style="font-size: 11pt; color: #065F46;">$${dayMetrics.totalFinancialImpact.toLocaleString('es-CO')}</strong>
                    </div>
                    <div style="background-color: #FEF2F2; border: 1px solid #FECACA; padding: 6px 8px; border-radius: 6px;">
                        <span style="font-size: 6.5pt; font-weight: 800; color: #991B1B; text-transform: uppercase; display: block;">Brecha Neta Operación</span>
                        <strong style="font-size: 11pt; color: #991B1B;">$${Math.round(dayMetrics.netCompanyCost).toLocaleString('es-CO')}</strong>
                    </div>
                </div>

                <!-- 3. NARRATIVA EJECUTIVA -->
                <div style="background-color: #F8FAFC; border-left: 4px solid #0D7A57; padding: 8px 12px; border-radius: 4px; font-size: 8.2pt; line-height: 1.45; color: #1E293B; margin-bottom: 12px;">
                    ${narrativeText}
                </div>

                <!-- 4. PRODUCTOS Y CANTIDADES POR IMPACTO ECONÓMICO -->
                <h2 style="font-size: 8.5pt; font-weight: 900; color: #0F172A; text-transform: uppercase; margin: 0 0 4px 0;">1. Productos y Cantidades Afectadas por Impacto Económico</h2>
                <table style="width: 100%; border-collapse: collapse; font-size: 7.5pt; margin-bottom: 12px;">
                    <thead>
                        <tr style="background-color: #0F172A; color: #FFFFFF; text-transform: uppercase; font-size: 6.8pt;">
                            <th style="padding: 5px 8px; text-align: left;">#ID</th>
                            <th style="padding: 5px 8px; text-align: left;">Producto</th>
                            <th style="padding: 5px 8px; text-align: right;">Cantidad Afectada</th>
                            <th style="padding: 5px 8px; text-align: center;">Líneas</th>
                            <th style="padding: 5px 8px; text-align: right;">Impacto Económico</th>
                            <th style="padding: 5px 8px; text-align: right;">% Día</th>
                        </tr>
                    </thead>
                    <tbody>${prodRowsHtml}</tbody>
                </table>

                <!-- 5. IMPACTO POR CAUSAS -->
                <h2 style="font-size: 8.5pt; font-weight: 900; color: #0F172A; text-transform: uppercase; margin: 0 0 4px 0;">2. Impacto por Causas (Área Responsable & Causa Raíz RCA)</h2>
                <table style="width: 100%; border-collapse: collapse; font-size: 7.5pt; margin-bottom: 12px;">
                    <thead>
                        <tr style="background-color: #0F172A; color: #FFFFFF; text-transform: uppercase; font-size: 6.8pt;">
                            <th style="padding: 5px 8px; text-align: left;">Área Responsable</th>
                            <th style="padding: 5px 8px; text-align: left;">Categoría Causa Raíz</th>
                            <th style="padding: 5px 8px; text-align: center;">Casos (%)</th>
                            <th style="padding: 5px 8px; text-align: right;">Ajuste Clientes ($)</th>
                            <th style="padding: 5px 8px; text-align: right;">Imputado ($)</th>
                        </tr>
                    </thead>
                    <tbody>${causeRowsHtml}</tbody>
                </table>

                <!-- 6. RELACIÓN POR USUARIOS (RESPONSABLES & CLIENTES) -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
                    <div>
                        <h2 style="font-size: 8.5pt; font-weight: 900; color: #0F172A; text-transform: uppercase; margin: 0 0 4px 0;">3A. Relación por Usuarios — Responsables Imputados</h2>
                        <table style="width: 100%; border-collapse: collapse; font-size: 7.3pt;">
                            <thead>
                                <tr style="background-color: #0F172A; color: #FFFFFF; text-transform: uppercase; font-size: 6.6pt;">
                                    <th style="padding: 5px 6px; text-align: left;">Usuario / Entidad</th>
                                    <th style="padding: 5px 6px; text-align: left;">Área</th>
                                    <th style="padding: 5px 6px; text-align: center;">Casos</th>
                                    <th style="padding: 5px 6px; text-align: right;">Imputado ($)</th>
                                </tr>
                            </thead>
                            <tbody>${imputedUsersHtml}</tbody>
                        </table>
                    </div>
                    <div>
                        <h2 style="font-size: 8.5pt; font-weight: 900; color: #0F172A; text-transform: uppercase; margin: 0 0 4px 0;">3B. Relación por Usuarios — Clientes / Sedes Afectadas</h2>
                        <table style="width: 100%; border-collapse: collapse; font-size: 7.3pt;">
                            <thead>
                                <tr style="background-color: #0F172A; color: #FFFFFF; text-transform: uppercase; font-size: 6.6pt;">
                                    <th style="padding: 5px 6px; text-align: left;">Cliente / Sede</th>
                                    <th style="padding: 5px 6px; text-align: left;">Pedidos</th>
                                    <th style="padding: 5px 6px; text-align: center;">Casos</th>
                                    <th style="padding: 5px 6px; text-align: right;">Ajuste ($)</th>
                                </tr>
                            </thead>
                            <tbody>${clientsUsersHtml}</tbody>
                        </table>
                    </div>
                </div>

                <!-- 7. BLOQUE DE FIRMAS Y CUSTODIA (ESTÁNDAR GOLDEN PRINT) -->
                <div style="margin-top: 24px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; page-break-inside: avoid;">
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
            title: `Informe_Ejecutivo_Calidad_${selectedDate}`,
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

                {/* Export, View Switcher & Print Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'inline-flex', backgroundColor: '#F1F5F9', padding: '3px', borderRadius: '9px', border: '1px solid #CBD5E1' }}>
                        <button
                            type="button"
                            onClick={() => setViewMode('executive')}
                            style={{
                                padding: '5px 12px',
                                fontSize: '0.73rem',
                                fontWeight: viewMode === 'executive' ? '800' : '600',
                                color: viewMode === 'executive' ? '#FFFFFF' : '#475569',
                                backgroundColor: viewMode === 'executive' ? '#0F172A' : 'transparent',
                                border: 'none',
                                borderRadius: '7px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px'
                            }}
                        >
                            <FileText size={13} />
                            <span>Informe Ejecutivo</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('table')}
                            style={{
                                padding: '5px 12px',
                                fontSize: '0.73rem',
                                fontWeight: viewMode === 'table' ? '800' : '600',
                                color: viewMode === 'table' ? '#FFFFFF' : '#475569',
                                backgroundColor: viewMode === 'table' ? '#0F172A' : 'transparent',
                                border: 'none',
                                borderRadius: '7px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px'
                            }}
                        >
                            <List size={13} />
                            <span>Tabla Operativa</span>
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={handleExportExcel}
                        disabled={isExportingExcel}
                        style={{
                            padding: '7px 14px',
                            backgroundColor: '#FFFFFF',
                            border: '1px solid #CBD5E1',
                            borderRadius: '9px',
                            color: '#1E293B',
                            fontSize: '0.75rem',
                            fontWeight: '700',
                            cursor: isExportingExcel ? 'not-allowed' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                        }}
                    >
                        <FileSpreadsheet size={15} color="#0D7A57" />
                        <span>{isExportingExcel ? 'Generando Excel...' : 'Descargar Excel (.xlsx)'}</span>
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
                    backgroundColor: '#FFFBEB',
                    borderRadius: '14px',
                    border: '1.5px solid #FDE68A',
                    padding: '12px 16px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: '800', color: '#92400E', textTransform: 'uppercase' }}>
                        Ajuste Facturado a Clientes
                    </span>
                    <div style={{ fontSize: '1.4rem', fontWeight: '900', color: '#B45309', marginTop: '2px' }}>
                        {formatMoney(dayMetrics.totalClientDiscounts)}
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
                        Recuperado / Imputado
                    </span>
                    <div style={{ fontSize: '1.4rem', fontWeight: '900', color: '#065F46', marginTop: '2px' }}>
                        {formatMoney(dayMetrics.totalFinancialImpact)}
                    </div>
                </div>
            </div>

            {viewMode === 'executive' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* 3A. NARRATIVA EJECUTIVA DEL DÍA */}
                    <div style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '14px',
                        border: '1px solid #CBD5E1',
                        borderLeft: '5px solid #0D7A57',
                        padding: '16px 20px',
                        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <ShieldCheck size={18} color="#0D7A57" />
                                <strong style={{ fontSize: '0.92rem', color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                                    Resumen Ejecutivo de Calidad — {selectedDate}
                                </strong>
                            </div>
                            <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#991B1B', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', padding: '3px 10px', borderRadius: '999px' }}>
                                Brecha Neta Asumida: {formatMoney(dayMetrics.netCompanyCost)}
                            </span>
                        </div>
                        {reportRows.length > 0 ? (
                            <p style={{ margin: 0, fontSize: '0.84rem', lineHeight: 1.6, color: '#334155' }}>
                                En la jornada se registraron <strong style={{ color: '#0F172A' }}>{dayMetrics.totalPqrs} casos PQR</strong> ({dayMetrics.resolvedPqrs} resueltos y {dayMetrics.pendingPqrs} pendientes) en <strong style={{ color: '#0F172A' }}>{dayMetrics.uniqueClients} clientes/sedes</strong>, afectando <strong style={{ color: '#0F172A' }}>{dayMetrics.totalProductsAffected} líneas de producto</strong>. El ajuste total facturado a clientes fue de <strong style={{ color: '#B45309' }}>{formatMoney(dayMetrics.totalClientDiscounts)}</strong>, frente a una recuperación imputada a responsables de <strong style={{ color: '#0D7A57' }}>{formatMoney(dayMetrics.totalFinancialImpact)}</strong>.
                                {executiveData.productRanking[0] && (
                                    <> El producto de mayor impacto económico fue <strong style={{ color: '#0F172A' }}>{executiveData.productRanking[0].name}</strong> ({executiveData.productRanking[0].totalQty.toLocaleString('es-CO')} {executiveData.productRanking[0].unit} • {formatMoney(executiveData.productRanking[0].economicImpact)}).</>
                                )}
                                {executiveData.causeRanking[0] && (
                                    <> La principal causa concentrada correspondió a <strong style={{ color: '#0F172A' }}>{executiveData.causeRanking[0].responsibleLabel} ({executiveData.causeRanking[0].categoryLabel})</strong> con {executiveData.causeRanking[0].casesCount} caso(s).</>
                                )}
                                {executiveData.unclassifiedCount > 0 && (
                                    <> Se mantienen <strong style={{ color: '#B45309' }}>{executiveData.unclassifiedCount} caso(s) sin clasificar</strong> pendientes de auditoría técnica.</>
                                )}
                            </p>
                        ) : (
                            <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748B' }}>
                                No se registraron PQRs ni novedades operativas en la fecha seleccionada.
                            </p>
                        )}
                    </div>

                    {/* 3B. PRODUCTOS Y CANTIDADES POR IMPACTO ECONÓMICO */}
                    <div style={{ backgroundColor: '#FFFFFF', borderRadius: '14px', border: '1px solid #CBD5E1', overflow: 'hidden', boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)' }}>
                        <div style={{ padding: '12px 16px', backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Package size={16} color="#0D7A57" />
                                <strong style={{ fontSize: '0.84rem', color: '#0F172A' }}>1. Productos y Cantidades Afectadas por Impacto Económico</strong>
                            </div>
                            <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: '700' }}>
                                {executiveData.productRanking.length} referencias deduplicadas
                            </span>
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#0F172A', color: '#FFFFFF', textAlign: 'left', fontSize: '0.68rem', textTransform: 'uppercase' }}>
                                    <th style={{ padding: '9px 12px' }}>#ID</th>
                                    <th style={{ padding: '9px 12px' }}>Producto</th>
                                    <th style={{ padding: '9px 12px', textAlign: 'right' }}>Cantidad Afectada</th>
                                    <th style={{ padding: '9px 12px', textAlign: 'center' }}>Líneas</th>
                                    <th style={{ padding: '9px 12px', textAlign: 'right' }}>Impacto Económico ($ COP)</th>
                                    <th style={{ padding: '9px 12px', textAlign: 'right' }}>% del Día</th>
                                </tr>
                            </thead>
                            <tbody>
                                {executiveData.productRanking.length > 0 ? executiveData.productRanking.map((p, idx) => {
                                    const pct = dayMetrics.totalClientDiscounts > 0 ? ((p.economicImpact / dayMetrics.totalClientDiscounts) * 100).toFixed(1) : '0.0';
                                    return (
                                        <tr key={p.key} style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}>
                                            <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontWeight: '800', color: '#0D7A57' }}>
                                                {p.accountingId ? `#${p.accountingId}` : '—'}
                                            </td>
                                            <td style={{ padding: '9px 12px', fontWeight: '700', color: '#0F172A' }}>{p.name}</td>
                                            <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: '700', color: '#334155' }}>
                                                {p.totalQty.toLocaleString('es-CO')} {p.unit}
                                            </td>
                                            <td style={{ padding: '9px 12px', textAlign: 'center', color: '#64748B' }}>{p.casesCount}</td>
                                            <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: '800', color: p.economicImpact > 0 ? '#B45309' : '#64748B' }}>
                                                {p.economicImpact > 0 ? formatMoney(p.economicImpact) : 'Sin valorizar ($0)'}
                                            </td>
                                            <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: '700', color: '#475569' }}>{pct}%</td>
                                        </tr>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: '#64748B' }}>
                                            No hay productos con novedad en devoluciones para esta jornada.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                        {executiveData.pqrsWithoutProductCount > 0 && (
                            <div style={{ padding: '8px 14px', backgroundColor: '#FFFBEB', borderTop: '1px solid #FDE68A', fontSize: '0.72rem', color: '#92400E', fontWeight: '600' }}>
                                Nota: {executiveData.pqrsWithoutProductCount} PQR(s) de la jornada no tienen líneas asociadas en devoluciones (reclamación operativa sin producto vinculado).
                            </div>
                        )}
                    </div>

                    {/* 3C. IMPACTO POR CAUSAS */}
                    <div style={{ backgroundColor: '#FFFFFF', borderRadius: '14px', border: '1px solid #CBD5E1', overflow: 'hidden', boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)' }}>
                        <div style={{ padding: '12px 16px', backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Layers size={16} color="#0D7A57" />
                            <strong style={{ fontSize: '0.84rem', color: '#0F172A' }}>2. Impacto por Causas (Área Responsable & Causa Raíz RCA)</strong>
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#0F172A', color: '#FFFFFF', textAlign: 'left', fontSize: '0.68rem', textTransform: 'uppercase' }}>
                                    <th style={{ padding: '9px 12px' }}>Área Responsable</th>
                                    <th style={{ padding: '9px 12px' }}>Categoría Causa Raíz</th>
                                    <th style={{ padding: '9px 12px', textAlign: 'center' }}>Casos (%)</th>
                                    <th style={{ padding: '9px 12px', textAlign: 'right' }}>Ajuste Clientes ($ COP)</th>
                                    <th style={{ padding: '9px 12px', textAlign: 'right' }}>Recuperado Imputado ($ COP)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {executiveData.causeRanking.length > 0 ? executiveData.causeRanking.map((c, idx) => {
                                    const pct = dayMetrics.totalPqrs > 0 ? ((c.casesCount / dayMetrics.totalPqrs) * 100).toFixed(1) : '0.0';
                                    return (
                                        <tr key={c.key} style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}>
                                            <td style={{ padding: '9px 12px', fontWeight: '800', color: '#0F172A' }}>{c.responsibleLabel}</td>
                                            <td style={{ padding: '9px 12px', color: '#334155' }}>{c.categoryLabel}</td>
                                            <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: '700' }}>{c.casesCount} ({pct}%)</td>
                                            <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: '800', color: '#B45309' }}>{formatMoney(Math.round(c.clientDiscount))}</td>
                                            <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: '800', color: '#0D7A57' }}>{formatMoney(c.imputedAmount)}</td>
                                        </tr>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: '#64748B' }}>Sin causas registradas.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* 3D. RELACIÓN POR USUARIOS (RESPONSABLES IMPUTADOS & CLIENTES AFECTADOS) */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '14px' }}>
                        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '14px', border: '1px solid #CBD5E1', overflow: 'hidden', boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)' }}>
                            <div style={{ padding: '12px 16px', backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <UserCheck size={16} color="#0D7A57" />
                                <strong style={{ fontSize: '0.84rem', color: '#0F172A' }}>3A. Relación por Usuarios — Responsables Imputados</strong>
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#0F172A', color: '#FFFFFF', textAlign: 'left', fontSize: '0.67rem', textTransform: 'uppercase' }}>
                                        <th style={{ padding: '8px 10px' }}>Usuario / Entidad</th>
                                        <th style={{ padding: '8px 10px' }}>Área</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'center' }}>Casos</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Imputado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {executiveData.imputedUsersRanking.length > 0 ? executiveData.imputedUsersRanking.map((u, idx) => (
                                        <tr key={`${u.name}-${idx}`} style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}>
                                            <td style={{ padding: '8px 10px', fontWeight: '700', color: '#0F172A' }}>{u.name}</td>
                                            <td style={{ padding: '8px 10px', color: '#475569' }}>{u.role}</td>
                                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>{u.casesCount}</td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '800', color: u.imputedAmount > 0 ? '#0D7A57' : '#64748B' }}>
                                                {u.imputedAmount > 0 ? formatMoney(u.imputedAmount) : 'Exonerado ($0)'}
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={4} style={{ padding: '20px', textAlign: 'center', color: '#64748B' }}>Sin responsables imputados en esta fecha.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '14px', border: '1px solid #CBD5E1', overflow: 'hidden', boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)' }}>
                            <div style={{ padding: '12px 16px', backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Users size={16} color="#0D7A57" />
                                <strong style={{ fontSize: '0.84rem', color: '#0F172A' }}>3B. Relación por Usuarios — Clientes / Sedes Afectadas</strong>
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#0F172A', color: '#FFFFFF', textAlign: 'left', fontSize: '0.67rem', textTransform: 'uppercase' }}>
                                        <th style={{ padding: '8px 10px' }}>Cliente / Sede</th>
                                        <th style={{ padding: '8px 10px' }}>Pedidos</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'center' }}>Casos</th>
                                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Ajuste ($)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {executiveData.clientsRanking.length > 0 ? executiveData.clientsRanking.map((cl, idx) => (
                                        <tr key={cl.clientName} style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}>
                                            <td style={{ padding: '8px 10px', fontWeight: '700', color: '#0F172A' }}>{cl.clientName}</td>
                                            <td style={{ padding: '8px 10px', color: '#475569' }}>{cl.ordersList.join(', ') || 'Sin pedido'}</td>
                                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                {cl.casesCount}{cl.pendingCount > 0 ? ` (${cl.pendingCount} pend.)` : ''}
                                            </td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '800', color: '#B45309' }}>
                                                {formatMoney(Math.round(cl.clientDiscount))}
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={4} style={{ padding: '20px', textAlign: 'center', color: '#64748B' }}>Sin clientes afectados en esta fecha.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            ) : (
            <>
            {/* 3. TABLE FILTER CONTROLS (Línea 1 Sticky: top 85px, zIndex 70) */}
            <div
                ref={filterBarRef}
                style={{
                    position: 'sticky',
                    top: '85px',
                    zIndex: 70,
                    backgroundColor: '#FFFFFF',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    padding: '8px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px',
                    boxShadow: '0 4px 12px rgba(15, 23, 42, 0.06)'
                }}
            >
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
                overflowX: 'clip',
                boxShadow: '0 4px 12px rgba(15, 23, 42, 0.04)'
            }}>
                <div style={{ overflowX: 'clip' }}>
                    <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.76rem' }}>
                        <thead style={{ position: 'sticky', top: `${85 + filterBarHeight}px`, zIndex: 40, backgroundColor: '#0F172A' }}>
                            <tr style={{ backgroundColor: '#0F172A', color: '#FFFFFF', textAlign: 'left' }}>
                                <th style={{ width: '9%', position: 'sticky', top: `${85 + filterBarHeight}px`, zIndex: 40, backgroundColor: '#0F172A', padding: '10px 10px', fontWeight: '800', fontSize: '0.68rem', textTransform: 'uppercase', borderTopLeftRadius: '15px' }}>Hora / Folio</th>
                                <th style={{ width: '15%', position: 'sticky', top: `${85 + filterBarHeight}px`, zIndex: 40, backgroundColor: '#0F172A', padding: '10px 10px', fontWeight: '800', fontSize: '0.68rem', textTransform: 'uppercase' }}>Cliente / Sede</th>
                                <th style={{ width: '21%', position: 'sticky', top: `${85 + filterBarHeight}px`, zIndex: 40, backgroundColor: '#0F172A', padding: '10px 10px', fontWeight: '800', fontSize: '0.68rem', textTransform: 'uppercase' }}>Productos Afectados & Causales</th>
                                <th style={{ width: '10%', position: 'sticky', top: `${85 + filterBarHeight}px`, zIndex: 40, backgroundColor: '#0F172A', padding: '10px 10px', fontWeight: '800', fontSize: '0.68rem', textTransform: 'uppercase' }}>Área / Causa Raíz</th>
                                <th style={{ width: '12%', position: 'sticky', top: `${85 + filterBarHeight}px`, zIndex: 40, backgroundColor: '#0F172A', padding: '10px 10px', fontWeight: '800', fontSize: '0.68rem', textTransform: 'uppercase' }}>Responsables Imputados</th>
                                <th style={{ width: '10%', position: 'sticky', top: `${85 + filterBarHeight}px`, zIndex: 40, backgroundColor: '#0F172A', padding: '10px 10px', fontWeight: '800', fontSize: '0.68rem', textTransform: 'uppercase' }}>Solución Contable</th>
                                <th style={{ width: '10%', position: 'sticky', top: `${85 + filterBarHeight}px`, zIndex: 40, backgroundColor: '#0F172A', padding: '10px 10px', fontWeight: '800', fontSize: '0.68rem', textTransform: 'uppercase', textAlign: 'right' }}>Financiero ($ COP)</th>
                                <th style={{ width: '6%', position: 'sticky', top: `${85 + filterBarHeight}px`, zIndex: 40, backgroundColor: '#0F172A', padding: '10px 8px', fontWeight: '800', fontSize: '0.68rem', textTransform: 'uppercase', textAlign: 'center' }}>Estado</th>
                                <th style={{ width: '7%', position: 'sticky', top: `${85 + filterBarHeight}px`, zIndex: 40, backgroundColor: '#0F172A', padding: '10px 8px', fontWeight: '800', fontSize: '0.68rem', textTransform: 'uppercase', textAlign: 'center', borderTopRightRadius: '15px' }}>Acción</th>
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
                                        <td style={{ padding: '10px 10px', verticalAlign: 'top', wordBreak: 'break-word' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                {row.productsList.map((prod, pIdx) => (
                                                    <div key={pIdx} style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                                                        {prod.accountingId && (
                                                            <span style={{ fontFamily: 'monospace', fontSize: '0.64rem', fontWeight: '800', color: '#0D7A57', backgroundColor: '#ECFDF5', padding: '1px 5px', borderRadius: '4px', border: '1px solid #A7F3D0' }}>
                                                                #{prod.accountingId}
                                                            </span>
                                                        )}
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
                                                {row.responsibleLabel}
                                            </strong>
                                            <span style={{ fontSize: '0.68rem', color: '#64748B' }}>
                                                {row.categoryLabel}
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

                                        {/* Financiero Dual (Ajuste Cliente vs Imputado) */}
                                        <td style={{ padding: '10px 10px', verticalAlign: 'top', textAlign: 'right' }}>
                                            <div style={{ fontWeight: '800', color: row.clientDiscountAmount > 0 ? '#B45309' : '#94A3B8', fontSize: '0.74rem' }} title="Ajuste / Descuento Facturado al Cliente">
                                                {row.clientDiscountAmount > 0 ? `-${formatMoney(row.clientDiscountAmount)}` : '$0'}
                                            </div>
                                            <div style={{ fontSize: '0.64rem', fontWeight: '800', color: row.totalDeductions > 0 ? '#0D7A57' : '#94A3B8', marginTop: '2px' }} title="Recuperación Imputada a Responsables">
                                                Imp: {formatMoney(row.totalDeductions)}
                                            </div>
                                        </td>

                                        {/* Estado */}
                                        <td style={{ padding: '10px 6px', verticalAlign: 'top', textAlign: 'center' }}>
                                            {row.status === 'resolved' ? (
                                                <span style={{
                                                    fontSize: '0.6rem',
                                                    fontWeight: '800',
                                                    backgroundColor: '#DCFCE7',
                                                    color: '#166534',
                                                    border: '1px solid #86EFAC',
                                                    padding: '2px 6px',
                                                    borderRadius: '6px',
                                                    display: 'inline-block'
                                                }}>
                                                    RESUELTO
                                                </span>
                                            ) : (
                                                <span style={{
                                                    fontSize: '0.6rem',
                                                    fontWeight: '800',
                                                    backgroundColor: '#FEF3C7',
                                                    color: '#92400E',
                                                    border: '1px solid #FDE68A',
                                                    padding: '2px 6px',
                                                    borderRadius: '6px',
                                                    display: 'inline-block'
                                                }}>
                                                    PENDIENTE
                                                </span>
                                            )}
                                        </td>

                                        {/* Acción & Evidencia */}
                                        <td style={{ padding: '10px 6px', verticalAlign: 'top', textAlign: 'center' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                                {onOpenAuditModal && (
                                                    <button
                                                        type="button"
                                                        onClick={() => onOpenAuditModal(row.pqr)}
                                                        style={{
                                                            padding: '4px 8px',
                                                            backgroundColor: '#0D7A57',
                                                            color: '#FFFFFF',
                                                            border: 'none',
                                                            borderRadius: '6px',
                                                            fontSize: '0.66rem',
                                                            fontWeight: '800',
                                                            cursor: 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px'
                                                        }}
                                                        title="Abrir Auditoría RCA y Resolución"
                                                    >
                                                        <Eye size={11} />
                                                        <span>Auditar</span>
                                                    </button>
                                                )}
                                                {row.photos.length > 0 && onZoomPhoto && (
                                                    <button
                                                        type="button"
                                                        onClick={() => onZoomPhoto(row.photos[0])}
                                                        style={{
                                                            padding: '2px 6px',
                                                            backgroundColor: '#F1F5F9',
                                                            color: '#334155',
                                                            border: '1px solid #CBD5E1',
                                                            borderRadius: '5px',
                                                            fontSize: '0.62rem',
                                                            fontWeight: '700',
                                                            cursor: 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '3px'
                                                        }}
                                                        title={`Ver ${row.photos.length} foto(s) de evidencia`}
                                                    >
                                                        <Camera size={10} />
                                                        <span>{row.photos.length}</span>
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={9} style={{ padding: '3rem 1rem', textAlign: 'center', color: '#64748B' }}>
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
            </>
            )}
        </div>
    );
}
