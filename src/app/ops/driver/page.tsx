'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { isAbortError } from '@/lib/errorUtils';
import Link from 'next/link';
import ActivityLog from '@/components/ActivityLog';
import { Gauge, AlertTriangle, AlertOctagon, MapPin, Key, ChevronRight } from 'lucide-react';

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
        <div style={{ padding: '1.5rem', paddingBottom: '6rem', maxWidth: '600px', margin: '0 auto', minHeight: '100vh', backgroundColor: '#090D16' }}>
            <header style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1 style={{ fontSize: '1.8rem', fontWeight: '900', margin: 0, color: 'white', letterSpacing: '-0.5px' }}>
                        Despacho <span style={{ color: '#059669' }}>/ Salida</span>
                    </h1>
                    <p style={{ color: '#9CA3AF', fontSize: '0.9rem', marginTop: '0.3rem' }}>Gestiona tu vehículo y tus rutas de hoy.</p>
                </div>
                <button 
                    onClick={() => setDemoMode(!demoMode)}
                    className="demo-btn"
                    style={{ 
                        padding: '0.6rem 1.2rem', 
                        borderRadius: '12px', 
                        fontSize: '0.7rem', 
                        fontWeight: '800',
                        backgroundColor: demoMode ? '#059669' : 'rgba(255, 255, 255, 0.05)',
                        color: 'white',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                    }}
                >
                    {demoMode ? 'SIMULACIÓN: ON' : 'SIMULAR OPERACIÓN'}
                </button>
            </header>

            {/* Vehicle Selection Dropdown */}
            <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#059669', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Selecciona tu Vehículo
                </label>
                <select 
                    value={selectedPlate}
                    onChange={(e) => setSelectedPlate(e.target.value)}
                    style={{ 
                        width: '100%', 
                        padding: '1rem 1.2rem', 
                        borderRadius: '16px', 
                        backgroundColor: 'rgba(30, 41, 59, 0.4)', 
                        border: '1px solid rgba(255, 255, 255, 0.08)', 
                        color: 'white',
                        fontSize: '1rem',
                        fontWeight: '600',
                        appearance: 'none',
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239CA3AF'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 1.2rem center',
                        backgroundSize: '1.2rem',
                        outline: 'none',
                        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)'
                    }}
                >
                    <option value="" style={{ backgroundColor: '#090D16' }}>-- {demoMode ? 'TODOS LOS VEHÍCULOS' : 'Elige una placa'} --</option>
                    {plates.map(p => (
                        <option key={p} value={p} style={{ backgroundColor: '#090D16' }}>{p}</option>
                    ))}
                </select>
            </div>

            {selectedPlate && !odometerConfirmed && (
                <div className="premium-card" style={{ 
                    padding: '1.5rem', 
                    marginBottom: '2rem',
                    animation: 'fadeIn 0.5s ease-out'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1rem' }}>
                        <Gauge style={{ color: '#059669', width: '24px', height: '24px' }} />
                        <h3 style={{ margin: 0, color: 'white', fontSize: '1.1rem', fontWeight: '800' }}>Actualiza el Kilometraje</h3>
                    </div>
                    <p style={{ color: '#9CA3AF', fontSize: '0.85rem', marginBottom: '1.5rem', lineHeight: '1.4' }}>
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
                                backgroundColor: 'rgba(9, 13, 22, 0.6)', 
                                border: '1px solid rgba(255, 255, 255, 0.08)', 
                                color: 'white',
                                fontSize: '1.5rem',
                                fontWeight: '800',
                                textAlign: 'center',
                                outline: 'none'
                            }}
                        />
                        <span style={{ position: 'absolute', right: '1.5rem', top: '50%', transform: 'translateY(-50%)', color: '#059669', fontWeight: '800' }}>KM</span>
                    </div>

                    <button 
                        onClick={handleConfirmOdometer}
                        disabled={isUpdatingOdo}
                        style={{ 
                            width: '100%', 
                            padding: '1.1rem', 
                            borderRadius: '16px', 
                            border: 'none', 
                            backgroundColor: '#059669', 
                            color: 'white', 
                            fontWeight: '800', 
                            fontSize: '1rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            boxShadow: '0 4px 12px rgba(5, 150, 105, 0.2)'
                        }}>
                        {isUpdatingOdo ? 'ACTUALIZANDO...' : 'CONFIRMAR E INICIAR'}
                    </button>
                </div>
            )}

            {selectedPlate && odometerConfirmed && maintenanceAlert && maintenanceAlert.status !== 'ok' && (
                <div style={{ 
                    marginBottom: '1.5rem', 
                    padding: '1.2rem', 
                    borderRadius: '16px',
                    backgroundColor: maintenanceAlert.status === 'urgent' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                    border: `1px solid ${maintenanceAlert.status === 'urgent' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    animation: 'pulse 2s infinite'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {maintenanceAlert.status === 'urgent' ? (
                            <AlertOctagon style={{ color: '#EF4444', width: '28px', height: '28px' }} />
                        ) : (
                            <AlertTriangle style={{ color: '#F59E0B', width: '28px', height: '28px' }} />
                        )}
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: '800', color: maintenanceAlert.status === 'urgent' ? '#F87171' : '#FBBF24', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                {maintenanceAlert.status === 'urgent' ? 'Acción Requerida' : 'Próximo Mantenimiento'}
                            </div>
                            <div style={{ 
                                fontSize: '0.75rem', 
                                fontWeight: '800', 
                                backgroundColor: maintenanceAlert.status === 'urgent' ? '#EF4444' : '#F59E0B',
                                color: 'white',
                                padding: '2px 8px',
                                borderRadius: '6px'
                            }}>
                                {maintenanceAlert.estimated}
                            </div>
                        </div>
                        <div style={{ fontSize: '0.95rem', fontWeight: '700', color: 'white', marginTop: '2px' }}>{maintenanceAlert.task_name}</div>
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

                    <h2 style={{ fontSize: '1.2rem', fontWeight: '800', marginBottom: '1rem', color: 'white', letterSpacing: '-0.3px' }}>
                        {selectedPlate ? `Rutas para ${selectedPlate}` : 'Rutas Activas de la Flota'}
                    </h2>

                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '2rem', color: '#9CA3AF' }}>Actualizando...</div>
                    ) : routes.length === 0 ? (
                        <div className="premium-card" style={{ 
                            padding: '3rem 2rem', 
                            textAlign: 'center',
                            borderStyle: 'dashed'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                                <MapPin style={{ width: '48px', height: '48px', color: '#9CA3AF', opacity: 0.5 }} />
                            </div>
                            <h3 style={{ margin: 0, color: 'white', fontSize: '1.1rem', fontWeight: '700' }}>Sin rutas asignadas</h3>
                            <p style={{ color: '#9CA3AF', fontSize: '0.85rem', marginTop: '0.4rem' }}>No tienes viajes pendientes para la placa {selectedPlate}.</p>
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
                                    <div className="premium-card route-card" style={{ 
                                        padding: '1.5rem',
                                        position: 'relative'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                            <div>
                                                <div style={{ fontSize: '1.1rem', fontWeight: '800', color: 'white' }}>{route.vehicle_plate}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>Ruta ID: {route.id.split('-')[0]}</div>
                                            </div>
                                            <div style={{ 
                                                padding: '0.4rem 1rem', 
                                                fontSize: '0.7rem', fontWeight: '800',
                                                backgroundColor: 
                                                    route.status === 'in_transit' ? '#2563EB' : '#D97706',
                                                color: 'white',
                                                borderRadius: '12px'
                                            }}>
                                                {route.status.toUpperCase()}
                                            </div>
                                        </div>

                                        <div style={{ marginBottom: '1rem' }}>
                                            <div style={{ fontSize: '0.9rem', color: '#E2E8F0', marginTop: '0.2rem' }}>Iniciada: {new Date(route.start_time || Date.now()).toLocaleTimeString()}</div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                            <div style={{ backgroundColor: 'rgba(9, 13, 22, 0.4)', padding: '0.75rem', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                                                <div style={{ fontSize: '0.6rem', color: '#059669', fontWeight: '800', letterSpacing: '0.5px' }}>PEDIDOS</div>
                                                <div style={{ fontSize: '1.1rem', fontWeight: '800', color: 'white' }}>{route.total_orders}</div>
                                            </div>
                                            <div style={{ backgroundColor: 'rgba(9, 13, 22, 0.4)', padding: '0.75rem', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                                                <div style={{ fontSize: '0.6rem', color: '#059669', fontWeight: '800', letterSpacing: '0.5px' }}>PESO TOTAL</div>
                                                <div style={{ fontSize: '1.1rem', fontWeight: '800', color: 'white' }}>{route.total_kilos} <span style={{ fontSize: '0.6rem', color: '#9CA3AF' }}>KG</span></div>
                                            </div>
                                        </div>

                                        <button style={{ 
                                            width: '100%', 
                                            marginTop: '1rem', 
                                            padding: '0.8rem', 
                                            borderRadius: '12px',
                                            border: 'none',
                                            backgroundColor: '#059669',
                                            color: 'white',
                                            fontWeight: '800',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            justifyItems: 'center',
                                            justifyContent: 'center',
                                            alignItems: 'center',
                                            gap: '8px'
                                        }}>
                                            {route.status === 'planning' ? 'INICIAR CARGUE' : 'CONTINUAR RUTA'}
                                            <ChevronRight style={{ width: '16px', height: '16px' }} />
                                        </button>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </>
            ) : (
                <div className="premium-card" style={{ 
                    marginTop: '2rem', 
                    padding: '3rem 1.5rem', 
                    textAlign: 'center'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                        <Key style={{ width: '64px', height: '64px', color: '#059669', opacity: 0.8 }} />
                    </div>
                    <h3 style={{ color: 'white', margin: 0, fontSize: '1.2rem', fontWeight: '800' }}>Identifica tu Vehículo</h3>
                    <p style={{ color: '#9CA3AF', fontSize: '0.9rem', marginTop: '0.5rem', lineHeight: '1.4' }}>Usa el selector de arriba para ver tus tareas y el estado de tu camión.</p>
                </div>
            )}

            <style jsx>{`
                .premium-card {
                    background: rgba(30, 41, 59, 0.45);
                    backdrop-filter: blur(12px);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-radius: 16px;
                    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.2);
                    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .route-card:hover {
                    transform: translateY(-2px);
                    border-color: rgba(5, 150, 105, 0.3);
                    box-shadow: 0 12px 40px 0 rgba(5, 150, 105, 0.1);
                    background: rgba(30, 41, 59, 0.55);
                }
                .demo-btn:hover {
                    opacity: 0.9;
                }
                @keyframes pulse {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.01); }
                    100% { transform: scale(1); }
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}
