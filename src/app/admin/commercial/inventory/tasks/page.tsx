'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/authContext';
import Toast from '@/components/Toast';

const ROLES = [
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
                const myTasks = tasksData.filter(t => t.assigned_to === user.id);
                const overdue = myTasks.filter(t => 
                    t.due_date && 
                    new Date(t.due_date) < now && 
                    t.status !== 'done' && 
                    t.status !== 'archived'
                );
                const pending = myTasks.filter(t => t.status === 'todo' || t.status === 'in_progress').length;
                
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

                mData.forEach(t => {
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
        } catch (err) {
            console.error('Error fetching Kanban data:', err);
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
            setNewTask({ title: '', description: '', priority: '' as any, assigned_to: '', target_role: '', scheduled_start: '', due_date: '' });
            setTempFiles([]);
            fetchData();
        } catch (err: any) {
            alert('Error al crear tarea: ' + err.message);
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
        } catch (err: any) {
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
        <main style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', fontFamily: 'Inter, sans-serif' }}>
            <Navbar />
            <Toast />
            
            <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
                    <div>
                        <Link href="/admin/commercial/inventory" style={{ color: '#64748B', textDecoration: 'none', fontWeight: '600', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            ← Volver a Inventario
                        </Link>
                        <h1 style={{ fontSize: '2.5rem', fontWeight: '900', color: '#0F172A', margin: 0 }}>Tablero Kanban Administrativo</h1>
                        <p style={{ color: '#64748B', fontSize: '1.1rem' }}>Gestión ágil de tareas y prioridades operativas.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <Link href="/admin/master/products" style={{ textDecoration: 'none' }}>
                            <button 
                                style={{ 
                                    backgroundColor: '#F8FAFC', color: '#1E293B', border: '1px solid #E2E8F0', padding: '1rem 1.5rem', 
                                    borderRadius: '14px', fontWeight: '800', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
                                }}
                            >
                                <span>📚</span> Catálogo Maestro
                            </button>
                        </Link>
                        <button 
                            onClick={() => setIsModalOpen(true)}
                            style={{ 
                                backgroundColor: '#2563EB', color: 'white', border: 'none', padding: '1rem 2rem', 
                                borderRadius: '14px', fontWeight: '800', cursor: 'pointer', boxShadow: '0 10px 15px -3px rgba(37, 99, 235, 0.2)',
                                display: 'flex', alignItems: 'center', gap: '0.5rem'
                            }}
                        >
                            <span>✚</span> Nueva Tarea
                        </button>
                    </div>
                </div>

                {/* Mini Dashboard */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '3rem' }}>
                    <StatCard title="Total Tareas" value={tasks.length} color="#EFF6FF" textColor="#1D4ED8" />
                    <StatCard title="Alta Prioridad" value={tasks.filter(t => t.priority === 'high').length} color="#FEF2F2" textColor="#B91C1C" />
                    <StatCard title="En Curso" value={tasks.filter(t => t.status === 'in_progress').length} color="#FFFBEB" textColor="#92400E" />
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

                {/* Kanban Board */}
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '5rem', color: '#64748B' }}>🔄 Cargando tablero...</div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2rem' }}>
                        {columns.map(col => (
                            <div key={col.id} style={{ backgroundColor: '#F1F5F9', borderRadius: '20px', padding: '1.5rem', minHeight: '600px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                    <h3 style={{ margin: 0, fontWeight: '800', color: col.textColor, textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '0.05em' }}>
                                        {col.title} <span style={{ backgroundColor: 'white', padding: '2px 8px', borderRadius: '6px', marginLeft: '8px', fontSize: '0.75rem' }}>{tasks.filter(t => t.status === col.id).length}</span>
                                    </h3>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {col.id === 'todo' && myPendingCount > 0 && (
                                        <div style={{ 
                                            backgroundColor: '#F0F9FF', borderRadius: '16px', padding: '1.25rem', 
                                            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '2px solid #0EA5E9',
                                            marginBottom: '0.5rem', position: 'relative', overflow: 'hidden'
                                        }}>
                                            <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', backgroundColor: '#0EA5E9' }}></div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                                <span style={{ fontSize: '0.65rem', fontWeight: '900', textTransform: 'uppercase', padding: '2px 8px', borderRadius: '4px', backgroundColor: '#E0F2FE', color: '#0369A1' }}>RESUMEN PERSONAL</span>
                                                <span style={{ fontSize: '1.1rem' }}>👤</span>
                                            </div>
                                            <h4 style={{ margin: '0 0 0.5rem 0', fontWeight: '900', color: '#0369A1' }}>Mis Tareas</h4>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '0.85rem', color: '#0C4A6E' }}>Pendientes hoy:</span>
                                                    <span style={{ fontWeight: '900', color: '#0EA5E9' }}>{myPendingCount}</span>
                                                </div>
                                                {myOverdueTasks.length > 0 && (
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FEF2F2', padding: '4px 8px', borderRadius: '8px' }}>
                                                        <span style={{ fontSize: '0.85rem', color: '#991B1B', fontWeight: '700' }}>🚨 VENCIDAS:</span>
                                                        <span style={{ fontWeight: '950', color: '#EF4444' }}>{myOverdueTasks.length}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {col.id === 'todo' && (maintenanceStats.urgent > 0 || maintenanceStats.upcoming > 0) && (
                                        <div style={{ 
                                            backgroundColor: '#FFF1F2', borderRadius: '16px', padding: '1.25rem', 
                                            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '2px solid #F43F5E',
                                            marginBottom: '0.5rem', position: 'relative', overflow: 'hidden'
                                        }}>
                                            <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', backgroundColor: '#F43F5E' }}></div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                                <span style={{ fontSize: '0.65rem', fontWeight: '900', textTransform: 'uppercase', padding: '2px 8px', borderRadius: '4px', backgroundColor: '#FFE4E6', color: '#9F1239' }}>SISTEMA / FLOTA</span>
                                                <span style={{ fontSize: '1.1rem' }}>🚛</span>
                                            </div>
                                            <h4 style={{ margin: '0 0 0.5rem 0', fontWeight: '900', color: '#9F1239' }}>Resumen de Flota</h4>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                {maintenanceStats.urgent > 0 && (
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FEF2F2', padding: '4px 8px', borderRadius: '8px' }}>
                                                        <span style={{ fontSize: '0.85rem', color: '#991B1B', fontWeight: '700' }}>🚨 VENCIDAS:</span>
                                                        <span style={{ fontWeight: '950', color: '#EF4444' }}>{maintenanceStats.urgent}</span>
                                                    </div>
                                                )}
                                                {maintenanceStats.upcoming > 0 && (
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ fontSize: '0.85rem', color: '#9F1239' }}>Próximas (&#60;30d/1500km):</span>
                                                        <span style={{ fontWeight: '900', color: '#F43F5E' }}>{maintenanceStats.upcoming}</span>
                                                    </div>
                                                )}
                                            </div>
                                            <Link href="/admin/transport?tab=maintenance" style={{ 
                                                display: 'block', width: '100%', marginTop: '1rem', padding: '0.6rem', border: 'none', 
                                                borderRadius: '10px', backgroundColor: '#F43F5E', color: 'white', 
                                                fontSize: '0.8rem', fontWeight: '800', cursor: 'pointer', textAlign: 'center', textDecoration: 'none'
                                            }}>
                                                Ver Mantenimientos
                                            </Link>
                                        </div>
                                    )}

                                    {col.id === 'todo' && incompleteCount > 0 && (
                                        <div style={{ 
                                            backgroundColor: '#FFF7ED', borderRadius: '16px', padding: '1.25rem', 
                                            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '2px solid #F97316',
                                            marginBottom: '1rem', position: 'relative', overflow: 'hidden'
                                        }}>
                                            <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', backgroundColor: '#F97316' }}></div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                                <span style={{ fontSize: '0.65rem', fontWeight: '900', textTransform: 'uppercase', padding: '2px 8px', borderRadius: '4px', backgroundColor: '#FFEDD5', color: '#9A3412' }}>SISTEMA / FACTURACIÓN</span>
                                                <span style={{ fontSize: '0.7rem', color: '#C2410C', fontWeight: 'bold' }}>Hoy</span>
                                            </div>
                                            <h4 style={{ margin: '0 0 0.5rem 0', fontWeight: '900', color: '#9A3412' }}>🚨 Proveedores Incompletos</h4>
                                            <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: '#7C2D12', lineHeight: '1.4' }}>
                                                Se han detectado <strong>{incompleteCount}</strong> proveedores sin información bancaria completa. 
                                            </p>
                                            <Link href="/admin/commercial/billing" style={{ textDecoration: 'none' }}>
                                                <button style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: 'none', backgroundColor: '#F97316', color: 'white', fontWeight: '800', fontSize: '0.8rem', cursor: 'pointer' }}>
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
                                                backgroundColor: isArchived ? '#F8FAFC' : 'white', borderRadius: '16px', padding: '1.25rem', 
                                                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: isOverdue ? '2px solid #EF4444' : isArchived ? '1px dashed #CBD5E1' : '1px solid #E2E8F0',
                                                cursor: 'pointer', transition: 'transform 0.2s', opacity: isArchived ? 0.7 : 1
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                                            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
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
                                                        padding: '4px 10px', borderRadius: '10px', 
                                                        border: `1px solid ${isOverdue ? '#FEE2E2' : '#E2E8F0'}`,
                                                        boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                                                    }}>
                                                        <span style={{ fontSize: '0.9rem' }}>{isOverdue ? '⚠️' : '📅'}</span>
                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1px' }}>
                                                            <span style={{ fontSize: '0.6rem', fontWeight: '800', color: isOverdue ? '#EF4444' : '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.02em', lineHeight: '1' }}>
                                                                Cronograma
                                                            </span>
                                                            <span style={{ fontSize: '0.72rem', fontWeight: '700', color: isOverdue ? '#991B1B' : '#475569', whiteSpace: 'nowrap' }}>
                                                                {task.scheduled_start && task.due_date ? (
                                                                    <>
                                                                        <span style={{ color: '#94A3B8', fontWeight: '400', fontSize: '0.65rem' }}>del</span> {new Date(task.scheduled_start).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} 
                                                                        <span style={{ color: '#94A3B8', fontWeight: '400', fontSize: '0.65rem' }}> al </span> {new Date(task.due_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                                                                    </>
                                                                ) : task.due_date ? (
                                                                    <>
                                                                        <span style={{ color: '#94A3B8', fontWeight: '400', fontSize: '0.65rem' }}>vence </span> {new Date(task.due_date).toLocaleDateString()}
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <span style={{ color: '#94A3B8', fontWeight: '400', fontSize: '0.65rem' }}>creado </span> {new Date(task.created_at).toLocaleDateString()}
                                                                    </>
                                                                )}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <h4 style={{ margin: '0 0 0.5rem 0', fontWeight: '700', color: '#1E293B' }}>{task.title}</h4>
                                                <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: '#64748B', lineHeight: '1.5' }}>{task.description}</p>
                                                

                                                {/* Attachments Preview */}
                                                {task.attachments && task.attachments.length > 0 && (
                                                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                                                        {task.attachments.slice(0, 3).map((url, i) => (
                                                            <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', width: '40px', height: '40px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #E2E8F0', backgroundColor: '#F9FAFB' }} onClick={(e) => e.stopPropagation()}>
                                                                {url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                                                                    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                                ) : (
                                                                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>📄</div>
                                                                )}
                                                            </a>
                                                        ))}
                                                        {task.attachments.length > 3 && (
                                                            <div style={{ fontSize: '0.7rem', color: '#94A3B8', alignSelf: 'center' }}>+{task.attachments.length - 3} más</div>
                                                        )}
                                                    </div>
                                                )}

                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '0.8rem', borderTop: '1px solid #F1F5F9' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                        <div style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: '#E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.5rem', fontWeight: '900' }}>
                                                            {task.profiles?.contact_name?.[0] || '?'}
                                                        </div>
                                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                            <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#1E293B' }}>{task.profiles?.contact_name || 'Sin asignar'}</span>
                                                            {task.profiles?.role && (
                                                                <span style={{ fontSize: '0.55rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                                                                    {ROLES.find(r => r.value === task.profiles?.role)?.label || task.profiles.role}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                                                        <select 
                                                            value={task.status} 
                                                            onClick={(e) => e.stopPropagation()}
                                                            onChange={(e) => updateTaskStatus(task.id, e.target.value)}
                                                            style={{ fontSize: '0.7rem', border: 'none', backgroundColor: '#F8FAFC', padding: '2px 5px', borderRadius: '4px', fontWeight: 'Bold', color: '#2563EB' }}
                                                        >
                                                            {columns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                                                            {task.status === 'archived' && <option value="archived">Archivada</option>}
                                                        </select>
                                                        {task.status === 'done' && (
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); updateTaskStatus(task.id, 'archived'); }}
                                                                title="Archivar tarea"
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
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* MODAL NUEVA TAREA */}
                {isModalOpen && (
                    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
                        <div style={{ backgroundColor: 'white', borderRadius: '24px', width: '100%', maxWidth: '500px', padding: '2rem', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                <h2 style={{ margin: 0, fontWeight: '900', color: '#0F172A' }}>Nueva Tarea</h2>
                                <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94A3B8' }}>✕</button>
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
                                            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
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
                                        <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.7rem', color: '#EF4444', fontWeight: '600' }}>
                                            ⚠️ No hay colaboradores ACTIVOS con este rol.
                                        </p>
                                    )}
                                </div>

                                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                                    <button 
                                        type="button"
                                        onClick={() => setIsModalOpen(false)} 
                                        style={{ flex: 1, padding: '0.8rem', borderRadius: '12px', border: '1px solid #E2E8F0', backgroundColor: 'transparent', fontWeight: '700', cursor: 'pointer' }}
                                    >
                                        Cancelar
                                    </button>
                                    <button 
                                        type="submit"
                                        disabled={!newTask.assigned_to || !newTask.priority || !newTask.target_role || uploading}
                                        style={{ flex: 2, padding: '0.8rem', borderRadius: '12px', border: 'none', backgroundColor: (newTask.assigned_to && newTask.priority && newTask.target_role && !uploading) ? '#2563EB' : '#94A3B8', color: 'white', fontWeight: '800', cursor: (newTask.assigned_to && newTask.priority && newTask.target_role && !uploading) ? 'pointer' : 'not-allowed' }}
                                    >
                                        {uploading ? 'SUBIENDO...' : 'CREAR TAREA'}
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
