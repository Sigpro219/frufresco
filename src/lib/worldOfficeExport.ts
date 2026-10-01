/**
 * WORLD OFFICE DESKTOP EXPORT ENGINE
 * Contract: SPEC.md v1.9.32 - Section 7.7.E & 7.7.F (COM-27, COM-31)
 * Generates official Excel (.xlsx) file matching World Office Desktop import layout (57 columns).
 * Sheet Name: 'Detalle migración'
 */

export const WORLD_OFFICE_SHEET_NAME = 'Detalle migración';

export const WORLD_OFFICE_57_COLUMNS = [
    'EMPRESA',
    'Encab: Tipo Documento',
    'Encab: Prefijo',
    'Encab: Documento Número',
    'Encab: Fecha',
    'Encab: Tercero Interno',
    'Encab: Tercero Externo',
    'Encab: Nota',
    'Encab: FormaPago',
    'Encab: Fecha Entrega',
    'Encab: Prefijo Documento Externo',
    'Encab: Número_Documento_Externo',
    'Encab: Verificado',
    'Encab: Anulado',
    'Encab: Personalizado 1',
    'Encab: Personalizado 2',
    'Encab: Personalizado 3',
    'Encab: Personalizado 4',
    'Encab: Personalizado 5',
    'Encab: Personalizado 6',
    'Encab: Personalizado 7',
    'Encab: Personalizado 8',
    'Encab: Personalizado 9',
    'Encab: Personalizado 10',
    'Encab: Personalizado 11',
    'Encab: Personalizado 12',
    'Encab: Personalizado 13',
    'Encab: Personalizado 14',
    'Encab: Personalizado 15',
    'Encab: Sucursal',
    'Encab: Clasificación',
    'Detalle: Producto',
    'Detalle: Bodega',
    'Detalle: UnidadDeMedida',
    'Detalle: Cantidad',
    'Detalle: IVA',
    'Detalle: Valor Unitario',
    'Detalle: Descuento',
    'Detalle: Vencimiento',
    'Detalle: Nota',
    'Detalle: Centro costos',
    'Detalle: Personalizado1',
    'Detalle: Personalizado2',
    'Detalle: Personalizado3',
    'Detalle: Personalizado4',
    'Detalle: Personalizado5',
    'Detalle: Personalizado6',
    'Detalle: Personalizado7',
    'Detalle: Personalizado8',
    'Detalle: Personalizado9',
    'Detalle: Personalizado10',
    'Detalle: Personalizado11',
    'Detalle: Personalizado12',
    'Detalle: Personalizado13',
    'Detalle: Personalizado14',
    'Detalle: Personalizado15',
    'Detalle: Código Centro Costos'
] as const;

export type WorldOfficeColumnKey = typeof WORLD_OFFICE_57_COLUMNS[number];

export interface WorldOfficeExportItem {
    empresa?: string;
    tipoDocumento: 'FV' | 'NC';
    prefijo?: string;
    numero: number | string;
    fecha: string; // YYYY-MM-DD o DD/MM/YYYY
    terceroInterno?: string | number;
    identificacionTercero: string;
    digitoVerificacion?: string;
    razonSocial: string;
    sucursal?: string;
    centroCostos?: string;
    cuentaContable?: string;
    codigoProducto: string | number;
    descripcion?: string;
    bodega?: string;
    unidadMedida?: string;
    cantidad: number;
    valorUnitario: number;
    valorBase?: number;
    tarifaIva?: number; // 0 o 19 (compatibilidad)
    ivaRateDecimal?: number; // 0 o 0.19
    valorIva?: number;
    totalLinea?: number;
    descuento?: number;
    diasCredito?: number;
    fechaVencimiento?: string;
    fechaEntrega?: string;
    formaPago?: 'Credito' | 'Contado';
    notaEncabezado?: string;
    observaciones?: string;
}

/**
 * Calculates Colombian DIAN Verification Digit (Módulo 11)
 */
