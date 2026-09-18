'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { 
    ArrowLeft, 
    Download, 
    ShieldAlert, 
    AlertTriangle, 
    Search, 
    Calendar, 
    User, 
    Settings, 
    Loader2, 
    RefreshCw, 
    Eye, 
    Users, 
    CheckCircle2, 
    Sprout, 
    Carrot, 
    Apple, 
    Boxes, 
    Layers, 
    Wheat, 
    Milk, 
    Beef, 
    Package, 
    Copy, 
    Check, 
    FileSpreadsheet 
} from 'lucide-react';
import { THEME } from '@/lib/adminTheme';
import { supabase } from '@/lib/supabase';
import { useAuth, checkUserPermission } from '@/lib/authContext';
import * as XLSX from 'xlsx';

const translateTableName = (table: string) => {
    if (table === 'products') return 'Productos';
    if (table === 'profiles') return 'Perfiles / Usuarios';
    if (table === 'orders') return 'Pedidos';
    if (table === 'app_settings') return 'Configuración';
    return table;
};

const translateRole = (role: string) => {
    if (!role) return '-';
    const r = role.toLowerCase();
    if (r === 'admin') return 'Administrador';
    if (r === 'sys_admin') return 'Administrador de Sistema';
    if (r === 'buyer') return 'Comprador';
    if (r === 'driver') return 'Conductor / Transportador';
    if (r === 'picker') return 'Alistador / Picking';
    if (r === 'sales') return 'Ventas';
    if (r === 'client') return 'Cliente';
    return role;
};

const translateStatus = (status: string) => {
    if (!status) return '-';
    const s = status.toLowerCase();
    if (s === 'draft') return 'Borrador';
    if (s === 'pending') return 'Pendiente';
    if (s === 'picking') return 'Alistando / En Preparación';
    if (s === 'ready') return 'Listo / Despachado';
    if (s === 'delivered') return 'Entregado';
    if (s === 'cancelled') return 'Cancelado';
    return status;
};

const translateDetailsKey = (key: string) => {
    if (!key) return '';
    const k = key.toLowerCase();
    if (k === 'work_cells_governance') return 'Gobernanza de Células de Trabajo';
    if (k === 'system_roles') return 'Roles y Permisos del Sistema';
    if (k === 'ai_product_aliases') return 'Sinónimos IA';
    if (k === 'out_of_bounds_requests') return 'Solicitudes Fuera de Horario';
    if (k === 'scarcity_locked_skus') return 'SKUs Bloqueados por Escasez';
    if (k === 'warehouse_crate_stock') return 'Stock de Canastillas';
    if (k === 'sku') return 'Código (SKU)';
    if (k === 'name') return 'Nombre';
    if (k === 'role') return 'Rol / Permiso';
    if (k === 'company_name') return 'Nombre de Empresa';
    if (k === 'contact_name') return 'Nombre de Contacto';
    if (k === 'key') return 'Parámetro / Clave';
    if (k === 'value') return 'Valor';
    if (k === 'id') return 'ID';
    if (k === 'sequence_id') return 'Consecutivo de Pedido';
    if (k === 'total' || k === 'total_price') return 'Precio Total';
    if (k === 'status') return 'Estado';
    if (k === 'base_price') return 'Precio Base';
    if (k === 'is_active') return '¿Activo?';
    if (k === 'description') return 'Descripción';
    if (k === 'category') return 'Categoría';
    if (k === 'unit_of_measure') return 'Unidad de Medida';
    if (k === 'image_url') return 'URL de Imagen';
    if (k === 'manual_cost' || k === 'cost' || k === 'costo') return 'Costo Manual';
    if (k === 'smart_cost') return 'Costo Sugerido IA';
    if (k === 'accounting_id') return 'ID Contable';
    if (k === 'source') return 'Origen';
    if (k === 'file_name') return 'Archivo Excel';
    if (k === 'carga_masiva') return 'Carga Masiva';
    if (k === 'autorizacion_masiva') return 'Autorización Masiva';
    return key;
};

const formatDetailsValue = (key: string, value: any) => {
    if (value === undefined || value === null) return '-';
    const k = key.toLowerCase();
    if (k === 'role') return translateRole(String(value));
    if (k === 'status') return translateStatus(String(value));
    if (k === 'total' || k === 'total_price') return `$${Number(value).toLocaleString('es-CO')}`;
    
    // Check structured objects or arrays
    if (typeof value === 'object') {
        if (Array.isArray(value)) return `[${value.length} elementos estructurados]`;
        return `{${Object.keys(value).length} propiedades estructuradas}`;
    }

    // Check stringified JSON
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) return `[${parsed.length} elementos configurados]`;
                return `{${Object.keys(parsed).length} propiedades configuradas}`;
            } catch (e) {}
        }
        if (trimmed.length > 70) {
            return trimmed.substring(0, 67) + '...';
        }
        return trimmed;
    }

    return String(value);
};

export interface GovernanceAnalysis {
    isGovernance: boolean;
    cellCount: number;
    added: string[];
    removed: string[];
    leaderChanges: { cell: string; oldL: string; newL: string }[];
    descChange: boolean;
    oldDesc?: string;
    newDesc?: string;
    newCells: any[];
}

export const analyzeGovernanceChanges = (d: any): GovernanceAnalysis => {
    if (!d || (d.key !== 'work_cells_governance' && !d.work_cells_governance)) {
        return { isGovernance: false, cellCount: 0, added: [], removed: [], leaderChanges: [], descChange: false, newCells: [] };
    }
    let oldCells: any[] = [];
    let newCells: any[] = [];
    try {
        const rawOld = d.changes?.value?.old;
        if (typeof rawOld === 'string') oldCells = JSON.parse(rawOld);
        else if (Array.isArray(rawOld)) oldCells = rawOld;
    } catch(e) {}

    try {
        const rawNew = d.changes?.value?.new || d.value;
        if (typeof rawNew === 'string') newCells = JSON.parse(rawNew);
        else if (Array.isArray(rawNew)) newCells = rawNew;
    } catch(e) {}

    const added = newCells.filter(nc => !oldCells.some(oc => oc.id === nc.id)).map(c => c.name || c.short_name || c.id);
    const removed = oldCells.filter(oc => !newCells.some(nc => nc.id === oc.id)).map(c => c.name || c.short_name || c.id);
    const leaderChanges: { cell: string; oldL: string; newL: string }[] = [];
    newCells.forEach(nc => {
        const oc = oldCells.find(o => o.id === nc.id);
        if (oc && (nc.leader_id !== oc.leader_id || nc.leader_name !== oc.leader_name)) {
            leaderChanges.push({ 
                cell: nc.name || nc.short_name || nc.id, 
                oldL: oc.leader_name || 'Sin asignar', 
                newL: nc.leader_name || 'Sin asignar' 
            });
        }
    });

    const descChange = !!d.changes?.description;
    const oldDesc = d.changes?.description?.old;
    const newDesc = d.changes?.description?.new || d.description;

    return {
        isGovernance: true,
        cellCount: newCells.length || oldCells.length,
        added,
        removed,
        leaderChanges,
        descChange,
        oldDesc,
        newDesc,
        newCells
    };
};

const renderGovernanceLucideIcon = (iconKey?: string, size = 18) => {
    const key = (iconKey || '').toLowerCase().trim();
    if (key === 'sprout' || key.includes('hortaliza')) return <Sprout size={size} />;
    if (key === 'carrot' || key.includes('verdura')) return <Carrot size={size} />;
    if (key === 'apple' || key.includes('fruta') || key.includes('mora') || key.includes('fresa')) return <Apple size={size} />;
    if (key === 'boxes' || key.includes('abarrote')) return <Boxes size={size} />;
    if (key === 'layers' || key.includes('papa') || key.includes('tubérculo') || key.includes('tomate') || key.includes('aguacate')) return <Layers size={size} />;
    if (key === 'wheat' || key.includes('grano')) return <Wheat size={size} />;
    if (key === 'milk' || key.includes('lácteo')) return <Milk size={size} />;
    if (key === 'beef' || key.includes('carne')) return <Beef size={size} />;
    return <Package size={size} />;
};

