'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { 
    OrderStagingInput, 
    allocateStagingSpacesGeographically,
    calculateCratesAndSpaces,
    formatSpaceLabel
} from '@/lib/stagingSpaceAllocator';
import { 
    Grid, 
    Save, 
    Printer, 
    Sparkles, 
    RefreshCw, 
    CheckCircle2, 
    Calendar,
    Layers,
    ShieldAlert,
    Search,
    Maximize2,
    Minimize2,
    MapPin,
    Package,
    Scale,
    X,
    Info
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { THEME } from '@/lib/adminTheme';

interface StagingSpacesManagementProps {
    readOnly?: boolean;
    initialDate?: string;
}

export default function StagingSpacesManagement({ readOnly = false, initialDate }: StagingSpacesManagementProps) {
    const searchParams = useSearchParams();
    const queryDate = searchParams ? searchParams.get('date') : null;

    const getTomorrowDateStr = () => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return d.toISOString().split('T')[0];
    };

    const getTodayDateStr = () => {
        return new Date().toISOString().split('T')[0];
    };

    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    // Interactive Tooltip & Search States
    const [hoveredSlot, setHoveredSlot] = useState<any | null>(null);
    const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [isFullMapMode, setIsFullMapMode] = useState<boolean>(false);

    // Parámetros Logísticos
    const [spaceCapacity, setSpaceCapacity] = useState<number>(36);
    const [avgKgPerCrate, setAvgKgPerCrate] = useState<number>(12.52);
    const [selectedDate, setSelectedDate] = useState<string>(() => {
        return initialDate || queryDate || getTomorrowDateStr();
    });

    // Sincronizar si cambia el prop o el parámetro de búsqueda en URL
    useEffect(() => {
        const targetDate = initialDate || queryDate;
        if (targetDate && targetDate !== selectedDate) {
            setSelectedDate(targetDate);
        }
    }, [initialDate, queryDate]);

    // Mapeo manual de espacios por orderId: { [orderId]: number[] }
    const [manualSpacesMap, setManualSpacesMap] = useState<Record<string, number[]>>({});

    // Cargar parámetros y órdenes
    useEffect(() => {
        fetchInitialData();
    }, [selectedDate]);

    const fetchInitialData = async () => {
        setLoading(true);
        try {
            // 1. Cargar parámetros logísticos
            const { data: paramData } = await supabase.from('logistic_parameters').select('*');
            if (paramData) {
                const sc = paramData.find((p: any) => p.id === 'space_capacity')?.value;
                if (sc) setSpaceCapacity(parseFloat(sc) || 36);
                const avg = paramData.find((p: any) => p.id === 'avg_kg_per_crate')?.value;
                if (avg) setAvgKgPerCrate(parseFloat(avg) || 12.52);
            }

            // 2. Cargar pedidos con items y perfiles
            let orderQuery = supabase
                .from('orders')
                .select(`
                    id, sequence_id, status, total, delivery_date, created_at,
                    shipping_address, warehouse_spaces, profile_id,
                    profiles:profile_id(id, company_name, contact_name, contact_phone, address),
                    order_items(id, quantity, unit_price, nickname, products(name, sku, unit_of_measure, weight_kg))
                `)
                .neq('status', 'cancelled');

            if (selectedDate) {
                orderQuery = orderQuery.eq('delivery_date', selectedDate);
            }

            const { data: ordersData, error: oErr } = await orderQuery.order('created_at', { ascending: false });

            if (oErr) {
                console.error('Error cargando pedidos para muelle:', oErr.message || oErr.details || oErr);
                throw oErr;
            }

            const fetchedOrders = ordersData || [];
            setOrders(fetchedOrders);

            // Inicializar mapa de espacios con los ya guardados en DB
            const initialMap: Record<string, number[]> = {};
            fetchedOrders.forEach((o: any) => {
                if (Array.isArray(o.warehouse_spaces) && o.warehouse_spaces.length > 0) {
                    initialMap[o.id] = o.warehouse_spaces;
                }
            });
            setManualSpacesMap(initialMap);

        } catch (err: any) {
            console.error('Error cargando pedidos para muelle:', err?.message || err?.details || err);
        } finally {
            setLoading(false);
        }
    };

    // Formatear pedidos para el motor de asignación
    const preparedOrders: OrderStagingInput[] = useMemo(() => {
        return orders.map((o: any) => {
            const totalKg = (o.order_items || []).reduce((sum: number, it: any) => {
                const qty = Number(it.quantity) || 0;
                const unitWeight = Number(it.products?.weight_kg) || 1;
                return sum + (qty * unitWeight);
            }, 0);

            return {
                id: o.id,
                sequence_id: o.sequence_id,
                client_id: o.profiles?.id,
                company_name: o.profiles?.company_name || 'Cliente sin nombre',
                shipping_address: o.shipping_address || o.profiles?.address || '',
                total_weight_kg: totalKg > 0 ? totalKg : 15,
                existing_spaces: manualSpacesMap[o.id] || o.warehouse_spaces || []
            };
        });
    }, [orders, manualSpacesMap]);

    // Calcular asignación automática inicial o sugerida
    const autoAllocation = useMemo(() => {
        return allocateStagingSpacesGeographically(preparedOrders, {
            avg_kg_per_crate: avgKgPerCrate,
            space_capacity: spaceCapacity,
            max_spaces: 150
        });
    }, [preparedOrders, avgKgPerCrate, spaceCapacity]);

    // Aplicar cálculo automático al estado manual
    const handleApplyAutoClustering = () => {
        if (readOnly) return;
        const newMap: Record<string, number[]> = {};
        autoAllocation.forEach(a => {
            newMap[a.order_id] = a.assigned_spaces;
        });
        setManualSpacesMap(newMap);
        setSaveSuccess(false);
    };

    // Cambiar manualmente el espacio de una orden
    const handleManualSpaceChange = (orderId: string, valueStr: string) => {
        if (readOnly) return;
        const cleaned = valueStr.replace(/[^0-9,-]/g, '');
        let spaces: number[] = [];

        if (cleaned.includes('-')) {
            const parts = cleaned.split('-').map(p => parseInt(p.trim())).filter(p => !isNaN(p));
            if (parts.length === 2 && parts[0] <= parts[1]) {
                for (let i = parts[0]; i <= parts[1]; i++) {
                    if (i >= 1 && i <= 150) spaces.push(i);
                }
            }
        } else if (cleaned.includes(',')) {
            spaces = cleaned.split(',').map(p => parseInt(p.trim())).filter(p => !isNaN(p) && p >= 1 && p <= 150);
        } else {
            const num = parseInt(cleaned);
            if (!isNaN(num) && num >= 1 && num <= 150) {
                spaces = [num];
            }
        }

        setManualSpacesMap(prev => ({
            ...prev,
            [orderId]: spaces
        }));
        setSaveSuccess(false);
    };

    // Guardar asignación en Supabase (orders.warehouse_spaces)
    const handleSaveToDatabase = async () => {
        if (readOnly) return;
        setSaving(true);
        setSaveSuccess(false);
        try {
            // 1. Guardar parámetros si cambiaron
            await supabase.from('logistic_parameters').upsert([
                { id: 'space_capacity', value: spaceCapacity.toString(), description: 'Capacidad de canastillas por espacio' },
                { id: 'avg_kg_per_crate', value: avgKgPerCrate.toString(), description: 'Peso promedio estimado por canastilla' }
            ]);

            // 2. Guardar warehouse_spaces en orders
            const updates = Object.entries(manualSpacesMap).map(([orderId, spaces]) => {
                return supabase
                    .from('orders')
                    .update({ warehouse_spaces: spaces })
                    .eq('id', orderId);
            });

            await Promise.all(updates);
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 4000);
        } catch (err) {
            console.error('Error guardando asignación de muelle:', err);
            alert('Error al guardar en base de datos');
        } finally {
            setSaving(false);
        }
    };

    // Construir la cuadrícula física de los 150 espacios
    const grid150 = useMemo(() => {
        const slots: Record<number, any> = {};

        preparedOrders.forEach(o => {
            const assigned = manualSpacesMap[o.id] || [];
            const { crates, spaces } = calculateCratesAndSpaces(o.total_weight_kg, avgKgPerCrate, spaceCapacity);
            assigned.forEach(slot => {
                if (slot >= 1 && slot <= 150) {
                    slots[slot] = {
                        orderId: o.id,
                        sequenceId: o.sequence_id,
                        customerName: o.company_name,
                        shippingAddress: o.shipping_address,
                        totalKg: o.total_weight_kg,
                        crates,
                        spacesCount: spaces,
                        assignedCount: assigned.length,
                        assignedSlots: assigned
                    };
                }
            });
        });

        return Array.from({ length: 150 }, (_, i) => {
            const slotNum = i + 1;
            return {
                slotNum,
                occupiedBy: slots[slotNum] || null
            };
        });
    }, [preparedOrders, manualSpacesMap, avgKgPerCrate, spaceCapacity]);

    // Resumen estadístico
    const stats = useMemo(() => {
        const totalKg = preparedOrders.reduce((sum, o) => sum + o.total_weight_kg, 0);
        const totalCrates = preparedOrders.reduce((sum, o) => {
            return sum + calculateCratesAndSpaces(o.total_weight_kg, avgKgPerCrate, spaceCapacity).crates;
        }, 0);
        const occupiedSlotsCount = grid150.filter(s => s.occupiedBy !== null).length;

        return {
            totalOrders: preparedOrders.length,
            totalKg: Math.round(totalKg),
            totalCrates,
            occupiedSlotsCount
        };
    }, [preparedOrders, grid150, avgKgPerCrate, spaceCapacity]);

    if (loading) {
        return (
            <div style={{ padding: '3rem', textAlign: 'center', backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.xl, border: `1px solid ${THEME.colors.border}`, minHeight: '380px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 1rem', color: THEME.colors.primary }} />
                <h3 style={{ color: THEME.colors.textMain, fontWeight: 800, fontSize: '0.95rem' }}>Cargando Centro de Mando de Bahías...</h3>
                <span style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary }}>Sincronizando 150 bahías en suelo de Corabastos</span>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            
            {/* Header Superior con Storytelling Operativo */}
            <div style={{ backgroundColor: THEME.colors.surface, padding: '1.25rem 1.5rem', borderRadius: THEME.radius.xl, border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                            <div style={{ backgroundColor: THEME.colors.primaryLight, padding: '5px', borderRadius: '7px', color: THEME.colors.primary, display: 'flex' }}>
                                <Grid size={18} />
                            </div>
                            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: THEME.colors.textMain, letterSpacing: '-0.02em' }}>
                                Centro de Mando de Muelle &amp; Bahías en Suelo (1 a 150)
                            </h2>
                        </div>
                        <p style={{ margin: 0, fontSize: '0.78rem', color: THEME.colors.textSecondary, fontWeight: '500' }}>
                            Asignación física de cross-docking para alistamiento nocturno con clusterización geográfica y cubicaje LIFO.
                        </p>
                    </div>

                    {/* Botonera de Acción */}
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            backgroundColor: THEME.colors.background,
                            border: `1px solid ${THEME.colors.border}`,
                            borderRadius: '8px',
                            padding: '4px 8px'
                        }}>
                            <Calendar size={14} color="#64748B" />
                            <span style={{ fontSize: '0.74rem', fontWeight: '700', color: THEME.colors.textSecondary }}>Fecha:</span>
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    fontSize: '0.78rem',
                                    fontWeight: '700',
                                    color: THEME.colors.textMain,
                                    outline: 'none'
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => setSelectedDate(getTodayDateStr())}
                                style={{
                                    padding: '2px 8px',
                                    borderRadius: '5px',
                                    border: `1px solid ${selectedDate === getTodayDateStr() ? THEME.colors.primary : '#CBD5E1'}`,
                                    backgroundColor: selectedDate === getTodayDateStr() ? THEME.colors.primaryLight : '#FFFFFF',
                                    color: selectedDate === getTodayDateStr() ? THEME.colors.primary : '#64748B',
                                    fontSize: '0.68rem',
                                    fontWeight: '800',
                                    cursor: 'pointer'
                                }}
                            >
                                Hoy
                            </button>
                            <button
                                type="button"
                                onClick={() => setSelectedDate(getTomorrowDateStr())}
                                style={{
                                    padding: '2px 8px',
                                    borderRadius: '5px',
                                    border: `1px solid ${selectedDate === getTomorrowDateStr() ? '#0D7A57' : '#CBD5E1'}`,
                                    backgroundColor: selectedDate === getTomorrowDateStr() ? '#ECFDF5' : '#FFFFFF',
                                    color: selectedDate === getTomorrowDateStr() ? '#065F46' : '#64748B',
                                    fontSize: '0.68rem',
                                    fontWeight: '800',
                                    cursor: 'pointer'
                                }}
                            >
                                Mañana (Despacho)
                            </button>
                        </div>

                        {!readOnly && (
                            <button
                                onClick={handleApplyAutoClustering}
                                style={{
                                    backgroundColor: THEME.colors.surface,
                                    color: THEME.colors.textMain,
                                    border: `1px solid ${THEME.colors.borderActive}`,
                                    padding: '0.5rem 0.95rem',
                                    borderRadius: '8px',
                                    fontWeight: 800,
                                    fontSize: '0.76rem',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    transition: 'all 0.15s'
                                }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = THEME.colors.background}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = THEME.colors.surface}
                            >
                                <Sparkles size={14} color="#D97706" /> Auto-Clúster Geográfico
                            </button>
                        )}

                        {!readOnly && (
                            <button
                                onClick={handleSaveToDatabase}
                                disabled={saving}
                                style={{
                                    backgroundColor: saveSuccess ? '#059669' : THEME.colors.primary,
                                    color: '#FFFFFF',
                                    border: 'none',
                                    padding: '0.5rem 1.05rem',
                                    borderRadius: '8px',
                                    fontWeight: 800,
                                    fontSize: '0.76rem',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: '0 2px 6px rgba(13, 122, 87, 0.25)',
                                    transition: 'all 0.15s'
                                }}
                                onMouseEnter={e => { if (!saveSuccess) e.currentTarget.style.backgroundColor = THEME.colors.primaryHover; }}
                                onMouseLeave={e => { if (!saveSuccess) e.currentTarget.style.backgroundColor = THEME.colors.primary; }}
                            >
                                {saveSuccess ? <CheckCircle2 size={14} /> : <Save size={14} />}
                                {saving ? 'Guardando...' : saveSuccess ? '¡Espacios Guardados!' : 'Guardar Asignación'}
                            </button>
                        )}

                        <Link
                            href={orders.length > 0 ? `/admin/orders/alistamiento-print?orderIds=${orders.map(o => o.id).join(',')}` : '/admin/orders/alistamiento-print'}
                            target="_blank"
                            style={{
                                backgroundColor: '#D97706',
                                color: '#FFFFFF',
                                textDecoration: 'none',
                                padding: '0.5rem 0.95rem',
                                borderRadius: '8px',
                                fontWeight: 800,
                                fontSize: '0.76rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                transition: 'all 0.15s'
                            }}
                        >
                            <Printer size={14} /> Sábana Oficio
                        </Link>
                    </div>
                </div>

                {/* Micro-Tira de Métricas y Parámetros */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginTop: '1rem', paddingTop: '1rem', borderTop: `1px solid ${THEME.colors.border}` }}>
                    <div style={{ backgroundColor: THEME.colors.background, padding: '8px 12px', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}` }}>
                        <div style={{ fontSize: '0.62rem', fontWeight: 800, color: THEME.colors.textSecondary, textTransform: 'uppercase' }}>Pedidos a Alistar</div>
                        <div style={{ fontSize: '1.15rem', fontWeight: 900, color: THEME.colors.textMain }}>{stats.totalOrders}</div>
                    </div>
                    <div style={{ backgroundColor: THEME.colors.background, padding: '8px 12px', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}` }}>
                        <div style={{ fontSize: '0.62rem', fontWeight: 800, color: THEME.colors.textSecondary, textTransform: 'uppercase' }}>Kilos Totales</div>
                        <div style={{ fontSize: '1.15rem', fontWeight: 900, color: THEME.colors.textMain }}>{stats.totalKg.toLocaleString()} kg</div>
                    </div>
                    <div style={{ backgroundColor: THEME.colors.background, padding: '8px 12px', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}` }}>
                        <div style={{ fontSize: '0.62rem', fontWeight: 800, color: THEME.colors.textSecondary, textTransform: 'uppercase' }}>Canastillas Estimadas</div>
                        <div style={{ fontSize: '1.15rem', fontWeight: 900, color: THEME.colors.primary }}>{stats.totalCrates} und</div>
                    </div>
                    <div style={{ backgroundColor: THEME.colors.background, padding: '8px 12px', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}` }}>
                        <div style={{ fontSize: '0.62rem', fontWeight: 800, color: THEME.colors.textSecondary, textTransform: 'uppercase' }}>Espacios Ocupados</div>
                        <div style={{ fontSize: '1.15rem', fontWeight: 900, color: stats.occupiedSlotsCount > 150 ? '#DC2626' : THEME.colors.textMain }}>
                            {stats.occupiedSlotsCount} / 150
                        </div>
                    </div>
                    {/* Parámetros Editables */}
                    <div style={{ backgroundColor: THEME.colors.background, padding: '6px 10px', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.62rem', fontWeight: 700, color: THEME.colors.textSecondary }}>
                            <span>Cubicaje/Bahía:</span>
                            <input 
                                type="number" 
                                disabled={readOnly}
                                value={spaceCapacity} 
                                onChange={e => setSpaceCapacity(parseFloat(e.target.value) || 36)}
                                style={{ width: '42px', padding: '2px 4px', fontSize: '0.72rem', fontWeight: 800, textAlign: 'center', borderRadius: '4px', border: `1px solid ${THEME.colors.border}`, backgroundColor: 'white' }}
                            /> can.
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.62rem', fontWeight: 700, color: THEME.colors.textSecondary, marginTop: '3px' }}>
                            <span>Kg/Canastilla:</span>
                            <input 
                                type="number" 
                                step="0.1"
                                disabled={readOnly}
                                value={avgKgPerCrate} 
                                onChange={e => setAvgKgPerCrate(parseFloat(e.target.value) || 12.52)}
                                style={{ width: '42px', padding: '2px 4px', fontSize: '0.72rem', fontWeight: 800, textAlign: 'center', borderRadius: '4px', border: `1px solid ${THEME.colors.border}`, backgroundColor: 'white' }}
                            /> kg
                        </div>
                    </div>
                </div>
            </div>

            {/* Layout Principal: Dos Columnas o 1 Columna en Pantalla Completa */}
            <div style={{ 
                display: 'grid', 
                gridTemplateColumns: isFullMapMode ? '1fr' : 'minmax(0, 1.85fr) minmax(0, 1.15fr)', 
                gap: '1.25rem', 
                alignItems: 'start',
                width: '100%',
                minWidth: 0
            }}>
                
                {/* Cuadrícula Visual de la Nave de Bodega (1 a 150) */}
                <div style={{ 
                    backgroundColor: THEME.colors.surface, 
                    padding: '1.25rem', 
                    borderRadius: THEME.radius.xl, 
                    border: `1px solid ${THEME.colors.border}`, 
                    boxShadow: THEME.shadow.sm,
                    minWidth: 0,
                    width: '100%',
                    boxSizing: 'border-box'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', borderBottom: `1px solid ${THEME.colors.border}`, paddingBottom: '0.65rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 900, color: THEME.colors.textMain }}>
                                Distribución Física en Planta (Bahías 1 a 150)
                            </h3>
                            <span style={{ fontSize: '0.68rem', color: THEME.colors.textSecondary, fontWeight: '500' }}>
                                Verde: Bahía Asignada &bull; Blanco/Gris: Bahía libre &bull; Pasa el cursor para ver detalles completos
                            </span>
                        </div>

                        {/* Barra de Búsqueda Rápida y Controles de Vista */}
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                <Search size={13} color={THEME.colors.textSecondary} style={{ position: 'absolute', left: '8px', pointerEvents: 'none' }} />
                                <input
                                    type="text"
                                    placeholder="Filtrar bahía o cliente..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    style={{
                                        padding: '4px 24px 4px 26px',
                                        fontSize: '0.72rem',
                                        fontWeight: 700,
                                        borderRadius: '6px',
                                        border: `1px solid ${searchTerm ? THEME.colors.primary : THEME.colors.border}`,
                                        outline: 'none',
                                        backgroundColor: '#FAFAFA',
                                        color: THEME.colors.textMain,
                                        width: '175px'
                                    }}
                                />
                                {searchTerm && (
                                    <button 
                                        onClick={() => setSearchTerm('')} 
                                        style={{ position: 'absolute', right: '6px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: THEME.colors.textSecondary, display: 'flex' }}
                                    >
                                        <X size={12} />
                                    </button>
                                )}
                            </div>

                            <button
                                type="button"
                                onClick={() => setIsFullMapMode(!isFullMapMode)}
                                title={isFullMapMode ? "Restaurar vista dividida con lista" : "Expandir plano de planta al 100% de la pantalla"}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    border: `1px solid ${isFullMapMode ? THEME.colors.primary : THEME.colors.border}`,
                                    backgroundColor: isFullMapMode ? THEME.colors.primaryLight : '#FFFFFF',
                                    color: isFullMapMode ? THEME.colors.primary : THEME.colors.textSecondary,
                                    fontSize: '0.68rem',
                                    fontWeight: 800,
                                    cursor: 'pointer'
                                }}
                            >
                                {isFullMapMode ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                                <span>{isFullMapMode ? 'Vista Dividida' : '100% Plano'}</span>
                            </button>

                            <div style={{ display: 'flex', gap: '6px', fontSize: '0.65rem', alignItems: 'center', fontWeight: '700', marginLeft: '4px' }}>
                                <span style={{ display: 'inline-block', width: '9px', height: '9px', borderRadius: '3px', backgroundColor: '#ECFDF5', border: '1px solid #0D7A57' }}></span> Ocupada
                                <span style={{ display: 'inline-block', width: '9px', height: '9px', borderRadius: '3px', backgroundColor: '#FAFAFA', border: '1px dashed #CBD5E1', marginLeft: '3px' }}></span> Libre
                            </div>
                        </div>
                    </div>

                    {/* Grilla 150 Casillas (10 columnas fijas con minmax(0, 1fr) anti-desbordamiento) */}
                    <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(10, minmax(0, 1fr))', 
                        gap: '4px',
                        width: '100%',
                        minWidth: 0
                    }}>
                        {grid150.map(slot => {
                            const isOccupied = slot.occupiedBy !== null;
                            const matchesSearch = searchTerm.trim() !== '' && (
                                slot.slotNum.toString() === searchTerm.trim().replace('#', '').toLowerCase() ||
                                (slot.occupiedBy && (
                                    slot.occupiedBy.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                    (slot.occupiedBy.shippingAddress && slot.occupiedBy.shippingAddress.toLowerCase().includes(searchTerm.toLowerCase()))
                                ))
                            );
                            const isDimmed = searchTerm.trim() !== '' && !matchesSearch;

                            return (
                                <div
                                    key={slot.slotNum}
                                    onMouseEnter={(e) => {
                                        setHoveredSlot(slot);
                                        setTooltipPos({ x: e.clientX, y: e.clientY });
                                    }}
                                    onMouseMove={(e) => {
                                        setTooltipPos({ x: e.clientX, y: e.clientY });
                                    }}
                                    onMouseLeave={() => {
                                        setHoveredSlot(null);
                                        setTooltipPos(null);
                                    }}
                                    style={{
                                        border: matchesSearch 
                                            ? '2px solid #0D7A57' 
                                            : isOccupied 
                                            ? '1.5px solid #0D7A57' 
                                            : '1px dashed #CBD5E1',
                                        backgroundColor: matchesSearch
                                            ? '#DCFCE7'
                                            : isOccupied 
                                            ? '#F0FDF4' 
                                            : '#FAFAFA',
                                        borderRadius: '5px',
                                        padding: '3px 4px',
                                        minHeight: '38px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'space-between',
                                        transition: 'all 0.12s ease',
                                        cursor: isOccupied ? 'pointer' : 'default',
                                        boxShadow: matchesSearch
                                            ? '0 0 8px rgba(13, 122, 87, 0.45)'
                                            : isOccupied 
                                            ? '0 1px 2px rgba(13, 122, 87, 0.10)' 
                                            : 'none',
                                        minWidth: 0,
                                        width: '100%',
                                        overflow: 'hidden',
                                        boxSizing: 'border-box',
                                        opacity: isDimmed ? 0.3 : 1,
                                        transform: matchesSearch ? 'scale(1.04)' : 'none',
                                        zIndex: matchesSearch ? 3 : 1
                                    }}
                                >
                                    <div style={{ 
                                        display: 'flex', 
                                        justifyContent: 'space-between', 
                                        alignItems: 'center', 
                                        fontSize: '0.58rem', 
                                        fontWeight: 900, 
                                        color: isOccupied ? '#0D7A57' : '#94A3B8',
                                        minWidth: 0,
                                        width: '100%'
                                    }}>
                                        <span style={{ fontFamily: 'monospace', letterSpacing: '-0.02em' }}>
                                            #{String(slot.slotNum).padStart(2, '0')}
                                        </span>
                                        {isOccupied && (
                                            <span style={{ 
                                                fontSize: '0.48rem', 
                                                backgroundColor: '#0D7A57', 
                                                color: '#FFF', 
                                                padding: '1px 3px', 
                                                borderRadius: '3px', 
                                                fontWeight: 800,
                                                whiteSpace: 'nowrap',
                                                flexShrink: 0
                                            }}>
                                                {slot.occupiedBy.crates}c
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ 
                                        fontSize: '0.52rem', 
                                        fontWeight: 800, 
                                        color: isOccupied ? THEME.colors.textMain : '#CBD5E1', 
                                        overflow: 'hidden', 
                                        textOverflow: 'ellipsis', 
                                        whiteSpace: 'nowrap', 
                                        lineHeight: 1.1,
                                        minWidth: 0,
                                        width: '100%'
                                    }}>
                                        {isOccupied ? slot.occupiedBy.customerName : 'Libre'}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Lista Editable de Clientes y Espacios (Oculta en modo 100% Plano) */}
                {!isFullMapMode && (
                    <div style={{ 
                        backgroundColor: THEME.colors.surface, 
                        padding: '1.25rem', 
                        borderRadius: THEME.radius.xl, 
                        border: `1px solid ${THEME.colors.border}`, 
                        boxShadow: THEME.shadow.sm,
                        minWidth: 0,
                        width: '100%',
                        boxSizing: 'border-box'
                    }}>
                        <div style={{ marginBottom: '0.85rem', borderBottom: `1px solid ${THEME.colors.border}`, paddingBottom: '0.65rem' }}>
                            <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 900, color: THEME.colors.textMain }}>
                                Relación &amp; Modificación Manual
                            </h3>
                            <span style={{ fontSize: '0.68rem', color: THEME.colors.textSecondary, fontWeight: '500' }}>
                                Digita el espacio de cada cliente (ej. "21" o "4-5" para cuentas con múltiples bahías).
                            </span>
                        </div>

                        <div style={{ maxHeight: '680px', overflowY: 'auto', paddingRight: '4px' }}>
                            {preparedOrders.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: THEME.colors.textSecondary, fontSize: '0.8rem' }}>
                                    No hay pedidos registrados para esta fecha de entrega.
                                </div>
                            ) : (
                                preparedOrders.map(order => {
                                    const assigned = manualSpacesMap[order.id] || [];
                                    const { crates, spaces } = calculateCratesAndSpaces(order.total_weight_kg, avgKgPerCrate, spaceCapacity);
                                    const label = formatSpaceLabel(assigned);

                                    return (
                                        <div
                                            key={order.id}
                                            style={{
                                                border: `1px solid ${THEME.colors.border}`,
                                                backgroundColor: THEME.colors.background,
                                                borderRadius: THEME.radius.md,
                                                padding: '8px 10px',
                                                marginBottom: '6px',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                gap: '8px'
                                            }}
                                        >
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '0.74rem', fontWeight: 800, color: THEME.colors.textMain, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {order.company_name}
                                                </div>
                                                <div style={{ fontSize: '0.62rem', color: THEME.colors.textSecondary, display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
                                                    <span><strong>{Math.round(order.total_weight_kg)} kg</strong></span>
                                                    <span>&bull;</span>
                                                    <span>{crates} canastillas</span>
                                                    <span>&bull;</span>
                                                    <span style={{ color: spaces > 1 ? '#D97706' : THEME.colors.textSecondary, fontWeight: spaces > 1 ? 800 : 600 }}>
                                                        {spaces} {spaces > 1 ? 'bahías' : 'bahía'}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Input de Edición Manual */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                <span style={{ fontSize: '0.60rem', fontWeight: 900, color: THEME.colors.textSecondary, textTransform: 'uppercase' }}>ESP:</span>
                                                <input
                                                    type="text"
                                                    disabled={readOnly}
                                                    value={label === 'S/A' ? '' : label}
                                                    placeholder="Ej: 4-5"
                                                    onChange={e => handleManualSpaceChange(order.id, e.target.value)}
                                                    style={{
                                                        width: '58px',
                                                        padding: '3px 5px',
                                                        fontSize: '0.78rem',
                                                        fontWeight: 900,
                                                        textAlign: 'center',
                                                        borderRadius: '6px',
                                                        border: `1.5px solid ${THEME.colors.borderActive}`,
                                                        backgroundColor: readOnly ? '#F1F5F9' : '#FFFFFF',
                                                        color: THEME.colors.primary
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}

            </div>

            {/* Micro-Tarjeta Flotante de Alta Definición (Tooltip Industrial para las 150 Bahías) */}
            {hoveredSlot && tooltipPos && (
                <div 
                    style={{
                        position: 'fixed',
                        left: Math.min(Math.max(12, tooltipPos.x + 16), typeof window !== 'undefined' ? window.innerWidth - 310 : 800),
                        top: Math.min(Math.max(12, tooltipPos.y - 30), typeof window !== 'undefined' ? window.innerHeight - 250 : 600),
                        zIndex: 99999,
                        pointerEvents: 'none',
                        backgroundColor: '#FFFFFF',
                        borderRadius: '12px',
                        boxShadow: '0 16px 36px -4px rgba(15, 23, 42, 0.22), 0 0 0 1px rgba(15, 23, 42, 0.08)',
                        padding: '12px 14px',
                        width: '280px',
                        maxWidth: '90vw',
                        fontFamily: THEME.typography?.fontFamilyMain || 'sans-serif'
                    }}
                >
                    {/* Encabezado del Tooltip */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', paddingBottom: '6px', borderBottom: `1px solid ${THEME.colors.border}` }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '0.86rem', fontWeight: 900, color: THEME.colors.primary, fontFamily: 'monospace' }}>
                                BAHÍA #{String(hoveredSlot.slotNum).padStart(2, '0')}
                            </span>
                        </div>
                        <span style={{
                            fontSize: '0.62rem',
                            fontWeight: 800,
                            padding: '2px 7px',
                            borderRadius: '4px',
                            backgroundColor: hoveredSlot.occupiedBy ? '#ECFDF5' : '#F1F5F9',
                            color: hoveredSlot.occupiedBy ? '#065F46' : '#64748B',
                            border: `1px solid ${hoveredSlot.occupiedBy ? '#A7F3D0' : '#E2E8F0'}`
                        }}>
                            {hoveredSlot.occupiedBy ? '🟢 ASIGNADA' : '⚪ LIBRE'}
                        </span>
                    </div>

                    {hoveredSlot.occupiedBy ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div>
                                <div style={{ fontSize: '0.60rem', fontWeight: 800, color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    Cliente Asignado
                                </div>
                                <div style={{ fontSize: '0.80rem', fontWeight: 900, color: THEME.colors.textMain, lineHeight: 1.25, marginTop: '2px' }}>
                                    {hoveredSlot.occupiedBy.customerName}
                                </div>
                                {hoveredSlot.occupiedBy.sequenceId && (
                                    <div style={{ fontSize: '0.65rem', color: THEME.colors.primary, fontWeight: 700, marginTop: '1px' }}>
                                        Pedido #{hoveredSlot.occupiedBy.sequenceId}
                                    </div>
                                )}
                            </div>

                            {hoveredSlot.occupiedBy.shippingAddress && (
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '5px', marginTop: '2px' }}>
                                    <MapPin size={12} color={THEME.colors.textSecondary} style={{ marginTop: '2px', flexShrink: 0 }} />
                                    <span style={{ fontSize: '0.68rem', color: THEME.colors.textSecondary, lineHeight: 1.25 }}>
                                        {hoveredSlot.occupiedBy.shippingAddress}
                                    </span>
                                </div>
                            )}

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '4px', backgroundColor: THEME.colors.background, padding: '6px 8px', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}` }}>
                                <div>
                                    <div style={{ fontSize: '0.56rem', fontWeight: 800, color: THEME.colors.textSecondary, textTransform: 'uppercase' }}>Carga Total</div>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 900, color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '4px', marginTop: '1px' }}>
                                        <Scale size={11} color={THEME.colors.primary} /> {Math.round(hoveredSlot.occupiedBy.totalKg)} kg
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.56rem', fontWeight: 800, color: THEME.colors.textSecondary, textTransform: 'uppercase' }}>Canastillas</div>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 900, color: '#D97706', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '1px' }}>
                                        <Package size={11} color="#D97706" /> {hoveredSlot.occupiedBy.crates} und
                                    </div>
                                </div>
                            </div>

                            {hoveredSlot.occupiedBy.assignedSlots && hoveredSlot.occupiedBy.assignedSlots.length > 1 && (
                                <div style={{ fontSize: '0.65rem', color: '#065F46', backgroundColor: '#ECFDF5', padding: '4px 6px', borderRadius: '4px', fontWeight: 700, marginTop: '2px', border: '1px solid #A7F3D0' }}>
                                    Bahías asignadas: {hoveredSlot.occupiedBy.assignedSlots.map((s: number) => `#${s}`).join(', ')} ({hoveredSlot.occupiedBy.spacesCount} requeridas)
                                </div>
                            )}
                        </div>
                    ) : (
                        <div style={{ fontSize: '0.72rem', color: THEME.colors.textSecondary, lineHeight: 1.4 }}>
                            Espacio libre en suelo disponible para tránsito, alistamiento nocturno o contingencia.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