export function calculateDianDV(rawNit: string | number): string {
    const nitStr = String(rawNit).replace(/\D/g, '');
    if (!nitStr || nitStr.length === 0) return '0';

    const vpri = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
    const len = nitStr.length;
    let sum = 0;

    for (let i = 0; i < len; i++) {
        const digit = parseInt(nitStr.charAt(len - 1 - i), 10);
        sum += digit * vpri[i];
    }

    const mod = sum % 11;
    if (mod === 0 || mod === 1) {
        return String(mod);
    }
    return String(11 - mod);
}

/**
 * Cleans a NIT string, extracting the base digits and resolving the DV
 */
export function parseNitAndDv(rawNit: string | null | undefined): { nit: string; dv: string } {
    if (!rawNit) return { nit: '222222222222', dv: '0' }; // Consumidor final fallback
    
    // Check if DV is already present with hyphen (e.g. 901234567-8)
    const parts = String(rawNit).trim().split('-');
    const cleanNit = parts[0].replace(/\D/g, '');
    
    if (parts.length > 1 && parts[1].trim().length > 0) {
        const cleanDv = parts[1].replace(/\D/g, '');
        return { nit: cleanNit, dv: cleanDv };
    }

    return {
        nit: cleanNit,
        dv: calculateDianDV(cleanNit)
    };
}

/**
 * Normalizes any date string or Date object to DD/MM/YYYY format
 */
export function formatDateDDMMYYYY(dateInput: string | Date | null | undefined): string {
    if (!dateInput) {
        const now = new Date();
        const d = String(now.getDate()).padStart(2, '0');
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const y = now.getFullYear();
        return `${d}/${m}/${y}`;
    }
    if (typeof dateInput === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(dateInput.trim())) {
        return dateInput.trim();
    }
    if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateInput.trim())) {
        const [y, m, d] = dateInput.trim().substring(0, 10).split('-');
        return `${d}/${m}/${y}`;
    }
    const dObj = new Date(dateInput);
    if (isNaN(dObj.getTime())) {
        return '';
    }
    const d = String(dObj.getDate()).padStart(2, '0');
    const m = String(dObj.getMonth() + 1).padStart(2, '0');
    const y = dObj.getFullYear();
    return `${d}/${m}/${y}`;
}

/**
 * Calculates due date (Fecha + payment_days) and returns DD/MM/YYYY
 */
export function calculateDueDate(baseDateInput: string | Date | null | undefined, days: number = 0): string {
    let dObj: Date;
    if (typeof baseDateInput === 'string' && /^\d{4}-\d{2}-\d{2}/.test(baseDateInput.trim())) {
        const [y, m, d] = baseDateInput.trim().substring(0, 10).split('-').map(Number);
        dObj = new Date(y, m - 1, d);
    } else if (baseDateInput) {
        dObj = new Date(baseDateInput);
    } else {
        dObj = new Date();
    }
    if (isNaN(dObj.getTime())) dObj = new Date();
    dObj.setDate(dObj.getDate() + (Number(days) || 0));
    const d = String(dObj.getDate()).padStart(2, '0');
    const m = String(dObj.getMonth() + 1).padStart(2, '0');
    const y = dObj.getFullYear();
    return `${d}/${m}/${y}`;
}

/**
 * Generates and triggers download of Excel file formatted for World Office Desktop (57-column matrix)
 * Matches the official layout audited from the Gemba ('Detalle migración' sheet)
 */
