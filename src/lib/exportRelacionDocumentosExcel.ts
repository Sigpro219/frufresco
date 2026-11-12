/**
 * Utilidad Oficial de Exportación de "Relación de Documentos" (.xlsx)
 * Clona de forma exacta el formato operacional histórico de despacho y ventas:
 * (relacion_documentos_YYYY-MM-DD.xlsx)
 *
 * Estructura de 16 columnas:
 * [No., Tipo, Documento, Cliente, Sucursal, Espacio, Vr/Total, Adicionales,
 *  Descuentos, Vr/Pagar, Celular, Dirección, Forma de pago, Proveedor, Diferencia, Zona]
 */

import { supabase } from '@/lib/supabase';
import { acquireSaveFileHandle, saveWorkbookWithPicker, isSavePickerAborted } from '@/lib/fileSavePicker';

const MONTH_NAMES_ES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

export function formatSpanishDateHeader(dateStr: string): string {
    const parts = (dateStr || '').split('-');
    if (parts.length === 3) {
        const year = parts[0];
        const monthIndex = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const monthName = MONTH_NAMES_ES[monthIndex] || parts[1];
        return `FECHA: ${day} de ${monthName} de ${year}`;
    }
    return `FECHA: ${dateStr}`;
}

export function formatGeneratedTimestamp(): string {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const hoursStr = String(hours).padStart(2, '0');
    return `GENERADO EL: ${day}/${month}/${year} ${hoursStr}:${minutes}:${seconds} ${ampm}`;
}

export function detectZone(address: string, municipality?: string, city?: string): string {
    const full = `${address || ''} ${municipality || ''} ${city || ''}`.toUpperCase();

    if (full.includes('KENNEDY')) return 'KENNEDY';
    if (full.includes('PUENTE ARANDA')) return 'PUENTE ARANDA';
    if (full.includes('USAQUEN') || full.includes('USAQUÉN')) return 'USAQUEN';
    if (full.includes('CHAPINERO')) return 'CHAPINERO';
    if (full.includes('SUBA')) return 'SUBA';
    if (full.includes('FONTIBON') || full.includes('FONTIBÓN')) return 'FONTIBON';
    if (full.includes('TEUSAQUILLO')) return 'TEUSAQUILLO';
    if (full.includes('BARRIOS UNIDOS')) return 'BARRIOS UNIDOS';
    if (full.includes('ENGATIVA') || full.includes('ENGATIVÁ')) return 'ENGATIVA';
    if (full.includes('SANTA FE') || full.includes('SANTAFE')) return 'SANTA FE';
    if (full.includes('MARTIRES') || full.includes('MÁRTIRES')) return 'MARTIRES';
    if (full.includes('ANTONIO NARIÑO') || full.includes('ANTONIO NARINO')) return 'ANTONIO NARIÑO';
    if (full.includes('CANDELARIA')) return 'LA CANDELARIA';
    if (full.includes('BOSA')) return 'BOSA';
    if (full.includes('TUNJUELITO')) return 'TUNJUELITO';
    if (full.includes('USME')) return 'USME';
    if (full.includes('SAN CRISTOBAL') || full.includes('SAN CRISTÓBAL')) return 'SAN CRISTOBAL';
    if (full.includes('CIUDAD BOLIVAR') || full.includes('CIUDAD BOLÍVAR')) return 'CIUDAD BOLIVAR';

    // Sabana de Bogotá
    if (full.includes('SOACHA')) return 'SOACHA (C/MARCA)';
    if (full.includes('TENJO')) return 'TENJO (C/MARCA)';
    if (full.includes('CHIA') || full.includes('CHÍA')) return 'CHIA (C/MARCA)';
    if (full.includes('CAJICA') || full.includes('CAJICÁ')) return 'CAJICA (C/MARCA)';
    if (full.includes('COTA')) return 'COTA (C/MARCA)';
    if (full.includes('ZIPAQUIRA') || full.includes('ZIPAQUIRÁ')) return 'ZIPAQUIRA (C/MARCA)';
    if (full.includes('FUNZA')) return 'FUNZA (C/MARCA)';
    if (full.includes('MOSQUERA')) return 'MOSQUERA (C/MARCA)';
    if (full.includes('MADRID')) return 'MADRID (C/MARCA)';
    if (full.includes('FACATATIVA') || full.includes('FACATATIVÁ')) return 'FACATATIVA (C/MARCA)';

    if (municipality && municipality.trim()) return municipality.trim().toUpperCase();
    if (city && city.trim()) return city.trim().toUpperCase();
    return 'BOGOTÁ D.C.';
}

