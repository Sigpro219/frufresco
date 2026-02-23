'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

interface KpiData {
    id: string;
    is_optimized: boolean;
    theoretical_distance_km: number;
    theoretical_duration_min: number;
    stops_count: number;
    created_at: string;
    status: string;
}

export default function ControlTowerKPIs() {
    const [routes, setRoutes] = useState<KpiData[]>([]);
    const [loading, setLoading] = useState(true);
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        fetchKpiData();
        return () => { isMounted.current = false; };
    }, []);

    const fetchKpiData = async () => {
        try {
            if (!isMounted.current) return;
            setLoading(true);
            const { data, error } = await supabase
                .from('routes')
                .select('id, is_optimized, theoretical_distance_km, theoretical_duration_min, stops_count, created_at, status')
                .order('created_at', { ascending: false });

            if (error) throw error;
            if (isMounted.current) {
                setRoutes(data || []);
            }
        } catch (err) {
            console.error('Error fetching KPI data:', err);
        } finally {
            if (isMounted.current) setLoading(false);
        }
    };

    const getStats = () => {
        const optimized = routes.filter(r => r.is_optimized);
        const manual = routes.filter(r => !r.is_optimized);

        const calcEfficiency = (list: KpiData[]) => {
            if (list.length === 0) return { avgStops: 0, avgKmPerStop: 0, avgTimePerStop: 0 };
            const totalStops = list.reduce((sum, r) => sum + (r.stops_count || 0), 0);
            const totalKm = list.reduce((sum, r) => sum + (r.theoretical_distance_km || 0), 0);
            const totalTime = list.reduce((sum, r) => sum + (r.theoretical_duration_min || 0), 0);

            return {
                avgStops: totalStops / list.length,
                avgKmPerStop: totalStops > 0 ? totalKm / totalStops : 0,
                avgTimePerStop: totalStops > 0 ? totalTime / totalStops : 0
            };
        };

        return {
            optimized: calcEfficiency(optimized),
            manual: calcEfficiency(manual),
            adoptionRate: routes.length > 0 ? (optimized.length / routes.length) * 100 : 0
        };
    };

    const stats = getStats();

    if (loading) return <div style={{ color: '#64748B', padding: '2rem', textAlign: 'center' }}>Analizando métricas...</div>;

    return (
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
                <KpiCard 
                    title="Adopción Magic" 
                    value={`${Math.round(stats.adoptionRate)}%`} 
                    subtitle="Rutas optimizadas vs total"
                    color="#0891B2"
                />
                <KpiCard 
                    title="Tiempo / Parada (Magic)" 
                    value={`${stats.optimized.avgTimePerStop.toFixed(1)}m`} 
                    subtitle="Eficiencia teórica optimizada"
                    color="#10B981"
                />
                <KpiCard 
                    title="Tiempo / Parada (Manual)" 
                    value={`${stats.manual.avgTimePerStop.toFixed(1)}m`} 
                    subtitle="Eficiencia histórica manual"
                    color="#64748B"
                />
            </div>

            <div style={{ 
                backgroundColor: 'white', 
                borderRadius: '24px', 
                border: '1px solid #E5E7EB', 
                padding: '2rem' 
            }}>
                <h3 style={{ margin: '0 0 1.5rem 0', fontWeight: '900', color: '#111827' }}>Comparativa de Desempeño</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <EfficiencyRow 
                        label="Entregas por Kilómetro" 
                        magic={stats.optimized.avgKmPerStop > 0 ? (1 / stats.optimized.avgKmPerStop).toFixed(2) : '0'} 
                        manual={stats.manual.avgKmPerStop > 0 ? (1 / stats.manual.avgKmPerStop).toFixed(2) : '0'} 
                        unit="paradas/km"
                    />
                    <EfficiencyRow 
                        label="Entregas por Ruta (Promedio)" 
                        magic={stats.optimized.avgStops.toFixed(1)} 
                        manual={stats.manual.avgStops.toFixed(1)} 
                        unit="pedidos"
                    />
                </div>
            </div>

            <div style={{ fontSize: '0.8rem', color: '#64748B', fontStyle: 'italic', backgroundColor: '#F8FAFC', padding: '1rem', borderRadius: '16px' }}>
                💡 Las métricas "Magic" se basan en la planificación teórica de Google Maps, mientras que las "Manuales" reflejan el despacho tradicional.
            </div>
        </div>
    );
}

function KpiCard({ title, value, subtitle, color }: { title: string, value: string, subtitle: string, color: string }) {
    return (
        <div style={{ 
            backgroundColor: 'white', 
            borderRadius: '24px', 
            padding: '1.5rem', 
            border: `1px solid ${color}20`,
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
        }}>
            <div style={{ fontSize: '0.75rem', fontWeight: '900', color: '#64748B', marginBottom: '0.5rem', letterSpacing: '0.05rem' }}>{title.toUpperCase()}</div>
            <div style={{ fontSize: '2rem', fontWeight: '900', color: color }}>{value}</div>
            <div style={{ fontSize: '0.7rem', color: '#94A3B8', marginTop: '0.4rem', fontWeight: '600' }}>{subtitle}</div>
        </div>
    );
}

function EfficiencyRow({ label, magic, manual, unit }: { label: string, magic: string, manual: string, unit: string }) {
    const isMagicBetter = parseFloat(magic) > parseFloat(manual);
    
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px', alignItems: 'center', padding: '1rem', borderBottom: '1px solid #F3F4F6' }}>
            <div style={{ fontWeight: '700', color: '#374151' }}>{label}</div>
            <div style={{ textAlign: 'center', fontWeight: '900', color: '#0891B2' }}>{magic} <span style={{ fontSize: '0.65rem', color: '#94A3B8' }}>{unit}</span></div>
            <div style={{ textAlign: 'center', fontWeight: '800', color: '#64748B' }}>{manual} <span style={{ fontSize: '0.65rem', color: '#C0C0C0' }}>{unit}</span></div>
            {isMagicBetter && <div style={{ position: 'absolute', right: '3rem', fontSize: '0.65rem', backgroundColor: '#F0FDFA', color: '#0D9488', padding: '0.2rem 0.5rem', borderRadius: '8px', fontWeight: '900' }}>✨ MEJOR</div>}
        </div>
    );
}