const formatActionName = (log: any) => {
    if (!log) return '-';
    const action = typeof log === 'string' ? log : log.action;
    if (!action) return '-';
    
    if (typeof log === 'object' && log.details?.key === 'work_cells_governance') {
        const gov = analyzeGovernanceChanges(log.details);
        if (gov.added.length > 0) return 'CREAR Célula de Trabajo';
        if (gov.leaderChanges.length > 0) return 'REASIGNAR Líder de Célula';
        return 'ACTUALIZAR Gobernanza de Células';
    }

    if (action === 'LOGIN' || action === 'USER_LOGIN') return 'INGRESO AL SISTEMA';
    if (action === 'LOGOUT' || action === 'USER_LOGOUT') return 'SALIDA DEL SISTEMA';

    // Check if it's a profile/user action but targeting a client
    if (typeof log === 'object' && action.endsWith('_profiles') && log.details) {
        const role = log.details.role || '';
        const isClient = role.includes('client') || log.details.company_name;
        
        if (isClient) {
            const op = action.startsWith('INSERT_') ? 'CREAR' : action.startsWith('UPDATE_') ? 'MODIFICAR' : 'ELIMINAR';
            return `${op} Cliente B2B`;
        }
    }
    
    if (action.startsWith('INSERT_')) {
        return 'CREAR ' + translateTableName(action.replace('INSERT_', ''));
    }
    if (action.startsWith('UPDATE_')) {
        return 'MODIFICAR ' + translateTableName(action.replace('UPDATE_', ''));
    }
    if (action.startsWith('DELETE_')) {
        return 'ELIMINAR ' + translateTableName(action.replace('DELETE_', ''));
    }
    if (action === 'BULK_IMPORT_CLIENTS') return 'IMPORTACIÓN MASIVA CLIENTES';
    if (action === 'BULK_IMPORT_COST_MATRIX') return 'CARGA MASIVA MATRIZ DE COSTOS';
    if (action === 'UPDATE_COST_MATRIX') return 'MODIFICAR COSTO COMERCIAL';
    return action;
};

const translateModule = (log: any) => {
    if (!log) return '-';
    const module = typeof log === 'string' ? log : log.module;
    if (!module) return '-';
    
    if (typeof log === 'object' && log.details?.key === 'work_cells_governance') {
        return 'GOBERNANZA OPERATIVA';
    }

    // Check if it's a security/profiles module action but targeting a client
    if (typeof log === 'object' && module === 'SECURITY' && log.details) {
        const role = log.details.role || '';
        const isClient = role.includes('client') || log.details.company_name;
        if (isClient) {
            return 'CLIENTES';
        }
    }
    
    if (module === 'PRODUCTS') return 'PRODUCTOS';
    if (module === 'SECURITY') return 'SEGURIDAD';
    if (module === 'ORDERS') return 'PEDIDOS';
    if (module === 'SETTINGS') return 'CONFIGURACIÓN';
    if (module === 'HR_ADMIN') return 'ADMIN GESTIÓN HUMANA';
    if (module === 'COMMERCIAL' || module === 'COST_MATRIX') return 'MATRIZ DE COSTOS';
    return module;
};

const formatCollaboratorName = (name: string) => {
    if (!name) return 'Sistema / Directo en BD';
    if (name === 'System / DB Direct') return 'Sistema / Directo en BD';
    if (name.startsWith('Authenticated User (')) {
        return name.replace('Authenticated User (', 'Usuario Autenticado (');
    }
    return name;
};

const formatDetailsSummary = (log: any) => {
    if (!log.details) return '-';
    const d = log.details;

    // 1. Detección visual dedicada para Gobernanza de Células
    const gov = analyzeGovernanceChanges(d);
    if (gov.isGovernance) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: '700', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Users size={14} color="#0D7A57" />
                        Gobernanza de Células de Trabajo
                    </span>
                    <span style={{ 
                        fontSize: '0.72rem', 
                        fontWeight: '800', 
                        padding: '1px 8px', 
                        borderRadius: '12px', 
                        backgroundColor: '#DCFCE7', 
                        color: '#15803D' 
                    }}>
                        {gov.cellCount} Células Activas
                    </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', fontSize: '0.78rem' }}>
                    {gov.added.length > 0 && (
                        <span style={{ 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '3px',
                            backgroundColor: '#FEF3C7', 
                            color: '#92400E', 
                            padding: '2px 8px', 
                            borderRadius: '6px', 
                            fontWeight: '700' 
                        }}>
                            + Célula Creada: {gov.added.join(', ')}
                        </span>
                    )}
                    {gov.leaderChanges.length > 0 && (
                        <span style={{ 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '3px',
                            backgroundColor: '#E0F2FE', 
                            color: '#0369A1', 
                            padding: '2px 8px', 
                            borderRadius: '6px', 
                            fontWeight: '700' 
                        }}>
                            Líder Reasignado: {gov.leaderChanges.map(l => `${l.cell} (${l.oldL} → ${l.newL})`).join('; ')}
                        </span>
                    )}
                    {gov.descChange && (
                        <span style={{ color: '#64748B', fontSize: '0.75rem' }}>
                            Descripción actualizada
                        </span>
                    )}
                    {gov.added.length === 0 && gov.leaderChanges.length === 0 && !gov.descChange && (
                        <span style={{ color: '#64748B' }}>
                            Configuración operativa actualizada
                        </span>
                    )}
                </div>
            </div>
        );
    }

    if (log.action === 'BULK_IMPORT_CLIENTS') {
        return `Clientes creados: ${d.parents_created || 0}, Sucursales creadas: ${d.children_created || 0}`;
    }
    if (log.action === 'BULK_IMPORT_COST_MATRIX') {
        return `Archivo: ${d.file_name || 'Excel'} | Productos actualizados: ${d.products_updated || 0}${d.summary ? ` (${d.summary})` : ''}`;
    }
    if (log.action === 'UPDATE_COST_MATRIX') {
        return `Producto: ${d.product_name || d.product_id} | Nuevo Costo: $${Number(d.manual_cost).toLocaleString('es-CO')}`;
    }
    if (log.action === 'LOGIN' || log.action === 'USER_LOGIN') {
        return `Inicio de sesión exitoso${d.email ? ` (${d.email})` : ''}`;
    }
    if (log.action === 'LOGOUT' || log.action === 'USER_LOGOUT') {
        return `Cierre de sesión realizado${d.email ? ` (${d.email})` : ''}`;
    }
    
    let parts: string[] = [];
    if (d.sku) parts.push(`Código (SKU): ${d.sku}`);
    if (d.name) parts.push(`Nombre: ${d.name}`);
    if (d.role) parts.push(`Rol: ${translateRole(d.role)}`);
    if (d.company_name) parts.push(`Empresa: ${d.company_name}`);
    if (d.contact_name) parts.push(`Contacto: ${d.contact_name}`);
    if (d.key) parts.push(`Parámetro: ${translateDetailsKey(d.key)}`);
    if (d.value !== undefined) {
        parts.push(`Valor: ${formatDetailsValue(d.key || 'valor', d.value)}`);
    }
    if (d.sequence_id) parts.push(`Consecutivo Pedido: ${d.sequence_id}`);
    if (d.total_price) parts.push(`Total: $${Number(d.total_price).toLocaleString('es-CO')}`);
    if (d.status) parts.push(`Estado: ${translateStatus(d.status)}`);
    
    const baseInfo = parts.join(' | ');

    if (d.changes && typeof d.changes === 'object' && Object.keys(d.changes).length > 0) {
        const changeKeys = Object.keys(d.changes);
        
        if (changeKeys.length <= 2) {
            const changeParts = Object.entries(d.changes).map(([key, val]: [string, any]) => {
                const translatedKey = translateDetailsKey(key);
                const oldVal = formatDetailsValue(key, val.old);
                const newVal = formatDetailsValue(key, val.new);
                return `${translatedKey}: ${oldVal} → ${newVal}`;
            });
            return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {baseInfo && <div>{baseInfo}</div>}
                    <div style={{ fontSize: '0.8rem', color: '#4F46E5', fontWeight: '600' }}>
                        Cambios: {changeParts.join(', ')}
                    </div>
                </div>
            );
        } else {
            return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {baseInfo && <span>{baseInfo}</span>}
                    <span 
                        style={{ 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            padding: '0.15rem 0.45rem', 
                            borderRadius: '12px', 
                            backgroundColor: '#E0E7FF', 
                            color: '#4338CA', 
                            fontWeight: '700', 
                            fontSize: '0.75rem',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        {changeKeys.length} modificaciones
                    </span>
                </div>
            );
        }
    }
    
    return baseInfo || formatDetailsValue('detalle', d);
};

