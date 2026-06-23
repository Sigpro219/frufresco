'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, ShieldAlert, Search, Calendar, User, Settings, Loader2, RefreshCw, Eye } from 'lucide-react';
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
    if (k === 'sku') return 'Código (SKU)';
    if (k === 'name') return 'Nombre';
    if (k === 'role') return 'Rol / Permiso';
    if (k === 'company_name') return 'Nombre de Empresa';
    if (k === 'contact_name') return 'Nombre de Contacto';
    if (k === 'key') return 'Parámetro / Clave';
    if (k === 'value') return 'Valor';
    if (k === 'id') return 'ID';
    if (k === 'sequence_id') return 'Consecutivo de Pedido';
    if (k === 'total_price') return 'Precio Total';
    if (k === 'status') return 'Estado';
    return key;
};

const formatDetailsValue = (key: string, value: any) => {
    if (value === undefined || value === null) return '-';
    const k = key.toLowerCase();
    if (k === 'role') return translateRole(String(value));
    if (k === 'status') return translateStatus(String(value));
    if (k === 'total_price') return `$${Number(value).toLocaleString('es-CO')}`;
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
};

const formatActionName = (action: string) => {
    if (!action) return '-';
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
    return action;
};

const translateModule = (module: string) => {
    if (!module) return '-';
    if (module === 'PRODUCTS') return 'PRODUCTOS';
    if (module === 'SECURITY') return 'SEGURIDAD';
    if (module === 'ORDERS') return 'PEDIDOS';
    if (module === 'SETTINGS') return 'CONFIGURACIÓN';
    if (module === 'HR_ADMIN') return 'ADMIN GESTIÓN HUMANA';
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
    if (log.action === 'BULK_IMPORT_CLIENTS') {
        return `Clientes creados: ${d.parents_created || 0}, Sucursales creadas: ${d.children_created || 0}`;
    }
    
    let parts = [];
    if (d.sku) parts.push(`Código (SKU): ${d.sku}`);
    if (d.name) parts.push(`Nombre: ${d.name}`);
    if (d.role) parts.push(`Rol: ${translateRole(d.role)}`);
    if (d.company_name) parts.push(`Empresa: ${d.company_name}`);
    if (d.contact_name) parts.push(`Contacto: ${d.contact_name}`);
    if (d.key) parts.push(`Parámetro: ${d.key}`);
    if (d.value !== undefined) {
        const valStr = typeof d.value === 'object' ? JSON.stringify(d.value) : String(d.value);
        parts.push(`Valor: ${valStr}`);
    }
    if (d.sequence_id) parts.push(`Consecutivo Pedido: ${d.sequence_id}`);
    if (d.total_price) parts.push(`Total: $${Number(d.total_price).toLocaleString('es-CO')}`);
    if (d.status) parts.push(`Estado: ${translateStatus(d.status)}`);
    
    if (parts.length > 0) return parts.join(' | ');
    return JSON.stringify(d);
};

