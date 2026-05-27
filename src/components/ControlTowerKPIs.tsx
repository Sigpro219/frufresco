'use client';

import { useState, useEffect, useRef } from 'react';
import { THEME } from '@/lib/adminTheme';
import { Activity, Clock, BarChart3, HelpCircle, ArrowUpRight } from 'lucide-react';

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

            const response = await fetch('/api/transport/kpis');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();

            if (isMounted.current) {
                setRoutes(data || []);
            }
        } catch (err: unknown) {
            const isAbortError = err instanceof Error && (err.name === 'AbortError' || err.message?.includes('aborted'));
            if (isAbortError) return;
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

    if (loading) return <div style={{ color: THEME.colors.textSecondary, padding: '2rem', textAlign: 'center', fontFamily: THEME.typography.fontFamilySecondary }}>Analizando métricas...</div>;

    return (
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '2rem', fontFamily: THEME.typography.fontFamilySecondary }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
                <KpiCard 
                    title="Adopción Magic" 
                    value={`${Math.round(stats.adoptionRate)}%`} 
                    subtitle="Rutas optimizadas vs total"
                    icon={<Activity size={18} strokeWidth={1.5} />}
                />
                <KpiCard 
                    title="Tiempo / Parada (Magic)" 
                    value={`${stats.optimized.avgTimePerStop.toFixed(1)}m`} 
                    subtitle="Eficiencia teórica optimizada"
                    icon={<Clock size={18} strokeWidth={1.5} />}
                />
                <KpiCard 
                    title="Tiempo / Parada (Manual)" 
                    value={`${stats.manual.avgTimePerStop.toFixed(1)}m`} 
                    subtitle="Eficiencia histórica manual"
                    icon={<BarChart3 size={18} strokeWidth={1.5} />}
                />
            </div>

            <div style={{ 
                backgroundColor: THEME.colors.surface, 
                borderRadius: THEME.radius.lg, 
                border: `1px solid ${THEME.colors.border}`, 
                padding: '1.25rem 1.5rem' 
            }}>
                <h3 style={{ margin: '0 0 1.5rem 0', fontWeight: '600', color: THEME.colors.textMain, fontFamily: THEME.typography.fontFamilyMain, fontSize: '1.1rem' }}>Comparativa de Desempeño</h3>
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

            <div style={{ fontSize: '0.8rem', color: THEME.colors.textSecondary, fontStyle: 'italic', backgroundColor: THEME.colors.background, padding: '1rem', borderRadius: THEME.radius.md, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <HelpCircle size={15} strokeWidth={1.5} style={{ color: THEME.colors.primary }} />
                <span>Las métricas &quot;Magic&quot; se basan en la planificación teórica de Google Maps, mientras que las &quot;Manuales&quot; reflejan el despacho tradicional.</span>
            </div>
        </div>
    );
}

function KpiCard({ title, value, subtitle, icon }: { title: string, value: string, subtitle: string, icon: React.ReactNode }) {
    return (
        <div style={{ 
            backgroundColor: THEME.colors.surface, 
            borderRadius: THEME.radius.lg, 
            padding: '1.25rem 1.5rem', 
            border: `1px solid ${THEME.colors.border}`,
            boxShadow: THEME.shadow.sm,
            display: 'flex',
            alignItems: 'center',
            gap: '1.2rem',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            cursor: 'pointer'
        }}
        onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = THEME.shadow.lg;
            e.currentTarget.style.borderColor = THEME.colors.borderActive;
        }}
        onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = THEME.shadow.sm;
            e.currentTarget.style.borderColor = THEME.colors.border;
        }}>
            <div style={{ backgroundColor: THEME.colors.primaryLight, width: '48px', height: '48px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: THEME.colors.primary, flexShrink: 0 }}>
                {icon}
            </div>
            <div>
                <div style={{ fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, marginBottom: '0.2rem', letterSpacing: '0.05rem', textTransform: 'uppercase' }}>{title}</div>
                <div style={{ fontSize: '1.3rem', fontWeight: '700', color: THEME.colors.textMain, margin: '0.2rem 0', lineHeight: 1, letterSpacing: '-0.02em' }}>{value}</div>
                <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, fontWeight: '500' }}>{subtitle}</div>
            </div>
        </div>
    );
}

function EfficiencyRow({ label, magic, manual, unit }: { label: string, magic: string, manual: string, unit: string }) {
    const isMagicBetter = parseFloat(magic) > parseFloat(manual);
    
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px', alignItems: 'center', padding: '0.65rem 1.25rem', borderBottom: `1px solid ${THEME.colors.border}`, position: 'relative' }}>
            <div style={{ fontWeight: '500', color: THEME.colors.textMain }}>{label}</div>
            <div style={{ textAlign: 'center', fontWeight: '700', color: THEME.colors.primary }}>{magic} <span style={{ fontSize: '0.65rem', color: THEME.colors.textSecondary }}>{unit}</span></div>
            <div style={{ textAlign: 'center', fontWeight: '500', color: THEME.colors.textSecondary }}>{manual} <span style={{ fontSize: '0.65rem', color: '#94A3B8' }}>{unit}</span></div>
            {isMagicBetter && (
                <div style={{ 
                    position: 'absolute', 
                    right: '1.25rem', 
                    fontSize: '0.65rem', 
                    backgroundColor: THEME.colors.primaryLight, 
                    color: THEME.colors.primary, 
                    padding: '0.2rem 0.5rem', 
                    borderRadius: THEME.radius.sm, 
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px'
                }}>
                    <ArrowUpRight size={10} strokeWidth={1.5} />
                    <span>MEJOR</span>
                </div>
            )}
        </div>
    );
}

