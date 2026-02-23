'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface ActivityType {
    id: string;
    label: string;
    icon: string;
    color: string;
}

const ACTIVITIES: ActivityType[] = [
    { id: 'operation', label: 'Operación', icon: '⚡', color: '#10B981' },
    { id: 'refuel', label: 'Tanqueo', icon: '⛽', color: '#F59E0B' },
    { id: 'workshop', label: 'Taller', icon: '🛠️', color: '#6366F1' },
    { id: 'lunch', label: 'Almuerzo', icon: '🥣', color: '#10B981' },
    { id: 'break', label: 'Receso', icon: '⏸️', color: '#94A3B8' },
    { id: 'park', label: 'Parquear', icon: '🅿️', color: '#1F2937' }
];

const ROAD_ADJUSTMENT_FACTOR = 1.25; // Estimate road distance from straight-line GPS

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Earth radius in KM
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c * ROAD_ADJUSTMENT_FACTOR;
};

interface ActivityLogProps {
    plate: string;
    onOdometerUpdate?: (newOdo: number) => void;
}

export default function ActivityLog({ plate, onOdometerUpdate }: ActivityLogProps) {
    const [activeActivity, setActiveActivity] = useState<{type: string, startTime: number, startLat: number, startLon: number} | null>(null);
    const [loading, setLoading] = useState(false);
    const [gpsActive, setGpsActive] = useState(false);
    const [theoreticalOdo, setTheoreticalOdo] = useState(0);

    const getCurrentPosition = (): Promise<GeolocationPosition> => {
        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true });
        });
    };

    useEffect(() => {
        const saved = localStorage.getItem(`active_activity_${plate}`);
        if (saved) {
            const parsedSaved = JSON.parse(saved);
            setActiveActivity(parsedSaved);
            // Don't overwrite odo from localstorage if it exists in activity state
            if (parsedSaved.odo) setTheoreticalOdo(parsedSaved.odo);
        } else {
            // PRODUCTION: Fetch current odo from fleet_vehicles if no local session
            const fetchVehicleOdo = async () => {
                if (plate.startsWith('mock')) {
                    setTheoreticalOdo(45000); // Sample odo for mock
                    return;
                }
                const { data } = await supabase
                    .from('fleet_vehicles')
                    .select('current_odometer')
                    .eq('plate', plate)
                    .single();
                if (data?.current_odometer) {
                    setTheoreticalOdo(data.current_odometer);
                }
            };
            fetchVehicleOdo();

            // Initial state if no saved activity
            getCurrentPosition().then(pos => {
                const initial = { 
                    type: 'operation', 
                    startTime: Date.now(), 
                    startLat: pos.coords.latitude, 
                    startLon: pos.coords.longitude 
                };
                setActiveActivity(initial);
                localStorage.setItem(`active_activity_${plate}`, JSON.stringify(initial));
                setGpsActive(true);
            }).catch(() => {
                setGpsActive(false);
            });
        }
    }, [plate]);

    const switchActivity = async (newType: string) => {
        if (activeActivity?.type === newType) return;
        
        setLoading(true);
        try {
            const pos = await getCurrentPosition();
            const now = Date.now();
            const currLat = pos.coords.latitude;
            const currLon = pos.coords.longitude;

            // 1. Log previous activity distance
            if (activeActivity) {
                const diffTime = now - activeActivity.startTime;
                const hours = Math.floor(diffTime / 3600000).toString().padStart(2, '0');
                const minutes = Math.floor((diffTime % 3600000) / 60000).toString().padStart(2, '0');
                const seconds = Math.floor((diffTime % 60000) / 1000).toString().padStart(2, '0');
                const durationTxt = `${hours}:${minutes}:${seconds}`;

                const dist = calculateDistance(
                    activeActivity.startLat, 
                    activeActivity.startLon, 
                    currLat, 
                    currLon
                );

                const description = `GPS AUDIT | PLACA: ${plate} | ESTADO: ${activeActivity.type.toUpperCase()} | DURACIÓN: ${durationTxt} | KM ESTIMADOS: ${dist.toFixed(2)} | COORDS: [${activeActivity.startLat.toFixed(4)},${activeActivity.startLon.toFixed(4)}] -> [${currLat.toFixed(4)},${currLon.toFixed(4)}]`;
                
                if (!plate.startsWith('mock')) {
                    await supabase.from('delivery_events').insert({
                        event_type: `activity_${activeActivity.type}`,
                        description,
                        created_at: new Date(activeActivity.startTime).toISOString()
                    });
                } else {
                    console.log('Bitácora Silenciosa:', description);
                }

                // Update theoretical odo locally for visual feedback
                const newOdo = theoreticalOdo + dist;
                setTheoreticalOdo(newOdo);

                // PRODUCTION UPDATE: Save new odo to fleet_vehicles
                if (!plate.startsWith('mock')) {
                    await supabase.from('fleet_vehicles')
                        .update({ 
                            current_odometer: Math.round(newOdo),
                            last_odometer_update: new Date().toISOString()
                        })
                        .eq('plate', plate);
                }

                if (onOdometerUpdate) onOdometerUpdate(Math.round(newOdo));
            }

            // 2. Set New State
            const nextActivity = { 
                type: newType, 
                startTime: now, 
                startLat: currLat, 
                startLon: currLon 
            };
            setActiveActivity(nextActivity);
            localStorage.setItem(`active_activity_${plate}`, JSON.stringify(nextActivity));
            setGpsActive(true);
            
            if (window.showToast) window.showToast(`Estado: ${newType.toUpperCase()}`, 'success');
            if (window.showToast) window.showToast(`Estado: ${newType.toUpperCase()}`, 'success');
        } catch (err: unknown) {
            const geoErr = err as GeolocationPositionError;
            console.error(`GPS Error Audit - Code: ${geoErr?.code || 'unknown'}, Message: ${geoErr?.message || 'No msg'}`);
             
            setGpsActive(false);

            // Fallback: If GPS fails, still switch activity but log with 0 distance and a warning
            const now = Date.now();
            const fallbackLat = activeActivity?.startLat || 0;
            const fallbackLon = activeActivity?.startLon || 0;
            const errorMessage = geoErr?.message || 'Ubicación denegada/nula';

            if (activeActivity) {
                const description = `GPS ERROR | ESTADO: ${activeActivity.type.toUpperCase()} | ERROR: ${errorMessage} | KM ESTIMADOS: 0.00`;
                
                if (!plate.startsWith('mock')) {
                    await supabase.from('delivery_events').insert({
                        event_type: `activity_error_${activeActivity.type}`,
                        description,
                        created_at: new Date(activeActivity.startTime).toISOString()
                    });
                }
            }

            const nextActivity = { 
                type: newType, 
                startTime: now, 
                startLat: fallbackLat, 
                startLon: fallbackLon 
            };
            setActiveActivity(nextActivity);
            localStorage.setItem(`active_activity_${plate}`, JSON.stringify(nextActivity));

            alert(`⚠️ GPS NO DISPONIBLE: Se cambió el estado a ${newType.toUpperCase()} pero no se pudo auditar la distancia. Por favor, activa el GPS si es posible.`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ backgroundColor: '#1E2937', borderRadius: '24px', padding: '1.5rem', border: '1px solid #374151', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'white', fontWeight: '900', letterSpacing: '0.05em' }}>BITÁCORA DE ACTIVIDAD (TIEMPO + KM)</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ 
                        fontSize: '0.65rem', padding: '4px 12px', borderRadius: '20px', 
                        backgroundColor: gpsActive ? 'rgba(59, 130, 246, 0.1)' : 'rgba(239, 68, 68, 0.1)', 
                        color: gpsActive ? '#3B82F6' : '#EF4444', 
                        fontWeight: '900', border: `1px solid ${gpsActive ? '#3B82F640' : '#EF444440'}`,
                        display: 'flex', alignItems: 'center', gap: '4px'
                    }}>
                        {gpsActive ? '🛰️ GPS ACTIVO' : '📵 GPS OFF'}
                    </div>
                    <div style={{ 
                        fontSize: '0.65rem', padding: '4px 12px', borderRadius: '20px', 
                        backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10B981', fontWeight: '900', border: '1px solid rgba(16, 185, 129, 0.2)'
                    }}>
                        {ACTIVITIES.find(a => a.id === activeActivity?.type)?.label.toUpperCase()}
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.8rem' }}>
                {ACTIVITIES.map(act => {
                    const isActive = activeActivity?.type === act.id;
                    return (
                        <button
                            key={act.id}
                            onClick={() => switchActivity(act.id)}
                            disabled={loading}
                            style={{
                                padding: '0.8rem 0.4rem', borderRadius: '14px', 
                                border: isActive ? `2px solid ${act.color}` : `1px solid #374151`,
                                backgroundColor: isActive ? `${act.color}15` : '#111827', 
                                color: isActive ? act.color : '#9CA3AF', 
                                fontWeight: '900', fontSize: '0.75rem',
                                cursor: 'pointer', transition: 'all 0.2s',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                                opacity: loading ? 0.5 : 1
                            }}
                        >
                            <span style={{ fontSize: '1.2rem' }}>{act.icon}</span>
                            <span>{act.label}</span>
                        </button>
                    );
                })}
            </div>

            <div style={{ marginTop: '1rem', padding: '0.6rem', backgroundColor: '#111827', borderRadius: '12px', border: '1px solid #374151', textAlign: 'center' }}>
                <span style={{ fontSize: '0.7rem', color: '#9CA3AF', fontWeight: '700' }}>
                    📐 DISTANCIA TEÓRICA ACUMULADA: 
                    <span style={{ color: 'white', marginLeft: '5px' }}>
                        {theoreticalOdo.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} KM
                    </span>
                </span>
            </div>
        </div>
    );
}