export default function AuditLogPage() {
    const { profile, loading: authLoading } = useAuth();
    
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const [selectedLog, setSelectedLog] = useState<any | null>(null);
    const [systemRoles, setSystemRoles] = useState<any[]>([]);

    const [searchTerm, setSearchTerm] = useState('');
    const [dateRange, setDateRange] = useState('all');
    const [actionType, setActionType] = useState('all');

    const PAGE_SIZE = 50;

    const hasPermission = (permission: string) => {
        return checkUserPermission(profile, permission, systemRoles);
    };

    const canView = hasPermission('admin.dashboard.audit');

    const applyFilters = (query: any) => {
        if (searchTerm.trim()) {
            const term = `%${searchTerm.trim()}%`;
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
        } else if (actionType === 'security') {
            query = query.or('module.eq.SECURITY,action.ilike.%SECURITY%,action.ilike.%LOGIN%,action.ilike.%REGENERATE%,action.ilike.%PERMISSION%');
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
                
                setLogs(data || []);
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
            
            setLogs(prev => [...prev, ...(data || [])]);
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
            let query = supabase
                .from('audit_logs')
                .select('*');
            query = applyFilters(query);
            const { data, error } = await query.order('created_at', { ascending: false });
            if (error) throw error;
            
            const exportData = (data || []).map((log: any) => ({
                'Fecha y Hora': new Date(log.created_at).toLocaleString('es-CO'),
                'Usuario': formatCollaboratorName(log.collaborator_name),
                'ID de Usuario': log.collaborator_id || 'Sistema',
                'Acción': formatActionName(log.action),
                'Módulo': translateModule(log.module),
                'Resumen Detalles': formatDetailsSummary(log),
                'Detalles JSON': JSON.stringify(log.details)
            }));
            
            const ws = XLSX.utils.json_to_sheet(exportData);
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
        if (action.startsWith('INSERT_')) return { bg: '#DEF7EC', text: '#03543F' };
        if (action.startsWith('UPDATE_')) return { bg: '#FEF08A', text: '#713F12' };
        if (action.startsWith('DELETE_')) return { bg: '#FDE8E8', text: '#9B1C1C' };
        return { bg: '#E5EDFF', text: '#1E40AF' }; // Security or other
    };

    if (authLoading) {
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

                {/* Filtros de Auditoría */}
                <div style={{ 
                    backgroundColor: THEME.colors.surface, padding: '1.2rem', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, 
                    display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap', alignItems: 'center',
                    boxShadow: THEME.shadow.sm
                }}>
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
                            <option value="all">Cualquier Fecha</option>
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
                            <option value="security">Seguridad/Login</option>
                        </select>
                    </div>
                </div>

                {/* Tabla de Auditoría */}
                <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.xl, border: `1px solid ${THEME.colors.border}`, overflow: 'hidden', minHeight: '400px', display: 'flex', flexDirection: 'column', boxShadow: THEME.shadow.sm }}>
                    <div style={{ overflowX: 'auto', flex: 1 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead style={{ backgroundColor: '#F9FAFB', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                <tr>
                                    <th style={{ padding: '0.85rem 1.25rem', fontSize: THEME.typography.tableHeader.fontSize, letterSpacing: THEME.typography.tableHeader.letterSpacing, fontWeight: THEME.typography.tableHeader.fontWeight, color: THEME.typography.tableHeader.color, textTransform: THEME.typography.tableHeader.textTransform }}>Fecha y Hora</th>
                                    <th style={{ padding: '0.85rem 1.25rem', fontSize: THEME.typography.tableHeader.fontSize, letterSpacing: THEME.typography.tableHeader.letterSpacing, fontWeight: THEME.typography.tableHeader.fontWeight, color: THEME.typography.tableHeader.color, textTransform: THEME.typography.tableHeader.textTransform }}>Usuario</th>
                                    <th style={{ padding: '0.85rem 1.25rem', fontSize: THEME.typography.tableHeader.fontSize, letterSpacing: THEME.typography.tableHeader.letterSpacing, fontWeight: THEME.typography.tableHeader.fontWeight, color: THEME.typography.tableHeader.color, textTransform: THEME.typography.tableHeader.textTransform }}>Acción</th>
                                    <th style={{ padding: '0.85rem 1.25rem', fontSize: THEME.typography.tableHeader.fontSize, letterSpacing: THEME.typography.tableHeader.letterSpacing, fontWeight: THEME.typography.tableHeader.fontWeight, color: THEME.typography.tableHeader.color, textTransform: THEME.typography.tableHeader.textTransform }}>Módulo</th>
                                    <th style={{ padding: '0.85rem 1.25rem', fontSize: THEME.typography.tableHeader.fontSize, letterSpacing: THEME.typography.tableHeader.letterSpacing, fontWeight: THEME.typography.tableHeader.fontWeight, color: THEME.typography.tableHeader.color, textTransform: THEME.typography.tableHeader.textTransform }}>Detalles</th>
                                    <th style={{ padding: '0.85rem 1.25rem', width: '50px' }}></th>
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
                                    {logs.map((log) => {
                                        const badge = getActionBadgeColor(log.action);
                                        return (
                                            <tr key={log.id} style={{ borderBottom: `1px solid ${THEME.colors.border}`, fontSize: '0.85rem', verticalAlign: 'middle', transition: 'background-color 0.15s' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#F9FAFB'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                <td style={{ padding: '0.85rem 1.25rem', color: THEME.colors.textMain, fontWeight: '600', whiteSpace: 'nowrap' }}>
                                                    {new Date(log.created_at).toLocaleString('es-CO')}
                                                </td>
                                                <td style={{ padding: '0.85rem 1.25rem', color: THEME.colors.textMain, fontWeight: '700' }}>
                                                    {formatCollaboratorName(log.collaborator_name)}
                                                </td>
                                                <td style={{ padding: '0.85rem 1.25rem' }}>
                                                    <span style={{ display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: '4px', backgroundColor: badge.bg, color: badge.text, fontWeight: '700', fontSize: '0.75rem' }}>
                                                        {formatActionName(log.action)}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.85rem 1.25rem', fontWeight: '700', color: THEME.colors.textSecondary }}>
                                                    {translateModule(log.module)}
                                                </td>
                                                <td style={{ padding: '0.85rem 1.25rem', color: THEME.colors.textSecondary }}>
                                                    {formatDetailsSummary(log)}
                                                </td>
                                                <td style={{ padding: '0.85rem 1.25rem' }}>
                                                    <button 
                                                        onClick={() => setSelectedLog(log)}
                                                        style={{ background: 'none', border: 'none', color: THEME.colors.primary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', borderRadius: '4px' }}
                                                        title="Ver detalles completos"
                                                    >
                                                        <Eye size={18} />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            )}
                        </table>
                    </div>

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
                    <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.xl, border: `1px solid ${THEME.colors.border}`, maxWidth: '650px', width: '100%', padding: '1.5rem', boxShadow: THEME.shadow.lg }}>
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
                                <strong style={{ color: THEME.colors.textSecondary }}>Acción:</strong> {formatActionName(selectedLog.action)}
                            </div>
                            <div>
                                <strong style={{ color: THEME.colors.textSecondary }}>Módulo:</strong> {translateModule(selectedLog.module)}
                            </div>
                            
                            {selectedLog.details && typeof selectedLog.details === 'object' && Object.keys(selectedLog.details).length > 0 && (
                                <div style={{ borderTop: `1px solid ${THEME.colors.border}`, paddingTop: '0.8rem', marginTop: '0.4rem' }}>
                                    <strong style={{ color: THEME.colors.textSecondary, display: 'block', marginBottom: '0.4rem' }}>Información Procesada:</strong>
                                    <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '6px', backgroundColor: '#F9FAFB', padding: '0.8rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}` }}>
                                        {Object.entries(selectedLog.details).map(([k, v]) => (
                                            <React.Fragment key={k}>
                                                <span style={{ fontWeight: '700', color: THEME.colors.textSecondary }}>{translateDetailsKey(k)}:</span>
                                                <span style={{ color: THEME.colors.textMain, wordBreak: 'break-all' }}>{formatDetailsValue(k, v)}</span>
                                            </React.Fragment>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div>
                                <strong style={{ color: THEME.colors.textSecondary }}>Datos del Objeto (JSON original):</strong>
                                <pre style={{ marginTop: '0.5rem', padding: '1rem', backgroundColor: THEME.colors.background, borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, fontSize: '0.75rem', fontFamily: 'monospace', overflowX: 'auto', whiteSpace: 'pre-wrap', maxHeight: '200px', overflowY: 'auto' }}>
                                    {JSON.stringify(selectedLog.details, null, 2)}
                                </pre>
                            </div>
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