export async function downloadWorldOfficeExcel(
    items: WorldOfficeExportItem[],
    fileNamePrefix: string = 'WorldOffice_Corte'
): Promise<void> {
    if (!items || items.length === 0) {
        throw new Error('No hay registros de facturación para exportar a World Office.');
    }

    // Dynamic import to prevent heavy bundles
    const XLSX = await import('xlsx');

    // Build the 57 exact columns matching World Office Desktop import template
    const formattedRows = items.map(item => {
        const rawNit = item.identificacionTercero || (item as any).nitCliente || (item as any).nit || '222222222222';
        const cleanNit = String(rawNit).replace(/\D/g, '') || '222222222222';
        const docDateStr = formatDateDDMMYYYY(item.fecha);
        const deliveryDateStr = formatDateDDMMYYYY(item.fechaEntrega || item.fecha);
        const dueDateStr = item.fechaVencimiento 
            ? formatDateDDMMYYYY(item.fechaVencimiento) 
            : calculateDueDate(item.fecha, item.diasCredito ?? 30);

        const paymentMethod = item.formaPago 
            ? item.formaPago 
            : ((item.diasCredito ?? 30) > 0 ? 'Credito' : 'Contado');

        // IVA is represented as decimal in WO Desktop: 0 or 0.19
        let ivaDecimal = 0;
        if (typeof item.ivaRateDecimal === 'number') {
            ivaDecimal = item.ivaRateDecimal;
        } else if (typeof item.tarifaIva === 'number') {
            ivaDecimal = item.tarifaIva > 1 ? item.tarifaIva / 100 : item.tarifaIva;
        }

        const docNum = item.numero ?? (item as any).consecutivo ?? 1;

        const row: Record<WorldOfficeColumnKey, any> = {
            'EMPRESA': item.empresa || 'INVESTMENTS CORTES SAS',
            'Encab: Tipo Documento': item.tipoDocumento || 'FV',
            'Encab: Prefijo': item.prefijo || '',
            'Encab: Documento Número': docNum,
            'Encab: Fecha': docDateStr,
            'Encab: Tercero Interno': item.terceroInterno || '456282',
            'Encab: Tercero Externo': cleanNit,
            'Encab: Nota': item.notaEncabezado || item.razonSocial || '',
            'Encab: FormaPago': paymentMethod,
            'Encab: Fecha Entrega': deliveryDateStr,
            'Encab: Prefijo Documento Externo': '',
            'Encab: Número_Documento_Externo': '',
            'Encab: Verificado': '',
            'Encab: Anulado': '',
            'Encab: Personalizado 1': '',
            'Encab: Personalizado 2': '',
            'Encab: Personalizado 3': '',
            'Encab: Personalizado 4': '',
            'Encab: Personalizado 5': '',
            'Encab: Personalizado 6': '',
            'Encab: Personalizado 7': '',
            'Encab: Personalizado 8': '',
            'Encab: Personalizado 9': '',
            'Encab: Personalizado 10': '',
            'Encab: Personalizado 11': '',
            'Encab: Personalizado 12': '',
            'Encab: Personalizado 13': '',
            'Encab: Personalizado 14': '',
            'Encab: Personalizado 15': '',
            'Encab: Sucursal': item.sucursal || item.razonSocial || 'Principal',
            'Encab: Clasificación': '',
            'Detalle: Producto': item.codigoProducto,
            'Detalle: Bodega': item.bodega || 'Principal',
            'Detalle: UnidadDeMedida': item.unidadMedida || 'kg',
            'Detalle: Cantidad': Number(item.cantidad) || 0,
            'Detalle: IVA': ivaDecimal,
            'Detalle: Valor Unitario': Number(item.valorUnitario) || 0,
            'Detalle: Descuento': item.descuento || 0,
            'Detalle: Vencimiento': dueDateStr,
            'Detalle: Nota': '',
            'Detalle: Centro costos': '',
            'Detalle: Personalizado1': '',
            'Detalle: Personalizado2': '',
            'Detalle: Personalizado3': '',
            'Detalle: Personalizado4': '',
            'Detalle: Personalizado5': '',
            'Detalle: Personalizado6': '',
            'Detalle: Personalizado7': '',
            'Detalle: Personalizado8': '',
            'Detalle: Personalizado9': '',
            'Detalle: Personalizado10': '',
            'Detalle: Personalizado11': '',
            'Detalle: Personalizado12': '',
            'Detalle: Personalizado13': '',
            'Detalle: Personalizado14': '',
            'Detalle: Personalizado15': '',
            'Detalle: Código Centro Costos': ''
        };

        return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(formattedRows, { header: [...WORLD_OFFICE_57_COLUMNS] });

    // Set auto-fit column widths
    const colWidths = WORLD_OFFICE_57_COLUMNS.map(col => ({
        wch: Math.max(col.length + 2, 14)
    }));
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, WORLD_OFFICE_SHEET_NAME);

    const cleanDate = new Date().toISOString().split('T')[0];
    const fullFileName = `${fileNamePrefix}_${cleanDate}.xlsx`;

    XLSX.writeFile(workbook, fullFileName);
}
