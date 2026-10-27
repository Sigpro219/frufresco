'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    FileText, 
    UploadCloud, 
    CheckCircle2, 
    AlertTriangle, 
    XCircle, 
    HelpCircle, 
    Download, 
    ShieldCheck, 
    RefreshCw, 
    Search, 
    Clock, 
    ArrowRight, 
    BookOpen, 
    FileSpreadsheet, 
    ChevronDown, 
    ChevronUp,
    ExternalLink,
    Filter,
    Building2,
    Calendar,
    DollarSign,
    Check,
    AlertCircle
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface CadenaRadianReconciliationSubmoduleProps {
    onSyncComplete?: () => void;
}

interface OrderRecord {
    id: string;
    delivery_date: string;
    total_amount: number;
    status: string;
    billing_cut_id?: string;
    invoice_id?: string;
    logistics_data?: any;
    client?: {
        id: string;
        full_name?: string;
        company_name?: string;
        nit?: string;
        phone?: string;
    };
    invoice_number?: string;
}

interface CadenaRowParsed {
    rawPrefix: string;
    rawNumber: string;
    invoiceFullNumber: string;
    cufe: string;
    issueDate: string;
    clientNit: string;
    clientName: string;
    dianStatus: 'aprobada' | 'rechazada' | 'pendiente';
    dianMessage?: string;
    event030Acuse: boolean;
    event030Date?: string;
    event032Recibo: boolean;
    event032Date?: string;
    event033Aceptacion: boolean;
    event033Date?: string;
    totalAmount: number;
    notesOrRef: string;
}

interface ReconciledItem {
    orderId: string;
    orderDate: string;
    clientName: string;
    clientNit: string;
    orderAmount: number;
    daysDelayed: number;
    cadenaInvoiceNumber?: string;
    cufe?: string;
    cadenaIssueDate?: string;
    dianStatus?: 'aprobada' | 'rechazada' | 'pendiente';
    dianMessage?: string;
    event030Acuse: boolean;
    event032Recibo: boolean;
    event033Aceptacion: boolean;
    reconciliationStatus: 'missing_in_cadena' | 'reconciled' | 'dian_rejected' | 'orphan_in_cadena';
    matchReason?: string;
    existingInvoiceNumber?: string;
}

