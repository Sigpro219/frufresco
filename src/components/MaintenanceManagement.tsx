'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { isAbortError, diagnoseStorageError } from '@/lib/errorUtils';
import { useParams, useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';

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
            if (isAbortError(error)) {
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

    const downloadHistory = () => {
        if (history.length === 0) {
            alert('No hay historial para exportar.');
            return;
        }

        const dataToExport = history.map(log => ({
            'Vehículo': log.vehicle?.plate,
            'Tarea': log.task_name,
            'Fecha Realización': log.performed_date,
            'Kms Realizados': log.performed_km,
            'Conductor': log.driver?.contact_name || 'N/A',
            'Próximo Obj (Km)': log.next_due_km || 'Vencido',
            'Próximo Obj (Fecha)': log.next_due_date || 'N/A',
            'Notas': log.notes || ''
        }));

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Historial_Mantenimiento');
        XLSX.writeFile(wb, `FruFresco_Mantenimiento_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

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

                if (uploadError) {
                    diagnoseStorageError(uploadError, 'delivery-evidence');
                    throw uploadError;
                }
                const { data: { publicUrl } } = supabase.storage
                    .from('delivery-evidence')
                    .getPublicUrl(fileName);
                uploadedUrls.push(publicUrl);
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

    const sortedTasks = [...tasks].sort((a, b) => {
        const statusPriority: Record<string, number> = { 'urgent': 1, 'upcoming': 2, 'ok': 3 };
        return statusPriority[getTaskStatus(a)] - statusPriority[getTaskStatus(b)];
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            
            {/* CABECERA ULTRA-COMPACTA 50/50: KPIs | FILTROS Y ACCIONES */}
            <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '1fr 1.2fr', 
                gap: '1.5rem', 
                alignItems: 'center',
                backgroundColor: 'white',
                padding: '0.8rem 1.5rem',
                borderRadius: '24px',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                border: '1px solid #E2E8F0'
            }}>
                {/* Lado Izquierdo: 4 KPIs de Mantenimiento (50%) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem', borderRight: '1px solid #F1F5F9', paddingRight: '1rem' }}>
                    <CompactStat 
                        label="Urgentes" value={stats.urgent} color="#EF4444" icon="🚨" 
                        active={filterStatus === 'urgent'} onClick={() => setFilterStatus(filterStatus === 'urgent' ? 'all' : 'urgent')} 
                    />
                    <CompactStat 
                        label="Próximas" value={stats.upcoming} color="#F97316" icon="⚠️" 
                        active={filterStatus === 'upcoming'} onClick={() => setFilterStatus(filterStatus === 'upcoming' ? 'all' : 'upcoming')} 
                    />
                    <CompactStat 
                        label="Al Día" value={stats.ok} color="#10B981" icon="✅" 
                        active={filterStatus === 'ok'} onClick={() => setFilterStatus(filterStatus === 'ok' ? 'all' : 'ok')} 
                    />
                    <CompactStat 
                        label="Total" value={stats.total} color="#0891B2" icon="📋" 
                        active={filterStatus === 'all'} onClick={() => setFilterStatus('all')} 
                    />
                </div>

                {/* Lado Derecho: Controles de Búsqueda y Botones (50%) */}
                <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <select 
                            value={filterPlate} 
                            onChange={(e) => setFilterPlate(e.target.value)}
                            style={{ 
                                width: '100%', padding: '0.6rem 0.8rem 0.6rem 2.2rem', borderRadius: '15px', 
                                border: '1px solid #CBD5E1', fontSize: '0.85rem', outline: 'none', 
                                backgroundColor: '#F8FAFC', fontWeight: '800', color: '#1E293B',
                                appearance: 'none', cursor: 'pointer'
                            }}
                        >
                            <option value="all">🚛 TODOS LOS VEHÍCULOS</option>
                            {vehicles.map(v => <option key={v.id} value={v.plate}>{v.plate}</option>)}
                        </select>
                        <span style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', fontSize: '1rem' }}>🔍</span>
                    </div>

                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button 
                            onClick={() => {
                                const nextState = !showHistory;
                                setShowHistory(nextState);
                                if (nextState) fetchHistory();
                            }}
                            title={showHistory ? 'Ver Cronograma' : 'Ver Historial'}
                            style={{ 
                                padding: '0.6rem', borderRadius: '12px', border: '1px solid #E2E8F0',
                                backgroundColor: showHistory ? '#0F172A' : 'white',
                                color: showHistory ? 'white' : '#64748B',
                                fontWeight: '800', cursor: 'pointer', transition: 'all 0.2s'
                            }}
                        >
                            {showHistory ? '📅' : '📜'}
                        </button>
                        <button 
                            onClick={() => setShowAdd(!showAdd)}
                            title="Programar Mantenimiento"
                            style={{ 
                                padding: '0.6rem 1rem', borderRadius: '12px', border: 'none',
                                backgroundColor: showAdd ? '#EF4444' : '#0891B2',
                                color: 'white', fontWeight: '900', fontSize: '0.75rem', cursor: 'pointer',
                                boxShadow: '0 4px 6px -1px rgba(8, 145, 178, 0.2)'
                            }}
                        >
                            {showAdd ? 'CANCELAR' : '+ TAREA'}
                        </button>
                    </div>
                </div>
            </div>

            {/* MAIN CONTENT AREA */}
            <div style={{ backgroundColor: 'white', borderRadius: '24px', border: '1px solid #E5E7EB', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.03)' }}>
                {showAdd && (
                    <form onSubmit={handleAddTask} style={{ backgroundColor: '#F9FAFB', padding: '1.5rem', borderBottom: '1px solid #E5E7EB', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                        <div>
                            <label style={{ fontSize: '0.65rem', fontWeight: '900', color: '#475569', display: 'block', marginBottom: '0.4rem' }}>VEHÍCULO</label>
                            <select required value={newTask.vehicle_id} onChange={e => setNewTask({...newTask, vehicle_id: e.target.value})} style={{ width: '100%', padding: '0.7rem', borderRadius: '12px', border: '1px solid #CBD5E1', fontWeight: '800', fontSize: '0.85rem' }}>
                                <option value="">-- Seleccionar --</option>
                                {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} ({v.current_odometer} km)</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ fontSize: '0.65rem', fontWeight: '900', color: '#475569', display: 'block', marginBottom: '0.4rem' }}>TAREA</label>
                            <select required value={newTask.task_name} onChange={e => {
                                const selectedTask = COMMON_TASKS.find(t => t.name === e.target.value);
                                if (selectedTask) setNewTask({...newTask, task_name: selectedTask.name, task_type: selectedTask.type as 'km' | 'date', interval_km: selectedTask.type === 'km' ? selectedTask.interval : 0, interval_months: selectedTask.type === 'date' ? selectedTask.interval : 12});
                            }} style={{ width: '100%', padding: '0.7rem', borderRadius: '12px', border: '1px solid #CBD5E1', fontWeight: '800', fontSize: '0.85rem' }}>
                                {COMMON_TASKS.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                            </select>
                        </div>
                        {newTask.task_type === 'km' ? (
                            <>
                                <div>
                                    <label style={{ fontSize: '0.65rem', fontWeight: '900', color: '#475569', display: 'block', marginBottom: '0.4rem' }}>INTERVALO (KM)</label>
                                    <input type="number" value={newTask.interval_km} onChange={e => setNewTask({...newTask, interval_km: parseInt(e.target.value) || 0})} style={{ width: '100%', padding: '0.7rem', borderRadius: '12px', border: '1px solid #CBD5E1', fontWeight: '800' }} />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.65rem', fontWeight: '900', color: '#475569', display: 'block', marginBottom: '0.4rem' }}>ÚLTIMO (KM)</label>
                                    <input type="number" value={newTask.last_performed_km} onChange={e => setNewTask({...newTask, last_performed_km: parseInt(e.target.value) || 0})} style={{ width: '100%', padding: '0.7rem', borderRadius: '12px', border: '1px solid #CBD5E1', fontWeight: '800' }} />
                                </div>
                            </>
                        ) : (
                            <>
                                <div>
                                    <label style={{ fontSize: '0.65rem', fontWeight: '900', color: '#475569', display: 'block', marginBottom: '0.4rem' }}>ÚLTIMA RENOVACIÓN</label>
                                    <input type="date" value={newTask.last_performed_date} onChange={e => setNewTask({...newTask, last_performed_date: e.target.value})} style={{ width: '100%', padding: '0.7rem', borderRadius: '12px', border: '1px solid #CBD5E1', fontWeight: '800' }} />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.65rem', fontWeight: '900', color: '#475569', display: 'block', marginBottom: '0.4rem' }}>VIGENCIA</label>
                                    <input type="text" readOnly value="12 Meses" style={{ width: '100%', padding: '0.7rem', borderRadius: '12px', border: '1px solid #E2E8F0', fontWeight: '800', backgroundColor: '#F1F5F9', color: '#64748B' }} />
                                </div>
                            </>
                        )}
                        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                            <button type="submit" style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', backgroundColor: '#10B981', color: 'white', border: 'none', fontWeight: '900', cursor: 'pointer' }}>CREAR</button>
                        </div>
                    </form>
                )}

                {!showHistory ? (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#F9FAFB', borderBottom: '2px solid #F3F4F6', textAlign: 'left' }}>
                                <th style={{ padding: '1.2rem', color: '#64748B', fontWeight: '900', fontSize: '0.7rem' }}>TAREA / VEHÍCULO</th>
                                <th style={{ padding: '1.2rem', color: '#64748B', fontWeight: '900', fontSize: '0.7rem' }}>ÚLTIMO</th>
                                <th style={{ padding: '1.2rem', color: '#64748B', fontWeight: '900', fontSize: '0.7rem' }}>PRÓXIMO OBJETIVO</th>
                                <th style={{ padding: '1.2rem', color: '#64748B', fontWeight: '900', fontSize: '0.7rem' }}>ESTIMADO</th>
                                <th style={{ padding: '1.2rem', color: '#64748B', fontWeight: '900', fontSize: '0.7rem' }}>ESTADO</th>
                                <th style={{ padding: '1.2rem', color: '#64748B', fontWeight: '900', fontSize: '0.7rem', textAlign: 'center' }}>GESTIÓN</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTasks.length === 0 ? (
                                <tr><td colSpan={6} style={{ padding: '4rem', textAlign: 'center', color: '#94A3B8' }}>No hay tareas para mostrar.</td></tr>
                            ) : filteredTasks.map(t => {
                                const status = getTaskStatus(t);
                                const remaining = (t.next_due_km || 0) - (t.vehicle?.current_odometer || 0);
                                const days = getEstimatedDays(t);
                                return (
                                    <tr key={t.id} style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: status === 'urgent' ? '#FEF2F2' : status === 'upcoming' ? '#FFF7ED' : 'transparent' }}>
                                        <td style={{ padding: '1.2rem' }}>
                                            <div style={{ fontWeight: '800', color: '#1F2937', fontSize: '1rem' }}>{t.task_name}</div>
                                            <div style={{ fontSize: '0.75rem', fontWeight: '900', color: '#0891B2', marginTop: '0.2rem' }}>🚛 {t.vehicle?.plate}</div>
                                        </td>
                                        <td style={{ padding: '1.2rem', fontWeight: '600', color: '#475569' }}>
                                            {t.task_type === 'km' ? `${t.last_performed_km?.toLocaleString()} km` : t.last_performed_date}
                                        </td>
                                        <td style={{ padding: '1.2rem', fontWeight: '900', color: '#0891B2' }}>
                                            {t.task_type === 'km' ? `${t.next_due_km?.toLocaleString()} km` : t.next_due_date}
                                        </td>
                                        <td style={{ padding: '1.2rem', fontWeight: '800', color: '#64748B' }}>
                                            {t.task_type === 'km' ? (remaining > 0 ? (days ? `${days} d` : '---') : 'VENCIDO') : 'ANUAL'}
                                        </td>
                                        <td style={{ padding: '1.2rem' }}>
                                            <span style={{ 
                                                padding: '0.3rem 0.6rem', borderRadius: '8px', fontSize: '0.65rem', fontWeight: '900',
                                                backgroundColor: status === 'urgent' ? '#EF4444' : status === 'upcoming' ? '#F97316' : '#10B981',
                                                color: 'white'
                                            }}>
                                                {status.toUpperCase()}
                                            </span>
                                        </td>
                                        <td style={{ padding: '1.2rem', textAlign: 'center' }}>
                                            <button 
                                                onClick={() => { setCompletingTask(t); setCompletionOdometer(t.vehicle?.current_odometer || 0); setNextDueKmOverride(t.interval_km || 0); setSelectedDriverId(t.vehicle?.driver_id || ''); setCompletionNotes(''); setShowCloseModal(true); }}
                                                style={{ padding: '0.4rem 0.8rem', borderRadius: '8px', border: 'none', backgroundColor: '#0F172A', color: 'white', fontWeight: '800', fontSize: '0.7rem', cursor: 'pointer' }}
                                            >
                                                CERRAR
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                ) : (
                    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                        {history.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '3rem', color: '#94A3B8' }}>Sin historial.</div>
                        ) : (
                            history.map(log => (
                                <div key={log.id} style={{ backgroundColor: '#F8FAFC', padding: '1.2rem', borderRadius: '20px', border: '1px solid #E2E8F0', display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 0.5fr', alignItems: 'center', gap: '1rem' }}>
                                    <div>
                                        <div style={{ fontSize: '0.6rem', fontWeight: '900', color: '#0891B2' }}>{log.vehicle?.plate}</div>
                                        <div style={{ fontWeight: '800', color: '#111827' }}>{log.task_name}</div>
                                        <div style={{ fontSize: '0.7rem', color: '#64748B' }}>{log.performed_date} • {log.driver?.contact_name || 'N/A'}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.55rem', fontWeight: '900', color: '#94A3B8' }}>REALIZADO</div>
                                        <div style={{ fontWeight: '800' }}>{log.performed_km?.toLocaleString()} KM</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.55rem', fontWeight: '900', color: '#94A3B8' }}>PRÓXIMO</div>
                                        <div style={{ fontWeight: '800', color: '#0891B2' }}>{log.next_due_km?.toLocaleString() || log.next_due_date}</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        {log.attachments?.length > 0 ? (
                                            <a href={log.attachments[0]} target="_blank" rel="noreferrer" style={{ fontSize: '1.2rem', textDecoration: 'none' }}>🖼️</a>
                                        ) : '---'}
                                    </div>
                                </div>
                            ))
                        )}
                        <button onClick={downloadHistory} style={{ alignSelf: 'center', marginTop: '1rem', padding: '0.6rem 1.5rem', borderRadius: '12px', border: '1px solid #10B981', color: '#15803D', fontWeight: '800', fontSize: '0.75rem', backgroundColor: '#F0FDF4', cursor: 'pointer' }}>
                            DESCARGAR EXCEL (.XLSX)
                        </button>
                    </div>
                )}
            </div>

            {/* MODAL CERRAR (Sin cambios estructurales) */}
            {showCloseModal && completingTask && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div style={{ backgroundColor: 'white', width: '100%', maxWidth: '550px', borderRadius: '32px', overflow: 'hidden', padding: '2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '900' }}>Cerrar Tarea</h3>
                            <button onClick={() => setShowCloseModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', fontWeight: '900', cursor: 'pointer' }}>✕</button>
                        </div>
                        <form onSubmit={handleCloseTask} style={{ display: 'grid', gap: '1rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ fontSize: '0.65rem', fontWeight: '900', marginBottom: '0.3rem', display: 'block' }}>FECHA</label>
                                    <input type="date" required value={completionDate} onChange={e => setCompletionDate(e.target.value)} style={{ width: '100%', padding: '0.7rem', borderRadius: '12px', border: '1px solid #CBD5E1', fontWeight: '800' }} />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.65rem', fontWeight: '900', marginBottom: '0.3rem', display: 'block' }}>KM ACTUAL</label>
                                    <input type="number" required value={completionOdometer} onChange={e => setCompletionOdometer(parseInt(e.target.value))} style={{ width: '100%', padding: '0.7rem', borderRadius: '12px', border: '1px solid #CBD5E1', fontWeight: '800' }} />
                                </div>
                            </div>
                            <div>
                                <label style={{ fontSize: '0.65rem', fontWeight: '900', marginBottom: '0.3rem', display: 'block' }}>FRECUENCIA PRÓXIMA (KM)</label>
                                <input type="number" value={nextDueKmOverride} onChange={e => setNextDueKmOverride(parseInt(e.target.value))} style={{ width: '100%', padding: '0.7rem', borderRadius: '12px', border: '1px solid #CBD5E1', fontWeight: '800' }} />
                            </div>
                            <textarea placeholder="Notas del mantenimiento..." value={completionNotes} onChange={e => setCompletionNotes(e.target.value)} style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '1px solid #CBD5E1', minHeight: '80px', fontWeight: '600' }} />
                            <input type="file" multiple onChange={e => setEvidenceFiles(Array.from(e.target.files || []))} style={{ fontSize: '0.7rem' }} />
                            <button type="submit" disabled={isSaving} style={{ padding: '1rem', borderRadius: '12px', background: '#10B981', color: 'white', border: 'none', fontWeight: '900', cursor: 'pointer', marginTop: '1rem' }}>
                                {isSaving ? 'GUARDANDO...' : 'FECHAR Y COMPLETAR'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

function CompactStat({ label, value, color, icon, active, onClick }: { label: string, value: number, color: string, icon: string, active: boolean, onClick: () => void }) {
    return (
        <div 
            onClick={onClick}
            style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.4rem', 
                cursor: 'pointer',
                padding: '0.4rem',
                borderRadius: '12px',
                backgroundColor: active ? `${color}10` : 'transparent',
                border: active ? `1px solid ${color}30` : '1px solid transparent',
                transition: 'all 0.2s'
            }}
        >
            <div style={{ fontSize: '1.2rem', filter: active ? 'none' : 'grayscale(0.5)', opacity: active ? 1 : 0.7 }}>{icon}</div>
            <div>
                <div style={{ fontSize: '0.55rem', color: '#64748B', fontWeight: '800', textTransform: 'uppercase', lineHeight: '1' }}>{label}</div>
                <div style={{ fontSize: '0.9rem', fontWeight: '900', color: active ? color : '#111827' }}>{value}</div>
            </div>
        </div>
    );
}