export interface RelacionExportOrder {
    id: string;
    sequence_id?: number | string;
    invoice_number?: string | null;
    status?: string;
    type?: string;
    payment_method?: string;
    delivery_date?: string;
    delivery_address?: string;
    delivery_phone?: string;
    delivery_name?: string;
    subtotal?: number;
    shipping_cost?: number;
    discount_amount?: number;
    total_amount?: number;
    warehouse_spaces?: any;
    profiles?: {
        company_name?: string | null;
        razon_social?: string | null;
        full_name?: string | null;
        role?: string | null;
        phone?: string | null;
        address?: string | null;
        document_type?: string | null;
        municipality?: string | null;
        city?: string | null;
    } | null;
}

/**
 * Genera el libro Excel de Relación de Documentos
 */
export function buildRelacionDocumentosSheet(
    XLSX: any,
    orders: RelacionExportOrder[],
    selectedDate: string,
    manualSpacesMap?: Record<string, number[]>
): any {
    const rows: (string | number)[][] = [];

    // Fila 0: Fecha en español
    rows.push([formatSpanishDateHeader(selectedDate)]);

    // Fila 1: Vacía separadora
    rows.push([]);

    // Fila 2: Encabezados estándar (16 columnas)
    const headers = [
        'No.', 'Tipo', 'Documento', 'Cliente', 'Sucursal', 'Espacio',
        'Vr/Total', 'Adicionales', 'Descuentos', 'Vr/Pagar',
        'Celular', 'Dirección', 'Forma de pago', 'Proveedor', 'Diferencia', 'Zona'
    ];
    rows.push(headers);

    // Filas de datos (Row 3 en adelante)
    orders.forEach((o, index) => {
        const prof = o.profiles || {};
        const isInstitucional = prof.role === 'b2b_client';
        const tipo = isInstitucional ? 'Institucional' : 'Hogar';

        // Documento
        let documento = '';
        if (o.invoice_number && String(o.invoice_number).trim()) {
            documento = String(o.invoice_number).trim();
        } else if (prof.document_type === 'invoice') {
            documento = `FV ${o.sequence_id || '---'}`;
        } else if (!isInstitucional) {
            documento = `REH ${o.sequence_id || '---'}`;
        } else {
            documento = `REM ${o.sequence_id || '---'}`;
        }

        // Cliente y Sucursal
        const rawName = prof.company_name || prof.razon_social || prof.full_name || o.delivery_name || 'CLIENTE GENERAL';
        let cliente = rawName;
        let sucursal = '';
        if (rawName.includes(' - ')) {
            const split = rawName.split(' - ');
            cliente = split[0].trim();
            sucursal = isInstitucional ? split.slice(1).join(' - ').trim() : '';
        }

        // Espacio en Bodega (Floor Staging)
        let espacioStr = '';
        if (manualSpacesMap && manualSpacesMap[o.id] && manualSpacesMap[o.id].length > 0) {
            espacioStr = manualSpacesMap[o.id].join(', ');
        } else if (o.warehouse_spaces) {
            if (Array.isArray(o.warehouse_spaces) && o.warehouse_spaces.length > 0) {
                espacioStr = o.warehouse_spaces.join(', ');
            } else if (typeof o.warehouse_spaces === 'number' || typeof o.warehouse_spaces === 'string') {
                espacioStr = String(o.warehouse_spaces);
            }
        }

        // Valores numéricos
        const shipping = Number(o.shipping_cost || 0);
        const discount = Number(o.discount_amount || 0);
        const total = Number(o.total_amount || 0);
        const subtotal = o.subtotal !== undefined && o.subtotal !== null
            ? Number(o.subtotal)
            : Math.max(0, total - shipping + discount);

        // Contacto
        const celular = String(prof.phone || o.delivery_phone || '').trim();
        const direccion = String(o.delivery_address || prof.address || '').replace(/[\r\n]+/g, ' ').trim();

        // Forma de pago
        const rawPay = (o.payment_method || '').toLowerCase();
        let formaPago = 'Crédito';
        if (!isInstitucional) {
            formaPago = rawPay.includes('efectivo') ? 'Efectivo' : 'Tienda Virtual - Pago PSE/Tarjeta de crédito';
        } else {
            formaPago = (rawPay.includes('efectivo') || rawPay.includes('cash')) ? 'Efectivo' : 'Crédito';
        }

        // Proveedor y Diferencia
        const proveedor = 'INVESTMENTS CORTES SAS';
        const diferencia = '';

        // Zona
        const zona = detectZone(direccion, prof.municipality || undefined, prof.city || undefined);

        rows.push([
            index + 1,
            tipo,
            documento,
            cliente,
            sucursal,
            espacioStr,
            subtotal,
            shipping,
            discount,
            total,
            celular,
            direccion,
            formaPago,
            proveedor,
            diferencia,
            zona
        ]);
    });

    // Fila final: GENERADO EL: ...
    const footerText = formatGeneratedTimestamp();
    rows.push([footerText]);

    const worksheet = XLSX.utils.aoa_to_sheet(rows);

    // Merges:
    // 1. Fila 0: Cols 0 a 15
    // 2. Fila final: Cols 0 a 3
    const finalRowIndex = rows.length - 1;
    worksheet['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 15 } },
        { s: { r: finalRowIndex, c: 0 }, e: { r: finalRowIndex, c: 3 } }
    ];

    // Ancho de columnas estándar
    worksheet['!cols'] = [
        { wch: 6 },   // No.
        { wch: 15 },  // Tipo
        { wch: 18 },  // Documento
        { wch: 38 },  // Cliente
        { wch: 36 },  // Sucursal
        { wch: 10 },  // Espacio
        { wch: 14 },  // Vr/Total
        { wch: 12 },  // Adicionales
        { wch: 12 },  // Descuentos
        { wch: 14 },  // Vr/Pagar
        { wch: 16 },  // Celular
        { wch: 45 },  // Dirección
        { wch: 32 },  // Forma de pago
        { wch: 25 },  // Proveedor
        { wch: 12 },  // Diferencia
        { wch: 20 },  // Zona
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Informe');
    return workbook;
}

/**
 * Flujo completo con Diálogo Nativo "Guardar como..." (acquireSaveFileHandle)
 */
export async function exportRelacionDocumentosWithPicker(options: {
    selectedDate: string;
    orders?: RelacionExportOrder[];
    manualSpacesMap?: Record<string, number[]>;
    preAcquiredHandle?: any;
}): Promise<boolean> {
    const { selectedDate, manualSpacesMap } = options;
    const suggestedFilename = `relacion_documentos_${selectedDate}.xlsx`;

    let fileHandle = options.preAcquiredHandle;

    // Si no se proporcionó handle previo, solicitarlo inmediatamente
    if (!fileHandle) {
        try {
            fileHandle = await acquireSaveFileHandle({
                suggestedName: suggestedFilename,
                description: 'Relación de Documentos (.xlsx)',
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                extension: '.xlsx',
            });
        } catch (pickerErr) {
            if (isSavePickerAborted(pickerErr)) return false;
            throw pickerErr;
        }
    }

    // Resolver órdenes completas con profiles
    let finalOrders = options.orders;
    if (!finalOrders || finalOrders.length === 0 || !finalOrders[0]?.profiles) {
        const { data, error } = await supabase
            .from('orders')
            .select(`
                id,
                sequence_id,
                invoice_number,
                status,
                type,
                payment_method,
                delivery_date,
                delivery_address,
                delivery_phone,
                delivery_name,
                subtotal,
                shipping_cost,
                discount_amount,
                total_amount,
                warehouse_spaces,
                profiles:customer_id (
                    company_name,
                    razon_social,
                    full_name,
                    role,
                    phone,
                    address,
                    document_type,
                    municipality,
                    city
                )
            `)
            .eq('delivery_date', selectedDate)
            .neq('status', 'cancelled')
            .order('sequence_id', { ascending: true })
            .range(0, 4999);

        if (error) {
            console.error('[exportRelacionDocumentos] Error consultando órdenes:', error);
            throw new Error(`Error al cargar órdenes de la fecha ${selectedDate}: ${error.message}`);
        }

        finalOrders = (data as any[]) || [];
    }

    const XLSX = await import('xlsx');
    const workbook = buildRelacionDocumentosSheet(XLSX, finalOrders, selectedDate, manualSpacesMap);

    return await saveWorkbookWithPicker(XLSX, workbook, suggestedFilename, fileHandle);
}
