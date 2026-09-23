'use client';

import React, { useState, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { 
    X, 
    Upload, 
    FileSpreadsheet, 
    CheckCircle2, 
    AlertTriangle, 
    Trash2, 
    Download, 
    Calendar,
    ArrowRight,
    Sparkles,
    RefreshCw,
    Layers,
    Info
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { INVENTORY_MOVEMENT_SUBTYPES } from '@/lib/constants';
import { formatNumber } from '@/lib/adminTheme';

interface ProductItem {
    id: string;
    name: string;
    sku?: string;
    accounting_id?: number | null;
    unit_of_measure: string;
    category?: string;
    inventory_group?: string | null;
    base_price?: number;
    parent_id?: string | null;
    is_active?: boolean;
}

interface DailyBalanceExcelImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    currentDate: string;
    products: ProductItem[];
}

interface ParsedOperationRow {
    rawId: number | string;
    accountingId: number | null;
    productName: string;
    productId: string | null;
    matchedProduct: ProductItem | null;
    isSummaryRow?: boolean;
    initialStock: number;
    corrections: number;
    purchases: number;
    salesKg: number;
    salesUnits: number;
    weightSalesUnits: number;
    shortage: number;
    unshipped: number;
    additionalSales: number;
    employeeSales: number;
    returns: number;
    weighingWaste: number;
    damageWaste: number;
    cleaningWaste: number;
    physicalCount: number | null;
    foodBank: number;
}

export default function DailyBalanceExcelImportModal({
    isOpen,
    onClose,
    onSuccess,
    currentDate,
    products
}: DailyBalanceExcelImportModalProps) {
    const todayStr = new Date().toISOString().split('T')[0];
    const [targetDate, setTargetDate] = useState<string>(currentDate || todayStr);
    const [fileName, setFileName] = useState<string | null>(null);
    const [parsedRows, setParsedRows] = useState<ParsedOperationRow[]>([]);
    const [excludeSummaryRows, setExcludeSummaryRows] = useState(true);
    const [isLoadingFile, setIsLoadingFile] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCleaning, setIsCleaning] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Map de productos por accounting_id para búsqueda O(1)
    const productByAccountingId = useMemo(() => {
        const map = new Map<number, ProductItem>();
        products.forEach(p => {
            if (p.accounting_id !== null && p.accounting_id !== undefined) {
                map.set(Number(p.accounting_id), p);
            }
        });
        return map;
    }, [products]);

    // Map de productos por nombre normalizado como fallback
    const productByName = useMemo(() => {
        const map = new Map<string, ProductItem>();
        products.forEach(p => {
            if (p.name) {
                map.set(p.name.trim().toLowerCase(), p);
            }
        });
        return map;
    }, [products]);

    // Resumen de validación previa
    const stats = useMemo(() => {
        if (parsedRows.length === 0) return null;
        const summaryRowsCount = parsedRows.filter(r => r.isSummaryRow).length;
        const activeRows = excludeSummaryRows ? parsedRows.filter(r => !r.isSummaryRow) : parsedRows;

        let matched = 0;
        let unmatched = 0;
        let totalPurchases = 0;
        let totalSalesKg = 0;
        let totalWasteKg = 0;
        let totalPhysicalCounts = 0;

        activeRows.forEach(r => {
            if (r.matchedProduct) matched++;
            else unmatched++;
            totalPurchases += r.purchases;
            totalSalesKg += r.salesKg;
            totalWasteKg += (r.damageWaste + r.cleaningWaste + r.weighingWaste);
            if (r.physicalCount !== null) totalPhysicalCounts++;
        });

        return {
            totalRows: activeRows.length,
            rawTotalRows: parsedRows.length,
            summaryRowsCount,
            matched,
            unmatched,
            totalPurchases,
            totalSalesKg,
            totalWasteKg,
            totalPhysicalCounts
        };
    }, [parsedRows, excludeSummaryRows]);

    if (!isOpen) return null;

    // 1. Manejo del archivo Excel / CSV
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setFileName(file.name);
        setIsLoadingFile(true);
        setErrorMessage(null);
        setSuccessMessage(null);

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });

                // Buscar la hoja oficial o la primera
                const sheetName = wb.SheetNames.find(n => n.toUpperCase().includes('INVENTARIO')) || wb.SheetNames[0];
                const ws = wb.Sheets[sheetName];
                if (!ws) throw new Error('No se encontró ninguna hoja válida en el archivo.');

                // Convertir hoja a matriz cruda de filas
                const rawSheet: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
                if (!rawSheet || rawSheet.length === 0) {
                    throw new Error('El archivo está vacío.');
                }

                // Buscar la fila de encabezados oficial (donde aparece "idProducto" o "Producto")
                let headerRowIndex = -1;
                for (let i = 0; i < Math.min(rawSheet.length, 25); i++) {
                    const row = rawSheet[i];
                    if (row && row.some(cell => {
                        const str = String(cell || '').toLowerCase().trim();
                        return str.includes('idproducto') || (str.includes('producto') && str.includes('inventario'));
                    })) {
                        headerRowIndex = i;
                        break;
                    }
                }

                // Si no se detectó por texto, asumir fila 10 (índice 9) como en el Excel de desarrollo o fila 0
                if (headerRowIndex === -1) {
                    headerRowIndex = rawSheet.length > 9 ? 9 : 0;
                }

                const headers = rawSheet[headerRowIndex].map(h => String(h || '').trim());

                // Mapear índices de columnas (por posición fija A-X o por nombre)
                const getColIdx = (letter: string, headerQuery: string) => {
                    const query = headerQuery.toLowerCase();
                    // 1. Búsqueda exacta
                    let found = headers.findIndex(h => h.toLowerCase() === query);
                    if (found !== -1) return found;
                    // 2. Búsqueda parcial excluyendo id para nombre de producto
                    found = headers.findIndex(h => {
                        const clean = h.toLowerCase();
                        if (query === 'producto') {
                            return clean.includes('producto') && !clean.includes('id');
                        }
                        return clean.includes(query);
                    });
                    if (found !== -1) return found;
                    const letterIdx = letter.charCodeAt(0) - 65;
                    return letterIdx < headers.length ? letterIdx : -1;
                };

                const idxB_id = getColIdx('B', 'idproducto');
                const idxD_name = getColIdx('D', 'producto');
                const idxE_init = getColIdx('E', 'inicial');
                const idxF_corr = getColIdx('F', 'corrección');
                const idxG_purch = getColIdx('G', 'compra');
                const idxH_salesKg = getColIdx('H', 'venta del día (kg)');
                const idxI_salesUn = getColIdx('I', 'venta del día (un)');
                const idxJ_weightUn = getColIdx('J', 'peso venta');
                const idxK_shortage = getColIdx('K', 'escaso');
                const idxL_unship = getColIdx('L', 'sin enviar');
                const idxM_extra = getColIdx('M', 'adicional cliente');
                const idxN_employee = getColIdx('N', 'empleado');
                const idxO_returns = getColIdx('O', 'devoluci');
                const idxP_weigh = getColIdx('P', 'pesada');
                const idxQ_damage = getColIdx('Q', 'desperdicio');
                const idxR_cleaning = getColIdx('R', 'basura');
                const idxT_physical = getColIdx('T', 'agregado bodega');
                const idxX_foodBank = getColIdx('X', 'banco de alimentos');

                const parsedList: ParsedOperationRow[] = [];
                let emptyStreak = 0;
                const seenAccountingIds = new Set<number>();

                for (let r = headerRowIndex + 1; r < rawSheet.length; r++) {
                    const row = rawSheet[r];
                    if (!row || row.length === 0) {
                        emptyStreak++;
                        if (emptyStreak > 40) break;
                        continue;
                    }

                    const hasData = row.some(cell => cell !== undefined && cell !== null && String(cell).trim() !== '');
                    if (!hasData) {
                        emptyStreak++;
                        if (emptyStreak > 40) break;
                        continue;
                    }
                    emptyStreak = 0;

                    const rawIdVal = idxB_id !== -1 ? row[idxB_id] : '';
                    const parsedAccId = rawIdVal && !isNaN(Number(rawIdVal)) ? Number(rawIdVal) : null;
                    const rawNameVal = idxD_name !== -1 ? String(row[idxD_name] || '').trim() : '';

                    if (!parsedAccId && !rawNameVal) continue;
                    if (rawNameVal.toLowerCase().startsWith('inventario de') && !parsedAccId) continue;

                    // Detección de fila de resumen / totalizador: si el ID contable ya apareció en una presentación previa
                    const isDuplicateSummaryRow = parsedAccId !== null && seenAccountingIds.has(parsedAccId);
                    if (parsedAccId !== null) {
                        seenAccountingIds.add(parsedAccId);
                    }

                    let matched: ProductItem | null = null;
                    if (parsedAccId !== null && productByAccountingId.has(parsedAccId)) {
                        matched = productByAccountingId.get(parsedAccId)!;
                    } else if (rawNameVal && productByName.has(rawNameVal.toLowerCase())) {
                        matched = productByName.get(rawNameVal.toLowerCase())!;
                    }

                    const parseNum = (val: any): number => {
                        if (val === undefined || val === null || val === '') return 0;
                        if (typeof val === 'number') return isNaN(val) ? 0 : val;
                        const str = String(val).trim();
                        if (!str) return 0;
                        if (str.includes(',')) {
                            const n = parseFloat(str.replace(/\./g, '').replace(',', '.'));
                            return isNaN(n) ? 0 : n;
                        }
                        if (str.includes('.')) {
                            const parts = str.split('.');
                            if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && !isNaN(Number(parts[0])) && !isNaN(Number(parts[1])))) {
                                const n = parseFloat(str.replace(/\./g, ''));
                                return isNaN(n) ? 0 : n;
                            }
                        }
                        const n = parseFloat(str);
                        return isNaN(n) ? 0 : n;
                    };

                    const rawPhysical = idxT_physical !== -1 ? row[idxT_physical] : '';
                    const physicalCount = (rawPhysical !== undefined && rawPhysical !== null && String(rawPhysical).trim() !== '') 
                        ? parseNum(rawPhysical) 
                        : null;

                    parsedList.push({
                        rawId: rawIdVal,
                        accountingId: parsedAccId,
                        isSummaryRow: isDuplicateSummaryRow,
                        productName: matched?.name || rawNameVal,
                        productId: matched?.id || null,
                        matchedProduct: matched,
                        initialStock: parseNum(idxE_init !== -1 ? row[idxE_init] : 0),
                        corrections: parseNum(idxF_corr !== -1 ? row[idxF_corr] : 0),
                        purchases: parseNum(idxG_purch !== -1 ? row[idxG_purch] : 0),
                        salesKg: parseNum(idxH_salesKg !== -1 ? row[idxH_salesKg] : 0),
                        salesUnits: parseNum(idxI_salesUn !== -1 ? row[idxI_salesUn] : 0),
                        weightSalesUnits: parseNum(idxJ_weightUn !== -1 ? row[idxJ_weightUn] : 0),
                        shortage: parseNum(idxK_shortage !== -1 ? row[idxK_shortage] : 0),
                        unshipped: parseNum(idxL_unship !== -1 ? row[idxL_unship] : 0),
                        additionalSales: parseNum(idxM_extra !== -1 ? row[idxM_extra] : 0),
                        employeeSales: parseNum(idxN_employee !== -1 ? row[idxN_employee] : 0),
                        returns: parseNum(idxO_returns !== -1 ? row[idxO_returns] : 0),
                        weighingWaste: parseNum(idxP_weigh !== -1 ? row[idxP_weigh] : 0),
                        damageWaste: parseNum(idxQ_damage !== -1 ? row[idxQ_damage] : 0),
                        cleaningWaste: parseNum(idxR_cleaning !== -1 ? row[idxR_cleaning] : 0),
                        physicalCount,
                        foodBank: parseNum(idxX_foodBank !== -1 ? row[idxX_foodBank] : 0),
                    });
                }

                if (parsedList.length === 0) {
                    throw new Error('No se encontraron filas con productos válidos en el archivo.');
                }

                setParsedRows(parsedList);
            } catch (err: any) {
                console.error('Error parseando archivo Excel:', err);
                setErrorMessage(err.message || 'Error al procesar el archivo Excel');
            } finally {
                setIsLoadingFile(false);
            }
        };
        reader.readAsBinaryString(file);
    };

    // 2. Inyección transaccional en Supabase
    const handleExecuteSimulation = async () => {
        if (parsedRows.length === 0) return;
        setIsSubmitting(true);
        setErrorMessage(null);
        setSuccessMessage(null);

        try {
            const { data: whData } = await supabase.from('warehouses').select('id').limit(1).single();
            const warehouseId = whData?.id;

            const movementsToInsert: any[] = [];
            const timestampIso = `${targetDate}T12:00:00.000Z`;

            const rowsToInsert = excludeSummaryRows ? parsedRows.filter(r => !r.isSummaryRow) : parsedRows;

            rowsToInsert.forEach(row => {
                if (!row.productId) return;

                // F: Corrección de inventario (+/-)
                if (Math.abs(row.corrections) > 0.0001) {
                    movementsToInsert.push({
                        product_id: row.productId,
                        warehouse_id: warehouseId,
                        quantity: row.corrections,
                        type: 'adjustment',
                        reference_type: INVENTORY_MOVEMENT_SUBTYPES.CORRECTION,
                        notes: `[SIMULACIÓN] Corrección Excel: ${row.corrections > 0 ? '+' : ''}${formatNumber(row.corrections, 2)}`,
                        created_at: timestampIso
                    });
                }

                // G: Compra del día (+)
                if (row.purchases > 0.0001) {
                    movementsToInsert.push({
                        product_id: row.productId,
                        warehouse_id: warehouseId,
                        quantity: row.purchases,
                        type: 'entry',
                        reference_type: 'purchase_reception',
                        notes: `[SIMULACIÓN] Compra del día cargada por Excel (${formatNumber(row.purchases, 2)} kg)`,
                        created_at: timestampIso
                    });
                }

                // H: Venta del día KG (-)
                if (row.salesKg > 0.0001) {
                    movementsToInsert.push({
                        product_id: row.productId,
                        warehouse_id: warehouseId,
                        quantity: -row.salesKg,
                        type: 'exit',
                        reference_type: 'order_item',
                        notes: `[SIMULACIÓN] Venta del día KG cargada por Excel (-${formatNumber(row.salesKg, 2)} kg)`,
                        created_at: timestampIso
                    });
                }

                // J: Peso Venta UN (-)
                if (row.weightSalesUnits > 0.0001 && row.salesKg <= 0.0001) {
                    movementsToInsert.push({
                        product_id: row.productId,
                        warehouse_id: warehouseId,
                        quantity: -row.weightSalesUnits,
                        type: 'exit',
                        reference_type: 'order_item',
                        notes: `[SIMULACIÓN] Venta UN (peso: ${formatNumber(row.weightSalesUnits, 2)}) cargada por Excel`,
                        created_at: timestampIso
                    });
                }

                // K: Escaso (-)
                if (row.shortage > 0.0001) {
                    movementsToInsert.push({
                        product_id: row.productId,
                        warehouse_id: warehouseId,
                        quantity: -row.shortage,
                        type: 'exit',
                        reference_type: INVENTORY_MOVEMENT_SUBTYPES.ORDER_SHORTAGE,
                        notes: `[SIMULACIÓN] Producto escaso reportado (-${formatNumber(row.shortage, 2)} kg)`,
                        created_at: timestampIso
                    });
                }

                // L: Sin Enviar (+)
                if (row.unshipped > 0.0001) {
                    movementsToInsert.push({
                        product_id: row.productId,
                        warehouse_id: warehouseId,
                        quantity: row.unshipped,
                        type: 'entry',
                        reference_type: INVENTORY_MOVEMENT_SUBTYPES.ORDER_UNSHIPPED,
                        notes: `[SIMULACIÓN] Producto retenido / sin enviar (+${formatNumber(row.unshipped, 2)} kg)`,
                        created_at: timestampIso
                    });
                }

                // M: Venta Extra Cliente (-)
                if (row.additionalSales > 0.0001) {
                    movementsToInsert.push({
                        product_id: row.productId,
                        warehouse_id: warehouseId,
                        quantity: -row.additionalSales,
                        type: 'exit',
                        reference_type: INVENTORY_MOVEMENT_SUBTYPES.ADDITIONAL_SALE,
                        notes: `[SIMULACIÓN] Venta adicional cliente mostrador (-${formatNumber(row.additionalSales, 2)} kg)`,
                        created_at: timestampIso
                    });
                }

                // N: Venta Nómina Empleado (-)
                if (row.employeeSales > 0.0001) {
                    movementsToInsert.push({
                        product_id: row.productId,
                        warehouse_id: warehouseId,
                        quantity: -row.employeeSales,
                        type: 'exit',
                        reference_type: INVENTORY_MOVEMENT_SUBTYPES.EMPLOYEE_SALE,
                        notes: `[SIMULACIÓN] Venta nómina colaborador (-${formatNumber(row.employeeSales, 2)} kg)`,
                        created_at: timestampIso
                    });
                }

                // O: Devoluciones (+)
                if (row.returns > 0.0001) {
                    movementsToInsert.push({
                        product_id: row.productId,
                        warehouse_id: warehouseId,
                        quantity: row.returns,
                        type: 'entry',
                        reference_type: 'route_return',
                        notes: `[SIMULACIÓN] Devolución de ruta (+${formatNumber(row.returns, 2)} kg)`,
                        created_at: timestampIso
                    });
                }

                // P: Merma Pesada (-)
                if (row.weighingWaste > 0.0001) {
                    movementsToInsert.push({
                        product_id: row.productId,
                        warehouse_id: warehouseId,
                        quantity: -row.weighingWaste,
                        type: 'exit',
                        reference_type: INVENTORY_MOVEMENT_SUBTYPES.WASTE_WEIGHING,
                        notes: `[SIMULACIÓN] Merma de pesada / báscula (-${formatNumber(row.weighingWaste, 2)} kg)`,
                        created_at: timestampIso
                    });
                }

                // Q: Merma Desperdicio (-)
                if (row.damageWaste > 0.0001) {
                    movementsToInsert.push({
                        product_id: row.productId,
                        warehouse_id: warehouseId,
                        quantity: -row.damageWaste,
                        type: 'exit',
                        reference_type: INVENTORY_MOVEMENT_SUBTYPES.WASTE_DAMAGE,
                        notes: `[SIMULACIÓN] Desperdicio / producto averiado (-${formatNumber(row.damageWaste, 2)} kg)`,
                        created_at: timestampIso
                    });
                }

                // R: Merma Basura (-)
                if (row.cleaningWaste > 0.0001) {
                    movementsToInsert.push({
                        product_id: row.productId,
                        warehouse_id: warehouseId,
                        quantity: -row.cleaningWaste,
                        type: 'exit',
                        reference_type: INVENTORY_MOVEMENT_SUBTYPES.WASTE_CLEANING,
                        notes: `[SIMULACIÓN] Basura / limpieza descapote (-${formatNumber(row.cleaningWaste, 2)} kg)`,
                        created_at: timestampIso
                    });
                }

                // X: Banco de Alimentos
                if (row.foodBank > 0.0001) {
                    movementsToInsert.push({
                        product_id: row.productId,
                        warehouse_id: warehouseId,
                        quantity: -row.foodBank,
                        type: 'exit',
                        reference_type: INVENTORY_MOVEMENT_SUBTYPES.FOOD_BANK,
                        notes: `[SIMULACIÓN] Donación a Banco de Alimentos (-${formatNumber(row.foodBank, 2)} kg)`,
                        created_at: timestampIso
                    });
                }

                // T: Conteo Físico Bodega
                if (row.physicalCount !== null) {
                    movementsToInsert.push({
                        product_id: row.productId,
                        warehouse_id: warehouseId,
                        quantity: 0,
                        type: 'adjustment',
                        reference_type: 'blind_count_shift_close',
                        notes: `[SIMULACIÓN] Cruce a ciegas fin de turno | Contado: ${formatNumber(row.physicalCount, 2)}`,
                        created_at: timestampIso
                    });
                }
            });

            if (movementsToInsert.length === 0) {
                throw new Error('No se generaron movimientos. Verifique que el archivo contenga valores numéricos en compras, ventas o conteos.');
            }

            const batchSize = 200;
            for (let i = 0; i < movementsToInsert.length; i += batchSize) {
                const batch = movementsToInsert.slice(i, i + batchSize);
                const { error: insError } = await supabase.from('inventory_movements').insert(batch);
                if (insError) throw insError;
            }

            setSuccessMessage(`¡Simulación inyectada con éxito! Se registraron ${movementsToInsert.length} transacciones operativas para la fecha ${targetDate}.`);
            setTimeout(() => {
                onSuccess();
                onClose();
            }, 1200);
        } catch (err: any) {
            console.error('Error inyectando simulación:', err);
            setErrorMessage(err.message || 'Error al inyectar los datos en base de datos.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // 3. Limpiar simulación de la fecha seleccionada
    const handleCleanSimulation = async () => {
        if (!confirm(`¿Estás seguro de eliminar todos los movimientos de [SIMULACIÓN] para la fecha ${targetDate}?`)) return;

        setIsCleaning(true);
        setErrorMessage(null);
        setSuccessMessage(null);

        try {
            const startOfDayIso = `${targetDate}T00:00:00.000Z`;
            const endOfDayIso = `${targetDate}T23:59:59.999Z`;

            const { error: delError } = await supabase
                .from('inventory_movements')
                .delete()
                .gte('created_at', startOfDayIso)
                .lte('created_at', endOfDayIso)
                .ilike('notes', '%[SIMULACIÓN]%');

            if (delError) throw delError;

            setSuccessMessage(`Se eliminaron con éxito los datos de simulación para ${targetDate}. El balance vuelve a su estado original.`);
            setTimeout(() => {
                onSuccess();
            }, 1000);
        } catch (err: any) {
            console.error('Error limpiando simulación:', err);
            setErrorMessage(err.message || 'Error al eliminar los datos de simulación.');
        } finally {
            setIsCleaning(false);
        }
    };

    // 4. Descargar plantilla oficial con los SKUs actuales
    const handleDownloadTemplate = () => {
        try {
            const rows = products.map(p => ({
                'Fecha inventario': targetDate,
                'idProducto': p.accounting_id || '',
                'Lista de Inventario': p.inventory_group || 'GENERAL',
                'Producto': p.name,
                'Inventario inicial': '',
                'Corrección de inventario': '',
                'Compra del día': '',
                'Venta del día (KG)': '',
                'Venta del día (UN)': '',
                'Peso Venta UN': '',
                'Producto escaso': '',
                'Producto sin enviar': '',
                'Venta adicional cliente': '',
                'Venta adicional empleado': '',
                'Devoluciones': '',
                'Pesada': '',
                'Desperdicio': '',
                'Basura': '',
                'Inventario agregado bodega': '',
                'Banco de alimentos': ''
            }));

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(rows);
            XLSX.utils.book_append_sheet(wb, ws, 'REQUERIMIENTO INVENTARIO');
            XLSX.writeFile(wb, `Plantilla_Simulacion_Operacion_${targetDate}.xlsx`);
        } catch (err: any) {
            alert('Error generando plantilla: ' + err.message);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '1rem',
            fontFamily: 'var(--font-outfit), sans-serif'
        }}>
            <div style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '16px',
                width: '100%',
                maxWidth: '750px',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                border: '1px solid #E2E8F0',
                overflow: 'hidden'
            }}>
                {/* Header */}
                <div style={{
                    padding: '1.25rem 1.5rem',
                    borderBottom: '1px solid #E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: '#F8FAFC'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '38px',
                            height: '38px',
                            borderRadius: '10px',
                            backgroundColor: '#ECFDF5',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <FileSpreadsheet size={20} color="#0D7A57" strokeWidth={2} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: '#0F172A' }}>
                                Simulación de Operación Diaria (Carga Masiva Excel)
                            </h2>
                            <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                                Ingesta rápida de la sábana de 24 columnas con cruce directo por ID Contable (#)
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            border: 'none',
                            background: 'transparent',
                            color: '#94A3B8',
                            cursor: 'pointer',
                            padding: '6px',
                            borderRadius: '8px',
                            display: 'flex'
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = '#0F172A'}
                        onMouseLeave={e => e.currentTarget.style.color = '#94A3B8'}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                    {/* Alertas */}
                    {errorMessage && (
                        <div style={{
                            backgroundColor: '#FEF2F2',
                            border: '1px solid #FCA5A5',
                            color: '#991B1B',
                            padding: '0.75rem 1rem',
                            borderRadius: '10px',
                            fontSize: '0.82rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                            <span>{errorMessage}</span>
                        </div>
                    )}

                    {successMessage && (
                        <div style={{
                            backgroundColor: '#ECFDF5',
                            border: '1px solid #A7F3D0',
                            color: '#065F46',
                            padding: '0.75rem 1rem',
                            borderRadius: '10px',
                            fontSize: '0.82rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
                            <span>{successMessage}</span>
                        </div>
                    )}

                    {/* Fila 1: Selector de Fecha y Descarga de Plantilla */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '1rem',
                        padding: '1rem',
                        backgroundColor: '#F8FAFC',
                        borderRadius: '12px',
                        border: '1px solid #E2E8F0'
                    }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '800', color: '#334155', marginBottom: '6px' }}>
                                Fecha de Simulación Objetivo:
                            </label>
                            <input
                                type="date"
                                value={targetDate}
                                onChange={e => setTargetDate(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '0.45rem 0.75rem',
                                    borderRadius: '8px',
                                    border: '1.5px solid #0D7A57',
                                    fontSize: '0.84rem',
                                    fontWeight: '700',
                                    color: '#0F172A',
                                    outline: 'none',
                                    backgroundColor: '#FFFFFF'
                                }}
                            />
                            <span style={{ fontSize: '0.68rem', color: '#64748B', display: 'block', marginTop: '4px' }}>
                                Los movimientos se inyectarán con esta fecha para conciliar el balance diario.
                            </span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '800', color: '#334155', marginBottom: '6px' }}>
                                Plantilla Espejo 1:1:
                            </label>
                            <button
                                type="button"
                                onClick={handleDownloadTemplate}
                                style={{
                                    padding: '0.45rem 0.85rem',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1',
                                    backgroundColor: '#FFFFFF',
                                    color: '#0F172A',
                                    fontSize: '0.78rem',
                                    fontWeight: '700',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    cursor: 'pointer',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                                }}
                            >
                                <Download size={14} color="#0D7A57" strokeWidth={2.5} />
                                <span>Descargar Plantilla con SKUs Actuales</span>
                            </button>
                        </div>
                    </div>

                    {/* Fila 2: Dropzone de Archivo */}
                    <div>
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            accept=".xlsx, .xls, .csv"
                            style={{ display: 'none' }}
                        />

                        <div
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                                border: '2px dashed #0D7A57',
                                borderRadius: '12px',
                                padding: '1.75rem 1rem',
                                textAlign: 'center',
                                backgroundColor: fileName ? '#F0FDF4' : '#FAFCFB',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#ECFDF5'}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = fileName ? '#F0FDF4' : '#FAFCFB'}
                        >
                            <div style={{
                                width: '48px',
                                height: '48px',
                                borderRadius: '50%',
                                backgroundColor: '#EAEFEA',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                margin: '0 auto 10px'
                            }}>
                                <Upload size={22} color="#0D7A57" />
                            </div>
                            <div style={{ fontWeight: '800', fontSize: '0.92rem', color: '#0F172A', marginBottom: '4px' }}>
                                {fileName ? fileName : 'Haz clic o arrastra aquí tu archivo Excel (.xlsx / .csv)'}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                                Compatible directamente con el formato <code>Inventario para desarrollo.xlsx</code>
                            </div>
                        </div>
                    </div>

                    {/* Banner informativo de deduplicación de totalizadores */}
                    {stats && stats.summaryRowsCount > 0 && (
                        <div style={{
                            backgroundColor: '#FFFBEB',
                            border: '1px solid #FDE68A',
                            borderRadius: '10px',
                            padding: '0.75rem 1rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '12px',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Info size={18} color="#D97706" style={{ flexShrink: 0 }} />
                                <div style={{ fontSize: '0.78rem', color: '#92400E', lineHeight: '1.35' }}>
                                    <span style={{ fontWeight: '800' }}>{stats.summaryRowsCount} filas totalizadoras detectadas:</span> El Excel contiene filas de resumen de familia (ID Contable repetido) además de las presentaciones hijas.
                                </div>
                            </div>
                            <label style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '0.78rem',
                                fontWeight: '700',
                                color: '#78350F',
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                                backgroundColor: '#FEF3C7',
                                padding: '4px 10px',
                                borderRadius: '6px',
                                border: '1px solid #FCD34D'
                            }}>
                                <input
                                    type="checkbox"
                                    checked={excludeSummaryRows}
                                    onChange={e => setExcludeSummaryRows(e.target.checked)}
                                    style={{ accentColor: '#0D7A57', cursor: 'pointer' }}
                                />
                                <span>Omitir totalizadores (evita duplicar)</span>
                            </label>
                        </div>
                    )}

                    {/* Fila 3: Pre-visualización de Validación si se cargó archivo */}
                    {stats && (
                        <div style={{
                            border: '1px solid #E2E8F0',
                            borderRadius: '12px',
                            padding: '1rem',
                            backgroundColor: '#FFFFFF',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Sparkles size={15} color="#0D7A57" />
                                    <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#0F172A' }}>
                                        Resumen Previo de Validación
                                    </span>
                                </div>
                                <span style={{
                                    fontSize: '0.72rem',
                                    fontWeight: '800',
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    backgroundColor: stats.unmatched === 0 ? '#DCFCE7' : '#FEF3C7',
                                    color: stats.unmatched === 0 ? '#166534' : '#92400E'
                                }}>
                                    {stats.matched} de {stats.totalRows} SKUs operativos {excludeSummaryRows && stats.summaryRowsCount > 0 ? `(${stats.summaryRowsCount} totalizadores descartados)` : ''}
                                </span>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                                <div style={{ backgroundColor: '#F8FAFC', padding: '8px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                    <div style={{ fontSize: '0.66rem', color: '#64748B', fontWeight: '700', textTransform: 'uppercase' }}>Compras (G)</div>
                                    <div style={{ fontSize: '1.05rem', fontWeight: '800', color: '#0F172A', marginTop: '2px' }}>
                                        {formatNumber(stats.totalPurchases, 2)} kg
                                    </div>
                                </div>
                                <div style={{ backgroundColor: '#F8FAFC', padding: '8px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                    <div style={{ fontSize: '0.66rem', color: '#64748B', fontWeight: '700', textTransform: 'uppercase' }}>Ventas (H)</div>
                                    <div style={{ fontSize: '1.05rem', fontWeight: '800', color: '#1E40AF', marginTop: '2px' }}>
                                        {formatNumber(stats.totalSalesKg, 2)} kg
                                    </div>
                                </div>
                                <div style={{ backgroundColor: '#F8FAFC', padding: '8px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                    <div style={{ fontSize: '0.66rem', color: '#64748B', fontWeight: '700', textTransform: 'uppercase' }}>Mermas (P/Q/R)</div>
                                    <div style={{ fontSize: '1.05rem', fontWeight: '800', color: '#DC2626', marginTop: '2px' }}>
                                        {formatNumber(stats.totalWasteKg, 2)} kg
                                    </div>
                                </div>
                                <div style={{ backgroundColor: '#F8FAFC', padding: '8px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                    <div style={{ fontSize: '0.66rem', color: '#64748B', fontWeight: '700', textTransform: 'uppercase' }}>Conteos (T)</div>
                                    <div style={{ fontSize: '1.05rem', fontWeight: '800', color: '#0D7A57', marginTop: '2px' }}>
                                        {formatNumber(stats.totalPhysicalCounts, 0)} productos
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '1rem 1.5rem',
                    borderTop: '1px solid #E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: '#F8FAFC'
                }}>
                    <button
                        type="button"
                        onClick={handleCleanSimulation}
                        disabled={isCleaning || isSubmitting}
                        style={{
                            padding: '0.45rem 0.85rem',
                            borderRadius: '8px',
                            border: '1px solid #FCA5A5',
                            backgroundColor: '#FEF2F2',
                            color: '#B91C1C',
                            fontSize: '0.78rem',
                            fontWeight: '700',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            cursor: 'pointer',
                            opacity: isCleaning ? 0.6 : 1
                        }}
                        title="Borrar movimientos de prueba marcados con [SIMULACIÓN] de la fecha seleccionada"
                    >
                        <Trash2 size={14} />
                        <span>{isCleaning ? 'Limpiando...' : 'Limpiar Simulación de esta Fecha'}</span>
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                padding: '0.45rem 1rem',
                                borderRadius: '8px',
                                border: '1px solid #CBD5E1',
                                backgroundColor: '#FFFFFF',
                                color: '#475569',
                                fontSize: '0.8rem',
                                fontWeight: '700',
                                cursor: 'pointer'
                            }}
                        >
                            Cancelar
                        </button>

                        <button
                            type="button"
                            onClick={handleExecuteSimulation}
                            disabled={parsedRows.length === 0 || isSubmitting || isCleaning}
                            style={{
                                padding: '0.45rem 1.25rem',
                                borderRadius: '8px',
                                border: 'none',
                                backgroundColor: parsedRows.length === 0 ? '#94A3B8' : '#0D7A57',
                                color: '#FFFFFF',
                                fontSize: '0.8rem',
                                fontWeight: '800',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                cursor: parsedRows.length === 0 ? 'not-allowed' : 'pointer',
                                boxShadow: parsedRows.length === 0 ? 'none' : '0 2px 6px rgba(13, 122, 87, 0.3)'
                            }}
                        >
                            {isSubmitting ? (
                                <>
                                    <RefreshCw size={14} className="animate-spin" />
                                    <span>Inyectando Datos...</span>
                                </>
                            ) : (
                                <>
                                    <ArrowRight size={14} strokeWidth={2.5} />
                                    <span>Ejecutar Simulación del Día</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
