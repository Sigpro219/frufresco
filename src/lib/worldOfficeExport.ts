/**
 * WORLD OFFICE DESKTOP EXPORT ENGINE
 * Contract: SPEC.md v1.9.32 - Section 7.7.E & 7.7.F (COM-27, COM-31)
 * Generates official Excel (.xls BIFF8) file matching World Office Desktop import layout (44 columns).
 * Sheet Name: 'Encab + Movim.Inven LOTES'
 */

import { addBogotaDays, getBogotaDateString } from '@/lib/dateUtils';

export const WORLD_OFFICE_SHEET_NAME = 'Encab + Movim.Inven LOTES';

export const WORLD_OFFICE_44_COLUMNS = [
    'Encab: Empresa',
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
    'Detalle: Lote',
    'Detalle: Código Centro Costos'
] as const;

export const WORLD_OFFICE_57_COLUMNS = WORLD_OFFICE_44_COLUMNS;

export type WorldOfficeColumnKey = typeof WORLD_OFFICE_44_COLUMNS[number];

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
    isB2B?: boolean;
    clasificacion?: string;
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
        const bogotaToday = getBogotaDateString();
        const [y, m, d] = bogotaToday.split('-');
        return `${d}/${m}/${y}`;
    }
    if (typeof dateInput === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(dateInput.trim())) {
        return dateInput.trim();
    }
    const bogotaStr = getBogotaDateString(dateInput);
    if (!bogotaStr) {
        return '';
    }
    const [y, m, d] = bogotaStr.split('-');
    return `${d}/${m}/${y}`;
}

/**
 * Calculates due date (Fecha + payment_days) and returns DD/MM/YYYY
 */
export function calculateDueDate(baseDateInput: string | Date | null | undefined, days: number = 0): string {
    let baseIso = '';
    if (typeof baseDateInput === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(baseDateInput.trim())) {
        const [d, m, y] = baseDateInput.trim().split('/');
        baseIso = `${y}-${m}-${d}`;
    } else if (baseDateInput) {
        baseIso = getBogotaDateString(baseDateInput);
    }
    if (!baseIso) {
        baseIso = getBogotaDateString();
    }
    const dueIso = addBogotaDays(baseIso, Number(days) || 0) || baseIso;
    const [y, m, d] = dueIso.split('-');
    return `${d}/${m}/${y}`;
}

export function normalizeWorldOfficeUom(rawUom: string | null | undefined): string {
    const clean = String(rawUom || 'kg').trim().toLowerCase();
    // 1. Libras (si el cliente factura en libras)
    if (/^(lb|lbs|libra|libras)$/i.test(clean)) return 'LB';
    // 2. Unidades (und, unidad, paquete, atado, bulto, caja, bandeja, un, pz, etc.)
    if (
        /^(und|und\.|unidad|unidades|un|pz|pza|paquete|atado|bulto|caja|bandeja|canastilla|malla|sobre)/i.test(clean) ||
        clean.includes('unidad') ||
        clean.includes('und') ||
        clean.includes('paquete')
    ) {
        return 'Und.';
    }
    // 3. Regla Estricta por defecto: Todo lo demás (peso, granel, kg, gramos) es 'kg'
    return 'kg';
}

/**
 * Generates and triggers download of Excel file formatted for World Office Desktop (57-column matrix)
 * Matches the official layout audited from the Gemba ('Detalle migración' sheet)
 */
/**
 * Resolves the clean World Office branch name (Columna AD: 'Encab: Sucursal').
 * Prioritizes canonical pre-paired columns (`logistics_data.world_office_branch` and `billing_razon_social`)
 * so exports never depend on fragile text-splitting heuristics.
 */
