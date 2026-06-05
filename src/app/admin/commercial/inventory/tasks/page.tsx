'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/authContext';
import Toast from '@/components/Toast';
import { THEME, formatNumber } from '@/lib/adminTheme';
import { 
    ClipboardList, 
    AlertCircle, 
    Play, 
    AlertTriangle, 
    ArrowLeft, 
    BookOpen, 
    Plus, 
    Folder, 
    FolderOpen, 
    User, 
    Truck, 
    Calendar, 
    FileText, 
    Archive, 
    Inbox, 
    X
} from 'lucide-react';

interface Role {
    value: string;
    label: string;
    color?: string;
}

const DEFAULT_ROLES: Role[] = [
    { value: 'administrativo', label: 'Administrativo' },
    { value: 'web_admin', label: 'Administrador Web' },
    { value: 'comercial', label: 'Comercial' },
    { value: 'sys_admin', label: 'Administrador del Sistema' },
    { value: 'contabilidad', label: 'Contabilidad' },
    { value: 'driver', label: 'Conductor' },
    { value: 'comprador', label: 'Comprador' },
    { value: 'internal_transport', label: 'Transporte Interno' },
    { value: 'warehouse_aux', label: 'Auxiliar de Bodega' },
    { value: 'b2c_client', label: 'Cliente B2C' },
    { value: 'admin', label: 'Admin Principal' }
];

interface Task {
    id: string;
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
    status: 'todo' | 'in_progress' | 'done' | 'archived';
    target_role: string;
    target_status: string;
    assigned_to: string | null;
    attachments: string[];
    scheduled_start: string | null;
    due_date: string | null;
    created_at: string;
    profiles?: {
        contact_name: string;
        role: string;
    } | null;
}

interface StaffProfile {
    id: string;
    contact_name: string;
    role: string;
    is_active: boolean;
}