// Generador de texto plano puro para evitar [object Object] en exportación Excel
const formatDetailsSummaryText = (log: any): string => {
    if (!log.details) return '-';
    const d = log.details;

    const gov = analyzeGovernanceChanges(d);
    if (gov.isGovernance) {
        const parts: string[] = [];
        if (gov.added.length > 0) parts.push(`+ Célula Creada: ${gov.added.join(', ')}`);
        if (gov.leaderChanges.length > 0) parts.push(`Líder Reasignado: ${gov.leaderChanges.map(l => `${l.cell} (${l.oldL} → ${l.newL})`).join('; ')}`);
        if (gov.descChange) parts.push('Descripción actualizada');
        parts.push(`${gov.cellCount} células configuradas`);
        return `Gobernanza de Células: ${parts.join(' | ')}`;
    }

    if (log.action === 'BULK_IMPORT_CLIENTS') {
        return `Clientes creados: ${d.parents_created || 0}, Sucursales creadas: ${d.children_created || 0}`;
    }
    if (log.action === 'BULK_IMPORT_COST_MATRIX') {
        return `Archivo: ${d.file_name || 'Excel'} | Productos actualizados: ${d.products_updated || 0}${d.summary ? ` (${d.summary})` : ''}`;
    }
    if (log.action === 'UPDATE_COST_MATRIX') {
        return `Producto: ${d.product_name || d.product_id} | Nuevo Costo: $${Number(d.manual_cost).toLocaleString('es-CO')}`;
    }
    if (log.action === 'LOGIN' || log.action === 'USER_LOGIN') {
        return `Inicio de sesión exitoso${d.email ? ` (${d.email})` : ''}`;
    }
    if (log.action === 'LOGOUT' || log.action === 'USER_LOGOUT') {
        return `Cierre de sesión realizado${d.email ? ` (${d.email})` : ''}`;
    }

    let parts: string[] = [];
    if (d.sku) parts.push(`Código (SKU): ${d.sku}`);
    if (d.name) parts.push(`Nombre: ${d.name}`);
    if (d.role) parts.push(`Rol: ${translateRole(d.role)}`);
    if (d.company_name) parts.push(`Empresa: ${d.company_name}`);
    if (d.contact_name) parts.push(`Contacto: ${d.contact_name}`);
    if (d.key) parts.push(`Parámetro: ${translateDetailsKey(d.key)}`);
    if (d.value !== undefined) {
        parts.push(`Valor: ${formatDetailsValue(d.key || 'valor', d.value)}`);
    }
    if (d.sequence_id) parts.push(`Consecutivo Pedido: ${d.sequence_id}`);
    if (d.total_price) parts.push(`Total: $${Number(d.total_price).toLocaleString('es-CO')}`);
    if (d.status) parts.push(`Estado: ${translateStatus(d.status)}`);

    let res = parts.join(' | ');
    if (d.changes && typeof d.changes === 'object' && Object.keys(d.changes).length > 0) {
        const changeParts = Object.entries(d.changes).map(([k, val]: [string, any]) => {
            const tk = translateDetailsKey(k);
            const ov = formatDetailsValue(k, val.old);
            const nv = formatDetailsValue(k, val.new);
            return `${tk}: ${ov} → ${nv}`;
        });
        res = `${res ? res + ' | ' : ''}Cambios: ${changeParts.join(', ')}`;
    }

    return res || '-';
};

const sanitizeJsonForExcel = (details: any): string => {
    if (!details) return '';
    try {
        const str = JSON.stringify(details);
        if (str.length > 3000) {
            return str.substring(0, 3000) + '... [TRUNCADO_POR_TAMAÑO]';
        }
        return str;
    } catch (e) {
        return '';
    }
};


