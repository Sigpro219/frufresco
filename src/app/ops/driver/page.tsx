'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { isAbortError } from '@/lib/errorUtils';
import Link from 'next/link';
import ActivityLog from '@/components/ActivityLog';

interface Route {
    id: string;
    vehicle_plate: string;
    status: 'planning' | 'loading' | 'in_transit' | 'completed';
    start_time: string;
    total_orders: number;
    total_kilos: number;
}

interface MaintenanceAlert {
    status: 'urgent' | 'upcoming' | 'ok';
    task_name: string;
    estimated: string;
}

const MOCK_ROUTES: Route[] = [
    { id: 'mock-1', vehicle_plate: 'FTX-902', status: 'planning', start_time: new Date().toISOString(), total_orders: 12, total_kilos: 450 },
    { id: 'mock-2', vehicle_plate: 'GHK-112', status: 'loading', start_time: new Date().toISOString(), total_orders: 8, total_kilos: 320 },
    { id: 'mock-3', vehicle_plate: 'ABC-789', status: 'in_transit', start_time: new Date().toISOString(), total_orders: 15, total_kilos: 600 },
    { id: 'mock-4', vehicle_plate: 'XYZ-123', status: 'planning', start_time: new Date().toISOString(), total_orders: 5, total_kilos: 150 },
    { id: 'mock-5', vehicle_plate: 'MNO-456', status: 'loading', start_time: new Date().toISOString(), total_orders: 10, total_kilos: 400 },
];

