'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/authContext';
import { useRouter } from 'next/navigation';
import { RefreshCw, Activity, Settings, HelpCircle, ShieldCheck, ArrowLeft, MapPin, History, Download, Search, Calendar, User, Loader2, Eye } from 'lucide-react';
import GeofencingManager from '@/components/admin/GeofencingManager';
import { APIProvider } from '@vis.gl/react-google-maps';
import TechUserGovernance from '@/components/admin/TechUserGovernance';
import * as XLSX from 'xlsx';

interface Point {
    lat: number;
    lng: number;
}

const AVAILABLE_MODULES = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'hr', label: 'Talento Humano' },
    { id: 'inventory', label: 'Inventarios' },
    { id: 'commercial', label: 'Comercial' },
    { id: 'transport', label: 'Transporte' },
    { id: 'maintenance', label: 'Mantenimiento' },
    { id: 'command_center', label: 'Command Center' },
    { id: 'client_portal_b2b', label: 'Portal B2B' },
    { id: 'client_portal_b2c', label: 'Portal B2C' }
];

interface Role {
    value: string;
    label: string;
    color: string;
    permissions?: string[];
}

interface Setting {
    key: string;
    value: string;
}

interface Ticket {
    id: string;
    subject: string;
    description: string;
    category: string;
    priority: string;
    status: string;
    created_at: string;
    first_response_at: string | null;
    resolved_at: string | null;
    user_email: string;
    user_name: string;
    response: string | null;
    response_time_minutes?: number | null;
}

interface Tenant {
    id: string;
    name: string;
    url: string;
    status: string;
    end_date: string;
    last_sync: string;
}

interface TenantDbRow {
    id: string;
    tenant_name: string;
    supabase_url: string;
    status: string;
    subscription_end: string;
    last_sync: string;
}

