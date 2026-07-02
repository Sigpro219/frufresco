'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/authContext';
import Toast from '@/components/Toast';
import { THEME } from '@/lib/adminTheme';

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

export default function KanbanTrelloPage() {
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
    
    // Drag and Drop state
    const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
    const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

    // Form state
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [newTaskStatus, setNewTaskStatus] = useState<'todo' | 'in_progress' | 'done'>('todo');
    const [newTask, setNewTask] = useState({
        title: '',
        description: '',
        priority: 'medium' as 'low' | 'medium' | 'high',
        assigned_to: '',
        target_role: '',
        scheduled_start: '',
        due_date: ''
    });

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingTask(null);
    };

    useEffect(() => {
        if (editingTask) {
            setNewTask({
                title: editingTask.title || '',
                description: editingTask.description || '',
                priority: (editingTask.priority || 'medium') as 'low' | 'medium' | 'high',
                assigned_to: editingTask.assigned_to || '',
                target_role: editingTask.target_role || '',
                scheduled_start: editingTask.scheduled_start ? new Date(editingTask.scheduled_start).toISOString().split('T')[0] : '',
                due_date: editingTask.due_date ? new Date(editingTask.due_date).toISOString().split('T')[0] : ''
            });
            setNewTaskStatus(editingTask.status as any);
        } else {
            setNewTask({
                title: '',
                description: '',
                priority: 'medium',
                assigned_to: '',
                target_role: '',
                scheduled_start: '',
                due_date: ''
            });
        }
        setTempFiles([]);
    }, [editingTask]);

    const handleUpdateTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingTask) return;
        setUploading(true);
        try {
            const uploadedUrls = [...(editingTask.attachments || [])];

            for (const file of tempFiles) {
                const fileExt = file.name.split('.').pop();
                const fileName = `${Math.random()}.${fileExt}`;
                const filePath = `tasks/${Date.now()}_${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('client-documents')
                    .upload(filePath, file);

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('client-documents')
                    .getPublicUrl(filePath);
                
                uploadedUrls.push(publicUrl);
            }

            const { error } = await supabase
                .from('admin_tasks')
                .update({
                    title: newTask.title,
                    description: newTask.description,
                    priority: newTask.priority,
                    target_role: newTask.target_role,
                    assigned_to: newTask.assigned_to,
                    scheduled_start: newTask.scheduled_start || null,
                    due_date: newTask.due_date || null,
                    attachments: uploadedUrls
                })
                .eq('id', editingTask.id);

            if (error) throw error;

            window.showToast?.('Tarea actualizada correctamente', 'success');
            closeModal();
            fetchData();
        } catch (err: any) {
            const message = err?.message || 'Error desconocido';
            alert('Error al actualizar tarea: ' + message);
        } finally {
            setUploading(false);
        }
    };

    const handleDeleteTask = async () => {
        if (!editingTask) return;
        if (!confirm('¿Estás seguro de que deseas eliminar esta tarea permanentemente?')) return;
        setUploading(true);
        try {
            const { error } = await supabase
                .from('admin_tasks')
                .delete()
                .eq('id', editingTask.id);

            if (error) throw error;

            window.showToast?.('Tarea eliminada correctamente', 'success');
            closeModal();
            fetchData();
        } catch (err: any) {
            alert('Error al eliminar tarea: ' + err.message);
        } finally {
            setUploading(false);
        }
    };

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

            // 2. Fetch Staff
            const { data: staffData, error: staffError } = await supabase
                .from('profiles')
                .select('id, contact_name, role, is_active')
                .eq('is_active', true)
                .not('role', 'eq', 'b2b_client')
                .order('contact_name');
            
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

                mData.forEach((t: any) => {
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

            // 6. Fetch Roles
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

            for (const file of tempFiles) {
                const fileExt = file.name.split('.').pop();
                const fileName = `${Math.random()}.${fileExt}`;
                const filePath = `tasks/${Date.now()}_${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('client-documents')
                    .upload(filePath, file);

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('client-documents')
                    .getPublicUrl(filePath);
                
                uploadedUrls.push(publicUrl);
            }

            const { error } = await supabase
                .from('admin_tasks')
                .insert([{
                    ...newTask,
                    created_by: user?.id,
                    assigned_to: newTask.assigned_to || null,
                    status: newTaskStatus,
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
        // Optimistic update
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus as any } : t));
        try {
            const { error } = await supabase
                .from('admin_tasks')
                .update({ status: newStatus })
                .eq('id', taskId);

            if (error) throw error;
            fetchData();
        } catch (err: any) {
            console.error('Error updating status:', err);
            const errMsg = err?.message || err?.details || JSON.stringify(err);
            console.error('Error message:', errMsg);
            window.showToast?.('Error al actualizar estado: ' + errMsg, 'error');
            fetchData(); // Rollback on error
        }
    };

    const filteredStaff = staff.filter(s => s.role === newTask.target_role);

    const columns = [
        { id: 'todo', title: 'Pendientes', color: '#FEE2E2', textColor: '#B91C1C' },
        { id: 'in_progress', title: 'En Ejecución', color: '#FEF3C7', textColor: '#D97706' },
        { id: 'done', title: 'Terminadas', color: '#DCFCE7', textColor: '#15803D' }
    ];

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif' }}>
            <Toast />
            
            <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
                    <div>
                        <Link href="/admin/commercial/inventory" style={{ color: '#64748B', textDecoration: 'none', fontWeight: '600', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            ← Volver a Inventario
                        </Link>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <h1 style={{ fontSize: '2.5rem', fontWeight: '900', color: '#0F172A', margin: 0 }}>Tablero Trello Operativo</h1>
                            <span style={{ backgroundColor: '#2563EB', color: 'white', fontSize: '0.65rem', fontWeight: '800', padding: '4px 8px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Beta Drag & Drop</span>
                        </div>
                        <p style={{ color: '#64748B', fontSize: '1.1rem' }}>Arrastra y suelta tarjetas entre columnas para gestionar tareas en tiempo real.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <Link href="/admin/commercial/inventory/tasks" style={{ textDecoration: 'none' }}>
                            <button 
                                style={{ 
                                    backgroundColor: '#F8FAFC', color: '#1E293B', border: '1px solid #E2E8F0', padding: '1rem 1.5rem', 
                                    borderRadius: '14px', fontWeight: '800', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
                                }}
                            >
                                <span>📋</span> Vista Clásica
                            </button>
                        </Link>
                        <button 
                            onClick={() => {
                                setNewTaskStatus('todo');
                                setIsModalOpen(true);
                            }}
                            style={{ 
                                backgroundColor: '#2563EB', color: 'white', border: 'none', padding: '1rem 2rem', 
                                borderRadius: '14px', fontWeight: '800', cursor: 'pointer', boxShadow: '0 10px 15px -3px rgba(37, 99, 235, 0.2)',
                                display: 'flex', alignItems: 'center', gap: '0.5rem'
                            }}
                        >
                            <span>✚</span> Nueva Tarjeta
                        </button>
                    </div>
                </div>

                {/* Mini Dashboard */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '3rem' }}>
                    <StatCard title="Total Tarjetas" value={tasks.length} color="#EFF6FF" textColor="#1D4ED8" />
                    <StatCard title="Alta Prioridad" value={tasks.filter(t => t.priority === 'high').length} color="#FEF2F2" textColor="#B91C1C" />
                    <StatCard title="En Ejecución" value={tasks.filter(t => t.status === 'in_progress').length} color="#FFFBEB" textColor="#92400E" />
                    <StatCard title="Mis Vencidas" value={myOverdueTasks.length} color={myOverdueTasks.length > 0 ? '#FEF2F2' : '#F0FDF4'} textColor={myOverdueTasks.length > 0 ? '#EF4444' : '#166534'} />
                </div>

                {/* Filters */}
                <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                    <button 
                        onClick={() => setShowArchived(!showArchived)}
                        style={{ 
                            fontSize: '0.8rem', fontWeight: '700', padding: '0.5rem 1rem', borderRadius: '10px', 
                            border: '1px solid #E2E8F0', backgroundColor: showArchived ? '#F1F5F9' : 'white',
                            color: showArchived ? '#2563EB' : '#64748B', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem'
                        }}
                    >
                        {showArchived ? '📁 Ocultar Archivadas' : '📂 Ver Archivadas'}
                    </button>
                </div>

                {/* Trello Kanban Board */}
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '5rem', color: '#64748B' }}>🔄 Cargando tablero...</div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2rem' }}>
                        {columns.map(col => {
                            const isOver = dragOverColumn === col.id;
                            const colTasks = tasks.filter(t => {
                                if (col.id === 'done') return showArchived ? (t.status === 'done' || t.status === 'archived') : (t.status === 'done');
                                return t.status === col.id;
                            });

                            return (
                                <div 
                                    key={col.id} 
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        e.dataTransfer.dropEffect = 'move';
                                    }}
                                    onDragEnter={() => setDragOverColumn(col.id)}
                                    onDragLeave={() => setDragOverColumn(prev => prev === col.id ? null : prev)}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        const taskId = e.dataTransfer.getData('text/plain') || draggingTaskId;
                                        if (taskId) {
                                            updateTaskStatus(taskId, col.id);
                                        }
                                        setDragOverColumn(null);
                                        setDraggingTaskId(null);
                                    }}
                                    style={{ 
                                        backgroundColor: isOver ? '#E2E8F0' : '#F1F5F9', 
                                        borderRadius: '20px', 
                                        padding: '1.5rem', 
                                        minHeight: '600px',
                                        border: isOver ? `2px dashed ${col.textColor}` : '2px solid transparent',
                                        transition: 'all 0.2s ease',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '1rem'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                        <h3 style={{ margin: 0, fontWeight: '800', color: col.textColor, textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '0.05em' }}>
                                            {col.title} <span style={{ backgroundColor: 'white', padding: '2px 8px', borderRadius: '6px', marginLeft: '8px', fontSize: '0.75rem', color: '#475569' }}>{colTasks.length}</span>
                                        </h3>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>


                                        {/* Task Cards */}
                                        {colTasks.map(task => {
                                            const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done' && task.status !== 'archived';
                                            const isArchived = task.status === 'archived';
                                            const isDragging = draggingTaskId === task.id;

                                            return (
                                                <div 
                                                    key={task.id} 
                                                    draggable={true}
                                                    onDragStart={(e) => {
                                                        setDraggingTaskId(task.id);
                                                        e.dataTransfer.setData('text/plain', task.id);
                                                        e.dataTransfer.effectAllowed = 'move';
                                                    }}
                                                    onDragEnd={() => setDraggingTaskId(null)}
                                                    onClick={() => {
                                                        setEditingTask(task);
                                                        setIsModalOpen(true);
                                                    }}
                                                    style={{ 
                                                        backgroundColor: isArchived ? '#F8FAFC' : 'white', 
                                                        borderRadius: '16px', 
                                                        padding: '1.25rem', 
                                                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', 
                                                        border: isOverdue ? '2px solid #EF4444' : isArchived ? '1px dashed #CBD5E1' : '1px solid #E2E8F0',
                                                        cursor: 'grab', 
                                                        transition: 'all 0.2s', 
                                                        opacity: isDragging ? 0.3 : isArchived ? 0.7 : 1,
                                                        transform: isDragging ? 'scale(0.95)' : 'none'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        if (!isDragging) e.currentTarget.style.transform = 'translateY(-2px)';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        if (!isDragging) e.currentTarget.style.transform = 'translateY(0)';
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', alignItems: 'start' }}>
                                                        <span style={{ 
                                                            fontSize: '0.65rem', fontWeight: '900', textTransform: 'uppercase', padding: '2px 8px', borderRadius: '4px',
                                                            backgroundColor: task.priority === 'high' ? '#FEE2E2' : task.priority === 'medium' ? '#FEF3C7' : '#F1F5F9',
                                                            color: task.priority === 'high' ? '#991B1B' : task.priority === 'medium' ? '#92400E' : '#475569'
                                                        }}>
                                                            {task.priority || 'medium'}
                                                        </span>
                                                        <div style={{ 
                                                            display: 'flex', alignItems: 'center', gap: '6px', 
                                                            backgroundColor: isOverdue ? '#FEF2F2' : '#F8FAFC', 
                                                            padding: '2px 6px', borderRadius: '8px', 
                                                            border: `1px solid ${isOverdue ? '#FEE2E2' : '#E2E8F0'}`
                                                        }}>
                                                            <span style={{ fontSize: '0.8rem' }}>{isOverdue ? '⚠️' : '📅'}</span>
                                                            <span style={{ fontSize: '0.68rem', fontWeight: '700', color: isOverdue ? '#991B1B' : '#475569' }}>
                                                                {task.due_date ? new Date(task.due_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : 'Sin fecha'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <h4 style={{ margin: '0 0 0.5rem 0', fontWeight: '700', color: '#1E293B', fontSize: '0.95rem' }}>{task.title}</h4>
                                                    <p style={{ margin: '0 0 1rem 0', fontSize: '0.8rem', color: '#64748B', lineHeight: '1.4' }}>{task.description}</p>
                                                    
                                                    {/* Attachments Preview */}
                                                    {task.attachments && task.attachments.length > 0 && (
                                                        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                                                            {task.attachments.slice(0, 3).map((url, i) => (
                                                                <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', width: '35px', height: '35px', borderRadius: '6px', overflow: 'hidden', border: '1px solid #E2E8F0', backgroundColor: '#F9FAFB' }} onClick={(e) => e.stopPropagation()}>
                                                                    {url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                                                                        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                                    ) : (
                                                                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>📄</div>
                                                                    )}
                                                                </a>
                                                            ))}
                                                        </div>
                                                    )}

                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.8rem', borderTop: '1px solid #F1F5F9' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                            <div style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: '#E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: '950', color: '#475569' }}>
                                                                {task.profiles?.contact_name?.[0] || '?'}
                                                            </div>
                                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#1E293B' }}>{task.profiles?.contact_name || 'Sin asignar'}</span>
                                                            </div>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '4px' }}>
                                                            {task.status === 'done' && (
                                                                <button 
                                                                    onClick={(e) => { e.stopPropagation(); updateTaskStatus(task.id, 'archived'); }}
                                                                    title="Archivar"
                                                                    style={{ background: '#F1F5F9', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '2px 6px', fontSize: '0.7rem' }}
                                                                >
                                                                    📦
                                                                </button>
                                                            )}
                                                            {task.status === 'archived' && (
                                                                <button 
                                                                    onClick={(e) => { e.stopPropagation(); updateTaskStatus(task.id, 'done'); }}
                                                                    title="Desarchivar"
                                                                    style={{ background: '#F1F5F9', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '2px 6px', fontSize: '0.7rem' }}
                                                                >
                                                                    📤
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        {/* Trello Style Column Quick Add Card Button */}
                                        <button 
                                            onClick={() => {
                                                setNewTaskStatus(col.id as any);
                                                setIsModalOpen(true);
                                            }}
                                            style={{
                                                width: '100%',
                                                padding: '0.65rem',
                                                border: '1px dashed #CBD5E1',
                                                borderRadius: '12px',
                                                background: 'transparent',
                                                color: '#64748B',
                                                fontWeight: '700',
                                                fontSize: '0.8rem',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '0.4rem',
                                                transition: 'all 0.2s',
                                                marginTop: 'auto'
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.background = 'rgba(0,0,0,0.03)';
                                                e.currentTarget.style.color = '#1E293B';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.background = 'transparent';
                                                e.currentTarget.style.color = '#64748B';
                                            }}
                                        >
                                            <span>➕</span> Añadir una tarjeta
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* MODAL NUEVA TAREA */}
                {isModalOpen && (
                    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
                        <div style={{ backgroundColor: 'white', borderRadius: '24px', width: '100%', maxWidth: '500px', padding: '2rem', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <h2 style={{ margin: 0, fontWeight: '900', color: '#0F172A' }}>{editingTask ? 'Editar Tarjeta' : 'Nueva Tarjeta'}</h2>
                                    <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: '700', textTransform: 'uppercase', marginTop: '2px' }}>
                                        En columna: <span style={{ color: '#2563EB' }}>{columns.find(c => c.id === newTaskStatus)?.title}</span>
                                    </span>
                                </div>
                                <button onClick={closeModal} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94A3B8' }}>✕</button>
                            </div>
                            
                            <form onSubmit={editingTask ? handleUpdateTask : handleCreateTask} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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

                                <div>
                                    <label style={labelStyle}>Adjuntos</label>
                                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.2rem' }}>
                                        {tempFiles.map((file, i) => (
                                            <div key={i} style={{ position: 'relative', width: '50px', height: '50px', borderRadius: '10px', overflow: 'hidden', border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC' }}>
                                                {file.type.startsWith('image/') ? (
                                                    <img src={URL.createObjectURL(file)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                ) : (
                                                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>📄</div>
                                                )}
                                                <button type="button" onClick={() => removeFile(i)} style={{ position: 'absolute', top: '2px', right: '2px', backgroundColor: '#EF4444', color: 'white', border: 'none', borderRadius: '50%', width: '16px', height: '16px', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                                            </div>
                                        ))}
                                        <label style={{ width: '50px', height: '50px', borderRadius: '10px', border: '2px dashed #D1D5DB', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#94A3B8', fontSize: '1.2rem' }}>
                                            +
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
                                    <label style={labelStyle}>Asignar a ({staff.filter(s => s.contact_name).length} disponibles)</label>
                                    <select 
                                        required
                                        value={newTask.assigned_to}
                                        onChange={e => setNewTask({...newTask, assigned_to: e.target.value})}
                                        style={inputStyle}
                                    >
                                        <option value="">Seleccionar responsable...</option>
                                        {staff.filter(s => s.contact_name).map(s => (
                                            <option key={s.id} value={s.id}>
                                                {s.contact_name} ({roles.find(r => r.value === s.role)?.label || s.role || 'Colaborador'})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                                    {editingTask && (
                                        <button 
                                            type="button"
                                            onClick={handleDeleteTask} 
                                            style={{ padding: '0.8rem 1.2rem', borderRadius: '12px', border: '1px solid #FEE2E2', backgroundColor: '#FEF2F2', color: '#EF4444', fontWeight: '700', cursor: 'pointer' }}
                                            title="Eliminar tarea permanentemente"
                                        >
                                            🗑️
                                        </button>
                                    )}
                                    <button 
                                        type="button"
                                        onClick={closeModal} 
                                        style={{ flex: 1, padding: '0.8rem', borderRadius: '12px', border: '1px solid #E2E8F0', backgroundColor: 'transparent', fontWeight: '700', cursor: 'pointer' }}
                                    >
                                        Cancelar
                                    </button>
                                    <button 
                                        type="submit"
                                        disabled={!newTask.assigned_to || !newTask.priority || !newTask.target_role || uploading}
                                        style={{ flex: 2, padding: '0.8rem', borderRadius: '12px', border: 'none', backgroundColor: (newTask.assigned_to && newTask.priority && newTask.target_role && !uploading) ? '#2563EB' : '#94A3B8', color: 'white', fontWeight: '800', cursor: (newTask.assigned_to && newTask.priority && newTask.target_role && !uploading) ? 'pointer' : 'not-allowed' }}
                                    >
                                        {uploading ? 'SUBIENDO...' : editingTask ? 'GUARDAR' : 'CREAR TARJETA'}
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
    width: '100%', padding: '0.8rem 1rem', borderRadius: '12px', border: '1px solid #D1D5DB', 
    fontSize: '0.95rem', boxSizing: 'border-box', outline: 'none'
};

const labelStyle: React.CSSProperties = { 
    display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#64748B', 
    textTransform: 'uppercase', marginBottom: '0.5rem', letterSpacing: '0.05em' 
};

function StatCard({ title, value, color, textColor }: { title: string, value: string | number, color: string, textColor: string }) {
    return (
        <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '20px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', marginBottom: '0.5rem' }}>{title}</div>
            <div style={{ fontSize: '1.8rem', fontWeight: '950', color: textColor }}>{value}</div>
        </div>
    );
}