export function resolveWorldOfficeBranch(profile: any, parentProfile?: any, isB2B?: boolean): string {
    if (!profile && !parentProfile) return '';
    if (isB2B === false) return '';
    if (
        isB2B === undefined &&
        (profile?.role === 'b2c_client' || profile?.role === 'client') &&
        !profile?.parent_id &&
        !profile?.is_corporate_parent &&
        !parentProfile
    ) {
        return '';
    }

    // Prioridad 1 (Fuente Única Canónica): Columna pre-apareada en BD (preserva caracteres literales exactos)
    const canonicalBranch =
        (typeof profile?.logistics_data?.world_office_branch === 'string' && profile.logistics_data.world_office_branch.trim().length > 0
            ? profile.logistics_data.world_office_branch
            : undefined) ??
        (typeof profile?.billing_razon_social === 'string' && profile.billing_razon_social.trim().length > 0
            ? profile.billing_razon_social
            : undefined);

    if (canonicalBranch) {
        return canonicalBranch;
    }

    // Prioridad 2 (Heredado de Matriz cuando el perfil no es sucursal independiente)
    const isBranch = Boolean(profile?.parent_id) || Boolean(profile?.branch_id);
    if (!isBranch && parentProfile) {
        const parentCanonical =
            (typeof parentProfile?.logistics_data?.world_office_branch === 'string' && parentProfile.logistics_data.world_office_branch.trim().length > 0
                ? parentProfile.logistics_data.world_office_branch
                : undefined) ??
            (typeof parentProfile?.billing_razon_social === 'string' && parentProfile.billing_razon_social.trim().length > 0
                ? parentProfile.billing_razon_social
                : undefined);
        if (parentCanonical) {
            return parentCanonical;
        }
    }

    // Fallback de emergencia (solo para perfiles recién creados sin homologación previa)
    const fullName = (profile?.company_name || profile?.razon_social || profile?.contact_name || '').trim();
    const legalName = (profile?.razon_social || profile?.company_name || profile?.contact_name || parentProfile?.razon_social || parentProfile?.company_name || '').trim();
    if (!fullName && !legalName) return '';

    const parentCandidates = [
        parentProfile?.company_name,
        parentProfile?.razon_social,
        isBranch ? profile?.razon_social : null
    ]
        .map(c => (typeof c === 'string' ? c.trim() : ''))
        .filter(Boolean);

    for (const pName of parentCandidates) {
        if (fullName && fullName.toLowerCase() !== pName.toLowerCase() && fullName.toLowerCase().startsWith(pName.toLowerCase())) {
            const sub = fullName.slice(pName.length).trim().replace(/^[-–—:]+\s*/, '');
            if (sub) return sub;
        }
    }

    if (isBranch && fullName.includes(' - ')) {
        const parts = fullName.split(' - ');
        const candidate = parts.slice(1).join(' - ').trim();
        if (candidate) return candidate;
    }

    if (isBranch && fullName) {
        return fullName;
    }

    return legalName || fullName;
}

/**
 * Resolves the World Office header note (Columna H: 'Encab: Nota').
 * Rules (GEMBA-WO):
 * 1. If a valid Purchase Order / Solped code exists, emit the cleaned code.
 * 2. Otherwise emit strictly the canonical World Office branch (`branchName`) without discarding 'Principal'.
 */