export default function KanbanTasksPage() {
    const { user } = useAuth();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [staff, setStaff] = useState<StaffProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [tempFiles, setTempFiles] = useState<File[]>([]);
    const [showArchived, setShowArchived] = useState(false);
    const [incompleteCount, setIncompleteCount] = useState(0);
    const [myOverdueTasks, setMyOverdueTasks] = useState<Task[]>([]);
    const [myPendingCount, setMyPendingCount] = useState(0);
    const [roles, setRoles] = useState<Role[]>(DEFAULT_ROLES);
    const [maintenanceStats, setMaintenanceStats] = useState({ urgent: 0, upcoming: 0 });
    
    // Form state
    const [newTask, setNewTask] = useState({
        title: '',
        description: '',
        priority: 'medium' as 'low' | 'medium' | 'high',
        assigned_to: '',
        target_role: '',
        scheduled_start: '',
        due_date: ''
    });

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            // 1. Fetch Tasks
            const { data: tasksData, error: tasksError } = await supabase
                .from('admin_tasks')
                .select('*, profiles:assigned_to(contact_name, role)')
                .order('created_at', { ascending: false });
            
            if (tasksError) throw tasksError;
            setTasks(tasksData || []);

            // 2. Fetch Staff (Only active members, excluding clients)
            const { data: staffData, error: staffError } = await supabase
                .from('profiles')
                .select('id, contact_name, role, is_active')
                .eq('is_active', true)
                .not('role', 'eq', 'b2b_client');
            
            if (staffError) throw staffError;
            setStaff(staffData || []);

            // 3. Fetch Incomplete Providers Count
            const { count: incCount, error: incError } = await supabase
                .from('providers')
                .select('*', { count: 'exact', head: true })
                .or('bank_name.is.null,bank_account_number.is.null')
                .eq('is_archived', false);
            
            if (!incError) setIncompleteCount(incCount || 0);

            // 4. Calculate Personal Stats
            if (tasksData && user) {
                const now = new Date();
                const myTasks = tasksData.filter((t: Task) => t.assigned_to === user.id);
                const overdue = myTasks.filter((t: Task) => 
                    t.due_date && 
                    new Date(t.due_date) < now && 
                    t.status !== 'done' && 
                    t.status !== 'archived'
                );
                const pending = myTasks.filter((t: Task) => t.status === 'todo' || t.status === 'in_progress').length;
                
                setMyOverdueTasks(overdue);
                setMyPendingCount(pending);
            }

            // 5. Fetch Maintenance Data
            const { data: mData } = await supabase
                .from('maintenance_schedules')
                .select('*, vehicle:fleet_vehicles(current_odometer)');
            
            if (mData) {
                const now = new Date();
                let urgent = 0;
                let upcoming = 0;

                mData.forEach((t: any) => { // Using any for maintenance data as its structure is complex
                    if (t.task_type === 'date' && t.next_due_date) {
                        const due = new Date(t.next_due_date);
                        const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                        if (diffDays < 0) urgent++;
                        else if (diffDays < 30) upcoming++;
                    } else if (t.task_type === 'km') {
                        const remaining = (t.next_due_km || 0) - (t.vehicle?.current_odometer || 0);
                        if (remaining < 0) urgent++;
                        else if (remaining < 1500) upcoming++;
                    }
                });
                setMaintenanceStats({ urgent, upcoming });
            }

            // 6. Fetch Roles from Command Center
            const { data: settingsData } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'system_roles')
                .single();
            
            if (settingsData?.value) {
                try {
                    const parsedRoles = JSON.parse(settingsData.value);
                    if (Array.isArray(parsedRoles)) {
                        setRoles(parsedRoles);
                    }
                } catch (e) {
                    console.error('Error parsing roles:', e);
                }
            }
        } catch (err: any) {
            console.error('❌ Error fetching Kanban data:', err?.message || 'Unknown error', err);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const filesArray = Array.from(e.target.files);
            setTempFiles(prev => [...prev, ...filesArray]);
        }
    };

    const removeFile = (index: number) => {
        setTempFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleCreateTask = async (e: React.FormEvent) => {
        e.preventDefault();
        setUploading(true);
        try {
            const uploadedUrls = [];

            // 1. Upload Attachments to Storage
            for (const file of tempFiles) {
                const fileExt = file.name.split('.').pop();
                const fileName = `${Math.random()}.${fileExt}`;
                const filePath = `tasks/${Date.now()}_${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('task-attachments')
                    .upload(filePath, file);

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('task-attachments')
                    .getPublicUrl(filePath);
                
                uploadedUrls.push(publicUrl);
            }

            // 2. Insert Task to DB
            const { error } = await supabase
                .from('admin_tasks')
                .insert([{
                    ...newTask,
                    created_by: user?.id,
                    assigned_to: newTask.assigned_to || null,
                    status: 'todo',
                    attachments: uploadedUrls,
                    scheduled_start: newTask.scheduled_start || null,
                    due_date: newTask.due_date || null
                }]);

            if (error) throw error;

            window.showToast?.('Tarea creada exitosamente', 'success');
            setIsModalOpen(false);
            setNewTask({ title: '', description: '', priority: 'medium', assigned_to: '', target_role: '', scheduled_start: '', due_date: '' });
            setTempFiles([]);
            fetchData();
        } catch (err: unknown) {
            const message = (err as { message?: string })?.message || 'Error desconocido';
            alert('Error al crear tarea: ' + message);
        } finally {
            setUploading(false);
        }
    };

    const updateTaskStatus = async (taskId: string, newStatus: string) => {
        try {
            const { error } = await supabase
                .from('admin_tasks')
                .update({ status: newStatus })
                .eq('id', taskId);

            if (error) throw error;
            fetchData();
        } catch (err: unknown) {
            console.error('Error updating status:', err);
        }
    };

    // Filter staff based on selected role (already filtered by active in fetchData)
    const filteredStaff = staff.filter(s => s.role === newTask.target_role);

    const columns = [
        { id: 'todo', title: 'Pendientes', color: '#FEE2E2', textColor: '#991B1B' },
        { id: 'in_progress', title: 'En Ejecución', color: '#FEF3C7', textColor: '#92400E' },
        { id: 'done', title: 'Terminadas', color: '#DCFCE7', textColor: '#15803D' }
    ];

    return (
        <main style={{ minHeight: '100vh', backgroundColor: THEME.colors.background, fontFamily: THEME.typography.fontFamilySecondary }}>
            <Toast />
            
            <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
                    <div>
                        <Link href="/admin/commercial/inventory" style={{ color: THEME.colors.textSecondary, textDecoration: 'none', fontWeight: '600', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.5rem' }}>
                            <ArrowLeft size={14} strokeWidth={1.5} /> Volver a Inventario
                        </Link>
                        <h1 style={{ fontSize: '2rem', fontWeight: '700', color: THEME.colors.textMain, fontFamily: THEME.typography.fontFamilyMain, margin: 0 }}>Tablero Kanban Administrativo</h1>
                        <p style={{ color: THEME.colors.textSecondary, fontSize: '0.95rem', margin: '0.25rem 0 0 0' }}>Gestión ágil de tareas y prioridades operativas.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <Link href="/admin/master/products" style={{ textDecoration: 'none' }}>
                            <button 
                                style={{ 
                                    backgroundColor: THEME.colors.surface, color: THEME.colors.textMain, border: `1px solid ${THEME.colors.border}`, padding: '0.65rem 1.25rem', 
                                    borderRadius: THEME.radius.lg, fontWeight: '600', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                                    boxShadow: THEME.shadow.sm,
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.borderColor = THEME.colors.borderActive;
                                    e.currentTarget.style.backgroundColor = THEME.colors.background;
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.borderColor = THEME.colors.border;
                                    e.currentTarget.style.backgroundColor = THEME.colors.surface;
                                }}
                            >
                                <BookOpen size={16} strokeWidth={1.5} style={{ color: THEME.colors.primary }} /> Catálogo Maestro
                            </button>
                        </Link>
                        <button 
                            onClick={() => setIsModalOpen(true)}
                            style={{ 
                                backgroundColor: THEME.colors.primary, color: 'white', border: 'none', padding: '0.65rem 1.25rem', 
                                borderRadius: THEME.radius.lg, fontWeight: '600', cursor: 'pointer', boxShadow: '0 4px 12px rgba(13, 122, 87, 0.2)',
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = THEME.colors.primaryHover}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = THEME.colors.primary}
                        >
                            <Plus size={16} strokeWidth={1.5} /> Nueva Tarea
                        </button>
                    </div>
                </div>

                {/* Mini Dashboard */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
                    <StatCard title="Total Tareas" value={tasks.length} icon={ClipboardList} />
                    <StatCard title="Alta Prioridad" value={tasks.filter(t => t.priority === 'high').length} icon={AlertCircle} />
                    <StatCard title="En Curso" value={tasks.filter(t => t.status === 'in_progress').length} icon={Play} />
                    <StatCard title="Mis Vencidas" value={myOverdueTasks.length} icon={AlertTriangle} />
                </div>

                {/* Filters */}
                <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                    <button 
                        onClick={() => setShowArchived(!showArchived)}
                        style={{ 
                            fontSize: '0.8rem', fontWeight: '600', padding: '0.5rem 1rem', borderRadius: THEME.radius.md, 
                            border: `1px solid ${THEME.colors.border}`, backgroundColor: showArchived ? THEME.colors.primaryLight : THEME.colors.surface,
                            color: showArchived ? THEME.colors.primary : THEME.colors.textSecondary, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                            if (!showArchived) e.currentTarget.style.backgroundColor = THEME.colors.background;
                        }}
                        onMouseLeave={(e) => {
                            if (!showArchived) e.currentTarget.style.backgroundColor = THEME.colors.surface;
                        }}
                    >
                        {showArchived ? <Folder size={14} strokeWidth={1.5} /> : <FolderOpen size={14} strokeWidth={1.5} />}
                        {showArchived ? 'Ocultar Archivadas' : 'Ver Archivadas'}
                    </button>
                </div>

                {/* Kanban Board */}
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '5rem', color: THEME.colors.textSecondary }}>Cargando tablero...</div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2rem' }}>
                        {columns.map(col => (
                            <div key={col.id} style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.xl, border: `1px solid ${THEME.colors.border}`, padding: '1.25rem', minHeight: '600px', boxShadow: THEME.shadow.sm }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                    <h3 style={{ margin: 0, fontWeight: '600', color: THEME.colors.textMain, textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em', fontFamily: THEME.typography.fontFamilyMain, display: 'flex', alignItems: 'center' }}>
                                        <span style={{ 
                                            display: 'inline-block', 
                                            width: '8px', 
                                            height: '8px', 
                                            borderRadius: '50%', 
                                            backgroundColor: col.id === 'todo' ? '#EF4444' : col.id === 'in_progress' ? '#F59E0B' : '#10B981',
                                            marginRight: '8px'
                                        }}></span>
                                        {col.title} 
                                        <span style={{ backgroundColor: THEME.colors.background, color: THEME.colors.textSecondary, padding: '2px 8px', borderRadius: THEME.radius.sm, marginLeft: '8px', fontSize: '0.7rem', fontWeight: '600', border: `1px solid ${THEME.colors.border}` }}>
                                            {tasks.filter(t => {
                                                if (col.id === 'done') return showArchived ? (t.status === 'done' || t.status === 'archived') : (t.status === 'done');
                                                return t.status === col.id;
                                            }).length}
                                        </span>
                                    </h3>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {col.id === 'todo' && myPendingCount > 0 && (
                                        <div style={{ 
                                            backgroundColor: THEME.colors.background, borderRadius: THEME.radius.lg, padding: '1rem', 
                                            border: `1px solid ${THEME.colors.border}`,
                                            marginBottom: '0.75rem', position: 'relative'
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', alignItems: 'center' }}>
                                                <span style={{ fontSize: '0.6rem', fontWeight: '700', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '2px 6px', borderRadius: THEME.radius.sm, backgroundColor: THEME.colors.primaryLight, color: THEME.colors.primary }}>RESUMEN PERSONAL</span>
                                                <User size={14} strokeWidth={1.5} style={{ color: THEME.colors.primary }} />
                                            </div>
                                            <h4 style={{ margin: '0 0 0.5rem 0', fontWeight: '600', color: THEME.colors.textMain, fontSize: '0.85rem', fontFamily: THEME.typography.fontFamilyMain }}>Mis Tareas</h4>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '0.85rem', color: THEME.colors.textSecondary }}>Pendientes hoy:</span>
                                                    <span style={{ fontWeight: '600', color: THEME.colors.textMain, fontSize: '0.85rem' }}>{myPendingCount}</span>
                                                </div>
                                                {myOverdueTasks.length > 0 && (
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FEF2F2', padding: '4px 8px', borderRadius: THEME.radius.sm }}>
                                                        <span style={{ fontSize: '0.8rem', color: '#991B1B', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <AlertTriangle size={12} strokeWidth={1.5} style={{ color: '#EF4444' }} /> Vencidas:
                                                        </span>
                                                        <span style={{ fontWeight: '700', color: '#EF4444', fontSize: '0.8rem' }}>{myOverdueTasks.length}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {col.id === 'todo' && (maintenanceStats.urgent > 0 || maintenanceStats.upcoming > 0) && (
                                        <div style={{ 
                                            backgroundColor: THEME.colors.background, borderRadius: THEME.radius.lg, padding: '1rem', 
                                            border: `1px solid ${THEME.colors.border}`,
                                            marginBottom: '0.75rem', position: 'relative'
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', alignItems: 'center' }}>
                                                <span style={{ fontSize: '0.6rem', fontWeight: '700', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '2px 6px', borderRadius: THEME.radius.sm, backgroundColor: THEME.colors.primaryLight, color: THEME.colors.primary }}>SISTEMA / FLOTA</span>
                                                <Truck size={14} strokeWidth={1.5} style={{ color: THEME.colors.primary }} />
                                            </div>
                                            <h4 style={{ margin: '0 0 0.5rem 0', fontWeight: '600', color: THEME.colors.textMain, fontSize: '0.85rem', fontFamily: THEME.typography.fontFamilyMain }}>Resumen de Flota</h4>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                                {maintenanceStats.urgent > 0 && (
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FEF2F2', padding: '4px 8px', borderRadius: THEME.radius.sm }}>
                                                        <span style={{ fontSize: '0.8rem', color: '#991B1B', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <AlertTriangle size={12} strokeWidth={1.5} style={{ color: '#EF4444' }} /> Vencidas:
                                                        </span>
                                                        <span style={{ fontWeight: '700', color: '#EF4444', fontSize: '0.8rem' }}>{maintenanceStats.urgent}</span>
                                                    </div>
                                                )}
                                                {maintenanceStats.upcoming > 0 && (
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ fontSize: '0.8rem', color: THEME.colors.textSecondary }}>Próximas (&lt;30d/1500km):</span>
                                                        <span style={{ fontWeight: '600', color: THEME.colors.textMain, fontSize: '0.8rem' }}>{maintenanceStats.upcoming}</span>
                                                    </div>
                                                )}
                                            </div>
                                            <Link href="/admin/transport?tab=maintenance" style={{ 
                                                display: 'block', width: '100%', marginTop: '0.75rem', padding: '0.45rem', border: `1px solid ${THEME.colors.borderActive}`, 
                                                borderRadius: THEME.radius.sm, backgroundColor: THEME.colors.surface, color: THEME.colors.textMain, 
                                                fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', textAlign: 'center', textDecoration: 'none',
                                                transition: 'all 0.2s'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = THEME.colors.background}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = THEME.colors.surface}
                                            >
                                                Ver Mantenimientos
                                            </Link>
                                        </div>
                                    )}

                                    {col.id === 'todo' && incompleteCount > 0 && (
                                        <div style={{ 
                                            backgroundColor: THEME.colors.background, borderRadius: THEME.radius.lg, padding: '1rem', 
                                            border: `1px solid ${THEME.colors.border}`,
                                            marginBottom: '0.75rem', position: 'relative'
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', alignItems: 'center' }}>
                                                <span style={{ fontSize: '0.6rem', fontWeight: '700', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '2px 6px', borderRadius: THEME.radius.sm, backgroundColor: THEME.colors.primaryLight, color: THEME.colors.primary }}>SISTEMA / FACTURACIÓN</span>
                                                <AlertCircle size={14} strokeWidth={1.5} style={{ color: '#F97316' }} />
                                            </div>
                                            <h4 style={{ margin: '0 0 0.5rem 0', fontWeight: '600', color: THEME.colors.textMain, fontSize: '0.85rem', fontFamily: THEME.typography.fontFamilyMain }}>Proveedores Incompletos</h4>
                                            <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.75rem', color: THEME.colors.textSecondary, lineHeight: '1.4' }}>
                                                Se han detectado <strong>{incompleteCount}</strong> proveedores sin datos bancarios.
                                            </p>
                                            <Link href="/admin/commercial/billing" style={{ textDecoration: 'none' }}>
                                                <button style={{ 
                                                    width: '100%', padding: '0.45rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.borderActive}`, 
                                                    backgroundColor: THEME.colors.surface, color: THEME.colors.textMain, fontWeight: '600', fontSize: '0.75rem', cursor: 'pointer',
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = THEME.colors.background}
                                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = THEME.colors.surface}
                                                >
                                                    Ir a Completar Datos
                                                </button>
                                            </Link>
                                        </div>
                                    )}

                                    {tasks.filter(t => {
                                        if (col.id === 'done') return showArchived ? (t.status === 'done' || t.status === 'archived') : (t.status === 'done');
                                        return t.status === col.id;
                                    }).map(task => {
                                        const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done' && task.status !== 'archived';
                                        const isArchived = task.status === 'archived';
                                        return (
                                            <div key={task.id} style={{ 
                                                backgroundColor: isArchived ? THEME.colors.background : THEME.colors.surface, 
                                                borderRadius: THEME.radius.lg, 
                                                padding: '1rem', 
                                                boxShadow: THEME.shadow.sm, 
                                                border: isOverdue ? '1.5px solid #EF4444' : isArchived ? `1px dashed ${THEME.colors.borderActive}` : `1px solid ${THEME.colors.border}`,
                                                cursor: 'pointer', 
                                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)', 
                                                opacity: isArchived ? 0.7 : 1,
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '0.5rem'
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.transform = 'translateY(-2px)';
                                                e.currentTarget.style.boxShadow = THEME.shadow.lg;
                                                if (!isOverdue && !isArchived) e.currentTarget.style.borderColor = THEME.colors.borderActive;
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.transform = 'translateY(0)';
                                                e.currentTarget.style.boxShadow = THEME.shadow.sm;
                                                if (!isOverdue && !isArchived) e.currentTarget.style.borderColor = THEME.colors.border;
                                            }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', alignItems: 'center' }}>
                                                    <span style={{ 
                                                        fontSize: '0.6rem', fontWeight: '700', textTransform: 'uppercase', padding: '2px 6px', borderRadius: THEME.radius.sm,
                                                        backgroundColor: task.priority === 'high' ? '#FEE2E2' : task.priority === 'medium' ? '#FEF3C7' : THEME.colors.background,
                                                        color: task.priority === 'high' ? '#991B1B' : task.priority === 'medium' ? '#92400E' : THEME.colors.textSecondary,
                                                        letterSpacing: '0.05em'
                                                    }}>
                                                        {task.priority || 'medium'}
                                                    </span>
                                                    <div style={{ 
                                                        display: 'flex', alignItems: 'center', gap: '4px', 
                                                        backgroundColor: isOverdue ? '#FEF2F2' : THEME.colors.background, 
                                                        padding: '3px 8px', borderRadius: THEME.radius.sm, 
                                                        border: `1px solid ${isOverdue ? '#FEE2E2' : THEME.colors.border}`,
                                                    }}>
                                                        {isOverdue ? <AlertTriangle size={12} strokeWidth={1.5} style={{ color: '#EF4444' }} /> : <Calendar size={12} strokeWidth={1.5} style={{ color: THEME.colors.textSecondary }} />}
                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1px' }}>
                                                            <span style={{ fontSize: '0.6rem', fontWeight: '700', color: isOverdue ? '#991B1B' : THEME.colors.textSecondary, whiteSpace: 'nowrap' }}>
                                                                {task.scheduled_start && task.due_date ? (
                                                                    <>
                                                                        {new Date(task.scheduled_start).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} - {new Date(task.due_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                                                                    </>
                                                                ) : task.due_date ? (
                                                                    <>
                                                                        vence {new Date(task.due_date).toLocaleDateString()}
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        creado {new Date(task.created_at).toLocaleDateString()}
                                                                    </>
                                                                )}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <h4 style={{ margin: 0, fontWeight: '600', color: THEME.colors.textMain, fontSize: '0.9rem', fontFamily: THEME.typography.fontFamilyMain }}>{task.title}</h4>
                                                <p style={{ margin: 0, fontSize: '0.8rem', color: THEME.colors.textSecondary, lineHeight: '1.4' }}>{task.description}</p>
                                                
                                                {/* Attachments Preview */}
                                                {task.attachments && task.attachments.length > 0 && (
                                                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.25rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                                                        {task.attachments.slice(0, 3).map((url, i) => (
                                                            <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', width: '32px', height: '32px', borderRadius: THEME.radius.sm, overflow: 'hidden', border: `1px solid ${THEME.colors.border}`, backgroundColor: THEME.colors.background }} onClick={(e) => e.stopPropagation()}>
                                                                {url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                                                                    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                                ) : (
                                                                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                        <FileText size={14} strokeWidth={1.5} style={{ color: THEME.colors.textSecondary }} />
                                                                    </div>
                                                                )}
                                                            </a>
                                                        ))}
                                                        {task.attachments.length > 3 && (
                                                            <div style={{ fontSize: '0.65rem', color: THEME.colors.textSecondary, alignSelf: 'center' }}>+{task.attachments.length - 3}</div>
                                                        )}
                                                    </div>
                                                )}

                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem', paddingTop: '0.6rem', borderTop: `1px solid ${THEME.colors.border}` }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                        <div style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: THEME.colors.primaryLight, color: THEME.colors.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: '700' }}>
                                                            {task.profiles?.contact_name?.[0] || '?'}
                                                        </div>
                                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                            <span style={{ fontSize: '0.7rem', fontWeight: '600', color: THEME.colors.textMain }}>{task.profiles?.contact_name || 'Sin asignar'}</span>
                                                            {task.profiles?.role && (
                                                                <span style={{ fontSize: '0.55rem', fontWeight: '600', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                                                                    {roles.find((r: Role) => r.value === task.profiles?.role)?.label || task.profiles?.role}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                                                        <select 
                                                            value={task.status} 
                                                            onClick={(e) => e.stopPropagation()}
                                                            onChange={(e) => updateTaskStatus(task.id, e.target.value)}
                                                            style={{ fontSize: '0.65rem', border: `1px solid ${THEME.colors.border}`, backgroundColor: THEME.colors.background, padding: '2px 4px', borderRadius: THEME.radius.sm, fontWeight: '600', color: THEME.colors.primary }}
                                                        >
                                                            {columns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                                                            {task.status === 'archived' && <option value="archived">Archivada</option>}
                                                        </select>
                                                        {task.status === 'done' && (
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); updateTaskStatus(task.id, 'archived'); }}
                                                                title="Archivar tarea"
                                                                style={{ background: THEME.colors.background, border: `1px solid ${THEME.colors.border}`, borderRadius: THEME.radius.sm, cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                            >
                                                                <Archive size={12} strokeWidth={1.5} style={{ color: THEME.colors.textSecondary }} />
                                                            </button>
                                                        )}
                                                        {task.status === 'archived' && (
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); updateTaskStatus(task.id, 'done'); }}
                                                                title="Desarchivar"
                                                                style={{ background: THEME.colors.background, border: `1px solid ${THEME.colors.border}`, borderRadius: THEME.radius.sm, cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                            >
                                                                <Inbox size={12} strokeWidth={1.5} style={{ color: THEME.colors.textSecondary }} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* MODAL NUEVA TAREA */}
                {isModalOpen && (
                    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
                        <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.xl, width: '100%', maxWidth: '500px', padding: '1.75rem', border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.lg }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                                <h2 style={{ margin: 0, fontWeight: '600', color: THEME.colors.textMain, fontSize: '1.25rem', fontFamily: THEME.typography.fontFamilyMain }}>Nueva Tarea</h2>
                                <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: THEME.colors.textSecondary, display: 'flex', alignItems: 'center' }}>
                                    <X size={20} strokeWidth={1.5} />
                                </button>
                            </div>
                            
                            <form onSubmit={handleCreateTask} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div>
                                    <label style={labelStyle}>Asunto / Título</label>
                                    <input 
                                        required
                                        placeholder="Ej: Revisión de merma semanal"
                                        value={newTask.title}
                                        onChange={e => setNewTask({...newTask, title: e.target.value})}
                                        style={inputStyle}
                                    />
                                </div>

                                <div>
                                    <label style={labelStyle}>Descripción</label>
                                    <textarea 
                                        placeholder="Detalles de la tarea..."
                                        value={newTask.description}
                                        onChange={e => setNewTask({...newTask, description: e.target.value})}
                                        style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }}
                                    />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div>
                                        <label style={labelStyle}>Fecha Inicio</label>
                                        <input 
                                            type="date"
                                            value={newTask.scheduled_start}
                                            onChange={e => setNewTask({...newTask, scheduled_start: e.target.value})}
                                            style={inputStyle}
                                        />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Fecha Finalización</label>
                                        <input 
                                            type="date"
                                            value={newTask.due_date}
                                            onChange={e => setNewTask({...newTask, due_date: e.target.value})}
                                            style={inputStyle}
                                        />
                                    </div>
                                </div>

                                {/* Multi-Attachment Input */}
                                <div>
                                    <label style={labelStyle}>Adjuntos</label>
                                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.2rem' }}>
                                        {tempFiles.map((file, i) => (
                                            <div key={i} style={{ position: 'relative', width: '50px', height: '50px', borderRadius: THEME.radius.sm, overflow: 'hidden', border: `1px solid ${THEME.colors.border}`, backgroundColor: THEME.colors.background }}>
                                                {file.type.startsWith('image/') ? (
                                                    <img src={URL.createObjectURL(file)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                ) : (
                                                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        <FileText size={18} strokeWidth={1.5} style={{ color: THEME.colors.textSecondary }} />
                                                    </div>
                                                )}
                                                <button type="button" onClick={() => removeFile(i)} style={{ position: 'absolute', top: '2px', right: '2px', backgroundColor: '#EF4444', color: 'white', border: 'none', borderRadius: '50%', width: '16px', height: '16px', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <X size={10} strokeWidth={1.5} />
                                                </button>
                                            </div>
                                        ))}
                                        <label style={{ width: '50px', height: '50px', borderRadius: THEME.radius.sm, border: `2px dashed ${THEME.colors.borderActive}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: THEME.colors.textSecondary }}>
                                            <Plus size={18} strokeWidth={1.5} />
                                            <input type="file" multiple onChange={handleFileChange} style={{ display: 'none' }} />
                                        </label>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div>
                                        <label style={labelStyle}>Rol Destino</label>
                                        <select 
                                            required
                                            value={newTask.target_role}
                                            onChange={e => setNewTask({...newTask, target_role: e.target.value, assigned_to: ''})}
                                            style={inputStyle}
                                        >
                                            <option value="">Seleccionar rol...</option>
                                            {roles.map((r: Role) => <option key={r.value} value={r.value}>{r.label}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Prioridad</label>
                                        <select 
                                            required
                                            value={newTask.priority}
                                            onChange={e => setNewTask({...newTask, priority: e.target.value as any})}
                                            style={inputStyle}
                                        >
                                            <option value="">Seleccionar...</option>
                                            <option value="low">Baja</option>
                                            <option value="medium">Media</option>
                                            <option value="high">Alta</option>
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label style={labelStyle}>Asignar a ({filteredStaff.length} disponibles)</label>
                                    <select 
                                        required
                                        value={newTask.assigned_to}
                                        onChange={e => setNewTask({...newTask, assigned_to: e.target.value})}
                                        style={inputStyle}
                                    >
                                        <option value="">Seleccionar responsable...</option>
                                        {filteredStaff.map(s => (
                                            <option key={s.id} value={s.id}>{s.contact_name}</option>
                                        ))}
                                    </select>
                                    {filteredStaff.length === 0 && (
                                        <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.7rem', color: '#EF4444', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <AlertTriangle size={12} strokeWidth={1.5} /> No hay colaboradores ACTIVOS con este rol.
                                        </p>
                                    )}
                                </div>

                                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                                    <button 
                                        type="button"
                                        onClick={() => setIsModalOpen(false)} 
                                        style={{ 
                                            flex: 1, padding: '0.65rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, 
                                            backgroundColor: 'transparent', color: THEME.colors.textSecondary, fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer',
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor = THEME.colors.background;
                                            e.currentTarget.style.borderColor = THEME.colors.borderActive;
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = 'transparent';
                                            e.currentTarget.style.borderColor = THEME.colors.border;
                                        }}
                                    >
                                        Cancelar
                                    </button>
                                    <button 
                                        type="submit"
                                        disabled={!newTask.assigned_to || !newTask.priority || !newTask.target_role || uploading}
                                        style={{ 
                                            flex: 2, padding: '0.65rem', borderRadius: THEME.radius.md, border: 'none', 
                                            backgroundColor: (newTask.assigned_to && newTask.priority && newTask.target_role && !uploading) ? THEME.colors.primary : '#94A3B8', 
                                            color: 'white', fontWeight: '600', fontSize: '0.875rem', 
                                            cursor: (newTask.assigned_to && newTask.priority && newTask.target_role && !uploading) ? 'pointer' : 'not-allowed',
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={(e) => {
                                            if (newTask.assigned_to && newTask.priority && newTask.target_role && !uploading) {
                                                e.currentTarget.style.backgroundColor = THEME.colors.primaryHover;
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            if (newTask.assigned_to && newTask.priority && newTask.target_role && !uploading) {
                                                e.currentTarget.style.backgroundColor = THEME.colors.primary;
                                            }
                                        }}
                                    >
                                        {uploading ? 'Subiendo...' : 'Crear Tarea'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}

const inputStyle: React.CSSProperties = { 
    width: '100%', 
    padding: '0.65rem 1rem', 
    borderRadius: THEME.radius.md, 
    border: `1px solid ${THEME.colors.border}`, 
    backgroundColor: THEME.colors.surface,
    color: THEME.colors.textMain,
    fontSize: '0.875rem', 
    fontFamily: THEME.typography.fontFamilySecondary,
    boxSizing: 'border-box', 
    outline: 'none',
    transition: 'border-color 0.2s',
};

const labelStyle: React.CSSProperties = { 
    display: 'block', 
    fontSize: '0.75rem', 
    fontWeight: '600', 
    color: THEME.colors.textSecondary, 
    textTransform: 'uppercase', 
    marginBottom: '0.4rem', 
    letterSpacing: '0.05em' 
};

function StatCard({ 
    title, 
    value, 
    icon: Icon 
}: { 
    title: string; 
    value: string | number; 
    icon: React.ComponentType<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }>; 
}) {
    const [hover, setHover] = useState(false);

    return (
        <div 
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{ 
                backgroundColor: THEME.colors.surface, 
                padding: '1.25rem 1.5rem', 
                borderRadius: THEME.radius.xl, 
                border: `1px solid ${THEME.colors.border}`, 
                boxShadow: hover ? THEME.shadow.lg : THEME.shadow.md,
                transform: hover ? 'translateY(-1px)' : 'translateY(0)',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'default'
            }}
        >
            <div>
                <div style={{ 
                    fontSize: '0.75rem', 
                    fontWeight: '600', 
                    color: THEME.colors.textSecondary, 
                    textTransform: 'uppercase', 
                    letterSpacing: '0.05em',
                    marginBottom: '0.25rem' 
                }}>{title}</div>
                <div style={{ 
                    fontSize: '1.4rem', 
                    fontWeight: '700', 
                    color: THEME.colors.textMain 
                }}>{typeof value === 'number' ? formatNumber(value) : value}</div>
            </div>
            <div style={{ 
                width: '38px', 
                height: '38px', 
                borderRadius: '50%', 
                backgroundColor: THEME.colors.primaryLight, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
            }}>
                <Icon size={18} strokeWidth={1.5} style={{ color: THEME.colors.primary }} />
            </div>
        </div>
    );
}
