'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface MaintenanceTask {
    id: string;
    vehicle_id: string;
    task_name: string;
    task_type: 'km' | 'date';
    interval_km?: number;
    interval_months?: number;
    last_performed_km?: number;
    last_performed_date?: string;
    next_due_km?: number;
    next_due_date?: string;
    is_urgent: boolean;
    vehicle?: {
        plate: string;
        current_odometer: number;
        avg_daily_km: number;
        driver_id?: string;
    };
}

interface MaintenanceHistoryLog {
    id: string;
    vehicle_id: string;
    task_name: string;
    performed_date: string;
    performed_km: number;
    performed_by_driver_id?: string;
    next_due_date?: string;
    next_due_km?: number;
    attachments: string[];
    notes?: string;
    created_at: string;
    vehicle?: { plate: string };
    driver?: { contact_name: string };
}

const COMMON_TASKS = [
    { name: 'Cambio de Aceite y Filtro', interval: 5000, type: 'km' },
    { name: 'Renovación de SOAT', interval: 12, type: 'date' },
    { name: 'Revisión Tecnomecánica', interval: 12, type: 'date' },
    { name: 'Revisión / Cambio de Frenos', interval: 15000, type: 'km' },
    { name: 'Rotación y Alineación de Llantas', interval: 10000, type: 'km' },
    { name: 'Cambio de Filtro de Aire y Combustible', interval: 10000, type: 'km' },
    { name: 'Revisión de Suspensión y Dirección', interval: 20000, type: 'km' },
    { name: 'Lubricación de Chasis y Transmisión', interval: 5000, type: 'km' },
];