export function resolveWorldOfficeNote(order: any, profile: any, branchName?: string, parentProfile?: any): string {
    const rawOc = (order?.purchase_order_number || '').trim();
    const cleanOc = rawOc
        .replace(/^(?:fv\s*)?(?:seg[uú]n\s*)?(?:orden\s*de\s*compra\s*[:#-]?\s*|solped\s*[:#-]?\s*|oc\b\s*[:#-]?\s+)/i, '')
        .trim();

    const digitCount = (cleanOc.match(/\d/g) || []).length;
    const isLikelyAddressOrNoise =
        /^(?:calle|cll|carrera|cra|kr|av|avenida|transversal|tv|diagonal|dg|piso|sede|bulevar|homecenter|cafam|corferias|n\/a|na|sin\s*oc|ningun[ao]?|pendiente|no\s*aplica)\b/i.test(cleanOc) ||
        /^carrera\s*\d+$/i.test(cleanOc);
    const isExplicitOrderRef = /\b(?:oc|solped|pedido|semana)\b/i.test(rawOc);
    const isValidOc = Boolean(cleanOc) && digitCount > 0 && !isLikelyAddressOrNoise && (digitCount >= 3 || isExplicitOrderRef);

    if (isValidOc) {
        return cleanOc;
    }

    const resolvedBranch = (typeof branchName === 'string' && branchName.trim().length > 0)
        ? branchName
        : resolveWorldOfficeBranch(profile, parentProfile);

    return resolvedBranch || (profile?.razon_social || profile?.company_name || profile?.contact_name || '').trim();
}

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
        const paymentMethod = item.formaPago 
            ? item.formaPago 
            : ((item.diasCredito ?? 30) > 0 ? 'Credito' : 'Contado');

        const effectiveCreditDays = paymentMethod === 'Credito'
            ? (Number(item.diasCredito) > 0 ? Number(item.diasCredito) : 30)
            : (Number(item.diasCredito) || 0);

        const dueDateStr = item.fechaVencimiento 
            ? formatDateDDMMYYYY(item.fechaVencimiento) 
            : calculateDueDate(item.fecha, effectiveCreditDays);

        // IVA is represented as decimal in WO Desktop: 0 or 0.19
        let ivaDecimal = 0;
        if (typeof item.ivaRateDecimal === 'number') {
            ivaDecimal = item.ivaRateDecimal;
        } else if (typeof item.tarifaIva === 'number') {
            ivaDecimal = item.tarifaIva > 1 ? item.tarifaIva / 100 : item.tarifaIva;
        }

        const rawDocNum = item.numero ?? (item as any).consecutivo ?? 1;
        // GEMBA-WO: Para Factura de Venta ('FV'), la Columna D ('Encab: Documento Número') exige estrictamente un entero numérico puro (ej: 68494).
        const cleanDocNum = typeof rawDocNum === 'number' 
            ? Math.round(rawDocNum) 
            : (parseInt(String(rawDocNum).replace(/\D/g, ''), 10) || 1);

        const cleanTerceroInterno = Number(String(item.terceroInterno || '456282').replace(/\D/g, '')) || 456282;
        const cleanTerceroExterno = Number(cleanNit) || 222222222222;
        const cleanSucursal = item.isB2B === false
            ? ''
            : ((typeof item.sucursal === 'string' && item.sucursal.trim().length > 0)
                ? item.sucursal
                : (item.razonSocial || ''));
        const cleanProducto = typeof item.codigoProducto === 'number'
            ? item.codigoProducto
            : (/^\d+$/.test(String(item.codigoProducto || '').trim()) ? Number(String(item.codigoProducto).trim()) : item.codigoProducto);

        const row: Record<WorldOfficeColumnKey, any> = {
            'Encab: Empresa': item.empresa || 'INVESTMENTS CORTES SAS',
            'Encab: Tipo Documento': item.tipoDocumento || 'FV',
            'Encab: Prefijo': item.prefijo || undefined,
            'Encab: Documento Número': cleanDocNum,
            'Encab: Fecha': docDateStr,
            'Encab: Tercero Interno': cleanTerceroInterno,
            'Encab: Tercero Externo': cleanTerceroExterno,
            'Encab: Nota': typeof item.notaEncabezado === 'string' && item.notaEncabezado.trim() ? item.notaEncabezado : (cleanSucursal || item.razonSocial || undefined),
            'Encab: FormaPago': paymentMethod,
            'Encab: Fecha Entrega': deliveryDateStr,
            'Encab: Prefijo Documento Externo': undefined,
            'Encab: Número_Documento_Externo': undefined,
            'Encab: Verificado': undefined,
            'Encab: Anulado': undefined,
            'Encab: Personalizado 1': undefined,
            'Encab: Personalizado 2': undefined,
            'Encab: Personalizado 3': undefined,
            'Encab: Personalizado 4': undefined,
            'Encab: Personalizado 5': undefined,
            'Encab: Personalizado 6': undefined,
            'Encab: Personalizado 7': undefined,
            'Encab: Personalizado 8': undefined,
            'Encab: Personalizado 9': undefined,
            'Encab: Personalizado 10': undefined,
            'Encab: Personalizado 11': undefined,
            'Encab: Personalizado 12': undefined,
            'Encab: Personalizado 13': undefined,
            'Encab: Personalizado 14': undefined,
            'Encab: Personalizado 15': undefined,
            'Encab: Sucursal': cleanSucursal || undefined,
            'Encab: Clasificación': item.clasificacion || undefined,
            'Detalle: Producto': cleanProducto,
            'Detalle: Bodega': item.bodega || 'Principal',
            'Detalle: UnidadDeMedida': normalizeWorldOfficeUom(item.unidadMedida),
            'Detalle: Cantidad': Number(item.cantidad) || 0,
            'Detalle: IVA': ivaDecimal,
            'Detalle: Valor Unitario': Number(item.valorUnitario) || 0,
            'Detalle: Descuento': item.descuento || 0,
            'Detalle: Vencimiento': dueDateStr,
            'Detalle: Nota': undefined,
            'Detalle: Centro costos': undefined,
            'Detalle: Personalizado1': undefined,
            'Detalle: Lote': undefined,
            'Detalle: Código Centro Costos': undefined
        };

        return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(formattedRows, { header: [...WORLD_OFFICE_44_COLUMNS] });

    const ddmmyyyyToExcelSerial = (val: string): number | null => {
        const m = String(val || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (!m) return null;
        const day = Number(m[1]);
        const month = Number(m[2]);
        const year = Number(m[3]);
        const utc = Date.UTC(year, month - 1, day);
        const epoch = Date.UTC(1899, 11, 30);
        return Math.round((utc - epoch) / 86400000);
    };

    // Explicitly format AI (Detalle: Cantidad) as 0.00 and date columns (E, J, AM) as native Excel dates (dd/mm/yyyy)
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:AR1');
    const dateColIndices = [4, 9, 38]; // Encab: Fecha, Encab: Fecha Entrega, Detalle: Vencimiento
    for (let R = 1; R <= range.e.r; ++R) {
        const aiAddr = XLSX.utils.encode_cell({ r: R, c: 34 });
        if (worksheet[aiAddr] && worksheet[aiAddr].t === 'n') {
            worksheet[aiAddr].z = '0.00';
        }
        for (const cIdx of dateColIndices) {
            const addr = XLSX.utils.encode_cell({ r: R, c: cIdx });
            const cell = worksheet[addr];
            if (cell && typeof cell.v === 'string') {
                const serial = ddmmyyyyToExcelSerial(cell.v);
                if (serial !== null) {
                    worksheet[addr] = { t: 'n', v: serial, z: 'dd/mm/yyyy' };
                }
            }
        }
    }

    // Set auto-fit column widths
    const colWidths = WORLD_OFFICE_44_COLUMNS.map(col => ({
        wch: Math.max(col.length + 2, 14)
    }));
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, WORLD_OFFICE_SHEET_NAME);

    const cleanDate = getBogotaDateString();
    const hasDateInPrefix = /\d{4}-\d{2}-\d{2}/.test(fileNamePrefix);
    const fullFileName = hasDateInPrefix
        ? `${fileNamePrefix}.xls`
        : `${fileNamePrefix}_${cleanDate}.xls`;

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        const wbout = XLSX.write(workbook, { bookType: 'biff8', type: 'array' });
        const blob = new Blob([wbout], {
            type: 'application/vnd.ms-excel'
        });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fullFileName;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => window.URL.revokeObjectURL(url), 1500);
    } else {
        XLSX.writeFile(workbook, fullFileName, { bookType: 'biff8' });
    }
}