export default function AuditLogPage() {
    const { profile, loading: authLoading } = useAuth();
    const [mounted, setMounted] = useState(false);
    
    useEffect(() => {
        setMounted(true);
    }, []);

    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const [selectedLog, setSelectedLog] = useState<any | null>(null);
    const [loadingOrderItems, setLoadingOrderItems] = useState(false);
    const [auditOrderItems, setAuditOrderItems] = useState<any[]>([]);
    const [systemRoles, setSystemRoles] = useState<any[]>([]);
    const [copiedJson, setCopiedJson] = useState(false);

    useEffect(() => {
        if (selectedLog && selectedLog.module === 'ORDERS' && selectedLog.details?.id) {
            setLoadingOrderItems(true);
            setAuditOrderItems([]);
            supabase
                .from('order_items')
                .select(`
                    quantity,
                    unit_price,
                    variant_label,
                    products (
                        name,
                        unit_of_measure,
                        accounting_id
                    )
                `)
                .eq('order_id', selectedLog.details.id)
                .then(({ data, error }) => {
                    if (!error && data) {
                        setAuditOrderItems(data);
                    }
                    setLoadingOrderItems(false);
                });
        } else {
            setAuditOrderItems([]);
            setLoadingOrderItems(false);
        }
    }, [selectedLog]);

    useEffect(() => {
        if (selectedLog) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [selectedLog]);

    const [searchTerm, setSearchTerm] = useState('');
    const [dateRange, setDateRange] = useState('all');
    const [actionType, setActionType] = useState('all');
    const toolbarRef = useRef<HTMLDivElement>(null);
    const [toolbarHeight, setToolbarHeight] = useState(63);

    useEffect(() => {
        if (!toolbarRef.current) return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const height = entry.borderBoxSize?.[0]?.blockSize || entry.contentRect.height;
                if (height) setToolbarHeight(Math.ceil(height));
            }
        });
        observer.observe(toolbarRef.current);
        return () => observer.disconnect();
    }, []);

    const PAGE_SIZE = 50;

    const hasPermission = (permission: string) => {
        return checkUserPermission(profile, permission, systemRoles);
    };

    const canView = hasPermission('admin.dashboard.audit');

    const applyFilters = (query: any) => {
        // Enforce STRICT 3-month limit (90 days)
        const limitDate = new Date();
        limitDate.setDate(limitDate.getDate() - 90);
        query = query.gte('created_at', limitDate.toISOString());

        if (searchTerm.trim()) {
            const sanitizedTerm = searchTerm.trim().replace(/[%_]/g, '\\$&');
            const term = `%${sanitizedTerm}%`;
            query = query.or(`collaborator_name.ilike.${term},action.ilike.${term},module.ilike.${term}`);
        }
        
        if (dateRange === 'today') {
            const start = new Date();
            start.setHours(0, 0, 0, 0);
            query = query.gte('created_at', start.toISOString());
        } else if (dateRange === 'week') {
            const start = new Date();
            start.setDate(start.getDate() - 7);
            query = query.gte('created_at', start.toISOString());
        } else if (dateRange === 'month') {
            const start = new Date();
            start.setDate(start.getDate() - 30);
            query = query.gte('created_at', start.toISOString());
        }
        
        if (actionType === 'create') {
            query = query.like('action', 'INSERT_%');
        } else if (actionType === 'update') {
            query = query.like('action', 'UPDATE_%');
        } else if (actionType === 'delete') {
            query = query.like('action', 'DELETE_%');
        } else if (actionType === 'login') {
            query = query.or('action.eq.LOGIN,action.eq.USER_LOGIN');
        } else if (actionType === 'logout') {
            query = query.or('action.eq.LOGOUT,action.eq.USER_LOGOUT');
        } else if (actionType === 'security') {
            query = query.or('module.eq.SECURITY,action.ilike.%SECURITY%,action.ilike.%LOGIN%,action.ilike.%LOGOUT%,action.ilike.%REGENERATE%,action.ilike.%PERMISSION%');
        }
        
        return query;
    };

    useEffect(() => {
        async function fetchSystemRoles() {
            const { data, error } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'system_roles')
                .maybeSingle();
            if (data && !error) {
                setSystemRoles(data.value || []);
            }
        }
        fetchSystemRoles();
    }, []);

    useEffect(() => {
        if (authLoading || !canView) return;

        async function loadInitial() {
            setLoading(true);
            try {
                let query = supabase
                    .from('audit_logs')
                    .select('*');
                    
                query = applyFilters(query);
                
                const { data, error } = await query
                    .order('created_at', { ascending: false })
                    .range(0, PAGE_SIZE - 1);
                    
                if (error) throw error;
                
                const uniqueData = Array.from(new Map((data || []).map((item: any) => [item.id, item])).values());
                setLogs(uniqueData);
                setHasMore((data || []).length === PAGE_SIZE);
                setPage(0);
            } catch (err: any) {
                console.error('Error loading audit logs:', err);
            } finally {
                setLoading(false);
            }
        }
        loadInitial();
    }, [searchTerm, dateRange, actionType, refreshKey, authLoading, canView]);

    const loadMore = async () => {
        if (loading || !hasMore) return;
        const nextPage = page + 1;
        setLoading(true);
        try {
            let query = supabase
                .from('audit_logs')
                .select('*');
                
            query = applyFilters(query);
            
            const { data, error } = await query
                .order('created_at', { ascending: false })
                .range(nextPage * PAGE_SIZE, (nextPage + 1) * PAGE_SIZE - 1);
                
            if (error) throw error;
            
            setLogs(prev => {
                const existingIds = new Set(prev.map(l => l.id));
                const newLogs = (data || []).filter(l => !existingIds.has(l.id));
                return [...prev, ...newLogs];
            });
            setHasMore((data || []).length === PAGE_SIZE);
            setPage(nextPage);
        } catch (err) {
            console.error('Error loading more logs:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleExportXLSX = async () => {
        setExporting(true);
        try {
            // Carga optimizada de hasta 2.500 registros con columnas específicas para máxima velocidad
            let allLogs: any[] = [];
            let from = 0;
            const batchSize = 1000;
            const maxExportLimit = 2500;
            let keepFetching = true;

            while (keepFetching && allLogs.length < maxExportLimit) {
                let query = supabase
                    .from('audit_logs')
                    .select('id, created_at, collaborator_name, collaborator_id, action, module, details');
                query = applyFilters(query);
                const { data, error } = await query
                    .order('created_at', { ascending: false })
                    .range(from, from + batchSize - 1);

                if (error) throw error;
                if (!data || data.length === 0) {
                    keepFetching = false;
                } else {
                    allLogs = [...allLogs, ...data];
                    if (data.length < batchSize || allLogs.length >= maxExportLimit) {
                        keepFetching = false;
                    } else {
                        from += batchSize;
                    }
                }
            }
            
            const exportData = allLogs.map((log: any) => ({
                'Fecha y Hora': new Date(log.created_at).toLocaleString('es-CO'),
                'Usuario': formatCollaboratorName(log.collaborator_name),
                'ID de Usuario': log.collaborator_id || 'Sistema',
                'Acción': formatActionName(log),
                'Módulo': translateModule(log),
                'Resumen Detalles': formatDetailsSummaryText(log),
                'Detalles JSON': sanitizeJsonForExcel(log.details)
            }));
            
            const ws = XLSX.utils.json_to_sheet(exportData);
            
            // Configuración de anchos de columna para legibilidad óptima
            ws['!cols'] = [
                { wch: 22 }, // Fecha y Hora
                { wch: 28 }, // Usuario
                { wch: 20 }, // ID de Usuario
                { wch: 30 }, // Acción
                { wch: 24 }, // Módulo
                { wch: 70 }, // Resumen Detalles
                { wch: 45 }  // Detalles JSON
            ];

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Logs de Auditoría");
            XLSX.writeFile(wb, `Reporte_Auditoria_${new Date().toISOString().split('T')[0]}.xlsx`);
        } catch (err: any) {
            console.error('Error exporting data:', err);
            alert('Error al exportar reporte: ' + err.message);
        } finally {
            setExporting(false);
        }
    };

    const getActionBadgeColor = (action: string) => {
        if (action === 'LOGIN' || action === 'USER_LOGIN') return { bg: '#E0E7FF', text: '#3730A3' }; // High contrast Indigo
        if (action === 'LOGOUT' || action === 'USER_LOGOUT') return { bg: '#F3F4F6', text: '#4B5563' }; // Neutral Slate
        if (action.startsWith('INSERT_')) return { bg: '#DEF7EC', text: '#03543F' };
        if (action.startsWith('UPDATE_')) return { bg: '#FEF08A', text: '#713F12' };
        if (action.startsWith('DELETE_')) return { bg: '#FDE8E8', text: '#9B1C1C' };
        return { bg: '#E5EDFF', text: '#1E40AF' }; // Security or other
    };

    if (!mounted || authLoading) {
        return (
            <div style={{ minHeight: '100vh', backgroundColor: THEME.colors.background, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Loader2 size={40} className="animate-spin" color={THEME.colors.primary} />
            </div>
        );
    }

    if (!canView) {
        return (
            <main style={{ minHeight: '100vh', backgroundColor: THEME.colors.background, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
                <div style={{ textAlign: 'center', maxWidth: '500px', padding: '3rem', backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.xl, border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm }}>
                    <ShieldAlert size={60} color="#EF4444" style={{ marginBottom: '1.5rem', display: 'inline-block' }} />
                    <h2 style={{ fontSize: '1.6rem', fontFamily: THEME.typography.fontFamilyMain, fontWeight: '800', color: THEME.colors.textMain, marginBottom: '0.8rem' }}>Acceso Denegado</h2>
                    <p style={{ color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilySecondary, fontSize: '0.95rem', lineHeight: '1.6', marginBottom: '1.5rem' }}>
                        No tienes los permisos requeridos (`admin.dashboard.audit`) para ver el módulo de Trazabilidad y Gobernanza.
                    </p>
                    <Link href="/admin/dashboard" style={{ display: 'inline-block', padding: '0.75rem 1.5rem', backgroundColor: THEME.colors.primary, color: 'white', fontWeight: '700', borderRadius: THEME.radius.md, textDecoration: 'none' }}>
                        Volver al Panel
                    </Link>
                </div>
            </main>
        );
    }

    return (
        <main style={{ minHeight: '100vh', backgroundColor: THEME.colors.background }}>
            <div style={{ width: '98%', maxWidth: '100%', margin: '0 auto', padding: '2rem 2.5rem' }}>
                {/* Header Técnico */}
                <header style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '0.5rem' }}>
                            <Link href="/admin/dashboard" style={{ color: THEME.colors.textSecondary, display: 'flex', alignItems: 'center' }}>
                                <ArrowLeft size={20} strokeWidth={1.5} />
                            </Link>
                            <h1 style={{ fontSize: '2rem', fontFamily: THEME.typography.fontFamilyMain, fontWeight: '800', color: THEME.colors.textMain, letterSpacing: '-0.025em', margin: 0 }}>
                                Trazabilidad de <span style={{ color: THEME.colors.primary }}>Movimientos</span>
                            </h1>
                        </div>
                        <p style={{ color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilySecondary, fontSize: '0.95rem', fontWeight: '500' }}>Registro inalterable de movimientos y gobernanza del sistema.</p>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                            onClick={() => setRefreshKey(prev => prev + 1)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '8px', padding: '0.65rem',
                                backgroundColor: THEME.colors.surface, border: `1px solid ${THEME.colors.border}`, borderRadius: THEME.radius.md,
                                color: THEME.colors.textSecondary, cursor: 'pointer', transition: 'all 0.2s'
                            }}
                            title="Recargar logs"
                        >
                            <RefreshCw size={18} strokeWidth={1.5} className={loading ? 'animate-spin' : ''} />
                        </button>
                        <button 
                            onClick={handleExportXLSX}
                            disabled={exporting || logs.length === 0}
                            style={{ 
                                display: 'flex', alignItems: 'center', gap: '8px', padding: '0.65rem 1.25rem', 
                                backgroundColor: exporting ? THEME.colors.background : THEME.colors.primary, 
                                border: `1px solid ${THEME.colors.border}`, borderRadius: THEME.radius.md,
                                color: exporting ? THEME.colors.textSecondary : 'white', 
                                fontWeight: '700', fontSize: '0.85rem', cursor: exporting || logs.length === 0 ? 'not-allowed' : 'pointer',
                                opacity: logs.length === 0 ? 0.6 : 1, transition: 'all 0.2s'
                            }}
                        >
                            {exporting ? (
                                <Loader2 size={18} className="animate-spin" />
                            ) : (
                                <Download size={18} strokeWidth={1.5} />
                            )}
                            Descargar Reporte (XLSX)
                        </button>
                    </div>
                </header>

                {/* Banner Informativo sobre Políticas de Retención */}
                <div style={{ 
                    backgroundColor: '#FDF8F2', border: '1px solid #F59E0B33', borderRadius: THEME.radius.lg, 
                    padding: '0.6rem 1rem', display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '1rem'
                }}>
                    <AlertTriangle size={18} color="#B45309" style={{ flexShrink: 0 }} />
                    <div>
                        <h4 style={{ margin: 0, fontWeight: '800', color: '#B45309', fontSize: '0.72rem', fontFamily: THEME.typography.fontFamilyMain }}>POLÍTICA DE OPTIMIZACIÓN (BÚSQUEDA LIMITADA A 3 MESES)</h4>
                        <p style={{ margin: '2px 0 0 0', fontSize: '0.68rem', color: '#B45309', fontWeight: '500', fontFamily: THEME.typography.fontFamilySecondary }}>
                            Para garantizar la velocidad y el óptimo rendimiento de la plataforma, las consultas en tiempo real de este panel muestran los últimos 3 meses de trazabilidad. Para acceder a registros anteriores a este período, por favor solicite la exportación del consolidado histórico.
                        </p>
                    </div>
                </div>

                {/* Filtros de Auditoría - Barra Flotante Sticky Frosted Glass (Estándar Diseñador-Web) */}
                <div 
                    ref={toolbarRef}
                    style={{ 
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        padding: '0.65rem 1.25rem', 
                        borderRadius: '16px', 
                        border: '1px solid #E2E8F0', 
                        display: 'flex', 
                        gap: '0.85rem', 
                        marginBottom: '1rem', 
                        flexWrap: 'wrap', 
                        alignItems: 'center',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.07), 0 1px 3px rgba(0, 0, 0, 0.05)',
                        position: 'sticky',
                        top: '85px',
                        zIndex: 70,
                        transition: 'all 0.2s ease-in-out'
                    }}
                >
                    <div style={{ flex: 1, minWidth: '300px', position: 'relative' }}>
                        <Search size={18} strokeWidth={1.5} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: THEME.colors.textSecondary }} />
                        <input 
                            placeholder="Buscar por usuario, acción o referencia..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ 
                                width: '100%', padding: '0.65rem 1rem 0.65rem 2.8rem', borderRadius: THEME.radius.md, 
                                border: `1px solid ${THEME.colors.border}`, backgroundColor: THEME.colors.background, fontWeight: '600', fontSize: '0.9rem',
                                fontFamily: THEME.typography.fontFamilySecondary, color: THEME.colors.textMain
                            }}
                        />
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: THEME.colors.background, padding: '0.4rem 0.8rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}` }}>
                        <Calendar size={16} strokeWidth={1.5} color={THEME.colors.primary} />
                        <select 
                            value={dateRange}
                            onChange={(e) => setDateRange(e.target.value)}
                            style={{ border: 'none', background: 'none', fontWeight: '700', color: THEME.colors.textMain, fontSize: '0.85rem', cursor: 'pointer', outline: 'none', fontFamily: THEME.typography.fontFamilySecondary }}
                        >
                            <option value="all">Últimos 3 meses</option>
                            <option value="today">Hoy</option>
                            <option value="week">Esta Semana</option>
                            <option value="month">Este Mes</option>
                        </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: THEME.colors.background, padding: '0.4rem 0.8rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}` }}>
                        <User size={16} strokeWidth={1.5} color={THEME.colors.primary} />
                        <select 
                            value={actionType}
                            onChange={(e) => setActionType(e.target.value)}
                            style={{ border: 'none', background: 'none', fontWeight: '700', color: THEME.colors.textMain, fontSize: '0.85rem', cursor: 'pointer', outline: 'none', fontFamily: THEME.typography.fontFamilySecondary }}
                        >
                            <option value="all">Todas las Acciones</option>
                            <option value="create">Creación (INSERT)</option>
                            <option value="update">Modificación (UPDATE)</option>
                            <option value="delete">Eliminación (DELETE)</option>
                            <option value="login">Ingresos (LOGIN)</option>
                            <option value="logout">Salidas (LOGOUT)</option>
                            <option value="security">Seguridad / Autenticación</option>
                        </select>
                    </div>
                </div>

                {/* Tabla de Auditoría con Encabezados Sticky (Estándar Diseñador-Web) */}
                <div style={{ 
                    backgroundColor: THEME.colors.surface, 
                    borderRadius: THEME.radius.xl, 
                    border: `1px solid ${THEME.colors.border}`, 
                    minHeight: '400px', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    boxShadow: THEME.shadow.sm,
                    overflow: 'visible'
                }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead style={{ position: 'sticky', top: `${85 + toolbarHeight - 2}px`, zIndex: 40, backgroundColor: '#F8FAFC' }}>
                            <tr style={{ backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
                                <th style={{ 
                                    padding: '0.85rem 1.25rem', 
                                    fontSize: THEME.typography.tableHeader.fontSize, 
                                    letterSpacing: THEME.typography.tableHeader.letterSpacing, 
                                    fontWeight: THEME.typography.tableHeader.fontWeight, 
                                    color: THEME.typography.tableHeader.color, 
                                    textTransform: THEME.typography.tableHeader.textTransform, 
                                    minWidth: '170px'
                                }}>
                                    Fecha y Hora
                                </th>
                                <th style={{ 
                                    padding: '0.85rem 1.25rem', 
                                    fontSize: THEME.typography.tableHeader.fontSize, 
                                    letterSpacing: THEME.typography.tableHeader.letterSpacing, 
                                    fontWeight: THEME.typography.tableHeader.fontWeight, 
                                    color: THEME.typography.tableHeader.color, 
                                    textTransform: THEME.typography.tableHeader.textTransform, 
                                    minWidth: '180px'
                                }}>
                                    Usuario
                                </th>
                                <th style={{ 
                                    padding: '0.85rem 1.25rem', 
                                    fontSize: THEME.typography.tableHeader.fontSize, 
                                    letterSpacing: THEME.typography.tableHeader.letterSpacing, 
                                    fontWeight: THEME.typography.tableHeader.fontWeight, 
                                    color: THEME.typography.tableHeader.color, 
                                    textTransform: THEME.typography.tableHeader.textTransform, 
                                    minWidth: '160px'
                                }}>
                                    Acción
                                </th>
                                <th style={{ 
                                    padding: '0.85rem 1.25rem', 
                                    fontSize: THEME.typography.tableHeader.fontSize, 
                                    letterSpacing: THEME.typography.tableHeader.letterSpacing, 
                                    fontWeight: THEME.typography.tableHeader.fontWeight, 
                                    color: THEME.typography.tableHeader.color, 
                                    textTransform: THEME.typography.tableHeader.textTransform, 
                                    minWidth: '140px'
                                }}>
                                    Módulo
                                </th>
                                <th style={{ 
                                    padding: '0.85rem 1.25rem', 
                                    fontSize: THEME.typography.tableHeader.fontSize, 
                                    letterSpacing: THEME.typography.tableHeader.letterSpacing, 
                                    fontWeight: THEME.typography.tableHeader.fontWeight, 
                                    color: THEME.typography.tableHeader.color, 
                                    textTransform: THEME.typography.tableHeader.textTransform, 
                                    minWidth: '320px'
                                }}>
                                    Detalles
                                </th>
                                <th style={{ 
                                    padding: '0.85rem 1rem', 
                                    width: '90px', 
                                    minWidth: '90px', 
                                    textAlign: 'center', 
                                    fontSize: THEME.typography.tableHeader.fontSize, 
                                    letterSpacing: THEME.typography.tableHeader.letterSpacing, 
                                    fontWeight: THEME.typography.tableHeader.fontWeight, 
                                    color: THEME.typography.tableHeader.color, 
                                    textTransform: THEME.typography.tableHeader.textTransform
                                }}>
                                    Detalle
                                </th>
                            </tr>
                        </thead>
                            {loading && logs.length === 0 ? (
                                <tbody style={{ fontFamily: THEME.typography.fontFamilySecondary }}>
                                    <tr>
                                        <td colSpan={6} style={{ padding: '6rem 0', textAlign: 'center' }}>
                                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
                                                <Loader2 size={30} className="animate-spin" color={THEME.colors.primary} />
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            ) : logs.length === 0 ? (
                                <tbody style={{ fontFamily: THEME.typography.fontFamilySecondary }}>
                                    <tr>
                                        <td colSpan={6} style={{ padding: '4rem 2rem', textAlign: 'center' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                                <div style={{ width: '60px', height: '60px', borderRadius: '50%', backgroundColor: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem', color: THEME.colors.textSecondary }}>
                                                    <Search size={28} />
                                                </div>
                                                <h3 style={{ fontSize: '1.1rem', fontFamily: THEME.typography.fontFamilyMain, fontWeight: '700', color: THEME.colors.textMain, marginBottom: '0.25rem' }}>No se encontraron registros</h3>
                                                <p style={{ color: THEME.colors.textSecondary, fontSize: '0.85rem', maxWidth: '350px', margin: '0 auto' }}>Prueba ajustando los filtros de búsqueda o el rango de fechas.</p>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            ) : (
                                <tbody style={{ fontFamily: THEME.typography.fontFamilySecondary }}>
                                    {logs.map((log, index) => {
                                        const badge = getActionBadgeColor(log.action);
                                        return (
                                            <tr 
                                                key={`${log.id}-${index}`} 
                                                style={{ fontSize: '0.85rem', verticalAlign: 'middle', transition: 'background-color 0.15s', cursor: 'pointer' }} 
                                                onClick={() => setSelectedLog(log)}
                                                onMouseOver={(e) => {
                                                    e.currentTarget.style.backgroundColor = '#F9FAFB';
                                                    const stickyCell = e.currentTarget.querySelector('.sticky-action-cell') as HTMLElement;
                                                    if (stickyCell) stickyCell.style.backgroundColor = '#F9FAFB';
                                                }} 
                                                onMouseOut={(e) => {
                                                    e.currentTarget.style.backgroundColor = 'transparent';
                                                    const stickyCell = e.currentTarget.querySelector('.sticky-action-cell') as HTMLElement;
                                                    if (stickyCell) stickyCell.style.backgroundColor = '#FFFFFF';
                                                }}
                                            >
                                                <td style={{ padding: '0.85rem 1.25rem', color: THEME.colors.textMain, fontWeight: '600', whiteSpace: 'nowrap', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                                    {new Date(log.created_at).toLocaleString('es-CO')}
                                                </td>
                                                <td style={{ padding: '0.85rem 1.25rem', color: THEME.colors.textMain, fontWeight: '700', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                                    {formatCollaboratorName(log.collaborator_name)}
                                                </td>
                                                <td style={{ padding: '0.85rem 1.25rem', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                                    <span style={{ display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: '4px', backgroundColor: badge.bg, color: badge.text, fontWeight: '700', fontSize: '0.75rem' }}>
                                                        {formatActionName(log)}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.85rem 1.25rem', fontWeight: '700', color: THEME.colors.textSecondary, borderBottom: `1px solid ${THEME.colors.border}` }}>
                                                    {translateModule(log)}
                                                </td>
                                                <td style={{ padding: '0.85rem 1.25rem', color: THEME.colors.textSecondary, borderBottom: `1px solid ${THEME.colors.border}` }}>
                                                    {formatDetailsSummary(log)}
                                                </td>
                                                <td 
                                                    className="sticky-action-cell"
                                                    style={{ 
                                                        padding: '0.85rem 1rem', 
                                                        textAlign: 'center', 
                                                        position: 'sticky', 
                                                        right: 0, 
                                                        backgroundColor: '#FFFFFF', 
                                                        boxShadow: '-4px 0 8px rgba(0,0,0,0.03)',
                                                        zIndex: 10,
                                                        borderBottom: `1px solid ${THEME.colors.border}`
                                                    }}
                                                    onClick={(e) => { e.stopPropagation(); setSelectedLog(log); }}
                                                >
                                                    <button 
                                                        type="button"
                                                        onClick={() => setSelectedLog(log)}
                                                        style={{ 
                                                            display: 'inline-flex', 
                                                            alignItems: 'center', 
                                                            justifyContent: 'center',
                                                            gap: '6px',
                                                            padding: '6px 12px', 
                                                            borderRadius: '8px', 
                                                            backgroundColor: '#EDF5F1', 
                                                            color: THEME.colors.primary, 
                                                            border: '1px solid rgba(13, 122, 87, 0.25)', 
                                                            cursor: 'pointer', 
                                                            fontWeight: '700', 
                                                            fontSize: '0.8rem',
                                                            transition: 'all 0.15s ease'
                                                        }}
                                                        onMouseOver={(e) => {
                                                            e.currentTarget.style.backgroundColor = THEME.colors.primary;
                                                            e.currentTarget.style.color = '#FFFFFF';
                                                            e.currentTarget.style.borderColor = THEME.colors.primary;
                                                        }}
                                                        onMouseOut={(e) => {
                                                            e.currentTarget.style.backgroundColor = '#EDF5F1';
                                                            e.currentTarget.style.color = THEME.colors.primary;
                                                            e.currentTarget.style.borderColor = 'rgba(13, 122, 87, 0.25)';
                                                        }}
                                                        title="Ver detalles completos"
                                                    >
                                                        <Eye size={16} />
                                                        <span>Ver</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            )}
                        </table>

                    {/* Pagination / Load More */}
                    {hasMore && !loading && (
                        <div style={{ padding: '1.2rem', display: 'flex', justifyContent: 'center', borderTop: `1px solid ${THEME.colors.border}`, backgroundColor: '#F9FAFB' }}>
                            <button 
                                onClick={loadMore}
                                style={{
                                    padding: '0.5rem 1.5rem', backgroundColor: THEME.colors.surface, border: `1px solid ${THEME.colors.border}`,
                                    borderRadius: THEME.radius.md, color: THEME.colors.textMain, fontWeight: '700', fontSize: '0.85rem',
                                    cursor: 'pointer', transition: 'all 0.2s'
                                }}
                                onMouseOver={(e) => e.currentTarget.style.borderColor = THEME.colors.primary}
                                onMouseOut={(e) => e.currentTarget.style.borderColor = THEME.colors.border}
                            >
                                Cargar más registros
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal: Visor de JSON de Detalles */}
            {selectedLog && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '2rem' }}>
                    <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.xl, border: `1px solid ${THEME.colors.border}`, maxWidth: '850px', width: '100%', padding: '1.5rem', boxShadow: THEME.shadow.lg, maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem', borderBottom: `1px solid ${THEME.colors.border}`, paddingBottom: '0.8rem' }}>
                            <h3 style={{ fontSize: '1.2rem', fontFamily: THEME.typography.fontFamilyMain, fontWeight: '800', color: THEME.colors.textMain, margin: 0 }}>
                                Detalles de Auditoría
                            </h3>
                            <button onClick={() => setSelectedLog(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: THEME.colors.textSecondary, fontWeight: '700' }}>×</button>
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', fontSize: '0.85rem', fontFamily: THEME.typography.fontFamilySecondary, color: THEME.colors.textMain }}>
                            <div>
                                <strong style={{ color: THEME.colors.textSecondary }}>Fecha y Hora:</strong> {new Date(selectedLog.created_at).toLocaleString('es-CO')}
                            </div>
                            <div>
                                <strong style={{ color: THEME.colors.textSecondary }}>Usuario:</strong> {formatCollaboratorName(selectedLog.collaborator_name)}
                            </div>
                            <div>
                                <strong style={{ color: THEME.colors.textSecondary }}>Acción:</strong> {formatActionName(selectedLog)}
                            </div>
                            <div>
                                <strong style={{ color: THEME.colors.textSecondary }}>Módulo:</strong> {translateModule(selectedLog)}
                            </div>
                            
                            {(() => {
                                const gov = analyzeGovernanceChanges(selectedLog.details);
                                if (gov.isGovernance) {
                                    return (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
                                            {/* Panel Ejecutivo de Modificaciones */}
                                            <div style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '10px', padding: '1rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <Users size={18} color="#15803D" />
                                                        <strong style={{ color: '#166534', fontSize: '0.95rem' }}>
                                                            Gobernanza Operativa: {gov.cellCount} Células de Trabajo Activas
                                                        </strong>
                                                    </div>
                                                    <span style={{ fontSize: '0.75rem', fontWeight: '800', backgroundColor: '#DCFCE7', color: '#15803D', padding: '2px 8px', borderRadius: '12px' }}>
                                                        Registro Oficial
                                                    </span>
                                                </div>

                                                {gov.added.length > 0 && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', fontSize: '0.85rem' }}>
                                                        <span style={{ backgroundColor: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: '6px', fontWeight: '800' }}>
                                                            + Célula Creada:
                                                        </span>
                                                        <strong style={{ color: '#0F172A' }}>{gov.added.join(', ')}</strong>
                                                    </div>
                                                )}

                                                {gov.leaderChanges.length > 0 && (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px', fontSize: '0.85rem' }}>
                                                        <span style={{ fontWeight: '700', color: '#0369A1' }}>Reasignación de Liderazgo:</span>
                                                        {gov.leaderChanges.map((lc, idx) => (
                                                            <div key={idx} style={{ paddingLeft: '10px', color: '#334155' }}>
                                                                • <strong>{lc.cell}</strong>: <span style={{ textDecoration: 'line-through', color: '#DC2626' }}>{lc.oldL}</span> → <span style={{ color: '#15803D', fontWeight: '700' }}>{lc.newL}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {gov.descChange && (
                                                    <div style={{ marginTop: '6px', fontSize: '0.8rem', color: '#475569' }}>
                                                        <strong>Descripción Oficial:</strong> {gov.newDesc}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Visualizador de Células de Trabajo */}
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                                                    <strong style={{ color: THEME.colors.textSecondary, fontSize: '0.85rem' }}>
                                                        Células de Trabajo y Responsables Asignados:
                                                    </strong>
                                                    <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                                                        {gov.newCells.length} Células en catálogo
                                                    </span>
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '10px' }}>
                                                    {gov.newCells.map(cell => {
                                                        const isAdded = gov.added.includes(cell.name || cell.short_name || cell.id);
                                                        return (
                                                            <div 
                                                                key={cell.id} 
                                                                style={{ 
                                                                    backgroundColor: isAdded ? '#FEFCE8' : '#F8FAFC', 
                                                                    border: `1.5px solid ${isAdded ? '#F59E0B' : (cell.color || '#CBD5E1')}`, 
                                                                    borderLeft: `4px solid ${isAdded ? '#F59E0B' : (cell.color || '#0D7A57')}`,
                                                                    borderRadius: '8px', 
                                                                    padding: '0.75rem 0.9rem',
                                                                    display: 'flex',
                                                                    flexDirection: 'column',
                                                                    gap: '5px'
                                                                }}
                                                            >
                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                                                                        <div style={{ width: '26px', height: '26px', borderRadius: '6px', backgroundColor: `${cell.color || '#0D7A57'}20`, color: cell.color || '#0D7A57', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                            {renderGovernanceLucideIcon(cell.icon, 15)}
                                                                        </div>
                                                                        <span style={{ fontWeight: '800', fontSize: '0.82rem', color: '#0F172A' }}>
                                                                            {cell.name || cell.short_name}
                                                                        </span>
                                                                    </div>
                                                                    {isAdded && (
                                                                        <span style={{ fontSize: '0.65rem', backgroundColor: '#FEF3C7', color: '#92400E', padding: '1px 6px', borderRadius: '4px', fontWeight: '800' }}>
                                                                            NUEVA
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div style={{ fontSize: '0.78rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                    <User size={13} color="#64748B" />
                                                                    <span><strong>Líder:</strong> {cell.leader_name || 'Sin asignar'}</span>
                                                                </div>
                                                                {cell.leader_role && (
                                                                    <div style={{ fontSize: '0.72rem', color: '#64748B', paddingLeft: '17px' }}>
                                                                        Rol: {cell.leader_role}
                                                                    </div>
                                                                )}
                                                                {cell.inventory_group && (
                                                                    <div style={{ fontSize: '0.68rem', color: '#0D7A57', backgroundColor: '#EAEFEA', padding: '2px 6px', borderRadius: '4px', marginTop: '2px', fontWeight: '600' }}>
                                                                        {cell.inventory_group}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }

                                return (
                                    <>
                                        {selectedLog.details && typeof selectedLog.details === 'object' && Object.keys(selectedLog.details).length > 0 && (
                                            <div style={{ borderTop: `1px solid ${THEME.colors.border}`, paddingTop: '0.8rem', marginTop: '0.4rem' }}>
                                                <strong style={{ color: THEME.colors.textSecondary, display: 'block', marginBottom: '0.4rem' }}>Información Procesada:</strong>
                                                <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '6px', backgroundColor: '#F9FAFB', padding: '0.8rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}` }}>
                                                    {Object.entries(selectedLog.details).filter(([k]) => k !== 'changes').map(([k, v]) => (
                                                        <React.Fragment key={k}>
                                                            <span style={{ fontWeight: '700', color: THEME.colors.textSecondary }}>{translateDetailsKey(k)}:</span>
                                                            <span style={{ color: THEME.colors.textMain, wordBreak: 'break-all' }}>{formatDetailsValue(k, v)}</span>
                                                        </React.Fragment>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {selectedLog.details?.changes && typeof selectedLog.details.changes === 'object' && Object.keys(selectedLog.details.changes).length > 0 && (
                                            <div style={{ borderTop: `1px solid ${THEME.colors.border}`, paddingTop: '0.8rem', marginTop: '0.8rem' }}>
                                                <strong style={{ color: THEME.colors.textSecondary, display: 'block', marginBottom: '0.6rem' }}>Campos Modificados:</strong>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                    {Object.entries(selectedLog.details.changes).map(([k, val]: [string, any]) => (
                                                        <div key={k} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 20px 1fr', gap: '8px', alignItems: 'center', backgroundColor: '#FEF2F2', padding: '6px 12px', borderRadius: THEME.radius.md, border: '1px solid #FEE2E2' }}>
                                                            <span style={{ fontWeight: '700', color: THEME.colors.textMain }}>{translateDetailsKey(k)}</span>
                                                            <span style={{ color: '#EF4444', textDecoration: 'line-through', fontSize: '0.8rem' }}>{formatDetailsValue(k, val.old)}</span>
                                                            <span style={{ color: THEME.colors.textSecondary, textAlign: 'center' }}>→</span>
                                                            <span style={{ color: '#10B981', fontWeight: '700' }}>{formatDetailsValue(k, val.new)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                            
                            {selectedLog.module === 'ORDERS' && selectedLog.details?.id && (
                                 <div style={{ borderTop: `1px solid ${THEME.colors.border}`, paddingTop: '0.8rem', marginTop: '0.8rem' }}>
                                     <strong style={{ color: THEME.colors.textSecondary, display: 'block', marginBottom: '0.6rem' }}>Detalle de Productos en el Pedido:</strong>
                                     {loadingOrderItems ? (
                                         <p style={{ color: '#64748B', fontSize: '0.85rem' }}>Cargando productos...</p>
                                     ) : auditOrderItems.length > 0 ? (
                                         <div style={{ border: `1px solid ${THEME.colors.border}`, borderRadius: THEME.radius.md, overflow: 'hidden' }}>
                                             <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                                 <thead>
                                                     <tr style={{ backgroundColor: '#F8FAFC', borderBottom: `1px solid ${THEME.colors.border}`, textAlign: 'left' }}>
                                                         <th style={{ padding: '6px 12px', color: '#475569', fontWeight: '700' }}>ID</th>
                                                         <th style={{ padding: '6px 12px', color: '#475569', fontWeight: '700' }}>Producto</th>
                                                         <th style={{ padding: '6px 12px', color: '#475569', fontWeight: '700', textAlign: 'center' }}>Cantidad</th>
                                                         <th style={{ padding: '6px 12px', color: '#475569', fontWeight: '700', textAlign: 'right' }}>Precio U.</th>
                                                         <th style={{ padding: '6px 12px', color: '#475569', fontWeight: '700', textAlign: 'right' }}>Subtotal</th>
                                                     </tr>
                                                 </thead>
                                                 <tbody>
                                                     {auditOrderItems.map((item, index) => {
                                                         const qty = item.quantity || 0;
                                                         const price = item.unit_price || 0;
                                                         const prodName = item.products?.name || 'Desconocido';
                                                         const prodId = item.products?.accounting_id || '-';
                                                         const unit = item.products?.unit_of_measure || 'Kg';
                                                         const subtotal = qty * price;
                                                         return (
                                                             <tr key={index} style={{ borderBottom: index < auditOrderItems.length - 1 ? `1px solid #F1F5F9` : 'none' }}>
                                                                 <td style={{ padding: '6px 12px', color: '#475569', fontWeight: 'bold' }}>{prodId}</td>
                                                                 <td style={{ padding: '6px 12px', color: '#0F172A' }}>
                                                                     <div style={{ fontWeight: '600' }}>{prodName}</div>
                                                                     {item.variant_label && (
                                                                         <span style={{ fontSize: '0.7rem', color: '#0369A1', backgroundColor: '#E0F2FE', padding: '1px 6px', borderRadius: '3px', marginTop: '2px', display: 'inline-block' }}>
                                                                             {item.variant_label.replace(/\s*\((Nota|Entr):[^\)]*\)/g, '').trim()}
                                                                         </span>
                                                                     )}
                                                                 </td>
                                                                 <td style={{ padding: '6px 12px', textAlign: 'center', fontWeight: '700' }}>{qty} {unit}</td>
                                                                 <td style={{ padding: '6px 12px', textAlign: 'right', color: '#475569' }}>{`$${Number(price).toLocaleString('es-CO')}`}</td>
                                                                 <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: '700', color: '#059669' }}>{`$${Number(subtotal).toLocaleString('es-CO')}`}</td>
                                                             </tr>
                                                         );
                                                     })}
                                                 </tbody>
                                             </table>
                                         </div>
                                     ) : (
                                         <p style={{ color: '#94A3B8', fontSize: '0.85rem', fontStyle: 'italic' }}>Este pedido no contiene productos o ya fue eliminado.</p>
                                     )}
                                 </div>
                             )}

                            {/* Acordeón Plegable de Detalle Técnico JSON con Botón de Copiado */}
                            <details style={{ marginTop: '0.8rem', border: `1px solid ${THEME.colors.border}`, borderRadius: THEME.radius.md, padding: '0.6rem 0.85rem', backgroundColor: '#F8FAFC' }}>
                                <summary style={{ cursor: 'pointer', fontWeight: '700', color: THEME.colors.textSecondary, fontSize: '0.8rem', userSelect: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span>Ver Registro Técnico Completo (JSON estructurado)</span>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            navigator.clipboard.writeText(JSON.stringify(selectedLog.details, null, 2));
                                            setCopiedJson(true);
                                            setTimeout(() => setCopiedJson(false), 2000);
                                        }}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            backgroundColor: '#FFFFFF',
                                            border: `1px solid ${THEME.colors.border}`,
                                            padding: '3px 8px',
                                            borderRadius: '6px',
                                            fontSize: '0.72rem',
                                            color: copiedJson ? '#15803D' : THEME.colors.textMain,
                                            fontWeight: '700',
                                            cursor: 'pointer'
                                        }}
                                        title="Copiar JSON completo al portapapeles"
                                    >
                                        {copiedJson ? <Check size={13} color="#15803D" /> : <Copy size={13} />}
                                        <span>{copiedJson ? '¡Copiado!' : 'Copiar JSON'}</span>
                                    </button>
                                </summary>
                                <div style={{ marginTop: '0.6rem' }}>
                                    <pre style={{ margin: 0, padding: '0.8rem', backgroundColor: '#0F172A', color: '#E2E8F0', borderRadius: '6px', fontSize: '0.72rem', fontFamily: 'monospace', overflowX: 'auto', whiteSpace: 'pre-wrap', maxHeight: '220px', overflowY: 'auto' }}>
                                        {JSON.stringify(selectedLog.details, null, 2)}
                                    </pre>
                                </div>
                            </details>
                        </div>

                        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                            <button 
                                onClick={() => setSelectedLog(null)}
                                style={{ padding: '0.5rem 1.25rem', backgroundColor: THEME.colors.primary, color: 'white', fontWeight: '700', borderRadius: THEME.radius.md, border: 'none', cursor: 'pointer' }}
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