export default function CadenaRadianReconciliationSubmodule({ onSyncComplete }: CadenaRadianReconciliationSubmoduleProps) {
    // Pestaña principal interna
    const [innerTab, setInnerTab] = useState<'reconciliation' | 'guide' | 'history'>('reconciliation');
    
    // Estado de carga y datos
    const [loadingOrders, setLoadingOrders] = useState(false);
    const [orders, setOrders] = useState<OrderRecord[]>([]);
    const [invoicesMap, setInvoicesMap] = useState<Record<string, any>>({});
    
    // Archivo y conciliación
    const [fileName, setFileName] = useState<string | null>(null);
    const [processingFile, setProcessingFile] = useState(false);
    const [reconciledItems, setReconciledItems] = useState<ReconciledItem[]>([]);
    const [hasRanReconciliation, setHasRanReconciliation] = useState(false);
    
    // Filtros de tabla
    const [filterCategory, setFilterCategory] = useState<'missing' | 'reconciled' | 'rejected' | 'radian' | 'all'>('missing');
    const [searchTerm, setSearchTerm] = useState('');
    
    // Estado de guardado
    const [savingChanges, setSavingChanges] = useState(false);
    const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
    
    // Historial previo de auditorías
    const [auditHistory, setAuditHistory] = useState<any[]>([]);
    
    // Acordeones del instructivo
    const [openGuideSection, setOpenGuideSection] = useState<string>('causa_raiz');

    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // 1. Cargar pedidos entregados y facturas existentes desde Supabase
    const loadUniverse = async () => {
        setLoadingOrders(true);
        try {
            // Cargar pedidos entregados / completados / en ruta de los últimos 90 días
            const { data: ordersData, error: ordersErr } = await supabase
                .from('orders')
                .select(`
                    id,
                    delivery_date,
                    total_amount,
                    status,
                    billing_cut_id,
                    invoice_id,
                    logistics_data,
                    client:profiles!client_id (
                        id,
                        full_name,
                        company_name,
                        nit,
                        phone
                    )
                `)
                .in('status', ['delivered', 'completed', 'para_compra', 'received', 'recibido'])
                .order('delivery_date', { ascending: false })
                .limit(400);

            if (ordersErr) throw ordersErr;

            // Cargar facturas registradas en billing_invoices
            const { data: invData, error: invErr } = await supabase
                .from('billing_invoices')
                .select('*')
                .limit(1000);

            if (invErr) throw invErr;

            const map: Record<string, any> = {};
            invData?.forEach(inv => {
                if (inv.order_id) map[inv.order_id] = inv;
                if (inv.id) map[inv.id] = inv;
            });
            setInvoicesMap(map);

            const mappedOrders: OrderRecord[] = (ordersData || []).map((o: any) => {
                const associatedInv = o.invoice_id ? map[o.invoice_id] : (map[o.id] || null);
                return {
                    id: o.id,
                    delivery_date: o.delivery_date,
                    total_amount: Number(o.total_amount || 0),
                    status: o.status,
                    billing_cut_id: o.billing_cut_id,
                    invoice_id: o.invoice_id,
                    logistics_data: o.logistics_data,
                    client: Array.isArray(o.client) ? o.client[0] : o.client,
                    invoice_number: associatedInv?.invoice_number || (o.logistics_data?.cadena_reconciliation?.invoice_number || undefined)
                };
            });

            setOrders(mappedOrders);

            // Cargar historial de auditorías desde app_settings
            const { data: settingsData } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'cadena_reconciliations_history')
                .maybeSingle();

            if (settingsData?.value) {
                try {
                    const parsed = JSON.parse(settingsData.value);
                    if (Array.isArray(parsed)) setAuditHistory(parsed);
                } catch {
                    // Ignorar si no era JSON válido
                }
            }

        } catch (err: any) {
            console.error('Error cargando universo para conciliación:', err);
        } finally {
            setLoadingOrders(false);
        }
    };

    useEffect(() => {
        loadUniverse();
    }, []);

    // 2. Procesamiento del archivo Excel / CSV de Cadena o WorldOffice
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setFileName(file.name);
        setProcessingFile(true);
        setSaveSuccessMessage(null);

        try {
            const XLSX = await import('xlsx');
            const dataBuffer = await file.arrayBuffer();
            const workbook = XLSX.read(dataBuffer, { type: 'array' });
            
            // Tomar la primera hoja
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

            if (!rows || rows.length === 0) {
                alert('El archivo no contiene filas de datos.');
                setProcessingFile(false);
                return;
            }

            // Normalizador dinámico de encabezados
            const normalizeKey = (key: string) => 
                key.toLowerCase()
                   .normalize("NFD")
                   .replace(/[\u0300-\u036f]/g, "")
                   .replace(/[^a-z0-9]/g, "");

            const parsedCadenaRows: CadenaRowParsed[] = rows.map((r: any) => {
                const normObj: Record<string, any> = {};
                Object.keys(r).forEach(k => {
                    normObj[normalizeKey(k)] = r[k];
                });

                // Detectar Consecutivo / Número
                const rawNum = String(
                    normObj['consecutivo'] || 
                    normObj['numero'] || 
                    normObj['folio'] || 
                    normObj['factura'] || 
                    normObj['numerofactura'] || 
                    ''
                ).trim();

                // Detectar Prefijo
                const rawPref = String(
                    normObj['prefijo'] || 
                    normObj['serie'] || 
                    ''
                ).trim();

                const fullNumber = rawPref ? `${rawPref}-${rawNum}` : rawNum;

                // Detectar CUFE
                const cufeVal = String(
                    normObj['cufe'] || 
                    normObj['codigocufe'] || 
                    normObj['uuid'] || 
                    normObj['cufedocumento'] || 
                    ''
                ).trim();

                // Detectar Fecha
                const dateVal = String(
                    normObj['fechaemision'] || 
                    normObj['fecha'] || 
                    normObj['fechageneracion'] || 
                    normObj['fechafactura'] || 
                    ''
                ).trim();

                // Detectar Cliente / NIT
                const nitVal = String(
                    normObj['nit'] || 
                    normObj['nitadquiriente'] || 
                    normObj['identificacion'] || 
                    normObj['documentoreceptor'] || 
                    normObj['tercero'] || 
                    ''
                ).trim().replace(/\D/g, '');

                const clientNameVal = String(
                    normObj['cliente'] || 
                    normObj['nombrecliente'] || 
                    normObj['razonsocial'] || 
                    normObj['adquiriente'] || 
                    normObj['nombrereceptor'] || 
                    ''
                ).trim();

                // Detectar Estado DIAN
                const rawStatus = String(
                    normObj['estadodian'] || 
                    normObj['estado'] || 
                    normObj['respuestadian'] || 
                    normObj['estadodocumento'] || 
                    'aprobada'
                ).toLowerCase();

                let dianStatus: 'aprobada' | 'rechazada' | 'pendiente' = 'aprobada';
                if (rawStatus.includes('rechaz') || rawStatus.includes('error') || rawStatus.includes('fall')) {
                    dianStatus = 'rechazada';
                } else if (rawStatus.includes('pend') || rawStatus.includes('proc')) {
                    dianStatus = 'pendiente';
                }

                // Detectar Eventos RADIAN
                const acuseRaw = String(normObj['evento030'] || normObj['acuserecibo'] || normObj['acuse'] || normObj['eventoacuse'] || '').toLowerCase();
                const event030 = acuseRaw.includes('si') || acuseRaw.includes('true') || acuseRaw.includes('aprob') || acuseRaw.includes('radic') || acuseRaw.length > 5;

                const reciboRaw = String(normObj['evento032'] || normObj['recibomercancia'] || normObj['recibobienes'] || normObj['recibo'] || '').toLowerCase();
                const event032 = reciboRaw.includes('si') || reciboRaw.includes('true') || reciboRaw.includes('aprob') || reciboRaw.length > 5;

                const aceptacionRaw = String(normObj['evento033'] || normObj['evento034'] || normObj['aceptacion'] || normObj['aceptacionradian'] || normObj['titulovalor'] || '').toLowerCase();
                const event033 = aceptacionRaw.includes('si') || aceptacionRaw.includes('true') || aceptacionRaw.includes('aprob') || aceptacionRaw.length > 5;

                // Total
                const totalNum = typeof normObj['total'] === 'number' 
                    ? normObj['total'] 
                    : Number(String(normObj['total'] || normObj['valortotal'] || normObj['totalfactura'] || '0').replace(/[^0-9.-]+/g, '')) || 0;

                // Notas / Referencia / Remisión
                const notesStr = String(
                    normObj['ordencompra'] || 
                    normObj['remision'] || 
                    normObj['observaciones'] || 
                    normObj['notas'] || 
                    normObj['referencia'] || 
                    normObj['detalle'] || 
                    ''
                ).trim();

                return {
                    rawPrefix: rawPref,
                    rawNumber: rawNum,
                    invoiceFullNumber: fullNumber,
                    cufe: cufeVal,
                    issueDate: dateVal,
                    clientNit: nitVal,
                    clientName: clientNameVal,
                    dianStatus,
                    dianMessage: normObj['mensaje'] || normObj['error'] || undefined,
                    event030Acuse: event030,
                    event032Recibo: event032,
                    event033Aceptacion: event033,
                    totalAmount: totalNum,
                    notesOrRef: notesStr
                };
            });

            // 3. Algoritmo de Cruce FruFresco vs Cadena (Poka-Yoke)
            const matchedCadenaIndices = new Set<number>();
            const results: ReconciledItem[] = [];

            const today = new Date();

            orders.forEach(order => {
                const orderDateObj = new Date(order.delivery_date);
                const diffTime = Math.abs(today.getTime() - orderDateObj.getTime());
                const daysDelayed = Math.floor(diffTime / (1000 * 60 * 60 * 24));

                const orderShortId = order.id.slice(0, 8);
                const clientNitClean = (order.client?.nit || '').replace(/\D/g, '');

                // Prioridad 1: Match por ID de Pedido en notas/observaciones de Cadena
                let matchIdx = parsedCadenaRows.findIndex((row, idx) => {
                    if (matchedCadenaIndices.has(idx)) return false;
                    return row.notesOrRef.toLowerCase().includes(orderShortId.toLowerCase()) ||
                           row.notesOrRef.toLowerCase().includes(order.id.toLowerCase());
                });

                let matchReason = 'ID de Pedido en Observaciones Cadena';

                // Prioridad 2: Match por Consecutivo de Factura ya asignado en FruFresco
                if (matchIdx === -1 && order.invoice_number) {
                    const normInv = order.invoice_number.replace(/\s+/g, '').toLowerCase();
                    matchIdx = parsedCadenaRows.findIndex((row, idx) => {
                        if (matchedCadenaIndices.has(idx)) return false;
                        const rowFull = row.invoiceFullNumber.replace(/\s+/g, '').toLowerCase();
                        const rowPure = row.rawNumber.replace(/\s+/g, '').toLowerCase();
                        return normInv === rowFull || normInv.endsWith(rowPure);
                    });
                    if (matchIdx !== -1) matchReason = `Consecutivo Fiscal Exacto (${order.invoice_number})`;
                }

                // Prioridad 3: Match por NIT de Cliente + Monto Cercano (±1%)
                if (matchIdx === -1 && clientNitClean && clientNitClean.length > 5) {
                    matchIdx = parsedCadenaRows.findIndex((row, idx) => {
                        if (matchedCadenaIndices.has(idx)) return false;
                        const sameNit = row.clientNit === clientNitClean;
                        if (!sameNit) return false;
                        
                        // Monto similar (+/- 1% o +/- $500 pesos de redondeo)
                        const amountDiff = Math.abs(row.totalAmount - order.total_amount);
                        const isSimilarAmount = amountDiff < 500 || (order.total_amount > 0 && (amountDiff / order.total_amount) < 0.015);
                        return isSimilarAmount;
                    });
                    if (matchIdx !== -1) matchReason = `Cruce Heurístico por NIT (${clientNitClean}) + Monto ($${order.total_amount.toLocaleString()})`;
                }

                if (matchIdx !== -1) {
                    // Match encontrado
                    matchedCadenaIndices.add(matchIdx);
                    const matchedRow = parsedCadenaRows[matchIdx];

                    const status: 'reconciled' | 'dian_rejected' = 
                        matchedRow.dianStatus === 'rechazada' ? 'dian_rejected' : 'reconciled';

                    results.push({
                        orderId: order.id,
                        orderDate: order.delivery_date,
                        clientName: order.client?.company_name || order.client?.full_name || matchedRow.clientName || 'Cliente FruFresco',
                        clientNit: order.client?.nit || matchedRow.clientNit,
                        orderAmount: order.total_amount,
                        daysDelayed,
                        cadenaInvoiceNumber: matchedRow.invoiceFullNumber,
                        cufe: matchedRow.cufe || undefined,
                        cadenaIssueDate: matchedRow.issueDate || undefined,
                        dianStatus: matchedRow.dianStatus,
                        dianMessage: matchedRow.dianMessage,
                        event030Acuse: matchedRow.event030Acuse,
                        event032Recibo: matchedRow.event032Recibo,
                        event033Aceptacion: matchedRow.event033Aceptacion,
                        reconciliationStatus: status,
                        matchReason,
                        existingInvoiceNumber: order.invoice_number
                    });
                } else {
                    // No encontrado en Cadena -> ¡Esta es la factura faltante / en riesgo!
                    results.push({
                        orderId: order.id,
                        orderDate: order.delivery_date,
                        clientName: order.client?.company_name || order.client?.full_name || 'Cliente FruFresco',
                        clientNit: order.client?.nit || 'Sin NIT',
                        orderAmount: order.total_amount,
                        daysDelayed,
                        event030Acuse: false,
                        event032Recibo: false,
                        event033Aceptacion: false,
                        reconciliationStatus: 'missing_in_cadena',
                        matchReason: 'No figura emitida en el reporte de Cadena cargado',
                        existingInvoiceNumber: order.invoice_number
                    });
                }
            });

            setReconciledItems(results);
            setHasRanReconciliation(true);

            // Seleccionar por defecto la pestaña de faltantes si existen
            const hasMissing = results.some(r => r.reconciliationStatus === 'missing_in_cadena');
            setFilterCategory(hasMissing ? 'missing' : 'all');

        } catch (error: any) {
            console.error('Error procesando archivo de conciliación:', error);
            alert(`Error al procesar el archivo: ${error.message || 'Formato no reconocido'}`);
        } finally {
            setProcessingFile(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // 4. Descargar Plantilla de Ejemplo
    const handleDownloadTemplate = async () => {
        try {
            const XLSX = await import('xlsx');
            const templateRows = [
                {
                    'Prefijo': 'SETT',
                    'Consecutivo': 10001,
                    'CUFE': '3a8f192b0c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d',
                    'Fecha Emisión': '2026-10-25 08:30:00',
                    'NIT': '901234567',
                    'Cliente': 'RESTAURANTE EL CORRAL SUPO 14',
                    'Estado DIAN': 'Aprobada',
                    'Evento 030 (Acuse)': 'Si (2026-10-25 09:12)',
                    'Evento 032 (Recibo Bienes)': 'Si (2026-10-25 14:40)',
                    'Evento 033 (Aceptación)': 'Si (2026-10-26 10:00)',
                    'Total': 450200,
                    'Observaciones': 'Remisión FruFresco Pedido #e1161fc2'
                },
                {
                    'Prefijo': 'SETT',
                    'Consecutivo': 10002,
                    'CUFE': 'b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9',
                    'Fecha Emisión': '2026-10-25 09:15:00',
                    'NIT': '860001234',
                    'Cliente': 'HOTEL TEQUENDAMA SUITE',
                    'Estado DIAN': 'Aprobada',
                    'Evento 030 (Acuse)': 'Si (2026-10-25 11:00)',
                    'Evento 032 (Recibo Bienes)': 'Pendiente',
                    'Evento 033 (Aceptación)': 'Pendiente',
                    'Total': 789400,
                    'Observaciones': 'Pedido #5abca8b7 Hotel Tequendama'
                },
                {
                    'Prefijo': 'SETT',
                    'Consecutivo': 10003,
                    'CUFE': 'c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0',
                    'Fecha Emisión': '2026-10-25 11:20:00',
                    'NIT': '900999888',
                    'Cliente': 'CASINO NUTRIR BOGOTÁ',
                    'Estado DIAN': 'Rechazada',
                    'Mensaje': 'Error DIAN 99: El correo del receptor no responde al estándar VPFE',
                    'Evento 030 (Acuse)': 'No',
                    'Evento 032 (Recibo Bienes)': 'No',
                    'Evento 033 (Aceptación)': 'No',
                    'Total': 310000,
                    'Observaciones': 'Pedido #221f391f Casino Nutrir'
                }
            ];

            const ws = XLSX.utils.json_to_sheet(templateRows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Facturas Cadena');
            XLSX.writeFile(wb, 'Plantilla_Ejemplo_Reporte_Cadena_RADIAN.xlsx');
        } catch (e: any) {
            console.error('Error generando plantilla:', e);
            alert('Error al descargar plantilla');
        }
    };

    // 5. Exportar Informe de Facturas Faltantes para Contabilidad
    const handleExportMissingReport = async () => {
        const missingList = reconciledItems.filter(r => r.reconciliationStatus === 'missing_in_cadena');
        if (missingList.length === 0) {
            alert('No hay facturas faltantes detectadas en este cruce.');
            return;
        }

        try {
            const XLSX = await import('xlsx');
            const rowsToExport = missingList.map((m, idx) => ({
                'Item': idx + 1,
                'ID Pedido FruFresco': `#${m.orderId.slice(0, 8)}`,
                'Fecha de Entrega Física': m.orderDate,
                'Días de Retraso': m.daysDelayed,
                'Cliente / Razón Social': m.clientName,
                'NIT': m.clientNit,
                'Monto Entregado ($ COP)': m.orderAmount,
                'Estado Físico FruFresco': 'Entregado a Satisfacción',
                'Alerta Fiscal': 'FALTANTE EN CADENA - PENDIENTE DE EMITIR',
                'Acción Requerida': 'Emitir Factura Electrónica y verificar Radicación'
            }));

            const ws = XLSX.utils.json_to_sheet(rowsToExport);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Faltantes en Cadena');
            XLSX.writeFile(wb, `URGENTE_Facturas_Faltantes_Cadena_${new Date().toISOString().slice(0, 10)}.xlsx`);
        } catch (e: any) {
            console.error('Error exportando reporte de faltantes:', e);
            alert('Error al generar Excel');
        }
    };

    // 6. Aplicar Conciliación en Base de Datos (Persistir en Supabase)
    const handleApplyReconciliation = async () => {
        if (reconciledItems.length === 0) return;

        setSavingChanges(true);
        setSaveSuccessMessage(null);

        try {
            const reconciledList = reconciledItems.filter(r => r.reconciliationStatus === 'reconciled');
            let updatedCount = 0;

            for (const item of reconciledList) {
                // Actualizar metadatos de logística en orders
                const existingOrder = orders.find(o => o.id === item.orderId);
                const currentLogistics = existingOrder?.logistics_data || {};

                const updatedLogistics = {
                    ...currentLogistics,
                    cadena_reconciliation: {
                        reconciled_at: new Date().toISOString(),
                        invoice_number: item.cadenaInvoiceNumber,
                        cufe: item.cufe,
                        cadena_issue_date: item.cadenaIssueDate,
                        dian_status: item.dianStatus,
                        radian_events: {
                            event_030_acuse: item.event030Acuse,
                            event_032_recibo: item.event032Recibo,
                            event_033_aceptacion: item.event033Aceptacion
                        },
                        source_file: fileName
                    }
                };

                await supabase
                    .from('orders')
                    .update({ logistics_data: updatedLogistics })
                    .eq('id', item.orderId);

                // Si ya existe factura en billing_invoices, actualizar el consecutivo oficial
                if (existingOrder?.invoice_id && item.cadenaInvoiceNumber) {
                    await supabase
                        .from('billing_invoices')
                        .update({
                            invoice_number: item.cadenaInvoiceNumber,
                            worldoffice_sync_status: 'reconciled_cadena'
                        })
                        .eq('id', existingOrder.invoice_id);
                }

                updatedCount++;
            }

            // Registrar en historial de auditorías
            const newAuditEntry = {
                id: `audit_${Date.now()}`,
                date: new Date().toISOString(),
                fileName: fileName || 'Carga Manual',
                totalAnalyzed: reconciledItems.length,
                reconciledCount: reconciledList.length,
                missingCount: reconciledItems.filter(r => r.reconciliationStatus === 'missing_in_cadena').length,
                rejectedCount: reconciledItems.filter(r => r.reconciliationStatus === 'dian_rejected').length,
                radianAcceptedCount: reconciledItems.filter(r => r.event033Aceptacion).length
            };

            const updatedHistory = [newAuditEntry, ...auditHistory.slice(0, 19)];
            setAuditHistory(updatedHistory);

            await supabase
                .from('app_settings')
                .upsert({
                    key: 'cadena_reconciliations_history',
                    value: JSON.stringify(updatedHistory),
                    description: 'Bitácora histórica de cruces de facturación Cadena / RADIAN'
                }, { onConflict: 'key' });

            setSaveSuccessMessage(`¡Conciliación aplicada con éxito! Se sincronizaron ${updatedCount} facturas con CUFE y estado RADIAN en la base de datos.`);
            
            // Recargar universo
            await loadUniverse();
            if (onSyncComplete) onSyncComplete();

        } catch (err: any) {
            console.error('Error aplicando conciliación:', err);
            alert(`Error al guardar en base de datos: ${err.message || 'Fallo desconocido'}`);
        } finally {
            setSavingChanges(false);
        }
    };

    // Cálculos de resumen
    const metrics = useMemo(() => {
        if (!hasRanReconciliation) {
            // Métricas preventivas previas al cruce
            const deliveredWithoutInv = orders.filter(o => !o.invoice_number);
            const totalOrdersAmount = orders.reduce((sum, o) => sum + o.total_amount, 0);
            return {
                totalOrders: orders.length,
                pendingInvoiceEstimate: deliveredWithoutInv.length,
                totalOrdersAmount,
                missingCount: 0,
                reconciledCount: 0,
                rejectedCount: 0,
                radianAcceptedCount: 0
            };
        }

        const missing = reconciledItems.filter(r => r.reconciliationStatus === 'missing_in_cadena');
        const reconciled = reconciledItems.filter(r => r.reconciliationStatus === 'reconciled');
        const rejected = reconciledItems.filter(r => r.reconciliationStatus === 'dian_rejected');
        const radianAccepted = reconciledItems.filter(r => r.event033Aceptacion);

        return {
            totalOrders: reconciledItems.length,
            missingCount: missing.length,
            missingAmount: missing.reduce((sum, r) => sum + r.orderAmount, 0),
            reconciledCount: reconciled.length,
            reconciledAmount: reconciled.reduce((sum, r) => sum + r.orderAmount, 0),
            rejectedCount: rejected.length,
            radianAcceptedCount: radianAccepted.length
        };
    }, [orders, reconciledItems, hasRanReconciliation]);

    // Filtrar filas de tabla
    const filteredRows = useMemo(() => {
        let list = reconciledItems;

        if (filterCategory === 'missing') {
            list = list.filter(r => r.reconciliationStatus === 'missing_in_cadena');
        } else if (filterCategory === 'reconciled') {
            list = list.filter(r => r.reconciliationStatus === 'reconciled');
        } else if (filterCategory === 'rejected') {
            list = list.filter(r => r.reconciliationStatus === 'dian_rejected');
        } else if (filterCategory === 'radian') {
            list = list.filter(r => r.event030Acuse || r.event032Recibo || r.event033Aceptacion);
        }

        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            list = list.filter(r => 
                r.clientName.toLowerCase().includes(term) ||
                r.clientNit.toLowerCase().includes(term) ||
                r.orderId.toLowerCase().includes(term) ||
                (r.cadenaInvoiceNumber && r.cadenaInvoiceNumber.toLowerCase().includes(term)) ||
                (r.cufe && r.cufe.toLowerCase().includes(term))
            );
        }

        return list;
    }, [reconciledItems, filterCategory, searchTerm]);

    return (
        <div style={{ maxWidth: '1600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            
            {/* ── HEADER PRINCIPAL DEL SUBMÓDULO ── */}
            <div style={{ 
                backgroundColor: 'white', 
                borderRadius: '16px', 
                border: '1px solid #E2E8F0', 
                padding: '1.25rem 1.5rem', 
                boxShadow: '0 1px 4px rgba(0, 0, 0, 0.04)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ 
                        width: '42px', 
                        height: '42px', 
                        borderRadius: '12px', 
                        backgroundColor: '#ECFDF5', 
                        color: '#0D7A57', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        boxShadow: '0 2px 6px rgba(13, 122, 87, 0.15)'
                    }}>
                        <ShieldCheck size={24} strokeWidth={2.4} />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '900', color: '#0F172A' }}>
                                Conciliación & Ciclo RADIAN - Cadena S.A.
                            </h2>
                            <span style={{ 
                                backgroundColor: '#EFF6FF', 
                                color: '#1D4ED8', 
                                border: '1px solid #BFDBFE', 
                                padding: '0.15rem 0.55rem', 
                                borderRadius: '99px', 
                                fontSize: '0.68rem', 
                                fontWeight: '800' 
                            }}>
                                Poka-Yoke Anti-Facturas Huérfanas
                            </span>
                        </div>
                        <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.76rem', color: '#64748B' }}>
                            Detección temprana de remisiones entregadas sin facturar físicamente y auditoría del ciclo de título valor ante la DIAN
                        </p>
                    </div>
                </div>

                {/* SELECTOR DE PESTAÑAS INTERNAS */}
                <div style={{ display: 'inline-flex', gap: '4px', backgroundColor: '#F1F5F9', padding: '3px', borderRadius: '10px' }}>
                    <button
                        onClick={() => setInnerTab('reconciliation')}
                        style={{
                            backgroundColor: innerTab === 'reconciliation' ? 'white' : 'transparent',
                            color: innerTab === 'reconciliation' ? '#0D7A57' : '#64748B',
                            border: 'none',
                            padding: '0.4rem 0.85rem',
                            borderRadius: '8px',
                            fontWeight: '800',
                            fontSize: '0.74rem',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: innerTab === 'reconciliation' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <RefreshCw size={13} /> Conciliador en Vivo
                    </button>

                    <button
                        onClick={() => setInnerTab('guide')}
                        style={{
                            backgroundColor: innerTab === 'guide' ? 'white' : 'transparent',
                            color: innerTab === 'guide' ? '#0D7A57' : '#64748B',
                            border: 'none',
                            padding: '0.4rem 0.85rem',
                            borderRadius: '8px',
                            fontWeight: '800',
                            fontSize: '0.74rem',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: innerTab === 'guide' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <BookOpen size={13} /> 📖 Instructivo Operativo
                    </button>

                    <button
                        onClick={() => setInnerTab('history')}
                        style={{
                            backgroundColor: innerTab === 'history' ? 'white' : 'transparent',
                            color: innerTab === 'history' ? '#0D7A57' : '#64748B',
                            border: 'none',
                            padding: '0.4rem 0.85rem',
                            borderRadius: '8px',
                            fontWeight: '800',
                            fontSize: '0.74rem',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: innerTab === 'history' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <Clock size={13} /> Historial ({auditHistory.length})
                    </button>
                </div>
            </div>

            {/* ── BANNER DE ALERTA DE GUARDADO CON ÉXITO ── */}
            {saveSuccessMessage && (
                <div style={{ 
                    backgroundColor: '#ECFDF5', 
                    border: '1.5px solid #10B981', 
                    borderRadius: '12px', 
                    padding: '0.85rem 1.25rem', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '10px',
                    color: '#065F46',
                    fontSize: '0.82rem',
                    fontWeight: '700'
                }}>
                    <CheckCircle2 size={18} style={{ color: '#059669', flexShrink: 0 }} />
                    <span>{saveSuccessMessage}</span>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* VISTA 1: CONCILIADOR EN VIVO (EL MOTOR OPERATIVO)               */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {innerTab === 'reconciliation' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    
                    {/* ZONA DE CARGA DEL REPORTE */}
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '16px',
                        border: '1px solid #E2E8F0',
                        padding: '1.5rem',
                        boxShadow: '0 1px 4px rgba(0, 0, 0, 0.04)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: '900', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <UploadCloud size={18} style={{ color: '#0D7A57' }} /> Cargar Reporte de Facturación (Cadena S.A. o WorldOffice)
                                </h3>
                                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.74rem', color: '#64748B' }}>
                                    Arrastre o seleccione el archivo descargado (.xlsx, .xls o .csv). FruFresco cruzará automáticamente cada fila contra los pedidos físicos entregados.
                                </p>
                            </div>

                            <button
                                onClick={handleDownloadTemplate}
                                style={{
                                    backgroundColor: '#F8FAFC',
                                    color: '#334155',
                                    border: '1px solid #CBD5E1',
                                    padding: '0.45rem 0.9rem',
                                    borderRadius: '8px',
                                    fontWeight: '800',
                                    fontSize: '0.72rem',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                <Download size={13} /> Descargar Plantilla de Ejemplo (.xlsx)
                            </button>
                        </div>

                        {/* Drag and Drop Zone */}
                        <div 
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                                border: '2px dashed #CBD5E1',
                                borderRadius: '12px',
                                padding: '2rem',
                                textAlign: 'center',
                                cursor: 'pointer',
                                backgroundColor: processingFile ? '#F8FAFC' : '#FAF5FF',
                                transition: 'all 0.2s ease',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '8px'
                            }}
                        >
                            <input 
                                ref={fileInputRef}
                                type="file" 
                                accept=".xlsx,.xls,.csv" 
                                style={{ display: 'none' }}
                                onChange={handleFileUpload}
                            />
                            
                            <div style={{
                                width: '48px',
                                height: '48px',
                                borderRadius: '50%',
                                backgroundColor: '#F3E8FF',
                                color: '#7E22CE',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <FileSpreadsheet size={24} />
                            </div>

                            <div style={{ fontSize: '0.86rem', fontWeight: '800', color: '#1E293B' }}>
                                {processingFile ? 'Procesando y cruzando con la base de datos...' : (fileName ? `Archivo cargado: ${fileName}` : 'Haga clic o arrastre el reporte de Cadena / WorldOffice aquí')}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                Admite reportes oficiales de Cadena S.A. (Facture), WorldOffice Desktop o listados de facturación en Excel
                            </div>
                        </div>
                    </div>

                    {/* TARJETAS RESUMEN DE INDICADORES (KPIS) */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                        
                        {/* 1. Pedidos Entregados Analizados */}
                        <div style={{ backgroundColor: 'white', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '1rem 1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                            <div style={{ fontSize: '0.70rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase' }}>
                                Pedidos Entregados Base
                            </div>
                            <div style={{ fontSize: '1.45rem', fontWeight: '900', color: '#0F172A', marginTop: '4px' }}>
                                {loadingOrders ? '...' : orders.length}
                            </div>
                            <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '2px' }}>
                                Remisiones físicas despachadas
                            </div>
                        </div>

                        {/* 2. Faltantes en Cadena (ROJO - CRÍTICO) */}
                        <div style={{ 
                            backgroundColor: (metrics.missingCount || 0) > 0 ? '#FEF2F2' : 'white', 
                            borderRadius: '14px', 
                            border: `1.5px solid ${(metrics.missingCount || 0) > 0 ? '#F87171' : '#E2E8F0'}`, 
                            padding: '1rem 1.25rem', 
                            boxShadow: '0 1px 3px rgba(0,0,0,0.03)' 
                        }}>
                            <div style={{ fontSize: '0.70rem', fontWeight: '800', color: (metrics.missingCount || 0) > 0 ? '#991B1B' : '#64748B', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <AlertTriangle size={12} /> Faltantes en Cadena (Sin Emitir)
                            </div>
                            <div style={{ fontSize: '1.45rem', fontWeight: '900', color: (metrics.missingCount || 0) > 0 ? '#DC2626' : '#0F172A', marginTop: '4px' }}>
                                {hasRanReconciliation ? metrics.missingCount : `${orders.filter(o => !o.invoice_number).length} estimados`}
                            </div>
                            <div style={{ fontSize: '0.68rem', color: (metrics.missingCount || 0) > 0 ? '#B91C1C' : '#64748B', marginTop: '2px', fontWeight: '700' }}>
                                {hasRanReconciliation 
                                    ? `$${(metrics.missingAmount || 0).toLocaleString()} COP en riesgo de cobro` 
                                    : 'Sin número fiscal registrado en FruFresco'}
                            </div>
                        </div>

                        {/* 3. Conciliadas Exitosamente (VERDE) */}
                        <div style={{ backgroundColor: 'white', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '1rem 1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                            <div style={{ fontSize: '0.70rem', fontWeight: '800', color: '#065F46', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <CheckCircle2 size={12} /> Facturadas y Validadas
                            </div>
                            <div style={{ fontSize: '1.45rem', fontWeight: '900', color: '#0D7A57', marginTop: '4px' }}>
                                {hasRanReconciliation ? metrics.reconciledCount : orders.filter(o => !!o.invoice_number).length}
                            </div>
                            <div style={{ fontSize: '0.68rem', color: '#059669', marginTop: '2px' }}>
                                Con CUFE y emisión confirmada
                            </div>
                        </div>

                        {/* 4. Aceptadas RADIAN (Título Valor) */}
                        <div style={{ backgroundColor: 'white', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '1rem 1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                            <div style={{ fontSize: '0.70rem', fontWeight: '800', color: '#7E22CE', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <ShieldCheck size={12} /> Título Valor RADIAN (033/034)
                            </div>
                            <div style={{ fontSize: '1.45rem', fontWeight: '900', color: '#6B21A8', marginTop: '4px' }}>
                                {metrics.radianAcceptedCount || 0}
                            </div>
                            <div style={{ fontSize: '0.68rem', color: '#7E22CE', marginTop: '2px' }}>
                                Exigibles judicialmente para cobro
                            </div>
                        </div>
                    </div>

                    {/* BARRA DE ACCIÓN Y RESULTADOS DE CONCILIACIÓN */}
                    {hasRanReconciliation && (
                        <div style={{
                            backgroundColor: 'white',
                            borderRadius: '16px',
                            border: '1px solid #E2E8F0',
                            padding: '1.25rem 1.5rem',
                            boxShadow: '0 1px 4px rgba(0, 0, 0, 0.04)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '1rem'
                        }}>
                            {/* Píldoras de filtro */}
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                <button
                                    onClick={() => setFilterCategory('missing')}
                                    style={{
                                        padding: '0.35rem 0.8rem',
                                        borderRadius: '8px',
                                        border: filterCategory === 'missing' ? '1.5px solid #DC2626' : '1px solid #CBD5E1',
                                        backgroundColor: filterCategory === 'missing' ? '#FEF2F2' : 'white',
                                        color: filterCategory === 'missing' ? '#DC2626' : '#64748B',
                                        fontWeight: '800',
                                        fontSize: '0.72rem',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '5px'
                                    }}
                                >
                                    <AlertTriangle size={12} /> Faltantes en Cadena ({reconciledItems.filter(r => r.reconciliationStatus === 'missing_in_cadena').length})
                                </button>

                                <button
                                    onClick={() => setFilterCategory('reconciled')}
                                    style={{
                                        padding: '0.35rem 0.8rem',
                                        borderRadius: '8px',
                                        border: filterCategory === 'reconciled' ? '1.5px solid #0D7A57' : '1px solid #CBD5E1',
                                        backgroundColor: filterCategory === 'reconciled' ? '#ECFDF5' : 'white',
                                        color: filterCategory === 'reconciled' ? '#0D7A57' : '#64748B',
                                        fontWeight: '800',
                                        fontSize: '0.72rem',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '5px'
                                    }}
                                >
                                    <CheckCircle2 size={12} /> Conciliadas ({reconciledItems.filter(r => r.reconciliationStatus === 'reconciled').length})
                                </button>

                                <button
                                    onClick={() => setFilterCategory('rejected')}
                                    style={{
                                        padding: '0.35rem 0.8rem',
                                        borderRadius: '8px',
                                        border: filterCategory === 'rejected' ? '1.5px solid #D97706' : '1px solid #CBD5E1',
                                        backgroundColor: filterCategory === 'rejected' ? '#FFFBEB' : 'white',
                                        color: filterCategory === 'rejected' ? '#D97706' : '#64748B',
                                        fontWeight: '800',
                                        fontSize: '0.72rem',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '5px'
                                    }}
                                >
                                    <XCircle size={12} /> Rechazadas DIAN ({reconciledItems.filter(r => r.reconciliationStatus === 'dian_rejected').length})
                                </button>

                                <button
                                    onClick={() => setFilterCategory('radian')}
                                    style={{
                                        padding: '0.35rem 0.8rem',
                                        borderRadius: '8px',
                                        border: filterCategory === 'radian' ? '1.5px solid #7E22CE' : '1px solid #CBD5E1',
                                        backgroundColor: filterCategory === 'radian' ? '#FAF5FF' : 'white',
                                        color: filterCategory === 'radian' ? '#7E22CE' : '#64748B',
                                        fontWeight: '800',
                                        fontSize: '0.72rem',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '5px'
                                    }}
                                >
                                    <ShieldCheck size={12} /> Eventos RADIAN ({reconciledItems.filter(r => r.event030Acuse || r.event032Recibo || r.event033Aceptacion).length})
                                </button>

                                <button
                                    onClick={() => setFilterCategory('all')}
                                    style={{
                                        padding: '0.35rem 0.8rem',
                                        borderRadius: '8px',
                                        border: filterCategory === 'all' ? '1.5px solid #334155' : '1px solid #CBD5E1',
                                        backgroundColor: filterCategory === 'all' ? '#F1F5F9' : 'white',
                                        color: filterCategory === 'all' ? '#0F172A' : '#64748B',
                                        fontWeight: '800',
                                        fontSize: '0.72rem',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Ver Todos ({reconciledItems.length})
                                </button>
                            </div>

                            {/* Acciones principales: Guardar y Exportar Reporte */}
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                <button
                                    onClick={handleExportMissingReport}
                                    style={{
                                        backgroundColor: '#FEF2F2',
                                        color: '#DC2626',
                                        border: '1px solid #FCA5A5',
                                        padding: '0.45rem 0.95rem',
                                        borderRadius: '8px',
                                        fontWeight: '800',
                                        fontSize: '0.74rem',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    <Download size={13} /> Exportar Faltantes para Contabilidad (.xlsx)
                                </button>

                                <button
                                    onClick={handleApplyReconciliation}
                                    disabled={savingChanges}
                                    style={{
                                        backgroundColor: '#0D7A57',
                                        color: 'white',
                                        border: 'none',
                                        padding: '0.45rem 1.15rem',
                                        borderRadius: '8px',
                                        fontWeight: '800',
                                        fontSize: '0.74rem',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        boxShadow: '0 2px 6px rgba(13, 122, 87, 0.25)'
                                    }}
                                >
                                    <Check size={14} /> {savingChanges ? 'Guardando...' : 'Aplicar Conciliación en Base de Datos'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* TABLA PRINCIPAL DE AUDITORÍA Y RESULTADOS */}
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '16px',
                        border: '1px solid #E2E8F0',
                        overflow: 'hidden',
                        boxShadow: '0 1px 4px rgba(0, 0, 0, 0.04)'
                    }}>
                        {/* Buscador interno */}
                        <div style={{ padding: '0.9rem 1.25rem', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', maxWidth: '420px' }}>
                                <Search size={14} style={{ color: '#64748B' }} />
                                <input
                                    type="text"
                                    placeholder="Buscar por cliente, NIT, ID de pedido (#e1161fc2), consecutivo o CUFE..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    style={{
                                        width: '100%',
                                        border: 'none',
                                        outline: 'none',
                                        backgroundColor: 'transparent',
                                        fontSize: '0.76rem',
                                        fontWeight: '700',
                                        color: '#0F172A'
                                    }}
                                />
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: '700' }}>
                                Mostrando {filteredRows.length} registros
                            </div>
                        </div>

                        {/* Listado / Tabla */}
                        {filteredRows.length === 0 ? (
                            <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>
                                <ShieldCheck size={36} style={{ color: '#CBD5E1', margin: '0 auto 8px auto' }} />
                                <div style={{ fontSize: '0.86rem', fontWeight: '800', color: '#1E293B' }}>
                                    {!hasRanReconciliation ? 'Cargue un reporte de Cadena o WorldOffice para iniciar la conciliación en tiempo real' : 'No hay registros que coincidan con el filtro seleccionado'}
                                </div>
                                <div style={{ fontSize: '0.74rem', marginTop: '4px' }}>
                                    {!hasRanReconciliation && 'Arrastre el archivo arriba o haga clic en la pestaña "📖 Instructivo Operativo" para ver el paso a paso.'}
                                </div>
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.74rem' }}>
                                    <thead>
                                        <tr style={{ backgroundColor: '#F1F5F9', borderBottom: '1px solid #CBD5E1', color: '#475569', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.66rem' }}>
                                            <th style={{ padding: '0.65rem 0.9rem' }}>Remisión / Pedido</th>
                                            <th style={{ padding: '0.65rem 0.9rem' }}>Cliente & NIT</th>
                                            <th style={{ padding: '0.65rem 0.9rem' }}>Fecha Entrega</th>
                                            <th style={{ padding: '0.65rem 0.9rem', textAlign: 'right' }}>Monto ($ COP)</th>
                                            <th style={{ padding: '0.65rem 0.9rem' }}>Estado en Cadena</th>
                                            <th style={{ padding: '0.65rem 0.9rem' }}>Ciclo RADIAN (Eventos)</th>
                                            <th style={{ padding: '0.65rem 0.9rem' }}>Detalle / CUFE</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredRows.map((row) => {
                                            const isMissing = row.reconciliationStatus === 'missing_in_cadena';
                                            const isRejected = row.reconciliationStatus === 'dian_rejected';

                                            return (
                                                <tr 
                                                    key={row.orderId} 
                                                    style={{ 
                                                        borderBottom: '1px solid #E2E8F0',
                                                        backgroundColor: isMissing ? '#FEF2F2' : (isRejected ? '#FFFBEB' : 'white')
                                                    }}
                                                >
                                                    {/* Remisión / Pedido */}
                                                    <td style={{ padding: '0.65rem 0.9rem', verticalAlign: 'top' }}>
                                                        <div style={{ fontWeight: '800', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            #{row.orderId.slice(0, 8)}
                                                        </div>
                                                        {row.existingInvoiceNumber && (
                                                            <div style={{ fontSize: '0.65rem', color: '#059669', fontWeight: '700' }}>
                                                                FruFresco: {row.existingInvoiceNumber}
                                                            </div>
                                                        )}
                                                    </td>

                                                    {/* Cliente & NIT */}
                                                    <td style={{ padding: '0.65rem 0.9rem', verticalAlign: 'top' }}>
                                                        <div style={{ fontWeight: '800', color: '#1E293B' }}>{row.clientName}</div>
                                                        <div style={{ fontSize: '0.65rem', color: '#64748B' }}>NIT: {row.clientNit}</div>
                                                    </td>

                                                    {/* Fecha Entrega */}
                                                    <td style={{ padding: '0.65rem 0.9rem', verticalAlign: 'top' }}>
                                                        <div style={{ fontWeight: '700', color: '#334155' }}>{row.orderDate}</div>
                                                        {isMissing && (
                                                            <div style={{ fontSize: '0.65rem', color: '#DC2626', fontWeight: '800' }}>
                                                                {row.daysDelayed} días sin emitir
                                                            </div>
                                                        )}
                                                    </td>

                                                    {/* Monto */}
                                                    <td style={{ padding: '0.65rem 0.9rem', verticalAlign: 'top', textAlign: 'right' }}>
                                                        <div style={{ fontWeight: '900', color: '#0F172A' }}>
                                                            ${row.orderAmount.toLocaleString()}
                                                        </div>
                                                    </td>

                                                    {/* Estado en Cadena */}
                                                    <td style={{ padding: '0.65rem 0.9rem', verticalAlign: 'top' }}>
                                                        {isMissing ? (
                                                            <span style={{ 
                                                                backgroundColor: '#FEE2E2', 
                                                                color: '#991B1B', 
                                                                border: '1px solid #FCA5A5', 
                                                                padding: '0.15rem 0.5rem', 
                                                                borderRadius: '6px', 
                                                                fontSize: '0.66rem', 
                                                                fontWeight: '800',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '4px'
                                                            }}>
                                                                <XCircle size={10} /> NO EMITIDA (FALTANTE)
                                                            </span>
                                                        ) : isRejected ? (
                                                            <span style={{ 
                                                                backgroundColor: '#FEF3C7', 
                                                                color: '#92400E', 
                                                                border: '1px solid #FCD34D', 
                                                                padding: '0.15rem 0.5rem', 
                                                                borderRadius: '6px', 
                                                                fontSize: '0.66rem', 
                                                                fontWeight: '800',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '4px'
                                                            }}>
                                                                <AlertTriangle size={10} /> RECHAZADA DIAN
                                                            </span>
                                                        ) : (
                                                            <div>
                                                                <span style={{ 
                                                                    backgroundColor: '#D1FAE5', 
                                                                    color: '#065F46', 
                                                                    border: '1px solid #6EE7B7', 
                                                                    padding: '0.15rem 0.5rem', 
                                                                    borderRadius: '6px', 
                                                                    fontSize: '0.66rem', 
                                                                    fontWeight: '800',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px'
                                                                }}>
                                                                    <CheckCircle2 size={10} /> VALIDADA DIAN
                                                                </span>
                                                                <div style={{ fontSize: '0.66rem', fontWeight: '800', color: '#0F172A', marginTop: '2px' }}>
                                                                    Factura: {row.cadenaInvoiceNumber}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </td>

                                                    {/* Ciclo RADIAN */}
                                                    <td style={{ padding: '0.65rem 0.9rem', verticalAlign: 'top' }}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.64rem', color: row.event030Acuse ? '#059669' : '#94A3B8', fontWeight: '700' }}>
                                                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: row.event030Acuse ? '#10B981' : '#CBD5E1' }} />
                                                                Ev. 030: {row.event030Acuse ? 'Acuse Recibo Factura' : 'Sin Acuse'}
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.64rem', color: row.event032Recibo ? '#059669' : '#94A3B8', fontWeight: '700' }}>
                                                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: row.event032Recibo ? '#10B981' : '#CBD5E1' }} />
                                                                Ev. 032: {row.event032Recibo ? 'Recibo Mercancía' : 'Sin Recibo'}
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.64rem', color: row.event033Aceptacion ? '#7E22CE' : '#94A3B8', fontWeight: '800' }}>
                                                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: row.event033Aceptacion ? '#9333EA' : '#CBD5E1' }} />
                                                                Ev. 033: {row.event033Aceptacion ? 'Aceptada Título Valor' : 'No Exigible'}
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* Detalle / CUFE */}
                                                    <td style={{ padding: '0.65rem 0.9rem', verticalAlign: 'top', maxWidth: '240px' }}>
                                                        {row.cufe ? (
                                                            <div style={{ fontSize: '0.62rem', color: '#475569', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                                                                CUFE: {row.cufe.slice(0, 24)}...
                                                            </div>
                                                        ) : (
                                                            <div style={{ fontSize: '0.65rem', color: isMissing ? '#DC2626' : '#64748B', fontStyle: 'italic' }}>
                                                                {row.matchReason}
                                                            </div>
                                                        )}
                                                        {row.cadenaIssueDate && (
                                                            <div style={{ fontSize: '0.62rem', color: '#64748B', marginTop: '2px' }}>
                                                                Emitida: {row.cadenaIssueDate}
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* VISTA 2: INSTRUCTIVO OPERATIVO & FUNDAMENTO LEGAL               */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {innerTab === 'guide' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    
                    {/* TARJETA 1: ¿Por qué ocurre este problema? (Causa Raíz) */}
                    <div style={{ backgroundColor: 'white', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                        <div 
                            onClick={() => setOpenGuideSection(openGuideSection === 'causa_raiz' ? '' : 'causa_raiz')}
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#FEF2F2', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <AlertTriangle size={18} />
                                </div>
                                <div>
                                    <h4 style={{ margin: 0, fontSize: '0.96rem', fontWeight: '900', color: '#0F172A' }}>
                                        1. ¿Por qué ocurre este problema? (El vacío de la "Caja Negra")
                                    </h4>
                                    <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.72rem', color: '#64748B' }}>
                                        La diferencia entre "Exportar a Excel" y que la factura efectivamente exista ante la DIAN y el cliente
                                    </p>
                                </div>
                            </div>
                            {openGuideSection === 'causa_raiz' ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </div>

                        {openGuideSection === 'causa_raiz' && (
                            <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid #F1F5F9', fontSize: '0.78rem', color: '#334155', lineHeight: '1.6' }}>
                                <p>
                                    En la operación diaria de FruFresco, cuando el líder o auxiliar hace clic en <b>"Exportar a WorldOffice"</b>, el sistema genera un archivo Excel. Históricamente, muchos operadores creían que al hacer esto <i>"el pedido ya quedó facturado"</i>.
                                </p>
                                <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '1rem', margin: '0.75rem 0' }}>
                                    <b style={{ color: '#0F172A' }}>La realidad de los 4 pasos externos:</b>
                                    <ol style={{ margin: '0.5rem 0 0 0', paddingLeft: '1.25rem' }}>
                                        <li><b>WorldOffice Desktop:</b> El operador debe importar el archivo manualmente. Si hay un error de tercero, NIT o código de producto, la fila se salta y la factura no se crea.</li>
                                        <li><b>Cadena S.A. (Proveedor Tecnológico):</b> WorldOffice transmite la factura a Cadena para firma digital y validación DIAN. Si falla la conexión, la factura queda en el limbo.</li>
                                        <li><b>Validación DIAN:</b> La DIAN puede rechazar la factura si el correo electrónico del receptor está desactualizado, el RUT está bloqueado o hay incoherencias en retenciones.</li>
                                        <li><b>Buzón del Cliente & RADIAN:</b> Aunque Cadena la emita, si el cliente no recibe el correo o no se radica en su portal de proveedores, la factura nunca entrará a programación de pago.</li>
                                    </ol>
                                </div>
                                <p style={{ margin: 0, fontWeight: '700', color: '#DC2626' }}>
                                    👉 Consecuencia: Pasan semanas, Cartera llama a cobrar, y el cliente contesta que nunca recibió la factura. Este submódulo existe para erradicar ese desfase y destapar qué facturas faltan en menos de 2 segundos.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* TARJETA 2: ¿Qué es RADIAN y por qué es obligatorio? */}
                    <div style={{ backgroundColor: 'white', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                        <div 
                            onClick={() => setOpenGuideSection(openGuideSection === 'radian' ? '' : 'radian')}
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#FAF5FF', color: '#7E22CE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <ShieldCheck size={18} />
                                </div>
                                <div>
                                    <h4 style={{ margin: 0, fontSize: '0.96rem', fontWeight: '900', color: '#0F172A' }}>
                                        2. ¿Qué es RADIAN y qué significan los 3 Eventos DIAN?
                                    </h4>
                                    <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.72rem', color: '#64748B' }}>
                                        Cómo una factura electrónica se convierte legalmente en Título Valor exigible ejecutivamente
                                    </p>
                                </div>
                            </div>
                            {openGuideSection === 'radian' ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </div>

                        {openGuideSection === 'radian' && (
                            <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid #F1F5F9', fontSize: '0.78rem', color: '#334155', lineHeight: '1.6' }}>
                                <p>
                                    En Colombia, la Resolución DIAN 000085 de 2022 y el sistema <b>RADIAN</b> establecen que una factura electrónica de venta a crédito o con plazo de pago <b>no se puede cobrar judicialmente ni negociar en factoring</b> hasta que no cumpla con los 3 eventos formales:
                                </p>
                                
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', margin: '1rem 0' }}>
                                    <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '10px', padding: '0.9rem' }}>
                                        <b style={{ color: '#0284C7', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ backgroundColor: '#E0F2FE', padding: '2px 6px', borderRadius: '4px' }}>030</span> Acuse de Recibo
                                        </b>
                                        <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.72rem', color: '#475569' }}>
                                            El cliente certifica que recibió el archivo XML y PDF en su buzón de facturación electrónica registrado en el RUT.
                                        </p>
                                    </div>

                                    <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '10px', padding: '0.9rem' }}>
                                        <b style={{ color: '#0D7A57', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ backgroundColor: '#ECFDF5', padding: '2px 6px', borderRadius: '4px' }}>032</span> Recibo de Bienes
                                        </b>
                                        <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.72rem', color: '#475569' }}>
                                            El cliente declara que la fruta, verdura o abarrotes físicos llegaron a su cocina/bodega y fueron descargados.
                                        </p>
                                    </div>

                                    <div style={{ backgroundColor: '#FAF5FF', border: '1.5px solid #C084FC', borderRadius: '10px', padding: '0.9rem' }}>
                                        <b style={{ color: '#7E22CE', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ backgroundColor: '#F3E8FF', padding: '2px 6px', borderRadius: '4px' }}>033 / 034</span> Aceptación
                                        </b>
                                        <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.72rem', color: '#475569' }}>
                                            <b>Aceptación Expresa (033)</b> o <b>Tácita (034 a las 72 horas)</b>. Aquí nace el <b>Título Valor</b>. Si no existe este evento, el cliente legalmente puede alegar no haber recibido la factura.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* TARJETA 3: Paso a Paso Operativo para el Auxiliar */}
                    <div style={{ backgroundColor: 'white', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                        <div 
                            onClick={() => setOpenGuideSection(openGuideSection === 'paso_a_paso' ? '' : 'paso_a_paso')}
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#ECFDF5', color: '#0D7A57', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <BookOpen size={18} />
                                </div>
                                <div>
                                    <h4 style={{ margin: 0, fontSize: '0.96rem', fontWeight: '900', color: '#0F172A' }}>
                                        3. Paso a Paso Operativo (Manual Diario para Facturación)
                                    </h4>
                                    <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.72rem', color: '#64748B' }}>
                                        Protocolo estándar para ejecutar cada mañana o al final del día
                                    </p>
                                </div>
                            </div>
                            {openGuideSection === 'paso_a_paso' ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </div>

                        {openGuideSection === 'paso_a_paso' && (
                            <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid #F1F5F9', fontSize: '0.78rem', color: '#334155', lineHeight: '1.6' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                                        <div style={{ width: '26px', height: '26px', borderRadius: '50%', backgroundColor: '#0D7A57', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', flexShrink: 0, fontSize: '0.75rem' }}>1</div>
                                        <div>
                                            <b style={{ color: '#0F172A' }}>Descargar el reporte desde el portal de Cadena S.A. o WorldOffice:</b>
                                            <p style={{ margin: '0.2rem 0 0 0', color: '#64748B', fontSize: '0.74rem' }}>
                                                Ingrese al portal de emisión de Cadena (Facture) o a WorldOffice en la sección de Informes de Facturación. Filtre por las fechas recientes y haga clic en <i>"Exportar a Excel"</i>.
                                            </p>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                                        <div style={{ width: '26px', height: '26px', borderRadius: '50%', backgroundColor: '#0D7A57', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', flexShrink: 0, fontSize: '0.75rem' }}>2</div>
                                        <div>
                                            <b style={{ color: '#0F172A' }}>Subir el archivo al Conciliador en Vivo de FruFresco:</b>
                                            <p style={{ margin: '0.2rem 0 0 0', color: '#64748B', fontSize: '0.74rem' }}>
                                                Vaya a la pestaña <b>"Conciliador en Vivo"</b> y suelte el archivo en la zona punteada. FruFresco cruzará automáticamente por ID de Pedido, Consecutivo Fiscal, o NIT + Monto + Fecha.
                                            </p>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                                        <div style={{ width: '26px', height: '26px', borderRadius: '50%', backgroundColor: '#DC2626', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', flexShrink: 0, fontSize: '0.75rem' }}>3</div>
                                        <div>
                                            <b style={{ color: '#DC2626' }}>Revisar la pestaña roja "Faltantes en Cadena":</b>
                                            <p style={{ margin: '0.2rem 0 0 0', color: '#64748B', fontSize: '0.74rem' }}>
                                                Cualquier fila que aparezca aquí representa un pedido físicamente entregado que <b>NUNCA se facturó en Cadena</b>. Haga clic en <b>"Exportar Faltantes para Contabilidad (.xlsx)"</b> y expida esas facturas de inmediato.
                                            </p>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                                        <div style={{ width: '26px', height: '26px', borderRadius: '50%', backgroundColor: '#0D7A57', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', flexShrink: 0, fontSize: '0.75rem' }}>4</div>
                                        <div>
                                            <b style={{ color: '#0F172A' }}>Guardar la conciliación en base de datos:</b>
                                            <p style={{ margin: '0.2rem 0 0 0', color: '#64748B', fontSize: '0.74rem' }}>
                                                Haga clic en <b>"Aplicar Conciliación en Base de Datos"</b> para que los números de factura reales, CUFEs y fechas queden sincronizados permanentemente en FruFresco.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* VISTA 3: HISTORIAL DE CONCILIACIONES PREVIAS                    */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {innerTab === 'history' && (
                <div style={{ backgroundColor: 'white', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                    <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.96rem', fontWeight: '900', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Clock size={16} style={{ color: '#0D7A57' }} /> Bitácora de Auditorías y Conciliaciones Anteriores
                    </h3>

                    {auditHistory.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: '#64748B', fontSize: '0.78rem' }}>
                            Aún no se han ejecutado conciliaciones guardadas en la base de datos. Cuando aplique la primera conciliación, la bitácora aparecerá aquí.
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.74rem' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #CBD5E1', color: '#475569', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.66rem' }}>
                                        <th style={{ padding: '0.65rem 0.9rem' }}>Fecha & Hora</th>
                                        <th style={{ padding: '0.65rem 0.9rem' }}>Archivo de Origen</th>
                                        <th style={{ padding: '0.65rem 0.9rem', textAlign: 'right' }}>Total Analizadas</th>
                                        <th style={{ padding: '0.65rem 0.9rem', textAlign: 'right' }}>Conciliadas</th>
                                        <th style={{ padding: '0.65rem 0.9rem', textAlign: 'right' }}>Faltantes</th>
                                        <th style={{ padding: '0.65rem 0.9rem', textAlign: 'right' }}>Aceptadas RADIAN</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {auditHistory.map((item, idx) => (
                                        <tr key={item.id || idx} style={{ borderBottom: '1px solid #E2E8F0' }}>
                                            <td style={{ padding: '0.65rem 0.9rem', fontWeight: '800', color: '#0F172A' }}>
                                                {new Date(item.date).toLocaleString()}
                                            </td>
                                            <td style={{ padding: '0.65rem 0.9rem', color: '#475569' }}>
                                                {item.fileName}
                                            </td>
                                            <td style={{ padding: '0.65rem 0.9rem', textAlign: 'right', fontWeight: '700' }}>
                                                {item.totalAnalyzed}
                                            </td>
                                            <td style={{ padding: '0.65rem 0.9rem', textAlign: 'right', color: '#0D7A57', fontWeight: '800' }}>
                                                {item.reconciledCount}
                                            </td>
                                            <td style={{ padding: '0.65rem 0.9rem', textAlign: 'right', color: item.missingCount > 0 ? '#DC2626' : '#64748B', fontWeight: '800' }}>
                                                {item.missingCount}
                                            </td>
                                            <td style={{ padding: '0.65rem 0.9rem', textAlign: 'right', color: '#7E22CE', fontWeight: '800' }}>
                                                {item.radianAcceptedCount || 0}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
