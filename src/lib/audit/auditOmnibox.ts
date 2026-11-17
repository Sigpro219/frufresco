/**
 * Motor Omnibox Bilingüe y Ejecutor Híbrido para Auditoría Forense (90 días / ~20k eventos).
 * Soporta tokens AND (espacios), grupos OR (comas), prefijos #ID, etiquetas @modulo/@accion,
 * normalización NFD (sin tildes), seseo (z<->s, ce/ci->se/si) y optimización anti-TOAST en SETTINGS.
 */

export type AuditModuleFilter =
    | 'all'
    | 'ORDERS'
    | 'PRODUCTS'
    | 'CLIENTS'
    | 'COMMERCIAL'
    | 'SETTINGS'
    | 'SECURITY'
    | 'GOVERNANCE';

export interface ParsedAuditQuery {
    raw: string;
    orGroups: string[][];
    moduleTag: AuditModuleFilter | null;
    actionTag: string | null;
    wantsSettingsOrSystem: boolean;
    hasActiveFilter: boolean;
}

export function normalizeAuditText(val: unknown): string {
    if (val === null || val === undefined) return '';
    return String(val)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

export function toSeseo(norm: string): string {
    return norm
        .replace(/z/g, 's')
        .replace(/c([ei])/g, 's$1');
}

const TAG_TO_MODULE: Record<string, AuditModuleFilter> = {
    '@pedidos': 'ORDERS',
    '@pedido': 'ORDERS',
    '@orders': 'ORDERS',
    '@order': 'ORDERS',
    '@productos': 'PRODUCTS',
    '@producto': 'PRODUCTS',
    '@products': 'PRODUCTS',
    '@clientes': 'CLIENTS',
    '@cliente': 'CLIENTS',
    '@clients': 'CLIENTS',
    '@comercial': 'COMMERCIAL',
    '@costos': 'COMMERCIAL',
    '@precios': 'COMMERCIAL',
    '@commercial': 'COMMERCIAL',
    '@configuracion': 'SETTINGS',
    '@config': 'SETTINGS',
    '@settings': 'SETTINGS',
    '@seguridad': 'SECURITY',
    '@security': 'SECURITY',
    '@gobernanza': 'GOVERNANCE',
    '@governance': 'GOVERNANCE',
};

const TAG_TO_ACTION: Record<string, string> = {
    '@crear': 'create',
    '@creado': 'create',
    '@nuevo': 'create',
    '@modificar': 'update',
    '@editar': 'update',
    '@actualizar': 'update',
    '@eliminar': 'delete',
    '@borrar': 'delete',
    '@login': 'login',
    '@ingreso': 'login',
    '@logout': 'logout',
    '@salida': 'logout',
};

// Mapea términos en español/inglés a valores reales de `audit_logs` y `details`
const BILINGUAL_ALIASES: Record<string, string[]> = {
    pedidos: ['orders', 'order'],
    pedido: ['orders', 'order'],
    productos: ['products', 'product'],
    producto: ['products', 'product'],
    catalogo: ['products'],
    clientes: ['profiles', 'client', 'cliente', 'company_name'],
    cliente: ['profiles', 'client', 'company_name'],
    comercial: ['commercial', 'cost_matrix', 'pricing'],
    costos: ['cost_matrix', 'commercial', 'base_cost'],
    costo: ['cost_matrix', 'base_cost'],
    margen: ['margin', 'commercial'],
    precio: ['price', 'pricing'],
    precios: ['price', 'pricing'],
    configuracion: ['settings', 'app_settings'],
    seguridad: ['security', 'login', 'logout', 'permission'],
    gobernanza: ['work_cells_governance', 'system_roles', 'app_settings'],
    celula: ['work_cells_governance', 'work_cell'],
    celulas: ['work_cells_governance'],
    sistema: ['system', 'hostinger_imap_sync_state'],
    crear: ['insert_'],
    creado: ['insert_'],
    modificar: ['update_'],
    modificado: ['update_'],
    editar: ['update_'],
    actualizar: ['update_'],
    eliminar: ['delete_'],
    eliminado: ['delete_'],
    ingreso: ['login', 'user_login'],
    salida: ['logout', 'user_logout'],
    pendiente: ['pending', 'pending_approval'],
    aprobado: ['approved'],
    borrador: ['draft'],
    alistando: ['picking', 'in_preparation'],
    en_ruta: ['shipped', 'in_transit', 'dispatched'],
    despachado: ['shipped', 'dispatched'],
    entregado: ['delivered'],
    cancelado: ['cancelled'],
    facturado: ['invoiced'],
    bodega: ['warehouse_spaces', 'staging'],
    espacios: ['warehouse_spaces'],
    espacio: ['warehouse_spaces'],
    entrega: ['delivery_date'],
    fecha: ['delivery_date', 'created_at'],
    notas: ['admin_notes', 'notes'],
    nota: ['admin_notes', 'notes'],
    peso: ['total_weight_kg'],
    total: ['total', 'subtotal'],
    nit: ['billing_nit', 'nit'],
    razon: ['billing_razon_social', 'company_name'],
    empresa: ['company_name', 'billing_razon_social'],
    contacto: ['contact_name', 'contact_phone'],
    telefono: ['contact_phone', 'phone'],
    direccion: ['shipping_address', 'address'],
    correo: ['email'],
    email: ['email'],
    rol: ['role', 'system_roles'],
    activo: ['is_active'],
    estado: ['status'],
    orden: ['sequence_id', 'orders'],
    consecutivo: ['sequence_id'],
    factura: ['invoice', 'billing'],
    canastillas: ['warehouse_crate_stock', 'crate'],
};

const SYSTEM_HINT_TOKENS = new Set([
    'sistema',
    'system',
    'direct',
    'hostinger',
    'imap',
    'sync',
    'cron',
    'settings',
    'configuracion',
    'config',
    'gobernanza',
    'work_cells_governance',
    'system_roles',
    'app_settings',
]);

// Campos JSONB en `details->changes` susceptibles de búsqueda directa por llave
const CHANGE_KEYS_ALLOWLIST = new Set([
    'warehouse_spaces',
    'status',
    'total',
    'subtotal',
    'delivery_date',
    'admin_notes',
    'total_weight_kg',
    'price',
    'base_cost',
    'name',
    'display_name',
    'is_active',
    'role',
    'accounting_id',
    'sku',
    'billing_nit',
    'billing_razon_social',
    'company_name',
    'contact_name',
    'shipping_address',
    'delivery_slot',
    'payment_method',
    'work_cells_governance',
    'system_roles',
]);

export function parseAuditSearchQuery(rawQuery: string): ParsedAuditQuery {
    const raw = rawQuery || '';
    const trimmed = raw.trim();
    if (!trimmed) {
        return {
            raw,
            orGroups: [],
            moduleTag: null,
            actionTag: null,
            wantsSettingsOrSystem: false,
            hasActiveFilter: false,
        };
    }

    let moduleTag: AuditModuleFilter | null = null;
    let actionTag: string | null = null;
    let wantsSettingsOrSystem = false;

    const commaSegments = trimmed
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

    const orGroups: string[][] = [];

    for (const seg of commaSegments) {
        const tokens = seg
            .split(/\s+/)
            .map((t) => t.trim())
            .filter(Boolean);

        const groupTokens: string[] = [];
        for (const tok of tokens) {
            const norm = normalizeAuditText(tok);
            if (TAG_TO_MODULE[norm]) {
                moduleTag = TAG_TO_MODULE[norm];
                if (moduleTag === 'SETTINGS' || moduleTag === 'GOVERNANCE') {
                    wantsSettingsOrSystem = true;
                }
                continue;
            }
            if (TAG_TO_ACTION[norm]) {
                actionTag = TAG_TO_ACTION[norm];
                continue;
            }
            const bareNorm = norm.startsWith('#') ? norm.slice(1) : norm;
            if (SYSTEM_HINT_TOKENS.has(bareNorm)) {
                wantsSettingsOrSystem = true;
            }
            groupTokens.push(tok);
        }

        if (groupTokens.length > 0) {
            orGroups.push(groupTokens);
        }
    }

    return {
        raw,
        orGroups,
        moduleTag,
        actionTag,
        wantsSettingsOrSystem,
        hasActiveFilter: orGroups.length > 0 || moduleTag !== null || actionTag !== null,
    };
}

function sanitizePostgrestValue(val: string): string {
    return val
        .replace(/[(),]/g, ' ')
        .replace(/[%_]/g, '\\$&')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Construye una cláusula `.or(...)` segura para PostgREST buscando un token en columnas
 * principales + atributos clave dentro del JSONB `details` y cambios en `details->changes`.
 */
export function buildAuditOrClause(rawToken: string): string {
    const stripped = rawToken.startsWith('#') ? rawToken.slice(1) : rawToken;
    const norm = normalizeAuditText(stripped);
    const cleanRaw = sanitizePostgrestValue(stripped);
    const cleanNorm = sanitizePostgrestValue(norm);

    const searchVariants = new Set<string>();
    if (cleanRaw) searchVariants.add(cleanRaw);
    if (cleanNorm && cleanNorm !== cleanRaw.toLowerCase()) searchVariants.add(cleanNorm);

    const rawVariantsForKeys = new Set<string>([norm]);
    const aliases = BILINGUAL_ALIASES[norm] || [];
    for (const alias of aliases) {
        rawVariantsForKeys.add(alias.toLowerCase());
        const cleanAlias = sanitizePostgrestValue(alias);
        if (cleanAlias) searchVariants.add(cleanAlias);
    }

    const clauses: string[] = [];
    const textCols = [
        'collaborator_name',
        'action',
        'module',
        'details->>sequence_id',
        'details->>accounting_id',
        'details->>sku',
        'details->>id',
        'details->>name',
        'details->>display_name',
        'details->>product_name',
        'details->>company_name',
        'details->>contact_name',
        'details->>client_name',
        'details->>status',
        'details->>key',
        'details->>file_name',
        'details->>email',
        'details->>role',
        'details->>billing_nit',
        'details->>billing_razon_social',
    ];

    for (const variant of searchVariants) {
        const pattern = `%${variant}%`;
        for (const col of textCols) {
            clauses.push(`${col}.ilike.${pattern}`);
        }
    }

    for (const rawCandidate of rawVariantsForKeys) {
        const keyCandidate = rawCandidate.replace(/\s+/g, '_');
        if (/^[a-z0-9_]+$/.test(keyCandidate) && CHANGE_KEYS_ALLOWLIST.has(keyCandidate)) {
            clauses.push(`details->changes->>${keyCandidate}.not.is.null`);
        }
    }

    return clauses.join(',');
}

/**
 * Elige el token más selectivo de un grupo AND para fallback rápido en Supabase
 * cuando una búsqueda multi-token apunta en parte a valores anidados en `details.changes`.
 */
export function pickPrimaryToken(tokens: string[]): string | null {
    if (tokens.length === 0) return null;
    const scored = tokens.map((tok) => {
        const bare = tok.startsWith('#') ? tok.slice(1) : tok;
        let score = bare.length;
        if (tok.startsWith('#')) score += 100;
        if (/^\d+$/.test(bare)) score += 80;
        if (/[_-]/.test(bare)) score += 30;
        if (BILINGUAL_ALIASES[normalizeAuditText(bare)]) score -= 10;
        return { tok, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0].tok;
}

/**
 * Recolecta todo el texto indexable en memoria de un registro de auditoría,
 * incluyendo `details`, llaves/valores de `changes` y cadenas traducidas opcionales.
 */
export function buildLogSearchableText(log: any, extraTexts: string[] = []): string {
    const parts: string[] = [
        String(log?.collaborator_name || ''),
        String(log?.action || ''),
        String(log?.module || ''),
        ...extraTexts,
    ];

    const d = log?.details;
    if (d && typeof d === 'object') {
        for (const [k, v] of Object.entries(d)) {
            if (k === 'changes' && v && typeof v === 'object') {
                for (const [ck, cv] of Object.entries(v as Record<string, any>)) {
                    parts.push(ck);
                    if (cv && typeof cv === 'object' && ('old' in cv || 'new' in cv)) {
                        const oldStr = typeof cv.old === 'string' ? cv.old : JSON.stringify(cv.old ?? '');
                        const newStr = typeof cv.new === 'string' ? cv.new : JSON.stringify(cv.new ?? '');
                        if (oldStr.length < 500) parts.push(oldStr);
                        if (newStr.length < 500) parts.push(newStr);
                    } else {
                        const valStr = typeof cv === 'string' ? cv : JSON.stringify(cv ?? '');
                        if (valStr.length < 500) parts.push(valStr);
                    }
                }
            } else if (v !== null && v !== undefined) {
                const str = typeof v === 'string' ? v : JSON.stringify(v);
                if (str.length < 500) parts.push(`${k} ${str}`);
            }
        }
    }

    return parts.join(' ');
}

function matchesSingleToken(haystackNorm: string, haystackSeseo: string, rawToken: string): boolean {
    const isHashId = rawToken.startsWith('#');
    const bare = isHashId ? rawToken.slice(1) : rawToken;
    const norm = normalizeAuditText(bare);
    if (!norm) return true;
    const seseo = toSeseo(norm);

    if (haystackNorm.includes(norm) || haystackSeseo.includes(seseo)) {
        return true;
    }

    if (!isHashId) {
        const aliases = BILINGUAL_ALIASES[norm] || [];
        for (const alias of aliases) {
            const aliasNorm = normalizeAuditText(alias);
            if (haystackNorm.includes(aliasNorm) || haystackSeseo.includes(toSeseo(aliasNorm))) {
                return true;
            }
        }
    }

    return false;
}

export function matchesAuditModuleFilter(log: any, moduleFilter: AuditModuleFilter): boolean {
    if (!moduleFilter || moduleFilter === 'all') return true;
    if (moduleFilter === 'GOVERNANCE') {
        const k = String(log?.details?.key || '').toLowerCase();
        return k === 'work_cells_governance' || k === 'system_roles';
    }
    if (moduleFilter === 'CLIENTS') {
        const role = String(log?.details?.role || '');
        return (
            log?.module === 'CLIENTS' ||
            (String(log?.action || '').endsWith('_profiles') &&
                (role.includes('client') || Boolean(log?.details?.company_name)))
        );
    }
    if (moduleFilter === 'COMMERCIAL') {
        return log?.module === 'COMMERCIAL' || log?.module === 'COST_MATRIX';
    }
    return log?.module === moduleFilter;
}

/**
 * Evalúa si un evento de auditoría satisface la consulta Omnibox completa
 * (etiquetas @modulo/@accion + grupos OR separados por coma + tokens AND por espacio).
 */
export function matchesAuditOmnibox(
    log: any,
    parsed: ParsedAuditQuery,
    extraTexts: string[] = [],
): boolean {
    if (!parsed.hasActiveFilter) return true;

    if (parsed.moduleTag && !matchesAuditModuleFilter(log, parsed.moduleTag)) {
        return false;
    }

    if (parsed.actionTag) {
        const act = String(log?.action || '').toUpperCase();
        if (parsed.actionTag === 'create' && !act.startsWith('INSERT_')) return false;
        if (parsed.actionTag === 'update' && !act.startsWith('UPDATE_')) return false;
        if (parsed.actionTag === 'delete' && !act.startsWith('DELETE_')) return false;
        if (parsed.actionTag === 'login' && act !== 'LOGIN' && act !== 'USER_LOGIN') return false;
        if (parsed.actionTag === 'logout' && act !== 'LOGOUT' && act !== 'USER_LOGOUT') return false;
    }

    if (parsed.orGroups.length === 0) return true;

    const rawHaystack = buildLogSearchableText(log, extraTexts);
    const haystackNorm = normalizeAuditText(rawHaystack);
    const haystackSeseo = toSeseo(haystackNorm);

    return parsed.orGroups.some((andTokens) =>
        andTokens.every((tok) => matchesSingleToken(haystackNorm, haystackSeseo, tok)),
    );
}

export interface FetchAuditLogsParams {
    supabase: any;
    rawQuery: string;
    moduleFilter: AuditModuleFilter;
    dateRange: string;
    actionType: string;
    limit?: number;
    beforeCreatedAt?: string | null;
    excludeIds?: Set<string>;
    selectColumns?: string;
    getExtraTexts?: (log: any) => string[];
}

export interface FetchAuditLogsResult {
    logs: any[];
    hasMore: boolean;
    parsed: ParsedAuditQuery;
}

/**
 * Ejecuta consultas híbridas optimizadas sobre los 90 días de `audit_logs` (~20k filas):
 * - Aísla las filas pesadas de `System / DB Direct` en `SETTINGS` para bajar búsquedas de ~6.9s a ~400ms.
 * - Soporta grupos OR (comas), tokens AND (espacios) y rescate automático si algún término vive
 *   solo dentro de `details.changes` anidado.
 */
export async function fetchAuditLogsSmart(params: FetchAuditLogsParams): Promise<FetchAuditLogsResult> {
    const {
        supabase,
        rawQuery,
        moduleFilter,
        dateRange,
        actionType,
        limit = 50,
        beforeCreatedAt = null,
        excludeIds,
        selectColumns = '*',
        getExtraTexts,
    } = params;

    const parsed = parseAuditSearchQuery(rawQuery);
    const effectiveModule: AuditModuleFilter = parsed.moduleTag || moduleFilter || 'all';
    const effectiveAction = parsed.actionTag || actionType || 'all';

    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - 90);
    const minIso = limitDate.toISOString();

    let rangeIso = minIso;
    if (dateRange === 'today') {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        rangeIso = start.toISOString() > minIso ? start.toISOString() : minIso;
    } else if (dateRange === 'week') {
        const start = new Date();
        start.setDate(start.getDate() - 7);
        rangeIso = start.toISOString() > minIso ? start.toISOString() : minIso;
    } else if (dateRange === 'month') {
        const start = new Date();
        start.setDate(start.getDate() - 30);
        rangeIso = start.toISOString() > minIso ? start.toISOString() : minIso;
    }

    const buildBaseQuery = () => {
        let q = supabase
            .from('audit_logs')
            .select(selectColumns)
            .gte('created_at', rangeIso);

        if (beforeCreatedAt) {
            q = q.lte('created_at', beforeCreatedAt);
        }

        if (effectiveAction === 'create') {
            q = q.like('action', 'INSERT_%');
        } else if (effectiveAction === 'update') {
            q = q.like('action', 'UPDATE_%');
        } else if (effectiveAction === 'delete') {
            q = q.like('action', 'DELETE_%');
        } else if (effectiveAction === 'login') {
            q = q.or('action.eq.LOGIN,action.eq.USER_LOGIN');
        } else if (effectiveAction === 'logout') {
            q = q.or('action.eq.LOGOUT,action.eq.USER_LOGOUT');
        } else if (effectiveAction === 'security') {
            q = q.or(
                'module.eq.SECURITY,action.ilike.%SECURITY%,action.ilike.%LOGIN%,action.ilike.%LOGOUT%,action.ilike.%REGENERATE%,action.ilike.%PERMISSION%',
            );
        }

        return q;
    };

    const applyModuleConstraint = (q: any, sliceMode: 'normal' | 'non_settings' | 'human_settings') => {
        if (sliceMode === 'non_settings') {
            return q.neq('module', 'SETTINGS');
        }
        if (sliceMode === 'human_settings') {
            return q.eq('module', 'SETTINGS').neq('collaborator_name', 'System / DB Direct');
        }
        if (effectiveModule === 'GOVERNANCE') {
            return q
                .eq('module', 'SETTINGS')
                .or('details->>key.eq.work_cells_governance,details->>key.eq.system_roles');
        }
        if (effectiveModule === 'CLIENTS') {
            return q.or('module.eq.CLIENTS,action.ilike.%_profiles');
        }
        if (effectiveModule === 'COMMERCIAL') {
            return q.in('module', ['COMMERCIAL', 'COST_MATRIX']);
        }
        if (effectiveModule === 'SETTINGS') {
            if (parsed.orGroups.length > 0 && !parsed.wantsSettingsOrSystem) {
                return q.eq('module', 'SETTINGS').neq('collaborator_name', 'System / DB Direct');
            }
            return q.eq('module', 'SETTINGS');
        }
        if (effectiveModule !== 'all') {
            return q.eq('module', effectiveModule);
        }
        return q;
    };

    const runGroup = async (andTokens: string[], sqlLimit: number): Promise<{ rows: any[]; hitLimit: boolean }> => {
        const useDualSplit =
            effectiveModule === 'all' && andTokens.length > 0 && !parsed.wantsSettingsOrSystem;

        const attachTokens = (q: any) => {
            let cur = q;
            for (const tok of andTokens) {
                const orClause = buildAuditOrClause(tok);
                if (orClause) cur = cur.or(orClause);
            }
            return cur;
        };

        if (useDualSplit) {
            const qOther = attachTokens(applyModuleConstraint(buildBaseQuery(), 'non_settings'))
                .order('created_at', { ascending: false })
                .limit(sqlLimit);
            const qHumanSettings = attachTokens(applyModuleConstraint(buildBaseQuery(), 'human_settings'))
                .order('created_at', { ascending: false })
                .limit(Math.min(sqlLimit, 80));

            const [resOther, resSettings] = await Promise.all([qOther, qHumanSettings]);
            if (resOther.error) throw resOther.error;
            if (resSettings.error) throw resSettings.error;
            const rowsA = resOther.data || [];
            const rowsB = resSettings.data || [];
            return {
                rows: [...rowsA, ...rowsB],
                hitLimit: rowsA.length >= sqlLimit || rowsB.length >= Math.min(sqlLimit, 80),
            };
        }

        let q = applyModuleConstraint(buildBaseQuery(), 'normal');
        q = attachTokens(q);
        const { data, error } = await q.order('created_at', { ascending: false }).limit(sqlLimit);
        if (error) throw error;
        const rows = data || [];
        return { rows, hitLimit: rows.length >= sqlLimit };
    };

    const needsClientPostFilter =
        parsed.orGroups.length > 0 ||
        parsed.moduleTag !== null ||
        parsed.actionTag !== null ||
        effectiveModule === 'CLIENTS';

    const sqlLimit = needsClientPostFilter ? Math.max(limit * 3, 150) : limit + 1;

    const groupsToRun = parsed.orGroups.length > 0 ? parsed.orGroups.slice(0, 4) : [[]];
    const groupResults = await Promise.all(groupsToRun.map((grp) => runGroup(grp, sqlLimit)));

    let rawRows = groupResults.flatMap((r) => r.rows);
    let anyHitLimit = groupResults.some((r) => r.hitLimit);

    // Rescate automático si búsqueda multi-token AND devolvió 0 en primera pasada por valor anidado
    if (!beforeCreatedAt && parsed.orGroups.length > 0) {
        const multiTokenGroups = parsed.orGroups.filter((g) => g.length > 1);
        const candidateMatches = rawRows.filter((row) =>
            matchesAuditOmnibox(row, parsed, getExtraTexts ? getExtraTexts(row) : []),
        );
        if (candidateMatches.length === 0 && multiTokenGroups.length > 0) {
            const rescuePromises = multiTokenGroups.slice(0, 2).map((grp) => {
                const primary = pickPrimaryToken(grp);
                return primary ? runGroup([primary], 200) : Promise.resolve({ rows: [], hitLimit: false });
            });
            const rescueResults = await Promise.all(rescuePromises);
            rawRows = [...rawRows, ...rescueResults.flatMap((r) => r.rows)];
            anyHitLimit = anyHitLimit || rescueResults.some((r) => r.hitLimit);
        }
    }

    // Deduplicación, filtrado exacto Omnibox y ordenamiento cronológico descendente
    const uniqueMap = new Map<string, any>();
    for (const row of rawRows) {
        if (!row?.id) continue;
        if (excludeIds && excludeIds.has(row.id)) continue;
        if (!matchesAuditModuleFilter(row, effectiveModule)) continue;
        if (
            parsed.hasActiveFilter &&
            !matchesAuditOmnibox(row, parsed, getExtraTexts ? getExtraTexts(row) : [])
        ) {
            continue;
        }
        uniqueMap.set(row.id, row);
    }

    const sorted = Array.from(uniqueMap.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    const hasMore = sorted.length > limit || anyHitLimit;
    return {
        logs: sorted.slice(0, limit),
        hasMore,
        parsed,
    };
}