export default function DriverDashboard() {
    const [routes, setRoutes] = useState<Route[]>([]);
    const [plates, setPlates] = useState<string[]>([]);
    const [selectedPlate, setSelectedPlate] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [maintenanceAlert, setMaintenanceAlert] = useState<MaintenanceAlert | null>(null);
    const [odometer, setOdometer] = useState<number>(0);
    const [inputOdometer, setInputOdometer] = useState<string>('');
    const [odometerConfirmed, setOdometerConfirmed] = useState(false);
    const [isUpdatingOdo, setIsUpdatingOdo] = useState(false);
    const [demoMode, setDemoMode] = useState(false);
    const isMounted = useRef(true);

    const fetchVehicleContext = useCallback(async (plate: string) => {
        try {
            setLoading(true);
            
            // 1. Fetch Vehicle Stats & Maintenance
            const { data: vehicle, error: vErr } = await supabase
                .from('fleet_vehicles')
                .select(`
                    current_odometer,
                    maintenance_schedules (
                        task_name,
                        task_type,
                        next_due_km,
                        next_due_date
                    )
                `)
                .eq('plate', plate)
                .single();
            
            // If vErr is PGRST116 (no rows), it's a mock or new plate
            if (vErr && vErr.code !== 'PGRST116') throw vErr;

            if (vehicle) {
                const currentOdo = vehicle.current_odometer || 0;
                setOdometer(currentOdo);
                setInputOdometer(''); // Blind entry: don't pre-fill
                const tasks = vehicle.maintenance_schedules || [];
                let mStatus: 'urgent' | 'upcoming' | 'ok' = 'ok';
                let mainTask = '';
                let estimated = '';

                for (const t of tasks) {
                    let taskStatus: 'urgent' | 'upcoming' | 'ok' = 'ok';
                    let est = '';

                    if (t.task_type === 'date' && t.next_due_date) {
                        const now = new Date();
                        const due = new Date(t.next_due_date);
                        const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                        if (diffDays < 0) {
                            taskStatus = 'urgent';
                            est = `Vencido hace ${Math.abs(diffDays)} días`;
                        } else if (diffDays < 30) {
                            taskStatus = 'upcoming';
                            est = `Faltan ${diffDays} días`;
                        }
                    } else if (t.task_type === 'km' && t.next_due_km) {
                        const remaining = t.next_due_km - currentOdo;
                        if (remaining < 0) {
                            taskStatus = 'urgent';
                            est = `Vencido hace ${Math.abs(remaining).toLocaleString()} KM`;
                        } else if (remaining < 1500) {
                            taskStatus = 'upcoming';
                            est = `Faltan ${remaining.toLocaleString()} KM`;
                        }
                    }

                    if (taskStatus === 'urgent') {
                        mStatus = 'urgent';
                        mainTask = t.task_name;
                        estimated = est;
                        break; 
                    } else if (taskStatus === 'upcoming') {
                        mStatus = 'upcoming';
                        mainTask = t.task_name;
                        estimated = est;
                    }
                }
                setMaintenanceAlert({ status: mStatus, task_name: mainTask, estimated });
            } else {
                // Fallback stats for mock plates or new plates not yet in DB
                const mockOdo = 45000 + Math.floor(Math.random() * 5000);
                setOdometer(mockOdo);
                setInputOdometer(''); // Blind entry
                setMaintenanceAlert({ 
                    status: 'upcoming', 
                    task_name: 'Cambio de Aceite (Simulado)', 
                    estimated: 'Faltan 500 KM' 
                });
            }

            // 2. Fetch Routes for this plate
            const { data: routeData, error: routeError } = await supabase
                .from('routes')
                .select('*')
                .eq('vehicle_plate', plate)
                .neq('status', 'completed') 
                .order('created_at', { ascending: false });
            
            if (routeError) throw routeError;
            
            let finalRoutes = routeData || [];
            if (demoMode) {
                if (finalRoutes.length === 0) {
                     finalRoutes = [
                        { id: `mock-${plate}`, vehicle_plate: plate, status: 'planning', start_time: new Date().toISOString(), total_orders: 10, total_kilos: 350 }
                     ];
                }
            }

            if (isMounted.current) setRoutes(finalRoutes);

        } catch (err: unknown) {
            if (isAbortError(err)) return;
            console.error('Error fetching vehicle context:', err);
        } finally {
            if (isMounted.current) setLoading(false);
        }
    }, [demoMode]);

    const fetchInitialData = useCallback(async () => {
        try {
            setLoading(true);
            const { data: vData, error: vErr } = await supabase
                .from('fleet_vehicles')
                .select('plate')
                .order('plate', { ascending: true });
            
            if (vErr) throw vErr;
            
            let platesList = vData?.map(v => v.plate) || [];
            
            // Fallback for empty database or for testing
            if (platesList.length === 0) {
                platesList = ['FTX-902', 'GHK-112', 'ABC-789', 'XYZ-123', 'MNO-456'];
            }

            if (isMounted.current) {
                setPlates(platesList);
            }
        } catch (err) {
            console.error('Error fetching plates:', err);
            // Even on error, show fallback plates for testing
            if (isMounted.current) {
                setPlates(['FTX-902', 'GHK-112', 'ABC-789', 'XYZ-123', 'MNO-456']);
            }
        } finally {
            if (isMounted.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        isMounted.current = true;
        fetchInitialData();
        return () => { isMounted.current = false; };
    }, [fetchInitialData]);

    useEffect(() => {
        if (selectedPlate) {
            setOdometerConfirmed(false);
            fetchVehicleContext(selectedPlate);
        } else if (demoMode) {
            setRoutes(MOCK_ROUTES);
            setMaintenanceAlert(null);
        } else {
            setRoutes([]);
            setMaintenanceAlert(null);
            setOdometerConfirmed(false);
        }
    }, [selectedPlate, demoMode, fetchVehicleContext]);

    const handleConfirmOdometer = async () => {
        const val = parseInt(inputOdometer);
        if (isNaN(val) || val <= 0) {
            alert('Por favor ingresa un kilometraje válido.');
            return;
        }

        if (val < odometer) {
            alert('❌ ERROR DE VALIDACIÓN: El kilometraje ingresado es inferior al último registro del sistema. Por favor, verifica el tablero del vehículo e ingresa el valor correcto.');
            return;
        }

        try {
            setIsUpdatingOdo(true);
            
            // Sync with DB
            if (!demoMode) {
                const { error } = await supabase
                    .from('fleet_vehicles')
                    .update({ current_odometer: val })
                    .eq('plate', selectedPlate);
                
                if (error) throw error;
            }

            setOdometer(val);
            setOdometerConfirmed(true);
            
            // Refresh maintenance context with new KM
            if (selectedPlate) {
                fetchVehicleContext(selectedPlate);
            }
        } catch (err) {
            console.error('Error updating odometer:', err);
            alert('Error al actualizar el kilometraje.');
        } finally {
            setIsUpdatingOdo(false);
        }
    };

    return (
        <div style={{ padding: '1.5rem', paddingBottom: '6rem', maxWidth: '600px', margin: '0 auto', minHeight: '100vh', backgroundColor: '#0F172A' }}>
            <header style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1 style={{ fontSize: '1.8rem', fontWeight: '900', margin: 0, color: 'white' }}>
                        Despacho <span style={{ color: '#10B981' }}>/ Salida</span>
                    </h1>
                    <p style={{ color: '#9CA3AF', fontSize: '0.9rem', marginTop: '0.5rem' }}>Gestiona tu vehículo y tus rutas de hoy.</p>
                </div>
                <button 
                    onClick={() => setDemoMode(!demoMode)}
                    style={{ 
                        padding: '0.5rem 1rem', 
                        borderRadius: '10px', 
                        fontSize: '0.7rem', 
                        fontWeight: '900',
                        backgroundColor: demoMode ? '#10B981' : '#1F2937',
                        color: 'white',
                        border: 'none',
                        cursor: 'pointer'
                    }}
                >
                    {demoMode ? 'SIMULACIÓN: ON' : 'SIMULAR OPERACIÓN'}
                </button>
            </header>

            {/* Vehicle Selection Dropdown */}
            <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '900', color: '#10B981', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                    Selecciona tu Vehículo
                </label>
                <select 
                    value={selectedPlate}
                    onChange={(e) => setSelectedPlate(e.target.value)}
                    style={{ 
                        width: '100%', 
                        padding: '1rem', 
                        borderRadius: '16px', 
                        backgroundColor: '#1E2937', 
                        border: '1px solid #374151', 
                        color: 'white',
                        fontSize: '1rem',
                        fontWeight: '700',
                        appearance: 'none',
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239CA3AF'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 1rem center',
                        backgroundSize: '1.5rem'
                    }}
                >
                    <option value="">-- {demoMode ? 'TODOS LOS VEHÍCULOS' : 'Elige una placa'} --</option>
                    {plates.map(p => (
                        <option key={p} value={p}>{p}</option>
                    ))}
                </select>
            </div>

            {selectedPlate && !odometerConfirmed && (
                <div style={{ 
                    backgroundColor: '#1E2937', 
                    borderRadius: '24px', 
                    padding: '1.5rem', 
                    marginBottom: '2rem',
                    border: '1px solid #3B82F6',
                    animation: 'fadeIn 0.5s ease-out'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
                        <span style={{ fontSize: '1.5rem' }}>📏</span>
                        <h3 style={{ margin: 0, color: 'white', fontSize: '1.1rem' }}>Actualiza el Kilometraje</h3>
                    </div>
                    <p style={{ color: '#9CA3AF', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                        Ingresa el kilometraje actual de la placa <strong>{selectedPlate}</strong> para iniciar tu operación.
                    </p>
                    
                    <div style={{ position: 'relative', marginBottom: '1rem' }}>
                        <input 
                            type="number" 
                            value={inputOdometer}
                            onChange={(e) => setInputOdometer(e.target.value)}
                            placeholder="Ej: 45000"
                            style={{ 
                                width: '100%', 
                                padding: '1.2rem', 
                                borderRadius: '16px', 
                                backgroundColor: '#111827', 
                                border: '1px solid #374151', 
                                color: 'white',
                                fontSize: '1.5rem',
                                fontWeight: '900',
                                textAlign: 'center'
                            }}
                        />
                        <span style={{ position: 'absolute', right: '1.5rem', top: '50%', transform: 'translateY(-50%)', color: '#10B981', fontWeight: '900' }}>KM</span>
                    </div>

                    <button 
                        onClick={handleConfirmOdometer}
                        disabled={isUpdatingOdo}
                        style={{ 
                            width: '100%', 
                            padding: '1.1rem', 
                            borderRadius: '16px', 
                            border: 'none', 
                            backgroundColor: '#3B82F6', 
                            color: 'white', 
                            fontWeight: '900', 
                            fontSize: '1rem',
                            cursor: 'pointer'
                        }}>
                        {isUpdatingOdo ? 'ACTUALIZANDO...' : 'CONFIRMAR E INICIAR'}
                    </button>
                </div>
            )}

            {selectedPlate && odometerConfirmed && maintenanceAlert && maintenanceAlert.status !== 'ok' && (
                <div style={{ 
                    marginBottom: '1.5rem', 
                    padding: '1.2rem', 
                    borderRadius: '24px',
                    backgroundColor: maintenanceAlert.status === 'urgent' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                    border: `1px solid ${maintenanceAlert.status === 'urgent' ? '#EF4444' : '#F59E0B'}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    animation: 'pulse 2s infinite'
                }}>
                    <span style={{ fontSize: '2rem' }}>{maintenanceAlert.status === 'urgent' ? '🚨' : '⚠️'}</span>
                    <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: '900', color: maintenanceAlert.status === 'urgent' ? '#F87171' : '#FBBF24', textTransform: 'uppercase' }}>
                                {maintenanceAlert.status === 'urgent' ? 'Acción Requerida' : 'Próximo Mantenimiento'}
                            </div>
                            <div style={{ 
                                fontSize: '0.75rem', 
                                fontWeight: '900', 
                                backgroundColor: maintenanceAlert.status === 'urgent' ? '#EF4444' : '#F59E0B',
                                color: 'white',
                                padding: '2px 8px',
                                borderRadius: '6px'
                            }}>
                                {maintenanceAlert.estimated}
                            </div>
                        </div>
                        <div style={{ fontSize: '1rem', fontWeight: '800', color: 'white', marginTop: '2px' }}>{maintenanceAlert.task_name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#9CA3AF', marginTop: '0.2rem' }}>Informa al administrador al terminar tu turno.</div>
                    </div>
                </div>
            )}

            {(selectedPlate && odometerConfirmed) || (demoMode && !selectedPlate) ? (
                <>
                    {selectedPlate && (
                        <ActivityLog 
                            plate={selectedPlate} 
                            onOdometerUpdate={(val: number) => setOdometer(val)} 
                        />
                    )}

                    <h2 style={{ fontSize: '1.2rem', fontWeight: '900', marginBottom: '1rem', color: 'white' }}>
                        {selectedPlate ? `Rutas para ${selectedPlate}` : 'Rutas Activas de la Flota'}
                    </h2>

                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '2rem', color: '#9CA3AF' }}>Actualizando...</div>
                    ) : routes.length === 0 ? (
                        <div style={{ 
                            backgroundColor: '#1E2937', 
                            borderRadius: '24px', 
                            padding: '3rem 2rem', 
                            textAlign: 'center',
                            border: '1px dashed #374151'
                        }}>
                            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📍</div>
                            <h3 style={{ margin: 0, color: 'white' }}>Sin rutas asignadas</h3>
                            <p style={{ color: '#9CA3AF', fontSize: '0.85rem' }}>No tienes viajes pendientes para la placa {selectedPlate}.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {routes.map(route => (
                                <Link 
                                    key={route.id} 
                                    href={route.status === 'planning' || route.status === 'loading' 
                                        ? `/ops/driver/route/${route.id}` 
                                        : `/ops/driver/route-map/${route.id}`} 
                                    style={{ textDecoration: 'none' }}
                                >
                                    <div style={{ 
                                        backgroundColor: '#1F2937', 
                                        borderRadius: '20px', 
                                        padding: '1.5rem',
                                        border: '1px solid #374151',
                                        position: 'relative'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                            <div>
                                                <div style={{ fontSize: '1.1rem', fontWeight: '800', color: 'white' }}>{route.vehicle_plate}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>Ruta ID: {route.id.split('-')[0]}</div>
                                            </div>
                                            <div style={{ 
                                                padding: '0.4rem 1rem', 
                                                fontSize: '0.7rem', fontWeight: '900',
                                                backgroundColor: 
                                                    route.status === 'in_transit' ? '#3B82F6' : '#F59E0B',
                                                color: 'white',
                                                borderRadius: '12px'
                                            }}>
                                                {route.status.toUpperCase()}
                                            </div>
                                        </div>

                                        <div style={{ marginBottom: '1rem' }}>
                                            <div style={{ fontSize: '0.9rem', color: 'white', marginTop: '0.2rem' }}>Iniciada: {new Date(route.start_time || Date.now()).toLocaleTimeString()}</div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                            <div style={{ backgroundColor: '#111827', padding: '0.75rem', borderRadius: '12px' }}>
                                                <div style={{ fontSize: '0.6rem', color: '#10B981', fontWeight: '900' }}>PEDIDOS</div>
                                                <div style={{ fontSize: '1.1rem', fontWeight: '900', color: 'white' }}>{route.total_orders}</div>
                                            </div>
                                            <div style={{ backgroundColor: '#111827', padding: '0.75rem', borderRadius: '12px' }}>
                                                <div style={{ fontSize: '0.6rem', color: '#10B981', fontWeight: '900' }}>PESO TOTAL</div>
                                                <div style={{ fontSize: '1.1rem', fontWeight: '900', color: 'white' }}>{route.total_kilos} <span style={{ fontSize: '0.6rem' }}>KG</span></div>
                                            </div>
                                        </div>

                                        <button style={{ 
                                            width: '100%', 
                                            marginTop: '1rem', 
                                            padding: '0.8rem', 
                                            borderRadius: '12px',
                                            border: 'none',
                                            backgroundColor: '#10B981',
                                            color: 'white',
                                            fontWeight: '900'
                                        }}>
                                            {route.status === 'planning' ? 'INICIAR CARGUE' : 'CONTINUAR RUTA'}
                                        </button>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </>
            ) : (
                <div style={{ 
                    marginTop: '2rem', 
                    padding: '3rem 1.5rem', 
                    background: 'linear-gradient(180deg, #1E2937 0%, #111827 100%)', 
                    borderRadius: '24px', 
                    textAlign: 'center',
                    border: '1px solid #374151'
                }}>
                    <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🔑</div>
                    <h3 style={{ color: 'white', margin: 0 }}>Identifica tu Vehículo</h3>
                    <p style={{ color: '#9CA3AF', fontSize: '0.9rem', marginTop: '0.5rem' }}>Usa el selector de arriba para ver tus tareas y el estado de tu camión.</p>
                </div>
            )}

            <style jsx>{`
                @keyframes pulse {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.02); }
                    100% { transform: scale(1); }
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}