export default function MaintenanceManagement() {
    const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
    const [vehicles, setVehicles] = useState<{id: string, plate: string, current_odometer: number, avg_daily_km: number, driver_id?: string}[]>([]);
    const [drivers, setDrivers] = useState<{id: string, contact_name: string}[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const isMounted = useRef(true);
    const [newTask, setNewTask] = useState({
        vehicle_id: '',
        task_name: COMMON_TASKS[0].name,
        task_type: COMMON_TASKS[0].type as 'km' | 'date',
        interval_km: COMMON_TASKS[0].type === 'km' ? COMMON_TASKS[0].interval : 0,
        interval_months: COMMON_TASKS[0].type === 'date' ? COMMON_TASKS[0].interval : 0,
        last_performed_km: 0,
        last_performed_date: new Date().toISOString().split('T')[0]
    });

    // Completion modal state
    const [showCloseModal, setShowCloseModal] = useState(false);
    const [completingTask, setCompletingTask] = useState<MaintenanceTask | null>(null);
    const [completionDate, setCompletionDate] = useState(new Date().toISOString().split('T')[0]);
    const [completionOdometer, setCompletionOdometer] = useState(0);
    const [nextValidityStart, setNextValidityStart] = useState(new Date().toISOString().split('T')[0]);
    const [nextDueKmOverride, setNextDueKmOverride] = useState(0);
    const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
    const [completionNotes, setCompletionNotes] = useState('');
    const [selectedDriverId, setSelectedDriverId] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // History state
    const [history, setHistory] = useState<MaintenanceHistoryLog[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [loadingHistory, setLoadingHistory] = useState(false);

    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const { data: vData, error: vErr } = await supabase.from('fleet_vehicles').select('id, plate, current_odometer, avg_daily_km, driver_id').order('plate');
            
            if (!isMounted.current) return;
            if (vErr) throw vErr;
            setVehicles(vData || []);

            // Also fetch drivers
            const { data: dData } = await supabase
                .from('profiles')
                .select('id, contact_name')
                .or('role.eq.driver,specialty.ilike.%conductor%')
                .order('contact_name');
            setDrivers(dData || []);

            const { data: tData, error: tErr } = await supabase
                .from('maintenance_schedules')
                .select('*, vehicle:fleet_vehicles(plate, current_odometer, avg_daily_km, driver_id)')
                .order('next_due_km', { ascending: true });

            if (!isMounted.current) return;
            if (tErr) throw tErr;
            setTasks(tData || []);
            setLastUpdated(new Date());
        } catch (err: unknown) {
            if (!isMounted.current) return;
            const error = err as { message?: string, code?: string, name?: string };
            if (error.message?.includes('aborted') || error.code === 'ABORTED' || error.name === 'AbortError') {
                return;
            }
            console.error('Error fetching maintenance data:', error.message || error);
        } finally {
            if (isMounted.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        isMounted.current = true;
        fetchData();
        return () => { isMounted.current = false; };
    }, [fetchData]);

    const fetchHistory = useCallback(async () => {
        try {
            setLoadingHistory(true);
            const { data, error } = await supabase
                .from('maintenance_history_logs')
                .select('*, vehicle:fleet_vehicles(plate), driver:profiles(contact_name)')
                .order('performed_date', { ascending: false })
                .limit(50);
            
            if (error) throw error;
            setHistory(data || []);
        } catch (err: unknown) {
            const error = err as { message?: string };
            console.error('Error fetching history:', error.message || err);
        } finally {
            setLoadingHistory(false);
        }
    }, []);

    const handleCloseTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!completingTask) return;

        setIsSaving(true);
        try {
            // 1. Calculate Next Due
            let nextDueKm = 0;
            let nextDueDate = null;

            if (completingTask.task_type === 'km') {
                nextDueKm = (completionOdometer || completingTask.vehicle?.current_odometer || 0) + (nextDueKmOverride || completingTask.interval_km || 5000);
            } else {
                const startDate = new Date(nextValidityStart);
                const nextDate = new Date(startDate);
                nextDate.setFullYear(nextDate.getFullYear() + 1);
                nextDueDate = nextDate.toISOString().split('T')[0];
                nextDueKm = 9999999;
            }

            // 2. Upload Evidences
            const uploadedUrls: string[] = [];
            for (const file of evidenceFiles) {
                const fileExt = file.name.split('.').pop();
                const fileName = `maint_${completingTask.id}_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
                
                const { error: uploadError } = await supabase.storage
                    .from('delivery-evidence') // Using existing bucket for now
                    .upload(fileName, file);

                if (!uploadError) {
                    const { data: { publicUrl } } = supabase.storage
                        .from('delivery-evidence')
                        .getPublicUrl(fileName);
                    uploadedUrls.push(publicUrl);
                } else {
                    console.warn('Upload error:', uploadError);
                }
            }

            // 3. Insert History Log
            const { error: logError } = await supabase
                .from('maintenance_history_logs')
                .insert([{
                    vehicle_id: completingTask.vehicle_id,
                    schedule_id: completingTask.id,
                    task_name: completingTask.task_name,
                    performed_date: completionDate,
                    performed_km: completionOdometer,
                    performed_by_driver_id: selectedDriverId || null,
                    next_due_date: nextDueDate,
                    next_due_km: nextDueKm,
                    attachments: uploadedUrls,
                    notes: completionNotes
                }]);
            
            if (logError) throw logError;

            // 4. Update Schedule
            const { error: schedError } = await supabase
                .from('maintenance_schedules')
                .update({
                    last_performed_km: completionOdometer,
                    last_performed_date: completionDate,
                    next_due_km: nextDueKm,
                    next_due_date: nextDueDate
                })
                .eq('id', completingTask.id);

            if (schedError) throw schedError;

            // 5. Sync Vehicle Odometer (Trusting the entry)
            await supabase.from('fleet_vehicles')
                .update({ 
                    current_odometer: completionOdometer,
                    last_odometer_update: new Date().toISOString()
                })
                .eq('id', completingTask.vehicle_id);

            setShowCloseModal(false);
            setCompletingTask(null);
            setEvidenceFiles([]);
            fetchData();
            if (showHistory) fetchHistory();
        } catch (err) {
            console.error('Error closing task:', err);
            alert('Error al completar la tarea');
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddTask = async (e: React.FormEvent) => {
        e.preventDefault();
        const vehicle = vehicles.find(v => v.id === newTask.vehicle_id);
        if (!vehicle) return;

        let nextDueKm = 0;
        let nextDueDate = null;

        if (newTask.task_type === 'km') {
            nextDueKm = (newTask.last_performed_km || vehicle.current_odometer) + (newTask.interval_km || 0);
        } else {
            const lastDate = new Date(newTask.last_performed_date || new Date());
            const nextDate = new Date(lastDate);
            nextDate.setFullYear(nextDate.getFullYear() + 1); // User specified every year
            nextDueDate = nextDate.toISOString().split('T')[0];
        }

        try {
            const { error } = await supabase
                .from('maintenance_schedules')
                .insert([{
                    vehicle_id: newTask.vehicle_id,
                    task_name: newTask.task_name,
                    task_type: newTask.task_type,
                    interval_km: newTask.interval_km,
                    interval_months: newTask.interval_months || 12,
                    last_performed_km: newTask.last_performed_km,
                    last_performed_date: newTask.last_performed_date,
                    next_due_km: nextDueKm || 9999999, // Hack to not break current order if date-based
                    next_due_date: nextDueDate
                }]);

            if (error) throw error;
            setShowAdd(false);
            fetchData();
        } catch (err: unknown) {
            const error = err as { message?: string };
            console.error('DATABASE ERROR:', error.message || err);
            alert(`Error al programar mantenimiento: ${error.message || 'Error desconocido'}`);
        }
    };

    const getEstimatedDays = (task: MaintenanceTask) => {
        if (!task.vehicle?.avg_daily_km || task.vehicle.avg_daily_km <= 0) return null;
        const kmRemaining = (task.next_due_km || 0) - (task.vehicle.current_odometer || 0);
        if (kmRemaining <= 0) return 0;
        return Math.ceil(kmRemaining / task.vehicle.avg_daily_km);
    };

    const [filterPlate, setFilterPlate] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');

    // ... (fetchData and handleAddTask remain the same) ...

    const getTaskStatus = (task: MaintenanceTask) => {
        if (task.task_type === 'date' && task.next_due_date) {
            const now = new Date();
            const due = new Date(task.next_due_date);
            const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays < 0) return 'urgent';
            if (diffDays < 30) return 'upcoming';
            return 'ok';
        }

        const remaining = (task.next_due_km || 0) - (task.vehicle?.current_odometer || 0);
        if (remaining < 0) return 'urgent';
        if (remaining < 1500) return 'upcoming';
        return 'ok';
    };

    const statusPriority: Record<string, number> = { 'urgent': 1, 'upcoming': 2, 'ok': 3 };
    const sortedTasks = [...tasks].sort((a, b) => {
        const statusA = getTaskStatus(a);
        const statusB = getTaskStatus(b);
        return statusPriority[statusA] - statusPriority[statusB];
    });

    const filteredTasks = sortedTasks.filter(t => {
        if (filterPlate !== 'all' && t.vehicle?.plate !== filterPlate) return false;
        if (filterStatus !== 'all' && getTaskStatus(t) !== filterStatus) return false;
        return true;
    });

    const stats = {
        urgent: tasks.filter(t => getTaskStatus(t) === 'urgent').length,
        upcoming: tasks.filter(t => getTaskStatus(t) === 'upcoming').length,
        ok: tasks.filter(t => getTaskStatus(t) === 'ok').length,
        total: tasks.length
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* --- DASHBOARD DE MANTENIMIENTO --- */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
                <MaintenanceStatCard 
                    label="TAREAS URGENTES" 
                    value={stats.urgent} 
                    color="#EF4444" 
                    icon="🚨" 
                    bg="#FEF2F2"
                    desc="Mantenimientos vencidos"
                />
                <MaintenanceStatCard 
                    label="TAREAS PRÓXIMAS" 
                    value={stats.upcoming} 
                    color="#F97316" 
                    icon="⚠️" 
                    bg="#FFF7ED"
                    desc="Vencimiento < 30 días / 1500km"
                />
                <MaintenanceStatCard 
                    label="FLOTA AL DÍA" 
                    value={stats.ok} 
                    color="#10B981" 
                    icon="✅" 
                    bg="#F0FDF4"
                    desc="Sin tareas pendientes"
                />
                <MaintenanceStatCard 
                    label="TOTAL TAREAS" 
                    value={stats.total} 
                    color="#0891B2" 
                    icon="📋" 
                    bg="#ECFDF5"
                    desc="Programadas en sistema"
                />
            </div>

            <div style={{ backgroundColor: 'white', borderRadius: '24px', padding: '1.5rem', border: '1px solid #E5E7EB' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '900' }}>Cronograma de <span style={{ color: '#0891B2' }}>Mantenimientos</span></h2>
                        {lastUpdated && (
                            <p style={{ margin: 0, fontSize: '0.7rem', color: '#9CA3AF', fontWeight: '600' }}>
                                ÚLTIMA ACTUALIZACIÓN: {lastUpdated.toLocaleTimeString()}
                            </p>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button 
                            onClick={fetchData}
                            disabled={loading}
                            style={{ 
                                padding: '0.6rem 1.2rem', borderRadius: '12px', 
                                backgroundColor: '#F3F4F6', color: '#4B5563', border: '1px solid #E5E7EB', 
                                fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem'
                            }}
                        >
                             {loading ? '🔄 Cargando...' : '🔃 Sincronizar'}
                        </button>
                        <button 
                            onClick={() => {
                                const nextState = !showHistory;
                                setShowHistory(nextState);
                                if (nextState) fetchHistory();
                            }}
                            style={{ 
                                padding: '0.6rem 1.2rem', borderRadius: '12px', 
                                backgroundColor: showHistory ? '#F1F5F9' : '#F3F4F6', 
                                color: showHistory ? '#0891B2' : '#4B5563', 
                                border: `1px solid ${showHistory ? '#0891B2' : '#E5E7EB'}`, 
                                fontWeight: '700', cursor: 'pointer'
                            }}
                        >
                            {showHistory ? '📂 Ver Cronograma' : '📜 Historial'}
                        </button>
                        <button 
                            onClick={() => setShowAdd(!showAdd)}
                            style={{ padding: '0.6rem 1.2rem', borderRadius: '12px', backgroundColor: '#0891B2', color: 'white', border: 'none', fontWeight: '700', cursor: 'pointer' }}
                        >
                            {showAdd ? 'Cancelar' : '+ Programar Tarea'}
                        </button>
                    </div>
                </div>

                {/* --- INTELLIGENT FILTERS (only for Schedule) --- */}
                {!showHistory && (
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', backgroundColor: '#F8FAFC', padding: '1rem', borderRadius: '16px' }}>
                     <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#64748B', display: 'block', marginBottom: '0.3rem' }}>FILTRAR POR VEHÍCULO</label>
                        <select 
                            value={filterPlate} 
                            onChange={(e) => setFilterPlate(e.target.value)}
                            style={{ width: '100%', padding: '0.6rem', borderRadius: '10px', border: '1px solid #CBD5E1', fontWeight: 'bold', color: '#334155' }}
                        >
                            <option value="all">🚛 Todos los Vehículos ({vehicles.length})</option>
                            {vehicles.map(v => <option key={v.id} value={v.plate}>{v.plate} ({v.current_odometer} km)</option>)}
                        </select>
                     </div>
                     <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#64748B', display: 'block', marginBottom: '0.3rem' }}>ESTADO DE URGENCIA</label>
                        <select 
                            value={filterStatus} 
                            onChange={(e) => setFilterStatus(e.target.value)}
                            style={{ width: '100%', padding: '0.6rem', borderRadius: '10px', border: '1px solid #CBD5E1', fontWeight: 'bold', color: '#334155' }}
                        >
                            <option value="all">🔍 Todos los Estados</option>
                            <option value="urgent">🚨 Urgente (Vencidos)</option>
                            <option value="upcoming">⚠️ Próximos (&#60; 1500 km)</option>
                            <option value="ok">✅ Al Día</option>
                        </select>
                     </div>
                    </div>
                )}

                {showAdd && (
                    <form onSubmit={handleAddTask} style={{ backgroundColor: '#F9FAFB', padding: '2rem', borderRadius: '32px', marginBottom: '2rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', boxShadow: '0 4px 15px -5px rgba(0,0,0,0.05)' }}>
                        <div>
                            <label style={{ fontSize: '0.75rem', fontWeight: '900', color: '#475569', display: 'block', marginBottom: '0.6rem' }}>VEHÍCULO</label>
                            <select required value={newTask.vehicle_id} onChange={e => setNewTask({...newTask, vehicle_id: e.target.value})} style={{ width: '100%', padding: '0.9rem', borderRadius: '16px', border: '1px solid #CBD5E1', fontWeight: 'bold' }}>
                                <option value="">-- Seleccionar --</option>
                                {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} ({v.current_odometer} km)</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ fontSize: '0.75rem', fontWeight: '900', color: '#475569', display: 'block', marginBottom: '0.6rem' }}>TIPO DE TAREA</label>
                            <select 
                                required 
                                value={newTask.task_name} 
                                onChange={e => {
                                    const selectedTask = COMMON_TASKS.find(t => t.name === e.target.value);
                                    if (selectedTask) {
                                        setNewTask({
                                            ...newTask, 
                                            task_name: selectedTask.name,
                                            task_type: selectedTask.type as 'km' | 'date',
                                            interval_km: selectedTask.type === 'km' ? selectedTask.interval : 0,
                                            interval_months: selectedTask.type === 'date' ? selectedTask.interval : 12
                                        });
                                    }
                                }} 
                                style={{ width: '100%', padding: '0.9rem', borderRadius: '16px', border: '1px solid #CBD5E1', fontWeight: 'bold' }}
                            >
                                {COMMON_TASKS.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                            </select>
                        </div>
                        
                        {newTask.task_type === 'km' ? (
                            <>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: '900', color: '#475569', display: 'block', marginBottom: '0.6rem' }}>INTERVALO (KM)</label>
                                    <input type="number" value={newTask.interval_km} onChange={e => setNewTask({...newTask, interval_km: parseInt(e.target.value) || 0})} style={{ width: '100%', padding: '0.9rem', borderRadius: '16px', border: '1px solid #CBD5E1', fontWeight: 'bold' }} />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: '900', color: '#475569', display: 'block', marginBottom: '0.6rem' }}>ÚLTIMO REGISTRO (KM)</label>
                                    <input type="number" value={newTask.last_performed_km} onChange={e => setNewTask({...newTask, last_performed_km: parseInt(e.target.value) || 0})} style={{ width: '100%', padding: '0.9rem', borderRadius: '16px', border: '1px solid #CBD5E1', fontWeight: 'bold' }} />
                                </div>
                            </>
                        ) : (
                            <>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: '900', color: '#475569', display: 'block', marginBottom: '0.6rem' }}>ÚLTIMA RENOVACIÓN</label>
                                    <input type="date" value={newTask.last_performed_date} onChange={e => setNewTask({...newTask, last_performed_date: e.target.value})} style={{ width: '100%', padding: '0.9rem', borderRadius: '16px', border: '1px solid #CBD5E1', fontWeight: 'bold' }} />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: '900', color: '#475569', display: 'block', marginBottom: '0.6rem' }}>VIGENCIA (MESES)</label>
                                    <input type="number" readOnly value={12} style={{ width: '100%', padding: '0.9rem', borderRadius: '16px', border: '1px solid #E2E8F0', fontWeight: 'bold', backgroundColor: '#F1F5F9' }} />
                                </div>
                            </>
                        )}
                        
                        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                            <button type="submit" style={{ width: '100%', padding: '1rem', borderRadius: '16px', backgroundColor: '#10B981', color: 'white', border: 'none', fontWeight: '900', cursor: 'pointer', boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.2)' }}>PROGRAMAR</button>
                        </div>
                    </form>
                )}

                {!showHistory ? (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ textAlign: 'left', borderBottom: '2px solid #F3F4F6' }}>
                                <th style={{ padding: '1rem', fontSize: '0.75rem', color: '#6B7280', letterSpacing: '0.05rem' }}>TAREA PROGRAMADA</th>
                                <th style={{ padding: '1rem', fontSize: '0.75rem', color: '#6B7280' }}>ÚLTIMO (KM)</th>
                                <th style={{ padding: '1rem', fontSize: '0.75rem', color: '#6B7280' }}>PRÓXIMO (KM)</th>
                                <th style={{ padding: '1rem', fontSize: '0.75rem', color: '#6B7280' }}>ESTIMADO</th>
                                <th style={{ padding: '1rem', fontSize: '0.75rem', color: '#6B7280' }}>ESTADO</th>
                                <th style={{ padding: '1rem', fontSize: '0.75rem', color: '#6B7280' }}>ACCIÓN</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && filteredTasks.length === 0 ? (
                                [...Array(3)].map((_, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid #F3F4F6', opacity: 0.5 }}>
                                        <td colSpan={6} style={{ padding: '2rem', textAlign: 'center' }}>
                                            <div style={{ height: '20px', backgroundColor: '#F3F4F6', borderRadius: '10px', width: '80%', margin: '0 auto', animation: 'pulse 1.5s infinite' }}></div>
                                        </td>
                                    </tr>
                                ))
                            ) : filteredTasks.length === 0 ? (
                                <tr><td colSpan={6} style={{ padding: '4rem', textAlign: 'center' }}>
                                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔧</div>
                                    <h3 style={{ color: '#6B7280', margin: 0 }}>No se encontraron tareas</h3>
                                    <p style={{ color: '#9CA3AF', fontSize: '0.85rem' }}>Ajusta los filtros o programa una nueva tarea.</p>
                                </td></tr>
                            ) : filteredTasks.map(t => {
                                const remaining = (t.next_due_km || 0) - (t.vehicle?.current_odometer || 0);
                                const days = getEstimatedDays(t);
                                const status = getTaskStatus(t);
                                return (
                                    <tr key={t.id} style={{ 
                                        borderBottom: '1px solid #F3F4F6', 
                                        backgroundColor: status === 'urgent' ? '#FEF2F2' : status === 'upcoming' ? '#FFF7ED' : 'transparent',
                                        transition: 'all 0.2s ease'
                                    }}>
                                        <td style={{ padding: '1.2rem 1rem', position: 'relative' }}>
                                            {/* Barra indicadora lateral */}
                                            {(status === 'urgent' || status === 'upcoming') && (
                                                <div style={{ 
                                                    position: 'absolute', 
                                                    left: 0, 
                                                    top: '10%', 
                                                    bottom: '10%', 
                                                    width: '4px', 
                                                    borderRadius: '0 4px 4px 0',
                                                    backgroundColor: status === 'urgent' ? '#EF4444' : '#F97316'
                                                }} />
                                            )}
                                            <div style={{ fontWeight: '900', color: '#111827', fontSize: '1.1rem', marginBottom: '0.2rem', letterSpacing: '-0.02rem' }}>
                                                {t.task_name}
                                            </div>
                                            <div style={{ fontSize: '0.9rem', color: '#0891B2', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.1rem' }}>
                                                <span style={{ fontSize: '1rem' }}>🚛</span> {t.vehicle?.plate}
                                            </div>
                                        </td>
                                        <td style={{ padding: '1rem', fontWeight: '600' }}>
                                            {t.task_type === 'km' ? `${t.last_performed_km?.toLocaleString()} km` : t.last_performed_date}
                                        </td>
                                        <td style={{ padding: '1rem', fontWeight: '800', color: '#0891B2' }}>
                                            {t.task_type === 'km' ? `${t.next_due_km?.toLocaleString()} km` : t.next_due_date}
                                        </td>
                                        <td style={{ padding: '1rem', fontWeight: '700', color: '#64748B' }}>
                                            {t.task_type === 'km' ? (
                                                remaining > 0 ? (days ? `~ ${days} días` : '---') : 'VENCIDO'
                                            ) : (
                                                (() => {
                                                    const diff = Math.ceil((new Date(t.next_due_date || '').getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                                                    return diff > 0 ? `${diff} días` : 'VENCIDO';
                                                })()
                                            )}
                                        </td>
                                        <td style={{ padding: '1rem' }}>
                                            <span style={{ 
                                                padding: '0.3rem 0.6rem', borderRadius: '8px', fontSize: '0.7rem', fontWeight: '900',
                                                backgroundColor: status === 'urgent' ? '#FEE2E2' : status === 'upcoming' ? '#FFF7ED' : '#F0FDF4',
                                                color: status === 'urgent' ? '#991B1B' : status === 'upcoming' ? '#9A3412' : '#15803D'
                                            }}>
                                                {status === 'urgent' ? 'URGENTE' : status === 'upcoming' ? 'PRÓXIMO' : 'AL DÍA'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '1rem' }}>
                                            <button 
                                                onClick={() => {
                                                    setCompletingTask(t);
                                                    setCompletionOdometer(t.vehicle?.current_odometer || 0);
                                                    setNextDueKmOverride(t.interval_km || 0);
                                                    setSelectedDriverId(t.vehicle?.driver_id || '');
                                                    setCompletionNotes('');
                                                    setShowCloseModal(true);
                                                }}
                                                style={{ 
                                                    padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', 
                                                    backgroundColor: '#0891B2', color: 'white', fontWeight: '800', 
                                                    fontSize: '0.75rem', cursor: 'pointer' 
                                                }}
                                            >
                                                Cerrar
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {loadingHistory ? (
                             <div style={{ textAlign: 'center', padding: '3rem', color: '#64748B' }}>Cargando historial...</div>
                        ) : history.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '4rem', color: '#64748B' }}>No hay registros de mantenimiento previos.</div>
                        ) : (
                            <div style={{ display: 'grid', gap: '1rem' }}>
                                {history.map(log => (
                                    <div key={log.id} style={{ 
                                        backgroundColor: '#F8FAFC', borderRadius: '20px', padding: '1.5rem', border: '1px solid #E2E8F0',
                                        display: 'flex', flexDirection: 'column', gap: '1rem'
                                    }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1.5fr', alignItems: 'center', gap: '1rem' }}>
                                            <div>
                                                <div style={{ fontSize: '0.65rem', fontWeight: '900', color: '#0891B2' }}>{log.vehicle?.plate}</div>
                                                <div style={{ fontSize: '1rem', fontWeight: '900', color: '#111827' }}>{log.task_name}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '600' }}>Realizado el: {log.performed_date}</div>
                                                {log.driver?.contact_name && (
                                                    <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '0.2rem', fontWeight: '700' }}>👨🏻‍✈️ {log.driver.contact_name}</div>
                                                )}
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.6rem', fontWeight: '900', color: '#94A3B8' }}>KM REALIZADO</div>
                                                <div style={{ fontSize: '0.9rem', fontWeight: '800' }}>{log.performed_km.toLocaleString()} KM</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.6rem', fontWeight: '900', color: '#94A3B8' }}>PRÓXIMO OBJ.</div>
                                                <div style={{ fontSize: '0.9rem', fontWeight: '800', color: '#0891B2' }}>
                                                    {log.next_due_km ? `${log.next_due_km.toLocaleString()} KM` : log.next_due_date}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                                                {log.attachments?.map((url, i) => (
                                                    <a key={i} href={url} target="_blank" rel="noreferrer" style={{ 
                                                        width: '40px', height: '40px', borderRadius: '8px', border: '1px solid #CBD5E1', 
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'white',
                                                        fontSize: '1rem', textDecoration: 'none'
                                                    }}>
                                                        {url.match(/\.(jpg|jpeg|png|webp)$/i) ? '🖼️' : '📄'}
                                                    </a>
                                                ))}
                                                {(!log.attachments || log.attachments.length === 0) && (
                                                    <span style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: '600' }}>Sin adjuntos</span>
                                                )}
                                            </div>
                                        </div>
                                        {log.notes && (
                                            <div style={{ 
                                                backgroundColor: 'white', padding: '1rem', borderRadius: '12px', 
                                                borderLeft: '4px solid #0891B2', fontSize: '0.85rem', color: '#475569',
                                                fontStyle: 'italic', fontWeight: '500'
                                            }}>
                                                &quot;{log.notes}&quot;
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* --- MODAL PARA CERRAR TAREA --- */}
            {showCloseModal && completingTask && (
                <div style={{ 
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
                    backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                    display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '1rem'
                }}>
                    <div style={{ 
                        backgroundColor: 'white', borderRadius: '32px', width: '100%', maxWidth: '600px', 
                        maxHeight: '90vh', overflowY: 'auto', padding: '2.5rem', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' 
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '900', color: '#111827' }}>Completar Mantenimiento</h3>
                                <p style={{ margin: '0.2rem 0 0 0', color: '#6B7280', fontWeight: '600' }}>{completingTask.task_name} - {completingTask.vehicle?.plate}</p>
                            </div>
                            <button onClick={() => setShowCloseModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#9CA3AF' }}>✕</button>
                        </div>

                        <form onSubmit={handleCloseTask} style={{ display: 'grid', gap: '1.5rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: '900', color: '#475569', display: 'block', marginBottom: '0.5rem' }}>FECHA DE EJECUCIÓN</label>
                                    <input type="date" required value={completionDate} onChange={e => setCompletionDate(e.target.value)} style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '1px solid #CBD5E1', fontWeight: '700' }} />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: '900', color: '#475569', display: 'block', marginBottom: '0.5rem' }}>KILOMETRAJE ACTUAL</label>
                                    <input type="number" required value={completionOdometer} onChange={e => setCompletionOdometer(parseInt(e.target.value))} style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '1px solid #CBD5E1', fontWeight: '700' }} />
                                </div>
                            </div>

                            {completingTask.task_type === 'date' ? (
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: '900', color: '#475569', display: 'block', marginBottom: '0.5rem' }}>FECHA INICIO VIGENCIA (NUEVO DOC)</label>
                                    <input type="date" required value={nextValidityStart} onChange={e => setNextValidityStart(e.target.value)} style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '1px solid #CBD5E1', fontWeight: '700' }} />
                                    <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.7rem', color: '#0891B2', fontWeight: '700' }}>ℹ️ Próximo vencimiento será exactamente el {new Date(new Date(nextValidityStart).setFullYear(new Date(nextValidityStart).getFullYear() + 1)).toISOString().split('T')[0]}</p>
                                </div>
                            ) : (
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: '900', color: '#475569', display: 'block', marginBottom: '0.5rem' }}>FRECUENCIA PARA PRÓXIMA (KM)</label>
                                    <input type="number" value={nextDueKmOverride} onChange={e => setNextDueKmOverride(parseInt(e.target.value))} style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '1px solid #CBD5E1', fontWeight: '700' }} />
                                    <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.7rem', color: '#0891B2', fontWeight: '700' }}>ℹ️ Próximo mantenimiento a los: {(completionOdometer + nextDueKmOverride).toLocaleString()} km</p>
                                </div>
                            )}

                            <div>
                                <label style={{ fontSize: '0.75rem', fontWeight: '900', color: '#475569', display: 'block', marginBottom: '0.5rem' }}>CONDUCTOR RESPONSABLE</label>
                                <select 
                                    required 
                                    value={selectedDriverId} 
                                    onChange={e => setSelectedDriverId(e.target.value)} 
                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '1px solid #CBD5E1', fontWeight: '700' }}
                                >
                                    <option value="">-- Seleccionar --</option>
                                    {drivers.map(d => (
                                        <option key={d.id} value={d.id}>{d.contact_name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label style={{ fontSize: '0.75rem', fontWeight: '900', color: '#475569', display: 'block', marginBottom: '0.5rem' }}>OBSERVACIONES / NOVEDADES</label>
                                <textarea 
                                    value={completionNotes} 
                                    onChange={e => setCompletionNotes(e.target.value)} 
                                    placeholder="Ej: Se cambiaron también pastillas de freno..." 
                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '1px solid #CBD5E1', fontWeight: '600', minHeight: '80px', fontFamily: 'inherit' }}
                                />
                            </div>

                            <div>
                                <label style={{ fontSize: '0.75rem', fontWeight: '900', color: '#475569', display: 'block', marginBottom: '0.5rem' }}>EVIDENCIA (PDF Y HASTA 7 FOTOS)</label>
                                <div 
                                    onClick={() => document.getElementById('file-upload')?.click()}
                                    style={{ border: '2px dashed #CBD5E1', borderRadius: '16px', padding: '2rem', textAlign: 'center', cursor: 'pointer', backgroundColor: '#F8FAFC' }}
                                >
                                    <span style={{ fontSize: '2rem' }}>📁</span>
                                    <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.8rem', color: '#64748B', fontWeight: '600' }}>Haz clic para subir archivos</p>
                                    <input id="file-upload" type="file" multiple accept="image/*,.pdf" style={{ display: 'none' }} onChange={e => setEvidenceFiles(Array.from(e.target.files || []))} />
                                </div>
                                {evidenceFiles.length > 0 && (
                                    <div style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                        {evidenceFiles.slice(0, 8).map((f, i) => (
                                            <div key={i} style={{ backgroundColor: '#E0F2FE', padding: '4px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: '700', color: '#0369A1' }}>
                                                {f.name.length > 15 ? f.name.substring(0, 12) + '...' : f.name}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <button 
                                type="submit" 
                                disabled={isSaving}
                                style={{ 
                                    marginTop: '1rem', padding: '1.2rem', borderRadius: '16px', border: 'none', 
                                    backgroundColor: '#10B981', color: 'white', fontWeight: '900', fontSize: '1rem', 
                                    cursor: 'pointer', boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.2)' 
                                }}
                            >
                                {isSaving ? 'GUARDANDO...' : 'MARCAR COMO COMPLETADA'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

function MaintenanceStatCard({ label, value, color, icon, bg, desc }: { label: string, value: number, color: string, icon: string, bg: string, desc: string }) {
    return (
        <div style={{ 
            padding: '1.5rem', 
            borderRadius: '24px', 
            backgroundColor: 'white', 
            border: `1px solid #E5E7EB`,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ 
                    width: '40px', 
                    height: '40px', 
                    borderRadius: '12px', 
                    backgroundColor: bg, 
                    display: 'flex', 
                    justifyContent: 'center', 
                    alignItems: 'center',
                    fontSize: '1.2rem'
                }}>
                    {icon}
                </div>
                <div style={{ fontSize: '2rem', fontWeight: '900', color: '#111827', lineHeight: '1' }}>{value}</div>
            </div>
            <div>
                <div style={{ fontSize: '0.7rem', fontWeight: '900', color: '#64748B', letterSpacing: '0.05rem', marginTop: '0.5rem' }}>{label}</div>
                <div style={{ fontSize: '0.75rem', color: color, fontWeight: '700', marginTop: '0.2rem' }}>{desc}</div>
            </div>
        </div>
    );
}