export default function CommandCenter() {
    const { profile, loading: authLoading } = useAuth();
    const router = useRouter();
    const [settings, setSettings] = useState<Setting[]>([]);
    const [loading, setLoading] = useState(true);
    const [, setStatusMessage] = useState({ text: '', type: '' });
    const [isEditing, setIsEditing] = useState(false);
    const [activeTab, setActiveTab] = useState<'governance' | 'helpdesk' | 'approvals' | 'fleet' | 'geofencing' | 'audit'>('governance');
    
    // Help Desk state
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [, setTicketsLoading] = useState(false);
    const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
    const [responseText, setResponseText] = useState('');
    const [ticketFilter, setTicketFilter] = useState<string>('all');
    const [savingResponse, setSavingResponse] = useState(false);
    const [ticketsError, setTicketsError] = useState<string | null>(null);

    // Fleet state
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [syncing, setSyncing] = useState<string | null>(null);
    const [currentBranch, setCurrentBranch] = useState<string>('Detectando...');

    // Audit logs state (Hot storage: strictly limited to last 6 months)
    const [auditLogs, setAuditLogs] = useState<any[]>([]);
    const [auditLoading, setAuditLoading] = useState(false);
    const [auditPage, setAuditPage] = useState(0);
    const [auditHasMore, setAuditHasMore] = useState(true);
    const [auditExporting, setAuditExporting] = useState(false);
    const [auditSearchTerm, setAuditSearchTerm] = useState('');
    const [auditSelectedModules, setAuditSelectedModules] = useState<string[]>([]);
    const [auditSelectedActions, setAuditSelectedActions] = useState<string[]>([]);
    const [auditDatePreset, setAuditDatePreset] = useState('all');
    const [auditStartDate, setAuditStartDate] = useState('');
    const [auditEndDate, setAuditEndDate] = useState('');
    const [auditDetailSearch, setAuditDetailSearch] = useState('');
    const [auditSelectedLog, setAuditSelectedLog] = useState<any | null>(null);
    const [auditRefreshKey, setAuditRefreshKey] = useState(0);

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

    const getActionBadgeColor = (action: string) => {
        if (action.startsWith('INSERT_')) return { bg: '#DEF7EC', text: '#03543F' };
        if (action.startsWith('UPDATE_')) return { bg: '#FEF08A', text: '#713F12' };
        if (action.startsWith('DELETE_')) return { bg: '#FDE8E8', text: '#9B1C1C' };
        return { bg: '#E5EDFF', text: '#1E40AF' }; // Security or other
    };

    const applyAuditFilters = useCallback((query: any) => {
        // ENFORCE 6 MONTHS LIMIT (Strict Hot Storage Policy)
        const limitDate = new Date();
        limitDate.setMonth(limitDate.getMonth() - 6);
        query = query.gte('created_at', limitDate.toISOString());

        if (auditSearchTerm.trim()) {
            const term = `%${auditSearchTerm.trim()}%`;
            query = query.or(`collaborator_name.ilike.${term},action.ilike.${term},module.ilike.${term}`);
        }
        
        if (auditSelectedModules.length > 0) {
            query = query.in('module', auditSelectedModules);
        }
        
        if (auditSelectedActions.length > 0) {
            const actionParts = [];
            if (auditSelectedActions.includes('create')) actionParts.push('action.like.INSERT_%');
            if (auditSelectedActions.includes('update')) actionParts.push('action.like.UPDATE_%');
            if (auditSelectedActions.includes('delete')) actionParts.push('action.like.DELETE_%');
            if (auditSelectedActions.includes('security')) actionParts.push('module.eq.SECURITY');
            
            if (actionParts.length > 0) {
                query = query.or(actionParts.join(','));
            }
        }
        
        if (auditDatePreset === 'today') {
            const start = new Date();
            start.setHours(0, 0, 0, 0);
            query = query.gte('created_at', start.toISOString());
        } else if (auditDatePreset === 'week') {
            const start = new Date();
            start.setDate(start.getDate() - 7);
            query = query.gte('created_at', start.toISOString());
        } else if (auditDatePreset === 'month') {
            const start = new Date();
            start.setDate(start.getDate() - 30);
            query = query.gte('created_at', start.toISOString());
        } else if (auditDatePreset === 'custom') {
            if (auditStartDate) {
                query = query.gte('created_at', new Date(auditStartDate).toISOString());
            }
            if (auditEndDate) {
                const end = new Date(auditEndDate);
                end.setHours(23, 59, 59, 999);
                query = query.lte('created_at', end.toISOString());
            }
        }
        
        return query;
    }, [auditSearchTerm, auditSelectedModules, auditSelectedActions, auditDatePreset, auditStartDate, auditEndDate]);

    useEffect(() => {
        const getBranch = async () => {
            try {
                const res = await fetch('/api/maintenance/branch');
                const data = await res.json();
                setCurrentBranch(data.branch);
            } catch {
                setCurrentBranch('Error');
            }
        };
        getBranch();
    }, []);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    
    const [newRole, setNewRole] = useState<Role>({
        label: '',
        value: '',
        color: '#64748B',
        permissions: []
    });

    const PAGE_SIZE = 50;

    const fetchAuditLogsInitial = useCallback(async () => {
        setAuditLoading(true);
        try {
            let query = supabase
                .from('audit_logs')
                .select('*');
                
            query = applyAuditFilters(query);
            
            const { data, error } = await query
                .order('created_at', { ascending: false })
                .range(0, PAGE_SIZE - 1);
                
            if (error) throw error;
            
            setAuditLogs(data || []);
            setAuditHasMore((data || []).length === PAGE_SIZE);
            setAuditPage(0);
        } catch (err: any) {
            console.error('Error loading audit logs in command center:', err);
        } finally {
            setAuditLoading(false);
        }
    }, [applyAuditFilters]);

    const loadMoreAuditLogs = async () => {
        if (auditLoading || !auditHasMore) return;
        const nextPage = auditPage + 1;
        setAuditLoading(true);
        try {
            let query = supabase
                .from('audit_logs')
                .select('*');
                
            query = applyAuditFilters(query);
            
            const { data, error } = await query
                .order('created_at', { ascending: false })
                .range(nextPage * PAGE_SIZE, (nextPage + 1) * PAGE_SIZE - 1);
                
            if (error) throw error;
            
            setAuditLogs(prev => [...prev, ...(data || [])]);
            setAuditHasMore((data || []).length === PAGE_SIZE);
            setAuditPage(nextPage);
        } catch (err) {
            console.error('Error loading more audit logs:', err);
        } finally {
            setAuditLoading(false);
        }
    };

    const handleExportAuditXLSX = async () => {
        setAuditExporting(true);
        try {
            let query = supabase
                .from('audit_logs')
                .select('*');
            query = applyAuditFilters(query);
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
            setAuditExporting(false);
        }
    };

    const fetchSettings = useCallback(async () => {
        try {
            const { data, error } = await supabase.from('app_settings').select('*');
            if (error) throw error;
            setSettings(data || []);
        } catch (error) {
            console.error('Error fetching settings:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchTickets = useCallback(async () => {
        setTicketsLoading(true);
        setTicketsError(null);
        try {
            const { data, error } = await supabase
                .from('support_tickets_metrics')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) {
                if (error.code === '42P01' || error.message?.includes('does not exist')) {
                    setTicketsError('setup_required');
                } else {
                    setTicketsError(error.message || 'Error desconocido');
                }
                return;
            }
            setTickets(data || []);
        } catch (e: unknown) {
            setTicketsError(e instanceof Error ? e.message : 'Error de conexión');
        } finally {
            setTicketsLoading(false);
        }
    }, []);

    const fetchTenants = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('fleet_tenants')
                .select('*')
                .order('tenant_name', { ascending: true });
            
            if (error) throw error;
            
            const formattedTenants: Tenant[] = (data || []).map((t: TenantDbRow) => ({
                id: t.id,
                name: t.tenant_name,
                url: t.supabase_url.replace('https://', '').replace('.supabase.co', ''),
                status: t.status,
                end_date: t.subscription_end ? new Date(t.subscription_end).toLocaleDateString('es-CO') : 'N/A',
                last_sync: t.last_sync ? new Date(t.last_sync).toLocaleString('es-CO', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : 'Nunca'
            }));
            
            setTenants(formattedTenants);
        } catch (err) {
            console.error('Error fetching fleet:', err);
        }
    }, []);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const tabParam = params.get('tab');
            if (tabParam && ['governance', 'helpdesk', 'approvals', 'fleet', 'geofencing', 'audit'].includes(tabParam)) {
                setActiveTab(tabParam as any);
            }
        }
    }, []);

    useEffect(() => {
        if (!authLoading && profile?.role !== 'sys_admin') {
            router.push('/admin');
        }
        fetchSettings();
    }, [profile, authLoading, router, fetchSettings]);

    useEffect(() => {
        if (activeTab === 'helpdesk') fetchTickets();
        if (activeTab === 'fleet') fetchTenants();
        if (activeTab === 'audit') fetchAuditLogsInitial();
    }, [activeTab, fetchTickets, fetchTenants, fetchAuditLogsInitial, auditRefreshKey]);

    const toggleSelection = (id: string) => {
        setSelectedIds(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handleSync = async () => {
        if (selectedIds.length === 0) return;
        setSyncing('global');
        try {
            // PASO 1: Deploy de código (git push CORE → ramas remotas, sin cambiar rama local)
            const deployRes = await fetch('/api/maintenance/update-all', { method: 'POST' });
            const deployData = await deployRes.json();

            if (!deployData.success) {
                const detail = deployData.results
                    ?.map((r: { branch: string; success: boolean; message: string }) => `${r.branch}: ${r.success ? '✅' : '❌ ' + r.message}`)
                    .join('\n') || deployData.error;
                alert('⚠️ Deploy de código falló:\n\n' + detail);
                return;
            }

            // PASO 2: Sync de configuración en Supabase (branding, unidades, settings)
            const configRes = await fetch('/api/fleet/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ selectedIds })
            });
            const configData = await configRes.json();

            const deploySummary = deployData.results
                ?.map((r: { branch: string; success: boolean; message: string }) => `• ${r.branch}: ${r.success ? '✅ ' + r.message : '❌ ' + r.message}`)
                .join('\n') || '';

            if (configData.success) {
                alert(`🚀 Deploy completo:\n\n${deploySummary}\n\n⚙️ Config sincronizada. Vercel redespliega en ~60s.`);
            } else {
                alert(`Código desplegado pero config falló:\n\n${deploySummary}`);
            }
            fetchTenants();
        } catch (err) {
            console.error('Full Deploy Error:', err);
            alert('Error inesperado en el deploy. Revisa la consola del servidor.');
        } finally {
            setSyncing(null);
        }
    };


    const handleRespond = async (ticket: Ticket) => {
        if (!responseText.trim()) return;
        setSavingResponse(true);
        try {
            const updates: any = {
                response: responseText,
                status: 'in_progress',
                updated_at: new Date().toISOString(),
            };
            if (!ticket.first_response_at) {
                updates.first_response_at = new Date().toISOString();
            }
            const { error } = await supabase.from('support_tickets').update(updates).eq('id', ticket.id);
            if (error) throw error;
            setResponseText('');
            setSelectedTicket(null);
            fetchTickets();
        } catch (e: any) {
            console.error('Error responding to ticket:', e);
        } finally {
            setSavingResponse(false);
        }
    };

    const handleResolve = async (ticketId: string) => {
        const { error } = await supabase.from('support_tickets').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', ticketId);
        if (!error) fetchTickets();
    };

    const formatResponseTime = (minutes: number | null | undefined): string => {
        if (!minutes && minutes !== 0) return '—';
        if (minutes < 60) return `${minutes}m`;
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return m > 0 ? `${h}h ${m}m` : `${h}h`;
    };

    const handleUpdateSetting = async (key: string, newValue: string) => {
        try {
            const { error } = await supabase.from('app_settings').upsert({ key, value: newValue });
            if (error) throw error;
            
            setSettings(prev => {
                const exists = prev.find(s => s.key === key);
                if (exists) {
                    return prev.map(s => s.key === key ? { ...s, value: newValue } : s);
                }
                return [...prev, { key, value: newValue }];
            });
            
            setStatusMessage({ text: 'Configuración actualizada', type: 'success' });
            setTimeout(() => setStatusMessage({ text: '', type: '' }), 3000);
            return true;
        } catch (error) {
            console.error('Error updating setting:', error);
            setStatusMessage({ text: 'Error al actualizar gobernanza', type: 'error' });
            return false;
        }
    };

    const getActiveUnits = () => {
        const standard = settings.find(s => s.key === 'standard_units')?.value || '';
        const suspended = settings.find(s => s.key === 'suspended_units')?.value || '';
        const suspendedList = suspended ? suspended.split(',') : [];
        return standard ? standard.split(',').filter((u: string) => !suspendedList.includes(u)) : [];
    };

    const addNewUnit = async (unit: string) => {
        const standard = settings.find(s => s.key === 'standard_units')?.value || '';
        const list = standard ? standard.split(',') : [];
        if (!list.includes(unit)) {
            const newList = [...list, unit].join(',');
            await handleUpdateSetting('standard_units', newList);
        }
    };

    const removeUnitPermanently = async (unit: string) => {
        if (!window.confirm(`¿Estás SEGURO de eliminar "${unit}" permanentemente?`)) return;
        const standard = settings.find(s => s.key === 'standard_units')?.value || '';
        const newList = standard.split(',').filter((u: string) => u !== unit).join(',');
        await handleUpdateSetting('standard_units', newList);
    };

    const getSystemRoles = (): Role[] => {
        const rolesJson = settings.find(s => s.key === 'system_roles')?.value;
        if (rolesJson) {
            try { return JSON.parse(rolesJson); } catch (e) { console.error('Error parsing roles:', e); }
        }
        return [
            { value: 'admin', label: 'Admin Principal', color: '#1E293B', permissions: AVAILABLE_MODULES.map(m => m.id) },
            { value: 'administrativo', label: 'Administrativo', color: '#64748B', permissions: ['dashboard', 'hr', 'commercial'] },
            { value: 'web_admin', label: 'Administrador Web', color: '#3B82F6', permissions: ['dashboard', 'inventory', 'commercial'] },
            { value: 'comercial', label: 'Comercial', color: '#8B5CF6', permissions: ['dashboard', 'commercial'] },
            { value: 'sys_admin', label: 'Administrador del Sistema', color: '#1E293B', permissions: AVAILABLE_MODULES.map(m => m.id) },
            { value: 'contabilidad', label: 'Contabilidad', color: '#0EA5E9', permissions: ['dashboard', 'commercial'] },
            { value: 'driver', label: 'Conductor', color: '#10B981', permissions: ['transport'] },
            { value: 'comprador', label: 'Comprador', color: '#F59E0B', permissions: ['inventory', 'commercial'] },
            { value: 'internal_transport', label: 'Transporte Interno', color: '#D946EF', permissions: ['transport'] },
            { value: 'warehouse_aux', label: 'Auxiliar de Bodega', color: '#475569', permissions: ['inventory'] },
            { value: 'b2b_client', label: 'Cliente B2B', color: '#2563EB', permissions: ['client_portal_b2b'] },
            { value: 'b2c_client', label: 'Cliente B2C', color: '#DB2777', permissions: ['client_portal_b2c'] }
        ];
    };

    const saveRole = async () => {
        if (!newRole.label || !newRole.value) { alert('Nombre y Código requeridos'); return; }
        const currentRoles = getSystemRoles();
        let newList;
        if (isEditing) { newList = currentRoles.map(r => r.value === newRole.value ? newRole : r); }
        else {
            if (currentRoles.find(r => r.value === newRole.value)) { alert('Código ya existe'); return; }
            newList = [...currentRoles, newRole];
        }
        await handleUpdateSetting('system_roles', JSON.stringify(newList));
        setNewRole({ label: '', value: '', color: '#64748B', permissions: [] });
        setIsEditing(false);
    };

    const handleEditRole = (role: Role) => {
        setNewRole({ ...role, permissions: role.permissions || [] });
        setIsEditing(true);
        document.getElementById('roles-section')?.scrollIntoView({ behavior: 'smooth' });
    };

    const removeRole = async (roleValue: string) => {
        // Only CORE system roles are truly protected
        if (['admin', 'sys_admin'].includes(roleValue)) {
            alert('Este es un rol raíz del motor CORE y no puede ser eliminado.');
            return;
        }
        
        if (!window.confirm(`¿Estás seguro de eliminar el rol "${roleValue}"?`)) return;
        
        const currentRoles = getSystemRoles();
        const newList = currentRoles.filter(r => r.value !== roleValue);
        await handleUpdateSetting('system_roles', JSON.stringify(newList));
    };

    const togglePermission = (moduleId: string) => {
        setNewRole(prev => {
            const perms = prev.permissions || [];
            return { ...prev, permissions: perms.includes(moduleId) ? perms.filter(p => p !== moduleId) : [...perms, moduleId] };
        });
    };

    if (authLoading || loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando Centro de Mando Técnico...</div>;

    const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
        urgent: { label: 'Urgente', color: '#991B1B', bg: '#FEE2E2' },
        high:   { label: 'Alta',    color: '#C2410C', bg: '#FFEDD5' },
        normal: { label: 'Normal',  color: '#1D4ED8', bg: '#EFF6FF' },
        low:    { label: 'Baja',    color: '#166534', bg: '#F0FDF4' },
    };

    const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
        open:        { label: 'Abierto',     color: '#B45309', bg: '#FEF9C3', dot: '#F59E0B' },
        in_progress: { label: 'En progreso', color: '#1D4ED8', bg: '#EFF6FF', dot: '#3B82F6' },
        waiting:     { label: 'En espera',   color: '#7C3AED', bg: '#F5F3FF', dot: '#8B5CF6' },
        resolved:    { label: 'Resuelto',    color: '#166534', bg: '#F0FDF4', dot: '#10B981' },
    };

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F3F4F6', padding: '2rem' }}>
            <div style={{ maxWidth: '1440px', margin: '0 auto' }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
                    <div>
                        <h1 style={{ fontSize: '2.5rem', fontWeight: '900', color: '#111827', margin: 0 }}>DELTA <span style={{ color: '#D4AF37' }}>Command Center</span></h1>
                        <p style={{ color: '#6B7280', fontSize: '1rem', marginTop: '8px' }}>Consola Maestra de Gobernanza del Motor FruFresco CORE.</p>
                    </div>
                    <button 
                        onClick={() => router.push('/admin/dashboard')}
                        style={{ 
                            display: 'flex', alignItems: 'center', gap: '8px', 
                            padding: '10px 20px', backgroundColor: 'white', border: '1px solid #E5E7EB', 
                            borderRadius: '12px', fontWeight: '800', color: '#111827', cursor: 'pointer',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.05)', transition: 'all 0.2s'
                        }}
                    >
                        <ArrowLeft size={18} /> Menú Admin
                    </button>
                </header>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.5fr', gap: '1.5rem', marginBottom: '2rem' }}>
                    <div style={{ backgroundColor: '#111827', borderRadius: '20px', padding: '1.2rem 1.5rem', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <h3 style={{ fontSize: '0.65rem', fontWeight: '900', textTransform: 'uppercase', color: '#9CA3AF', margin: '0 0 4px 0' }}>Salud del Motor</h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10B981', boxShadow: '0 0 10px #10B981' }}></div>
                                <span style={{ fontWeight: '700', fontSize: '0.85rem' }}>Supabase Active</span>
                            </div>
                        </div>
                    </div>
                    <div style={{ backgroundColor: 'white', borderRadius: '20px', padding: '1.2rem 1.5rem', border: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: currentBranch === 'CORE' ? '#F5F3FF' : '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: currentBranch === 'CORE' ? '#7C3AED' : '#EF4444' }}>
                            <RefreshCw size={20} className={currentBranch === 'CORE' && syncing ? 'animate-spin' : ''} />
                        </div>
                        <div>
                            <span style={{ color: '#6B7280', fontSize: '0.65rem', display: 'block', fontWeight: '800', textTransform: 'uppercase' }}>Rama Local Activa</span>
                            <span style={{ fontWeight: '900', fontSize: '1rem', color: currentBranch === 'CORE' ? '#7C3AED' : '#EF4444' }}>{currentBranch}</span>
                        </div>
                    </div>
                    <div style={{ backgroundColor: '#F0F9FF', borderRadius: '20px', padding: '1.2rem 1.5rem', border: '1px solid #BAE6FD', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '1.2rem' }}>💡</span>
                        <p style={{ fontSize: '0.75rem', color: '#0369A1', margin: 0, fontWeight: '600' }}>Nivel <strong>Chief Engineer</strong> activo.</p>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', borderBottom: '1px solid #E5E7EB', padding: '0 10px', overflowX: 'auto' }}>
                    {[
                        { id: 'governance', label: 'Gobernanza', icon: <Settings size={18}/> },
                        { id: 'helpdesk', label: 'Mesa de Ayuda', icon: <HelpCircle size={18}/> },
                        { id: 'approvals', label: 'Aprobaciones', icon: <ShieldCheck size={18}/> },
                        { id: 'geofencing', label: 'Geocercas', icon: <MapPin size={18}/> },
                        { id: 'fleet', label: 'Flota SaaS', icon: <Activity size={18}/> },
                        { id: 'audit', label: 'Auditoría / Logs', icon: <History size={18}/> }
                    ].map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} style={{ padding: '12px 24px', backgroundColor: 'transparent', color: activeTab === tab.id ? '#111827' : '#6B7280', border: 'none', borderBottom: activeTab === tab.id ? '3px solid #111827' : '3px solid transparent', fontWeight: '800', fontSize: '0.9rem', cursor: 'pointer', transition: 'all 0.2s', marginBottom: '-1px', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    {activeTab === 'governance' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                            <section style={{ backgroundColor: 'white', borderRadius: '24px', padding: '2rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #E5E7EB' }}>
                                <h2 style={{ fontSize: '1.25rem', fontWeight: '900', marginBottom: '1.5rem' }}>📏 Gobernanza de Unidades</h2>
                                <div style={{ display: 'flex', gap: '10px', marginBottom: '1.5rem' }}>
                                    <input placeholder="+ Registrar nueva unidad técnica..." style={{ flex: 1, padding: '12px 1rem', borderRadius: '12px', border: '1px solid #D1D5DB', fontWeight: '600' }} onKeyDown={(e) => { if(e.key==='Enter' && e.currentTarget.value) { addNewUnit(e.currentTarget.value); e.currentTarget.value=''; } }} />
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                                    {getActiveUnits().map((u: string) => (
                                        <div key={u} style={{ backgroundColor: '#F0F9FF', padding: '10px 1.2rem', borderRadius: '15px', border: '1px solid #BAE6FD', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <span style={{ fontWeight: '800', color: '#0369A1' }}>{u}</span>
                                            <button onClick={() => removeUnitPermanently(u)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#EF4444', fontSize: '1.2rem' }}> × </button>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            <section id="roles-section" style={{ backgroundColor: 'white', borderRadius: '24px', padding: '2rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #E5E7EB' }}>
                                <h2 style={{ fontSize: '1.25rem', fontWeight: '900', marginBottom: '1.5rem' }}>👔 Gobernanza de Roles</h2>
                                <div style={{ border: '1px solid #E5E7EB', borderRadius: '12px', overflow: 'hidden' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                        <thead style={{ backgroundColor: '#F9FAFB' }}>
                                            <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
                                                <th style={{ padding: '12px', textAlign: 'left' }}>Rol</th>
                                                <th style={{ padding: '12px', textAlign: 'left' }}>Código</th>
                                                <th style={{ padding: '12px', textAlign: 'center' }}>Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {getSystemRoles().map((role: Role) => (
                                                <tr key={role.value} style={{ borderBottom: '1px solid #F3F4F6' }}>
                                                    <td style={{ padding: '10px 12px' }}>{role.label}</td>
                                                    <td style={{ padding: '10px 12px' }}>{role.value}</td>
                                                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                                        <button onClick={() => handleEditRole(role)} style={{ border: 'none', background: '#F1F5F9', color: '#475569', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer' }}>EDITAR</button>
                                                        {!['admin', 'b2b_client', 'b2c_client'].includes(role.value) && (
                                                            <button onClick={() => removeRole(role.value)} style={{ border: 'none', background: '#FEE2E2', color: '#EF4444', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', marginLeft: '4px' }}>ELIMINAR</button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div style={{ marginTop: '1.5rem', padding: '1.5rem', backgroundColor: '#F8FAFC', borderRadius: '16px', border: '1.5px dashed #CBD5E1' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '900' }}>{isEditing ? '🛠️ Editando Rol Técnico' : '➕ Crear Nuevo Rol'}</h3>
                                        {isEditing && <button onClick={() => { setIsEditing(false); setNewRole({ label: '', value: '', color: '#64748B', permissions: [] }); }} style={{ background: 'none', border: 'none', color: '#64748B', fontWeight: '700', cursor: 'pointer' }}>Cancelar</button>}
                                    </div>
                                    
                                    <div style={{ display: 'flex', gap: '10px', marginBottom: '1.5rem' }}>
                                        <input value={newRole.label} onChange={e => setNewRole({...newRole, label: e.target.value})} placeholder="Nombre Comercial" style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid #D1D5DB', fontWeight: '700' }} />
                                        <input value={newRole.value} onChange={e => setNewRole({...newRole, value: e.target.value})} disabled={isEditing} placeholder="Código Sistema" style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid #D1D5DB', fontWeight: '800', backgroundColor: isEditing ? '#F3F4F6' : 'white' }} />
                                        <button onClick={saveRole} style={{ padding: '0 2rem', background: '#111827', color: 'white', border: 'none', borderRadius: '12px', fontWeight: '800', cursor: 'pointer' }}>{isEditing ? 'ACTUALIZAR' : 'GUARDAR'}</button>
                                    </div>

                                    <div style={{ padding: '1rem', backgroundColor: '#ECFDF5', borderRadius: '12px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #10B98133' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <span style={{ fontSize: '1.2rem' }}>💎</span>
                                            <div>
                                                <div style={{ fontWeight: '900', fontSize: '0.85rem', color: '#065F46' }}>ACCESO MAESTRO (ALL ACCESS)</div>
                                                <div style={{ fontSize: '0.7rem', color: '#059669', fontWeight: '600' }}>Acceso total a la plataforma operativa (Excluye Command Center)</div>
                                            </div>
                                        </div>
                                        <input 
                                            type="checkbox" 
                                            style={{ width: '22px', height: '22px', cursor: 'pointer' }}
                                            checked={AVAILABLE_MODULES.filter(m => m.id !== 'command_center').every(m => (newRole.permissions || []).includes(m.id))}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setNewRole(prev => ({ ...prev, permissions: AVAILABLE_MODULES.filter(m => m.id !== 'command_center').map(m => m.id) }));
                                                } else {
                                                    setNewRole(prev => ({ ...prev, permissions: [] }));
                                                }
                                            }}
                                        />
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                                        {AVAILABLE_MODULES.map(m => {
                                            const isCC = m.id === 'command_center';
                                            return (
                                                <label 
                                                    key={m.id} 
                                                    style={{ 
                                                        display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', 
                                                        borderRadius: '10px', backgroundColor: isCC ? '#F1F5F9' : 'white', 
                                                        border: '1px solid #E2E8F0', cursor: isCC ? 'not-allowed' : 'pointer',
                                                        opacity: isCC ? 0.5 : 1
                                                    }}
                                                >
                                                    <input 
                                                        type="checkbox" 
                                                        checked={(newRole.permissions || []).includes(m.id)} 
                                                        disabled={isCC}
                                                        onChange={() => togglePermission(m.id)} 
                                                    /> 
                                                    <span style={{ fontSize: '0.8rem', fontWeight: '700', color: isCC ? '#94A3B8' : '#334155' }}>
                                                        {m.label} {isCC && '(PROTEGIDO)'}
                                                    </span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            </section>
                        </div>
                    )}

                    {activeTab === 'helpdesk' && (() => {
                        const filtered = ticketFilter === 'all' ? tickets : tickets.filter(t => t.status === ticketFilter);
                        const stats = {
                            open: tickets.filter(t => t.status === 'open').length,
                            in_progress: tickets.filter(t => t.status === 'in_progress').length,
                            resolved: tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length,
                            avgResponse: (() => {
                                const responded = tickets.filter((t: Ticket) => t.response_time_minutes != null);
                                if (!responded.length) return null;
                                return Math.round(responded.reduce((s, t) => s + (t.response_time_minutes || 0), 0) / responded.length);
                            })(),
                        };
                        return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                                    {[
                                        { label: 'Abiertos', value: stats.open, color: '#B45309', bg: '#FEF9C3' },
                                        { label: 'En progreso', value: stats.in_progress, color: '#1D4ED8', bg: '#EFF6FF' },
                                        { label: 'Resueltos', value: stats.resolved, color: '#166534', bg: '#F0FDF4' },
                                        { label: 'Tiempo prom.', value: formatResponseTime(stats.avgResponse), color: '#7C3AED', bg: '#F5F3FF' }
                                    ].map(kpi => (
                                        <div key={kpi.label} style={{ backgroundColor: kpi.bg, borderRadius: '16px', padding: '1.2rem', border: `1px solid ${kpi.color}20` }}>
                                            <div style={{ fontSize: '1.8rem', fontWeight: '900', color: kpi.color }}>{kpi.value ?? '—'}</div>
                                            <div style={{ fontSize: '0.7rem', fontWeight: '800', color: kpi.color }}>{kpi.label}</div>
                                        </div>
                                    ))}
                                </div>
                                <section style={{ backgroundColor: 'white', borderRadius: '24px', padding: '2rem', border: '1px solid #E5E7EB' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                        <h2>Solicitudes de Soporte</h2>
                                        <div>
                                            {['all', 'open', 'in_progress', 'resolved'].map(f => (
                                                <button key={f} onClick={() => setTicketFilter(f)} style={{ padding: '4px 10px', marginLeft: '4px', background: ticketFilter === f ? '#111827' : '#F3F4F6', color: ticketFilter === f ? 'white' : '#6B7280', border: 'none', borderRadius: '20px', cursor: 'pointer' }}>{f}</button>
                                            ))}
                                        </div>
                                    </div>
                                    {ticketsError === 'setup_required' ? <p>Tabla no encontrada.</p> : filtered.length === 0 ? <p>No hay solicitudes.</p> : (
                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                            <thead><tr><th>Asunto</th><th>Usuario</th><th>Estado</th><th>Acciones</th></tr></thead>
                                            <tbody>
                                                {filtered.map(t => (
                                                    <tr key={t.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                                                        <td style={{ padding: '10px' }}>{t.subject}</td>
                                                        <td>{t.user_name}</td>
                                                        <td><span style={{ backgroundColor: STATUS_CONFIG[t.status]?.bg, color: STATUS_CONFIG[t.status]?.color, padding: '2px 8px', borderRadius: '6px' }}>{STATUS_CONFIG[t.status]?.label}</span></td>
                                                        <td>
                                                            <button onClick={() => { setSelectedTicket(t); setResponseText(t.response || ''); }} style={{ padding: '4px 8px', borderRadius: '6px', background: '#F1F5F9', border: 'none' }}>Responder</button>
                                                            {t.status !== 'resolved' && <button onClick={() => handleResolve(t.id)} style={{ marginLeft: '4px', padding: '4px 8px', background: '#DCFCE7', color: '#166534', border: 'none', borderRadius: '6px' }}>Resolve</button>}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </section>
                                {selectedTicket && (
                                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 100 }}>
                                        <div style={{ background: 'white', padding: '2rem', borderRadius: '20px', maxWidth: '500px', width: '100%' }}>
                                            <h3>{selectedTicket.subject}</h3>
                                            <p>{selectedTicket.description}</p>
                                            <textarea value={responseText} onChange={e => setResponseText(e.target.value)} rows={4} style={{ width: '100%', padding: '10px', borderRadius: '10px' }} />
                                            <button onClick={() => handleRespond(selectedTicket)} disabled={savingResponse} style={{ marginTop: '10px', padding: '10px 20px', display: 'block', width: '100%', background: '#111827', color: 'white', borderRadius: '10px' }}>{savingResponse ? 'Enviando...' : 'Responder'}</button>
                                            <button onClick={() => setSelectedTicket(null)} style={{ marginTop: '10px', width: '100%', background: 'none', border: 'none' }}>Cerrar</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })()}

                    {activeTab === 'approvals' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                            <section style={{ backgroundColor: 'white', borderRadius: '24px', padding: '2.5rem', border: '1px solid #E5E7EB' }}>
                                <h2>Flujos de Aprobación</h2>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                                    <div style={{ padding: '1.5rem', background: '#FDF2F2', borderRadius: '20px', opacity: 0.6 }}><h3>Geocercas</h3><p>Pendiente.</p></div>
                                    <div style={{ padding: '1.5rem', background: '#F0FDF4', borderRadius: '20px' }}><h3>Usuarios Tech</h3><p>Control nivel 3 activo.</p></div>
                                </div>
                                <TechUserGovernance />
                            </section>
                        </div>
                    )}

                    {activeTab === 'fleet' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h2>🚢 Control de Flota SaaS</h2>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <button onClick={handleSync} disabled={selectedIds.length === 0 || !!syncing} style={{ background: '#111827', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '12px', border: 'none', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px', cursor: selectedIds.length > 0 ? 'pointer' : 'not-allowed', opacity: selectedIds.length > 0 ? 1 : 0.5, whiteSpace: 'nowrap' }}>
                                    <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
                                    {syncing ? 'Desplegando...' : `🚀 Deploy a ${selectedIds.length} Instancias`}
                                </button>
                            </div>
                            </div>
                            <div style={{ background: 'white', borderRadius: '20px', border: '1px solid #E5E7EB', overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                                    <thead style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                                        <tr>
                                            <th style={{ padding: '1rem' }}><input type="checkbox" onChange={(e) => setSelectedIds(e.target.checked ? tenants.map(t => t.id) : [])} /></th>
                                            <th style={{ padding: '1rem' }}>INSTANCIA</th>
                                            <th style={{ padding: '1rem' }}>ESTADO</th>
                                            <th style={{ padding: '1rem' }}>ÚLTIMO SYNC</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tenants.map(t => (
                                            <tr key={t.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                                                <td style={{ padding: '1rem' }}><input type="checkbox" checked={selectedIds.includes(t.id)} onChange={() => toggleSelection(t.id)} /></td>
                                                <td style={{ padding: '1rem' }}><strong>{t.name}</strong><br/><span style={{ fontSize: '0.7rem', color: '#6B7280' }}>{t.url}</span></td>
                                                <td style={{ padding: '1rem' }}><span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '0.7rem', background: t.status === 'active' ? '#DCFCE7' : '#FEE2E2', color: t.status === 'active' ? '#166534' : '#9B1C1C' }}>{t.status.toUpperCase()}</span></td>
                                                <td style={{ padding: '1rem', color: '#9CA3AF' }}>{t.last_sync}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'geofencing' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h2>📍 Control Maestro de Geocercas</h2>
                                <p style={{ fontSize: '0.8rem', color: '#6B7280', margin: 0 }}>Define los perímetros globales de operación B2B y B2C.</p>
                            </div>
                            <div style={{ backgroundColor: 'white', borderRadius: '24px', padding: '2rem', border: '1px solid #E5E7EB' }}>
                                <GeofencingManager 
                                    settings={settings} 
                                    onSave={handleUpdateSetting} 
                                    saving={loading} 
                                    canEdit={true} 
                                />
                            </div>
                        </div>
                    )}

                    {activeTab === 'audit' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            {/* Banner Informativo sobre Políticas de Retención */}
                            <div style={{ backgroundColor: '#FDF8F2', border: '1px solid #F59E0B33', borderRadius: '16px', padding: '1.2rem', display: 'flex', gap: '12px', alignItems: 'center' }}>
                                <span style={{ fontSize: '1.5rem' }}>⚠️</span>
                                <div>
                                    <h4 style={{ margin: 0, fontWeight: '800', color: '#B45309', fontSize: '0.85rem' }}>POLÍTICA DE RETENCIÓN DE LOGS (HOT STORAGE: 6 MESES)</h4>
                                    <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: '#B45309', fontWeight: '600' }}>
                                        Por rendimiento del motor FruFresco, solo los últimos 6 meses de logs están indexados en tiempo real. 
                                        Para auditorías históricas o reportes de años anteriores, favor solicitar al administrador de base de datos la exportación del storage en frío.
                                    </p>
                                </div>
                            </div>

                            {/* SUPER BUSCADOR MULTICRITERIO */}
                            <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '24px', border: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', gap: '1.2rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '900', color: '#111827' }}>🔍 Super Buscador Avanzado</h3>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button 
                                            onClick={() => setAuditRefreshKey(p => p + 1)}
                                            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.5rem 0.8rem', background: '#F3F4F6', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '0.75rem', color: '#475569' }}
                                        >
                                            <RefreshCw size={14} className={auditLoading ? 'animate-spin' : ''} />
                                            Recargar
                                        </button>
                                        <button 
                                            onClick={handleExportAuditXLSX}
                                            disabled={auditExporting || auditLogs.length === 0}
                                            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.5rem 1rem', background: '#10B981', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '0.75rem' }}
                                        >
                                            <Download size={14} />
                                            Exportar Filtro (XLSX)
                                        </button>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                    {/* Entrada de texto general */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase' }}>Búsqueda General (Usuario, Acción, Módulo)</label>
                                        <div style={{ position: 'relative' }}>
                                            <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                                            <input 
                                                value={auditSearchTerm}
                                                onChange={e => setAuditSearchTerm(e.target.value)}
                                                placeholder="Buscar por nombre, acción de base de datos..." 
                                                style={{ width: '100%', padding: '10px 10px 10px 32px', borderRadius: '10px', border: '1px solid #D1D5DB', fontSize: '0.8rem', fontWeight: '600' }}
                                            />
                                        </div>
                                    </div>

                                    {/* Selector de Rango de Fechas */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase' }}>Rango de Fechas (Máx. 6 meses)</label>
                                        <div style={{ display: 'flex', gap: '10px' }}>
                                            <select 
                                                value={auditDatePreset} 
                                                onChange={e => setAuditDatePreset(e.target.value)}
                                                style={{ padding: '10px', borderRadius: '10px', border: '1px solid #D1D5DB', fontSize: '0.8rem', fontWeight: '700', backgroundColor: '#F9FAFB' }}
                                            >
                                                <option value="all">Todo el historial (6 meses)</option>
                                                <option value="today">Hoy</option>
                                                <option value="week">Esta semana</option>
                                                <option value="month">Este mes</option>
                                                <option value="custom">Rango Personalizado</option>
                                            </select>
                                            
                                            {auditDatePreset === 'custom' && (
                                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                    <input type="date" value={auditStartDate} onChange={e => setAuditStartDate(e.target.value)} style={{ padding: '8px', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '0.75rem' }} />
                                                    <span style={{ fontSize: '0.75rem', fontWeight: '700' }}>a</span>
                                                    <input type="date" value={auditEndDate} onChange={e => setAuditEndDate(e.target.value)} style={{ padding: '8px', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '0.75rem' }} />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Selección múltiple de módulos mediante chips */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase' }}>Filtrar por Módulos</label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                        {[
                                            { id: 'PRODUCTS', label: 'Productos' },
                                            { id: 'SECURITY', label: 'Seguridad / Perfiles' },
                                            { id: 'ORDERS', label: 'Pedidos' },
                                            { id: 'SETTINGS', label: 'Configuración' },
                                            { id: 'HR_ADMIN', label: 'Talento Humano' }
                                        ].map(mod => {
                                            const isSelected = auditSelectedModules.includes(mod.id);
                                            return (
                                                <button
                                                    key={mod.id}
                                                    onClick={() => {
                                                        setAuditSelectedModules(prev => 
                                                            isSelected ? prev.filter(x => x !== mod.id) : [...prev, mod.id]
                                                        );
                                                    }}
                                                    style={{
                                                        padding: '6px 12px', borderRadius: '20px', border: isSelected ? '1px solid #111827' : '1px solid #E2E8F0',
                                                        backgroundColor: isSelected ? '#111827' : 'white', color: isSelected ? 'white' : '#475569',
                                                        fontWeight: '700', fontSize: '0.75rem', cursor: 'pointer', transition: 'all 0.15s'
                                                    }}
                                                >
                                                    {mod.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Selección múltiple de acciones mediante chips */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase' }}>Filtrar por Tipo de Acción</label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                        {[
                                            { id: 'create', label: 'Creación (INSERT)' },
                                            { id: 'update', label: 'Modificación (UPDATE)' },
                                            { id: 'delete', label: 'Eliminación (DELETE)' },
                                            { id: 'security', label: 'Seguridad' }
                                        ].map(act => {
                                            const isSelected = auditSelectedActions.includes(act.id);
                                            return (
                                                <button
                                                    key={act.id}
                                                    onClick={() => {
                                                        setAuditSelectedActions(prev => 
                                                            isSelected ? prev.filter(x => x !== act.id) : [...prev, act.id]
                                                        );
                                                    }}
                                                    style={{
                                                        padding: '6px 12px', borderRadius: '20px', border: isSelected ? '1px solid #111827' : '1px solid #E2E8F0',
                                                        backgroundColor: isSelected ? '#111827' : 'white', color: isSelected ? 'white' : '#475569',
                                                        fontWeight: '700', fontSize: '0.75rem', cursor: 'pointer', transition: 'all 0.15s'
                                                    }}
                                                >
                                                    {act.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* TABLA DE RESULTADOS DE AUDITORÍA */}
                            <div style={{ backgroundColor: 'white', borderRadius: '24px', border: '1px solid #E5E7EB', overflow: 'hidden', minHeight: '350px', display: 'flex', flexDirection: 'column', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                                        <thead style={{ backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                                            <tr>
                                                <th style={{ padding: '1rem', fontWeight: '800', color: '#475569' }}>Fecha y Hora</th>
                                                <th style={{ padding: '1rem', fontWeight: '800', color: '#475569' }}>Usuario</th>
                                                <th style={{ padding: '1rem', fontWeight: '800', color: '#475569' }}>Acción</th>
                                                <th style={{ padding: '1rem', fontWeight: '800', color: '#475569' }}>Módulo</th>
                                                <th style={{ padding: '1rem', fontWeight: '800', color: '#475569' }}>Detalles</th>
                                                <th style={{ padding: '1rem', width: '50px' }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {auditLoading && auditLogs.length === 0 ? (
                                                <tr>
                                                    <td colSpan={6} style={{ padding: '4rem', textAlign: 'center' }}>
                                                        <Loader2 size={30} className="animate-spin" style={{ display: 'inline-block', color: '#3B82F6' }} />
                                                    </td>
                                                </tr>
                                            ) : auditLogs.length === 0 ? (
                                                <tr>
                                                    <td colSpan={6} style={{ padding: '4rem', textAlign: 'center', color: '#6B7280', fontWeight: '600' }}>
                                                        No se encontraron registros de auditoría que cumplan con los filtros de los últimos 6 meses.
                                                    </td>
                                                </tr>
                                            ) : (
                                                auditLogs.map(log => {
                                                    const badge = getActionBadgeColor(log.action);
                                                    return (
                                                        <tr key={log.id} style={{ borderBottom: '1px solid #F3F4F6', transition: 'background-color 0.15s' }}>
                                                            <td style={{ padding: '0.85rem 1rem', fontWeight: '600', color: '#111827', whiteSpace: 'nowrap' }}>
                                                                {new Date(log.created_at).toLocaleString('es-CO')}
                                                            </td>
                                                            <td style={{ padding: '0.85rem 1rem', fontWeight: '700', color: '#111827' }}>
                                                                {formatCollaboratorName(log.collaborator_name)}
                                                            </td>
                                                            <td style={{ padding: '0.85rem 1rem' }}>
                                                                <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', backgroundColor: badge.bg, color: badge.text, fontWeight: '700', fontSize: '0.7rem' }}>
                                                                    {formatActionName(log.action)}
                                                                </span>
                                                            </td>
                                                            <td style={{ padding: '0.85rem 1rem', fontWeight: '700', color: '#475569' }}>
                                                                {translateModule(log.module)}
                                                            </td>
                                                            <td style={{ padding: '0.85rem 1rem', color: '#475569', maxWidth: '450px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {formatDetailsSummary(log)}
                                                            </td>
                                                            <td style={{ padding: '0.85rem 1rem' }}>
                                                                <button 
                                                                    onClick={() => setAuditSelectedLog(log)}
                                                                    style={{ background: 'none', border: 'none', color: '#3B82F6', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                                    title="Ver detalles completos"
                                                                >
                                                                    <Eye size={18} />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {auditHasMore && !auditLoading && (
                                    <div style={{ padding: '1rem', display: 'flex', justifyContent: 'center', borderTop: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}>
                                        <button 
                                            onClick={loadMoreAuditLogs}
                                            style={{ padding: '6px 16px', backgroundColor: 'white', border: '1px solid #E2E8F0', borderRadius: '8px', fontWeight: '700', fontSize: '0.8rem', color: '#111827', cursor: 'pointer' }}
                                        >
                                            Cargar más registros
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal de Detalles de Auditoría */}
            {auditSelectedLog && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '2rem' }}>
                    <div style={{ backgroundColor: 'white', borderRadius: '24px', border: '1px solid #E5E7EB', maxWidth: '650px', width: '100%', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem', borderBottom: '1px solid #E5E7EB', paddingBottom: '0.8rem' }}>
                            <h3 style={{ fontSize: '1.2rem', fontWeight: '900', color: '#111827', margin: 0 }}>
                                Detalles de Auditoría
                            </h3>
                            <button onClick={() => setAuditSelectedLog(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#6B7280', fontWeight: '700' }}>×</button>
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', fontSize: '0.85rem', color: '#111827' }}>
                            <div>
                                <strong style={{ color: '#475569' }}>Fecha y Hora:</strong> {new Date(auditSelectedLog.created_at).toLocaleString('es-CO')}
                            </div>
                            <div>
                                <strong style={{ color: '#475569' }}>Usuario:</strong> {formatCollaboratorName(auditSelectedLog.collaborator_name)}
                            </div>
                            <div>
                                <strong style={{ color: '#475569' }}>Acción:</strong> {formatActionName(auditSelectedLog.action)}
                            </div>
                            <div>
                                <strong style={{ color: '#475569' }}>Módulo:</strong> {translateModule(auditSelectedLog.module)}
                            </div>
                            
                            {auditSelectedLog.details && typeof auditSelectedLog.details === 'object' && Object.keys(auditSelectedLog.details).length > 0 && (
                                <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: '0.8rem', marginTop: '0.4rem' }}>
                                    <strong style={{ color: '#475569', display: 'block', marginBottom: '0.4rem' }}>Información Procesada:</strong>
                                    <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '6px', backgroundColor: '#F9FAFB', padding: '0.8rem', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
                                        {Object.entries(auditSelectedLog.details).map(([k, v]) => (
                                            <React.Fragment key={k}>
                                                <span style={{ fontWeight: '700', color: '#475569' }}>{translateDetailsKey(k)}:</span>
                                                <span style={{ color: '#111827', wordBreak: 'break-all' }}>{formatDetailsValue(k, v)}</span>
                                            </React.Fragment>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div>
                                <strong style={{ color: '#475569' }}>Datos del Objeto (JSON original):</strong>
                                <pre style={{ marginTop: '0.5rem', padding: '1rem', backgroundColor: '#F9FAFB', borderRadius: '12px', border: '1px solid #E5E7EB', fontSize: '0.75rem', fontFamily: 'monospace', overflowX: 'auto', whiteSpace: 'pre-wrap', maxHeight: '180px', overflowY: 'auto' }}>
                                    {JSON.stringify(auditSelectedLog.details, null, 2)}
                                </pre>
                            </div>
                        </div>

                        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                            <button 
                                onClick={() => setAuditSelectedLog(null)}
                                style={{ padding: '0.5rem 1.25rem', backgroundColor: '#111827', color: 'white', fontWeight: '800', borderRadius: '10px', border: 'none', cursor: 'pointer' }}
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <style jsx>{`
                .animate-spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </main>
    );
}
