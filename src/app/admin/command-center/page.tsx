'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/authContext';
import { useRouter } from 'next/navigation';

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
    resolution_time_minutes?: number | null;
}

export default function CommandCenter() {
    const { profile, loading: authLoading } = useAuth();
    const router = useRouter();
    const [settings, setSettings] = useState<Setting[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusMessage, setStatusMessage] = useState({ text: '', type: '' });
    const [isEditing, setIsEditing] = useState(false);
    const [activeTab, setActiveTab] = useState<'governance' | 'helpdesk' | 'approvals'>('governance');
    
    // Help Desk state
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [ticketsLoading, setTicketsLoading] = useState(false);
    const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
    const [responseText, setResponseText] = useState('');
    const [ticketFilter, setTicketFilter] = useState<string>('all');
    const [savingResponse, setSavingResponse] = useState(false);
    
    const [newRole, setNewRole] = useState<Role>({
        label: '',
        value: '',
        color: '#64748B',
        permissions: []
    });

    // Cargar solo lo necesario para el Chief Engineer
    useEffect(() => {
        if (!authLoading && profile?.role !== 'admin') {
            router.push('/admin'); // Protección básica por ahora
        }
        fetchSettings();
    }, [profile, authLoading, router]);

    const fetchSettings = async () => {
        try {
            const { data, error } = await supabase.from('app_settings').select('*');
            if (error) throw error;
            setSettings(data || []);
        } catch (error) {
            console.error('Error fetching settings:', error);
        } finally {
            setLoading(false);
        }
    };

    // ---- HELP DESK ----
    useEffect(() => {
        if (activeTab === 'helpdesk') fetchTickets();
    }, [activeTab]);

    const [ticketsError, setTicketsError] = useState<string | null>(null);

    const fetchTickets = async () => {
        setTicketsLoading(true);
        setTicketsError(null);
        try {
            const { data, error } = await supabase
                .from('support_tickets_metrics')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) {
                // Table might not exist yet
                if (error.code === '42P01' || error.message?.includes('does not exist') || error.message?.includes('relation')) {
                    setTicketsError('setup_required');
                } else {
                    setTicketsError(error.message || 'Error desconocido');
                }
                return;
            }
            setTickets(data || []);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Error de conexión';
            setTicketsError(msg);
        } finally {
            setTicketsLoading(false);
        }
    };

    const handleRespond = async (ticket: Ticket) => {
        if (!responseText.trim()) return;
        setSavingResponse(true);
        try {
            const updates: Record<string, string> = {
                response: responseText,
                status: 'in_progress',
                updated_at: new Date().toISOString(),
            };
            if (!ticket.first_response_at) {
                updates.first_response_at = new Date().toISOString();
            }
            const { error } = await supabase
                .from('support_tickets')
                .update(updates)
                .eq('id', ticket.id);
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
        const { error } = await supabase
            .from('support_tickets')
            .update({ status: 'resolved', resolved_at: new Date().toISOString() })
            .eq('id', ticketId);
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
        const d = new Date(dateStr);
        return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

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
        closed:      { label: 'Cerrado',     color: '#374151', bg: '#F3F4F6', dot: '#6B7280' },
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

    // Lógica de Unidades (Migrada de settings)
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
        if (!window.confirm(`¿Estás SEGURO de eliminar "${unit}" permanentemente? Esto es irreversible y puede romper el inventario histórico.`)) return;
        
        const standard = settings.find(s => s.key === 'standard_units')?.value || '';
        const newList = standard.split(',').filter((u: string) => u !== unit).join(',');
        await handleUpdateSetting('standard_units', newList);
    };

    const getSystemRoles = (): Role[] => {
        const rolesJson = settings.find(s => s.key === 'system_roles')?.value;
        if (rolesJson) {
            try {
                return JSON.parse(rolesJson);
            } catch (e) {
                console.error('Error parsing roles JSON:', e);
            }
        }
        // Fallback inicial ampliado para incluir clientes
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
        if (!newRole.label || !newRole.value) {
            alert('Nombre y Código son obligatorios.');
            return;
        }

        const currentRoles = getSystemRoles();
        let newList;

        if (isEditing) {
            newList = currentRoles.map(r => r.value === newRole.value ? newRole : r);
        } else {
            if (currentRoles.find(r => r.value === newRole.value)) {
                alert('Este código de rol ya existe.');
                return;
            }
            newList = [...currentRoles, newRole];
        }

        await handleUpdateSetting('system_roles', JSON.stringify(newList));
        resetForm();
    };

    const resetForm = () => {
        setNewRole({ label: '', value: '', color: '#64748B', permissions: [] });
        setIsEditing(false);
    };

    const handleEditRole = (role: Role) => {
        setNewRole({ ...role, permissions: role.permissions || [] });
        setIsEditing(true);
        // Scroll to form
        document.getElementById('role-form-anchor')?.scrollIntoView({ behavior: 'smooth' });
    };

    const removeRole = async (roleValue: string) => {
        if (['admin', 'b2b_client', 'b2c_client'].includes(roleValue)) {
            alert('Este rol es un pilar del sistema y no puede ser eliminado.');
            return;
        }
        if (!window.confirm('¿Eliminar este rol? Los colaboradores que lo tengan asignado podrían tener problemas de visualización.')) return;
        const currentRoles = getSystemRoles();
        const newList = currentRoles.filter(r => r.value !== roleValue);
        await handleUpdateSetting('system_roles', JSON.stringify(newList));
    };

    const togglePermission = (moduleId: string) => {
        setNewRole(prev => {
            const perms = prev.permissions || [];
            if (perms.includes(moduleId)) {
                return { ...prev, permissions: perms.filter(p => p !== moduleId) };
            } else {
                return { ...prev, permissions: [...perms, moduleId] };
            }
        });
    };

    if (authLoading || loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando Centro de Mando Técnico...</div>;

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F3F4F6', padding: '2rem' }}>
            <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
                    <div>
                        <h1 style={{ fontSize: '2.5rem', fontWeight: '900', color: '#111827', margin: 0, letterSpacing: '-1px' }}>
                            DELTA <span style={{ color: '#D4AF37' }}>Command Center</span>
                        </h1>
                        <p style={{ color: '#6B7280', fontSize: '1rem', marginTop: '8px' }}>
                            Consola Maestra de Gobernanza del Motor FruFresco CORE.
                        </p>
                    </div>
                </header>

                {statusMessage.text && (
                    <div style={{ 
                        position: 'fixed', top: '20px', right: '20px', 
                        padding: '1rem 2rem', borderRadius: '12px', 
                        backgroundColor: statusMessage.type === 'success' ? '#DEF7EC' : '#FDE8E8',
                        color: statusMessage.type === 'success' ? '#03543F' : '#9B1C1C',
                        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                        zIndex: 1000, fontWeight: '700'
                    }}>
                        {statusMessage.text}
                    </div>
                )}

                {/* FILA SUPERIOR: STATUS RÁPIDO */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.5fr', gap: '1.5rem', marginBottom: '2rem' }}>
                    <div style={{ backgroundColor: '#111827', borderRadius: '20px', padding: '1.2rem 1.5rem', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <h3 style={{ fontSize: '0.65rem', fontWeight: '900', textTransform: 'uppercase', color: '#9CA3AF', margin: '0 0 4px 0', letterSpacing: '1px' }}>Salud del Motor</h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10B981', boxShadow: '0 0 10px #10B981' }}></div>
                                <span style={{ fontWeight: '700', fontSize: '0.85rem' }}>Supabase Active</span>
                            </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <span style={{ color: '#9CA3AF', fontSize: '0.65rem', display: 'block' }}>Versión</span>
                            <span style={{ fontWeight: 'bold', fontSize: '0.8rem' }}>v1.1-gold</span>
                        </div>
                    </div>

                    <div style={{ backgroundColor: 'white', borderRadius: '20px', padding: '1.2rem 1.5rem', border: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '1.2rem' }}>🆔</span>
                        <div>
                            <span style={{ color: '#6B7280', fontSize: '0.65rem', display: 'block', fontWeight: '800', textTransform: 'uppercase' }}>Tenant Identifier</span>
                            <span style={{ fontWeight: 'bold', fontSize: '0.9rem', color: '#111827' }}>delta_coretech</span>
                        </div>
                    </div>

                    <div style={{ backgroundColor: '#F0F9FF', borderRadius: '20px', padding: '1.2rem 1.5rem', border: '1px solid #BAE6FD', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '1.2rem' }}>💡</span>
                        <p style={{ fontSize: '0.75rem', color: '#0369A1', margin: 0, lineHeight: '1.4', fontWeight: '600' }}>
                            Nivel <strong>Chief Engineer</strong> activo. Cambios en tiempo real en todas las capas del núcleo.
                        </p>
                    </div>
                </div>

                {/* NAVEGACIÓN POR PESTAÑAS (TABS) */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', borderBottom: '1px solid #E5E7EB', padding: '0 10px' }}>
                    <button 
                        onClick={() => setActiveTab('governance')}
                        style={{
                            padding: '12px 24px',
                            backgroundColor: 'transparent',
                            color: activeTab === 'governance' ? '#111827' : '#6B7280',
                            border: 'none',
                            borderBottom: activeTab === 'governance' ? '3px solid #111827' : '3px solid transparent',
                            fontWeight: '800',
                            fontSize: '0.9rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            marginBottom: '-1px'
                        }}
                    >
                        ⚙️ Gobernanza
                    </button>
                    <button 
                        onClick={() => setActiveTab('helpdesk')}
                        style={{
                            padding: '12px 24px',
                            backgroundColor: 'transparent',
                            color: activeTab === 'helpdesk' ? '#111827' : '#6B7280',
                            border: 'none',
                            borderBottom: activeTab === 'helpdesk' ? '3px solid #111827' : '3px solid transparent',
                            fontWeight: '800',
                            fontSize: '0.9rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            marginBottom: '-1px'
                        }}
                    >
                        🎧 Mesa de Ayuda
                    </button>
                    <button 
                        onClick={() => setActiveTab('approvals')}
                        style={{
                            padding: '12px 24px',
                            backgroundColor: 'transparent',
                            color: activeTab === 'approvals' ? '#111827' : '#6B7280',
                            border: 'none',
                            borderBottom: activeTab === 'approvals' ? '3px solid #111827' : '3px solid transparent',
                            fontWeight: '800',
                            fontSize: '0.9rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            marginBottom: '-1px'
                        }}
                    >
                        🛡️ Aprobaciones
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    {activeTab === 'governance' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                        {/* UNIDADES DE MEDIDA */}
                        <section style={{ backgroundColor: 'white', borderRadius: '24px', padding: '2rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #E5E7EB' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
                                <span style={{ fontSize: '1.5rem' }}>📏</span>
                                <h2 style={{ fontSize: '1.25rem', fontWeight: '900', color: '#111827', margin: 0 }}>Gobernanza de Unidades</h2>
                            </div>
                            <p style={{ color: '#4B5563', fontSize: '0.9rem', marginBottom: '2rem' }}>
                                Define las unidades de medida oficiales. <strong style={{ color: '#EF4444' }}>Precaución:</strong> Eliminar una unidad puede afectar el inventario histórico.
                            </p>

                            <div style={{ display: 'flex', gap: '10px', marginBottom: '1.5rem' }}>
                                <input 
                                    placeholder="+ Registrar nueva unidad técnica..." 
                                    style={{ flex: 1, padding: '12px 1rem', borderRadius: '12px', border: '1px solid #D1D5DB', fontSize: '0.9rem', fontWeight: '600' }} 
                                    onKeyDown={(e) => { if(e.key==='Enter' && e.currentTarget.value) { addNewUnit(e.currentTarget.value); e.currentTarget.value=''; } }} 
                                />
                            </div>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                                {getActiveUnits().map((u: string) => (
                                    <div key={u} style={{ backgroundColor: '#F0F9FF', padding: '10px 1.2rem', borderRadius: '15px', border: '1px solid #BAE6FD', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <span style={{ fontWeight: '800', color: '#0369A1' }}>{u}</span>
                                        <button 
                                            onClick={() => removeUnitPermanently(u)} 
                                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#EF4444', fontSize: '1.2rem', padding: 0, display: 'flex' }}
                                            title="Eliminar permanentemente"
                                        >
                                            ×
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* GOBERNANZA DE ROLES */}
                        <section id="roles-section" style={{ backgroundColor: 'white', borderRadius: '24px', padding: '2rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #E5E7EB' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
                                <span style={{ fontSize: '1.5rem' }}>👔</span>
                                <h2 style={{ fontSize: '1.25rem', fontWeight: '900', color: '#111827', margin: 0 }}>Gobernanza de Roles</h2>
                            </div>
                            <p style={{ color: '#4B5563', fontSize: '0.9rem', marginBottom: '2rem' }}>
                                Administra los cargos disponibles para los colaboradores. Estos roles aparecerán como seleccionables en el módulo de Talento Humano.
                            </p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <div id="role-form-anchor"></div>
                                {/* TABLA COMPACTA DE ROLES */}
                                <div style={{ border: '1px solid #E5E7EB', borderRadius: '12px', overflow: 'hidden' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                        <thead style={{ backgroundColor: '#F9FAFB' }}>
                                            <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
                                                <th style={{ padding: '12px', textAlign: 'left', fontWeight: '800' }}>Rol</th>
                                                <th style={{ padding: '12px', textAlign: 'left', fontWeight: '800' }}>Código</th>
                                                <th style={{ padding: '12px', textAlign: 'left', fontWeight: '800' }}>Accesos</th>
                                                <th style={{ padding: '12px', textAlign: 'center', fontWeight: '800' }}>Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {getSystemRoles().map((role: Role) => (
                                                <tr key={role.value} style={{ borderBottom: '1px solid #F3F4F6' }}>
                                                    <td style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: role.color }}></div>
                                                        <span style={{ fontWeight: '700' }}>{role.label}</span>
                                                    </td>
                                                    <td style={{ padding: '10px 12px', color: '#6B7280', fontWeight: '600' }}>{role.value}</td>
                                                    <td style={{ padding: '10px 12px' }}>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                            {(role.permissions || []).length > 0 ? (
                                                                role.permissions?.slice(0, 5).map(p => (
                                                                    <span key={p} style={{ fontSize: '0.65rem', backgroundColor: '#E0E7FF', color: '#4338CA', padding: '2px 6px', borderRadius: '4px', fontWeight: '800' }}>
                                                                        {AVAILABLE_MODULES.find(m => m.id === p)?.label || p}
                                                                    </span>
                                                                ))
                                                            ) : (
                                                                <span style={{ fontSize: '0.65rem', color: '#9CA3AF' }}>Sin accesos</span>
                                                            )}
                                                            {(role.permissions?.length || 0) > 5 && (
                                                                <span style={{ fontSize: '0.65rem', color: '#6B7280', fontWeight: 'bold' }}>+{(role.permissions?.length || 0) - 5}</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                                            <button 
                                                                onClick={() => handleEditRole(role)}
                                                                style={{ border: 'none', background: '#F1F5F9', color: '#475569', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', fontWeight: '800', fontSize: '0.7rem' }}
                                                            >
                                                                EDITAR
                                                            </button>
                                                            {!['admin', 'b2b_client', 'b2c_client'].includes(role.value) && (
                                                                <button 
                                                                    onClick={() => removeRole(role.value)}
                                                                    style={{ border: 'none', background: '#FEE2E2', color: '#EF4444', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', fontWeight: '800', fontSize: '0.7rem' }}
                                                                >
                                                                    ELIMINAR
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                
                                <div style={{ marginTop: '1.5rem', padding: '1.5rem', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <h3 style={{ fontSize: '0.9rem', fontWeight: '900', margin: 0, color: '#1E293B' }}>
                                        {isEditing ? `Editando Rol: ${newRole.label}` : '+ Crear Nuevo Rol Personalizado'}
                                    </h3>
                                    
                                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) minmax(200px, 1fr) auto', gap: '1rem', alignItems: 'flex-end' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#64748B' }}>NOMBRE VISIBLE</label>
                                            <input 
                                                value={newRole.label}
                                                onChange={(e) => setNewRole({...newRole, label: e.target.value})}
                                                placeholder="Ej: Auditor de Calidad" 
                                                style={{ padding: '12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontWeight: '600' }} 
                                            />
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#64748B' }}>CÓDIGO TÉCNICO (ID)</label>
                                            <input 
                                                value={newRole.value}
                                                onChange={(e) => setNewRole({...newRole, value: e.target.value})}
                                                disabled={isEditing}
                                                placeholder="ej: auditor_tech" 
                                                style={{ padding: '12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontWeight: '600', backgroundColor: isEditing ? '#F1F5F9' : 'white' }} 
                                            />
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#64748B' }}>COLOR</label>
                                            <input 
                                                type="color" 
                                                value={newRole.color}
                                                onChange={(e) => setNewRole({...newRole, color: e.target.value})}
                                                style={{ border: 'none', width: '45px', height: '45px', padding: 0, cursor: 'pointer', borderRadius: '8px' }} 
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#64748B', display: 'block', marginBottom: '8px' }}>MÓDULOS ACCESIBLES (PERMISOS)</label>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
                                            {AVAILABLE_MODULES.map(module => (
                                                <label key={module.id} style={{ 
                                                    display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', 
                                                    borderRadius: '10px', border: '1px solid #E2E8F0', backgroundColor: 'white', 
                                                    cursor: 'pointer', transition: 'all 0.2s',
                                                    boxShadow: (newRole.permissions || []).includes(module.id) ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'
                                                }}>
                                                    <input 
                                                        type="checkbox" 
                                                        checked={(newRole.permissions || []).includes(module.id)}
                                                        onChange={() => togglePermission(module.id)}
                                                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                                    />
                                                    <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#334155' }}>{module.label}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                                        <button 
                                            onClick={saveRole}
                                            style={{ flex: 2, backgroundColor: '#111827', color: 'white', padding: '14px', borderRadius: '12px', border: 'none', fontWeight: '900', cursor: 'pointer', fontSize: '0.95rem', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
                                        >
                                            {isEditing ? '✓ ACTUALIZAR CONFIGURACIÓN' : '+ REGISTRAR ROL EN EL SISTEMA'}
                                        </button>
                                        {isEditing && (
                                            <button 
                                                onClick={resetForm}
                                                style={{ flex: 1, backgroundColor: '#F1F5F9', color: '#475569', padding: '14px', borderRadius: '12px', border: 'none', fontWeight: '900', cursor: 'pointer', fontSize: '0.95rem' }}
                                            >
                                                CANCELAR
                                            </button>
                                        )}
                                    </div>
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
                                const responded = tickets.filter(t => t.response_time_minutes != null);
                                if (!responded.length) return null;
                                const avg = responded.reduce((s, t) => s + (t.response_time_minutes || 0), 0) / responded.length;
                                return Math.round(avg);
                            })(),
                        };

                        return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                            {/* KPI CARDS */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                                {[
                                    { label: 'Abiertos', value: stats.open, icon: '🔴', bg: '#FEF9C3', color: '#B45309' },
                                    { label: 'En progreso', value: stats.in_progress, icon: '🔵', bg: '#EFF6FF', color: '#1D4ED8' },
                                    { label: 'Resueltos', value: stats.resolved, icon: '✅', bg: '#F0FDF4', color: '#166534' },
                                    { label: 'Tiempo resp. prom.', value: formatResponseTime(stats.avgResponse), icon: '⏱️', bg: '#F5F3FF', color: '#7C3AED' },
                                ].map(kpi => (
                                    <div key={kpi.label} style={{ backgroundColor: kpi.bg, borderRadius: '16px', padding: '1.2rem 1.5rem', border: `1px solid ${kpi.color}20` }}>
                                        <div style={{ fontSize: '1.5rem', marginBottom: '6px' }}>{kpi.icon}</div>
                                        <div style={{ fontSize: '1.8rem', fontWeight: '900', color: kpi.color, lineHeight: 1 }}>{kpi.value ?? '—'}</div>
                                        <div style={{ fontSize: '0.7rem', fontWeight: '800', color: kpi.color, opacity: 0.7, marginTop: '4px', textTransform: 'uppercase' }}>{kpi.label}</div>
                                    </div>
                                ))}
                            </div>

                            {/* FILTROS + TABLA */}
                            <section style={{ backgroundColor: 'white', borderRadius: '24px', padding: '2rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #E5E7EB' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                                    <h2 style={{ fontSize: '1.1rem', fontWeight: '900', color: '#111827', margin: 0 }}>📋 Solicitudes de Soporte</h2>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        {['all', 'open', 'in_progress', 'resolved'].map(f => (
                                            <button key={f} onClick={() => setTicketFilter(f)} style={{
                                                padding: '6px 14px', borderRadius: '20px', border: 'none',
                                                fontWeight: '800', fontSize: '0.75rem', cursor: 'pointer',
                                                backgroundColor: ticketFilter === f ? '#111827' : '#F3F4F6',
                                                color: ticketFilter === f ? 'white' : '#6B7280',
                                                transition: 'all 0.2s'
                                            }}>
                                                {f === 'all' ? 'Todos' : f === 'open' ? 'Abiertos' : f === 'in_progress' ? 'En progreso' : 'Resueltos'}
                                            </button>
                                        ))}
                                        <button onClick={fetchTickets} style={{ padding: '6px 14px', borderRadius: '20px', border: '1px solid #E5E7EB', background: 'white', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '700', color: '#374151' }}>🔄 Actualizar</button>
                                    </div>
                                </div>

                                {ticketsLoading ? (
                                    <div style={{ padding: '3rem', textAlign: 'center', color: '#9CA3AF' }}>
                                        <div style={{ fontSize: '2rem', marginBottom: '8px' }}>⌛</div>
                                        <p style={{ fontWeight: '700' }}>Cargando tickets...</p>
                                    </div>
                                ) : ticketsError === 'setup_required' ? (
                                    <div style={{ padding: '2.5rem', textAlign: 'center', backgroundColor: '#FFFBEB', borderRadius: '16px', border: '1px solid #FDE68A' }}>
                                        <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>⚙️</div>
                                        <h3 style={{ fontWeight: '900', color: '#92400E', marginBottom: '8px', fontSize: '1rem' }}>Configuración inicial requerida</h3>
                                        <p style={{ fontSize: '0.85rem', color: '#B45309', maxWidth: '480px', margin: '0 auto 16px auto', lineHeight: '1.5' }}>
                                            La tabla <code style={{ backgroundColor: '#FEF3C7', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>support_tickets</code> aún no existe en Supabase.
                                        </p>
                                        <div style={{ backgroundColor: 'white', border: '1px solid #FDE68A', borderRadius: '12px', padding: '12px 16px', textAlign: 'left', maxWidth: '500px', margin: '0 auto', fontSize: '0.8rem', color: '#78350F' }}>
                                            <strong>Pasos:</strong>
                                            <ol style={{ margin: '8px 0 0 0', paddingLeft: '20px', lineHeight: '1.8' }}>
                                                <li>Abre el <strong>SQL Editor</strong> en tu proyecto Supabase</li>
                                                <li>Ejecuta el archivo <code style={{ fontFamily: 'monospace' }}>src/lib/Create_HelpDesk_Table.sql</code></li>
                                                <li>Haz clic en <strong>🔄 Actualizar</strong> arriba</li>
                                            </ol>
                                        </div>
                                    </div>
                                ) : ticketsError ? (
                                    <div style={{ padding: '2.5rem', textAlign: 'center', backgroundColor: '#FEF2F2', borderRadius: '16px', border: '1px solid #FECACA' }}>
                                        <p style={{ fontWeight: '700', color: '#991B1B' }}>❌ Error al cargar tickets</p>
                                        <code style={{ fontSize: '0.75rem', color: '#B91C1C' }}>{ticketsError}</code>
                                    </div>
                                ) : filtered.length === 0 ? (
                                    <div style={{ padding: '3rem', textAlign: 'center', color: '#9CA3AF', backgroundColor: '#F9FAFB', borderRadius: '16px', border: '2px dashed #E5E7EB' }}>
                                        <p style={{ fontWeight: '700', fontSize: '1rem' }}>🎉 No hay solicitudes pendientes.</p>
                                        <span style={{ fontSize: '0.8rem' }}>El sistema está operando nominalmente.</span>
                                    </div>
                                ) : (
                                    <div style={{ border: '1px solid #E5E7EB', borderRadius: '12px', overflow: 'hidden' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                            <thead style={{ backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                                                <tr>
                                                    {['Asunto', 'Usuario', 'Prioridad', 'Estado', 'Tiempo respuesta', 'Creado', 'Acciones'].map(h => (
                                                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '800', color: '#374151', whiteSpace: 'nowrap' }}>{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filtered.map(ticket => {
                                                    const p = PRIORITY_CONFIG[ticket.priority] || PRIORITY_CONFIG.normal;
                                                    const s = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open;
                                                    return (
                                                        <tr key={ticket.id} style={{ borderBottom: '1px solid #F3F4F6', transition: 'background 0.15s' }}
                                                            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#FAFBFF')}
                                                            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                                                            <td style={{ padding: '12px', maxWidth: '200px' }}>
                                                                <p style={{ margin: 0, fontWeight: '700', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticket.subject}</p>
                                                                <span style={{ fontSize: '0.7rem', color: '#9CA3AF' }}>{ticket.category}</span>
                                                            </td>
                                                            <td style={{ padding: '12px' }}>
                                                                <p style={{ margin: 0, fontWeight: '600', color: '#374151' }}>{ticket.user_name || '—'}</p>
                                                                <span style={{ fontSize: '0.7rem', color: '#9CA3AF' }}>{ticket.user_email}</span>
                                                            </td>
                                                            <td style={{ padding: '12px' }}>
                                                                <span style={{ backgroundColor: p.bg, color: p.color, padding: '3px 8px', borderRadius: '6px', fontWeight: '800', fontSize: '0.7rem' }}>{p.label}</span>
                                                            </td>
                                                            <td style={{ padding: '12px' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                    <div style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: s.dot }}></div>
                                                                    <span style={{ backgroundColor: s.bg, color: s.color, padding: '3px 8px', borderRadius: '6px', fontWeight: '800', fontSize: '0.7rem' }}>{s.label}</span>
                                                                </div>
                                                            </td>
                                                            <td style={{ padding: '12px', fontWeight: '700', color: '#6B7280' }}>
                                                                {formatResponseTime(ticket.response_time_minutes)}
                                                            </td>
                                                            <td style={{ padding: '12px', color: '#9CA3AF', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                                                                {formatDate(ticket.created_at)}
                                                            </td>
                                                            <td style={{ padding: '12px' }}>
                                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                                    <button onClick={() => { setSelectedTicket(ticket); setResponseText(ticket.response || ''); }}
                                                                        style={{ padding: '5px 10px', borderRadius: '8px', border: 'none', background: '#F1F5F9', color: '#475569', fontWeight: '800', fontSize: '0.7rem', cursor: 'pointer' }}>
                                                                        Responder
                                                                    </button>
                                                                    {ticket.status !== 'resolved' && ticket.status !== 'closed' && (
                                                                        <button onClick={() => handleResolve(ticket.id)}
                                                                            style={{ padding: '5px 10px', borderRadius: '8px', border: 'none', background: '#DCFCE7', color: '#166534', fontWeight: '800', fontSize: '0.7rem', cursor: 'pointer' }}>
                                                                            ✓ Resolver
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </section>

                            {/* MODAL RESPUESTA */}
                            {selectedTicket && (
                                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
                                    onClick={(e) => { if (e.target === e.currentTarget) setSelectedTicket(null); }}>
                                    <div style={{ backgroundColor: 'white', borderRadius: '24px', padding: '2rem', maxWidth: '600px', width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                                            <div>
                                                <h3 style={{ fontWeight: '900', fontSize: '1.1rem', color: '#111827', margin: '0 0 4px 0' }}>{selectedTicket.subject}</h3>
                                                <span style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>De: {selectedTicket.user_name} · {selectedTicket.user_email}</span>
                                            </div>
                                            <button onClick={() => setSelectedTicket(null)}
                                                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#9CA3AF', padding: 0 }}>×</button>
                                        </div>

                                        <div style={{ backgroundColor: '#F9FAFB', borderRadius: '12px', padding: '1rem', marginBottom: '1.5rem', fontSize: '0.85rem', color: '#374151', lineHeight: '1.6' }}>
                                            <strong style={{ display: 'block', marginBottom: '6px', color: '#111827' }}>Descripción:</strong>
                                            {selectedTicket.description || 'Sin descripción adicional.'}
                                        </div>

                                        <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#64748B', display: 'block', marginBottom: '8px' }}>TU RESPUESTA</label>
                                        <textarea
                                            value={responseText}
                                            onChange={(e) => setResponseText(e.target.value)}
                                            rows={5}
                                            placeholder="Escribe tu respuesta aquí..."
                                            style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #CBD5E1', fontSize: '0.9rem', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
                                        />
                                        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                            <button
                                                onClick={() => handleRespond(selectedTicket)}
                                                disabled={savingResponse}
                                                style={{ flex: 2, backgroundColor: '#111827', color: 'white', padding: '12px', borderRadius: '12px', border: 'none', fontWeight: '900', cursor: 'pointer', fontSize: '0.9rem' }}>
                                                {savingResponse ? 'Enviando...' : '📨 Enviar Respuesta'}
                                            </button>
                                            <button onClick={() => setSelectedTicket(null)}
                                                style={{ flex: 1, backgroundColor: '#F1F5F9', color: '#475569', padding: '12px', borderRadius: '12px', border: 'none', fontWeight: '900', cursor: 'pointer', fontSize: '0.9rem' }}>
                                                Cancelar
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        );
                    })()}

                    {activeTab === 'approvals' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                            <section style={{ backgroundColor: 'white', borderRadius: '24px', padding: '2.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #E5E7EB' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
                                    <span style={{ fontSize: '1.5rem' }}>💠</span>
                                    <h2 style={{ fontSize: '1.25rem', fontWeight: '900', color: '#111827', margin: 0 }}>Flujos de Aprobación</h2>
                                </div>
                                
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
                                    <div style={{ border: '1px solid #F3F4F6', backgroundColor: '#FDF2F2', padding: '1.5rem', borderRadius: '20px', opacity: 0.6 }}>
                                        <h3 style={{ fontSize: '0.9rem', fontWeight: '900', color: '#991B1B', margin: '0 0 8px 0' }}>Modificaciones de Geocerca</h3>
                                        <p style={{ fontSize: '0.75rem', color: '#B91C1C', margin: 0 }}>Pendiente de conexión con módulo de mapas.</p>
                                    </div>
                                    <div style={{ border: '1px solid #F3F4F6', backgroundColor: '#F0FDF4', padding: '1.5rem', borderRadius: '20px' }}>
                                        <h3 style={{ fontSize: '0.9rem', fontWeight: '900', color: '#166534', margin: '0 0 8px 0' }}>Nuevos Usuarios Tech</h3>
                                        <p style={{ fontSize: '0.75rem', color: '#15803D', margin: 0 }}>Control de acceso de tercer nivel.</p>
                                    </div>
                                </div>
                            </section>
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}