/**
 * Reporte Operativo Diario de Novedades para Radicación de Notas Crédito en World Office
 * Solicitud de Gemba: Cliente, Sucursal, Producto, Cantidad, Valor + Trazabilidad
 */
export interface CreditNoteReportItem {
    date: string;
    clientMatriz: string;
    sucursal: string;
    productName: string;
    quantity: number;
    unitOfMeasure: string;
    amount: number;
    invoiceRef: string;
    creditNoteFolio: string;
    pqrFolio?: string;
    reason: string;
    orderSequence?: number | string;
    status?: string;
}

export async function downloadCreditNotesExcel(
    items: CreditNoteReportItem[],
    selectedDate?: string
): Promise<void> {
    const XLSX = await import('xlsx');

    const formattedRows = items.map(item => ({
        'FECHA': item.date || '',
        'PEDIDO #': item.orderSequence ? `#${item.orderSequence}` : '',
        'CLIENTE (MATRIZ)': item.clientMatriz || 'Consumidor Final',
        'SUCURSAL (SEDE)': item.sucursal || 'Principal',
        'PRODUCTO': item.productName || 'Producto Agrícola',
        'CANTIDAD': item.quantity || 0,
        'UNIDAD': item.unitOfMeasure || 'Kg',
        'VALOR NOTA CRÉDITO ($ COP)': Math.round(item.amount || 0),
        'FACTURA AFECTADA': item.invoiceRef || '',
        'CONSECUTIVO NC WO': item.creditNoteFolio || '',
        'ESTADO': item.status === 'approved' ? 'Aprobada' : 'Pendiente',
        'FOLIO PQR': item.pqrFolio || '',
        'MOTIVO / JUSTIFICACIÓN': item.reason || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(formattedRows);

    // Auto-fit column widths
    worksheet['!cols'] = [
        { wch: 12 }, // FECHA
        { wch: 11 }, // PEDIDO #
        { wch: 32 }, // CLIENTE (MATRIZ)
        { wch: 35 }, // SUCURSAL (SEDE)
        { wch: 28 }, // PRODUCTO
        { wch: 10 }, // CANTIDAD
        { wch: 10 }, // UNIDAD
        { wch: 20 }, // VALOR NOTA CRÉDITO ($ COP)
        { wch: 18 }, // FACTURA AFECTADA
        { wch: 18 }, // CONSECUTIVO NC WO
        { wch: 12 }, // ESTADO
        { wch: 15 }, // FOLIO PQR
        { wch: 45 }  // MOTIVO / JUSTIFICACIÓN
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Novedades NC WO');

    const dateStr = selectedDate && selectedDate !== 'all'
        ? selectedDate
        : getBogotaDateString();
    const fullFileName = `Novedades_Notas_Credito_WorldOffice_${dateStr}.xlsx`;

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fullFileName;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => window.URL.revokeObjectURL(url), 1500);
    } else {
        XLSX.writeFile(workbook, fullFileName);
    }
}
