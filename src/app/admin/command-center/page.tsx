'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/authContext';
import { useRouter } from 'next/navigation';
import { RefreshCw, AlertTriangle, Activity, Settings, HelpCircle, ShieldCheck, ArrowLeft } from 'lucide-react';

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
    const [statusMessage, setStatusMessage] = useState({ text: '', type: '' });
    const [isEditing, setIsEditing] = useState(false);
    const [activeTab, setActiveTab] = useState<'governance' | 'helpdesk' | 'approvals' | 'fleet'>('governance');
    
    // Help Desk state
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [ticketsLoading, setTicketsLoading] = useState(false);
    const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
    const [responseText, setResponseText] = useState('');
    const [ticketFilter, setTicketFilter] = useState<string>('all');
    const [savingResponse, setSavingResponse] = useState(false);
    const [ticketsError, setTicketsError] = useState<string | null>(null);

    // Fleet state
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [syncing, setSyncing] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    
    const [newRole, setNewRole] = useState<Role>({
        label: '',
        value: '',
        color: '#64748B',
        permissions: []
    });

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
                last_sync: t.last_sync ? new Date(t.last_sync).toLocaleDateString('es-CO') : 'Nunca'
            }));
            
            setTenants(formattedTenants);
        } catch (err) {
            console.error('Error fetching fleet:', err);
        }
    }, []);

    useEffect(() => {
        if (!authLoading && profile?.role !== 'admin') {
            router.push('/admin');
        }
        fetchSettings();
    }, [profile, authLoading, router, fetchSettings]);

    useEffect(() => {
        if (activeTab === 'helpdesk') fetchTickets();
        if (activeTab === 'fleet') fetchTenants();
    }, [activeTab, fetchTickets, fetchTenants]);

    const toggleSelection = (id: string) => {
        setSelectedIds(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handleSync = async () => {
        if (selectedIds.length === 0) return;
        setSyncing('global');
        try {
            const res = await fetch('/api/fleet/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ selectedIds })
            });

            const data = await res.json();
            if (data.success) {
                const summary = data.results.map((r: any) => `${r.name}: ${r.success ? '✅ OK' : '❌ ' + (r.error || 'Err')}`).join('\n');
                alert(`Sincronización completada:\n\n${summary}`);
                fetchTenants();
            } else {
                alert('Error al sincronizar: ' + data.message);
            }
        } catch (err) {
            console.error('Sync Error:', err);
            alert('Fallo catastrófico al intentar la sincronización.');
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
        } catch (e) {
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

    const formatDate = (dateStr: string): string => {
        return new Date(dateStr).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const handleUpdateSetting = async (key: string, newValue: string) => {
        try {
            const { error } = await supabase.from('app_settings').upsert({ key, value: newValue });
            if (error) throw error;
            setSettings(prev => prev.map(s => s.key === key ? { ...s, value: newValue } : s));
            setStatusMessage({ text: 'Gobernanza actualizada correctamente', type: 'success' });
            setTimeout(() => setStatusMessage({ text: '', type: '' }), 3000);
        } catch (error) {
            console.error('Error updating setting:', error);
            setStatusMessage({ text: 'Error al actualizar gobernanza', type: 'error' });
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
        if (['admin', 'b2b_client', 'b2c_client'].includes(roleValue)) return;
        if (!window.confirm('¿Eliminar este rol?')) return;
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
            <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
                    <div>
                        <h1 style={{ fontSize: '2.5rem', fontWeight: '900', color: '#111827', margin: 0 }}>DELTA <span style={{ color: '#D4AF37' }}>Command Center</span></h1>
                        <p style={{ color: '#6B7280', fontSize: '1rem', marginTop: '8px' }}>Consola Maestra de Gobernanza del Motor FruFresco CORE.</p>
                    </div>
                    <button 
                        onClick={() => router.push('/admin')}
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
                        <span style={{ fontSize: '1.2rem' }}>🆔</span>
                        <div>
                            <span style={{ color: '#6B7280', fontSize: '0.65rem', display: 'block', fontWeight: '800' }}>Tenant Identifier</span>
                            <span style={{ fontWeight: 'bold', fontSize: '0.9rem', color: '#111827' }}>delta_coretech</span>
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
                        { id: 'fleet', label: 'Flota SaaS', icon: <Activity size={18}/> }
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
                                <div style={{ marginTop: '1.5rem', padding: '1.5rem', backgroundColor: '#F8FAFC', borderRadius: '16px' }}>
                                    <h3>{isEditing ? 'Editando Rol' : 'Crear Rol'}</h3>
                                    <input value={newRole.label} onChange={e => setNewRole({...newRole, label: e.target.value})} placeholder="Nombre" style={{ padding: '10px', marginRight: '10px' }} />
                                    <input value={newRole.value} onChange={e => setNewRole({...newRole, value: e.target.value})} disabled={isEditing} placeholder="Código" style={{ padding: '10px', marginRight: '10px' }} />
                                    <button onClick={saveRole} style={{ padding: '10px 20px', background: '#111827', color: 'white', border: 'none', borderRadius: '8px' }}>{isEditing ? 'Actualizar' : 'Guardar'}</button>
                                    <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' }}>
                                        {AVAILABLE_MODULES.map(m => (
                                            <label key={m.id}><input type="checkbox" checked={(newRole.permissions || []).includes(m.id)} onChange={() => togglePermission(m.id)} /> {m.label}</label>
                                        ))}
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
                                const responded = tickets.filter((t: any) => t.response_time_minutes != null);
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
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                                    <div style={{ padding: '1.5rem', background: '#FDF2F2', borderRadius: '20px', opacity: 0.6 }}><h3>Geocercas</h3><p>Pendiente.</p></div>
                                    <div style={{ padding: '1.5rem', background: '#F0FDF4', borderRadius: '20px' }}><h3>Usuarios Tech</h3><p>Control nivel 3.</p></div>
                                </div>
                            </section>
                        </div>
                    )}

                    {activeTab === 'fleet' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h2>🚢 Control de Flota SaaS</h2>
                                <button onClick={handleSync} disabled={selectedIds.length === 0 || !!syncing} style={{ background: '#111827', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '12px', border: 'none', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px', cursor: selectedIds.length > 0 ? 'pointer' : 'not-allowed', opacity: selectedIds.length > 0 ? 1 : 0.5 }}>
                                    <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
                                    {syncing ? 'Sincronizando...' : `Push a ${selectedIds.length} Instancias`}
                                </button>
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
                </div>
            </div>
            <style jsx>{`
                .animate-spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </main>
    );
}
