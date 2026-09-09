'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { 
    OrderStagingInput, 
    StagingAllocationResult, 
    allocateStagingSpacesGeographically,
    calculateCratesAndSpaces,
    formatSpaceLabel
} from '@/lib/stagingSpaceAllocator';
import { 
    Grid, 
    Layers, 
    MapPin, 
    Save, 
    Printer, 
    Sparkles, 
    RefreshCw, 
    CheckCircle2, 
    Building2, 
    Package, 
    Scale, 
    Sliders,
    ArrowRight,
    Calendar
} from 'lucide-react';
import Link from 'next/link';

export default function StagingSpacesManagementPage() {
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    // Parámetros Logísticos
    const [spaceCapacity, setSpaceCapacity] = useState<number>(36);
    const [avgKgPerCrate, setAvgKgPerCrate] = useState<number>(12.52);
    const [selectedDate, setSelectedDate] = useState<string>(() => {
        const now = new Date();
        return now.toISOString().split('T')[0];
    });

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
                const unitWeight = Number(it.products?.weight_kg) || 1; // default 1 kg if not specified
                return sum + (qty * unitWeight);
            }, 0);

            return {
                id: o.id,
                sequence_id: o.sequence_id,
                client_id: o.profiles?.id,
                company_name: o.profiles?.company_name || 'Cliente sin nombre',
                shipping_address: o.shipping_address || o.profiles?.address || '',
                total_weight_kg: totalKg > 0 ? totalKg : 15, // fallback 15 kg
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
        const newMap: Record<string, number[]> = {};
        autoAllocation.forEach(a => {
            newMap[a.order_id] = a.assigned_spaces;
        });
        setManualSpacesMap(newMap);
        setSaveSuccess(false);
    };

    // Cambiar manualmente el espacio de una orden
    const handleManualSpaceChange = (orderId: string, valueStr: string) => {
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
        // Mapeo: slotNumber -> { orderId, customerName, totalKg, crates, zoneName }
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
                        totalKg: o.total_weight_kg,
                        crates,
                        spacesCount: spaces,
                        assignedCount: assigned.length
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
            <div style={{ padding: '3rem', textAlign: 'center', backgroundColor: '#F8FAFC', minHeight: '100vh' }}>
                <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 1rem', color: '#0D7A57' }} />
                <h3 style={{ color: '#0F172A', fontWeight: 800 }}>Cargando Centro de Mando de Bahías...</h3>
            </div>
        );
    }

    return (
        <div style={{ backgroundColor: '#F1F5F9', minHeight: '100vh', padding: '1.5rem 2rem 4rem', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
            
            {/* Header Superior con Storytelling Operativo */}
            <div style={{ backgroundColor: '#FFFFFF', padding: '1.5rem 2rem', borderRadius: '12px', border: '1px solid #CBD5E1', boxShadow: '0 4px 15px rgba(0,0,0,0.04)', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                            <div style={{ backgroundColor: '#ECFDF5', padding: '6px', borderRadius: '8px', color: '#0D7A57' }}>
                                <Grid size={22} />
                            </div>
                            <h1 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em' }}>
                                Centro de Mando de Muelle & Bahías en Suelo (1 a 150)
                            </h1>
                        </div>
                        <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748B' }}>
                            Asignación física para el alistamiento nocturno (3:00 AM) con clusterización geográfica y cálculo de cubicaje LIFO.
                        </p>
                    </div>

                    {/* Botonera de Acción */}
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            backgroundColor: '#F8FAFC',
                            border: '1px solid #CBD5E1',
                            borderRadius: '8px',
                            padding: '6px 12px'
                        }}>
                            <Calendar size={15} color="#64748B" />
                            <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#475569' }}>Fecha:</span>
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    fontSize: '0.82rem',
                                    fontWeight: '700',
                                    color: '#0F172A',
                                    outline: 'none'
                                }}
                            />
                        </div>

                        <button
                            onClick={handleApplyAutoClustering}
                            style={{
                                backgroundColor: '#F8FAFC',
                                color: '#0F172A',
                                border: '1.5px solid #0F172A',
                                padding: '0.65rem 1.1rem',
                                borderRadius: '8px',
                                fontWeight: 700,
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}
                        >
                            <Sparkles size={16} color="#D97706" /> Auto-Clúster Geográfico
                        </button>

                        <button
                            onClick={handleSaveToDatabase}
                            disabled={saving}
                            style={{
                                backgroundColor: saveSuccess ? '#059669' : '#0D7A57',
                                color: '#FFFFFF',
                                border: 'none',
                                padding: '0.65rem 1.3rem',
                                borderRadius: '8px',
                                fontWeight: 800,
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                boxShadow: '0 4px 12px rgba(13, 122, 87, 0.25)',
                                transition: 'all 0.2s'
                            }}
                        >
                            {saveSuccess ? <CheckCircle2 size={16} /> : <Save size={16} />}
                            {saving ? 'Guardando...' : saveSuccess ? '¡Espacios Guardados!' : 'Guardar en Base de Datos'}
                        </button>

                        <Link
                            href="/admin/orders/alistamiento-print"
                            style={{
                                backgroundColor: '#0F172A',
                                color: '#FFFFFF',
                                textDecoration: 'none',
                                padding: '0.65rem 1.2rem',
                                borderRadius: '8px',
                                fontWeight: 700,
                                fontSize: '0.82rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}
                        >
                            <Printer size={16} /> Sábana de Alistamiento
                        </Link>
                    </div>
                </div>

                {/* Micro-Tira de Métricas y Parámetros */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid #E2E8F0' }}>
                    <div style={{ backgroundColor: '#F8FAFC', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Pedidos a Alistar</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0F172A' }}>{stats.totalOrders}</div>
                    </div>
                    <div style={{ backgroundColor: '#F8FAFC', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Kilos Totales</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0F172A' }}>{stats.totalKg.toLocaleString()} kg</div>
                    </div>
                    <div style={{ backgroundColor: '#F8FAFC', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Canastillas Estimadas</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0D7A57' }}>{stats.totalCrates} und</div>
                    </div>
                    <div style={{ backgroundColor: '#F8FAFC', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Espacios Ocupados</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 900, color: stats.occupiedSlotsCount > 150 ? '#DC2626' : '#0F172A' }}>
                            {stats.occupiedSlotsCount} / 150
                        </div>
                    </div>
                    {/* Parámetros Editables */}
                    <div style={{ backgroundColor: '#F8FAFC', padding: '8px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.65rem', fontWeight: 700, color: '#475569' }}>
                            <span>Cubicaje/Espacio:</span>
                            <input 
                                type="number" 
                                value={spaceCapacity} 
                                onChange={e => setSpaceCapacity(parseFloat(e.target.value) || 36)}
                                style={{ width: '45px', padding: '2px 4px', fontSize: '0.75rem', fontWeight: 800, textAlign: 'center', borderRadius: '4px', border: '1px solid #CBD5E1' }}
                            /> can.
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.65rem', fontWeight: 700, color: '#475569', marginTop: '4px' }}>
                            <span>Kg/Canastilla:</span>
                            <input 
                                type="number" 
                                step="0.1"
                                value={avgKgPerCrate} 
                                onChange={e => setAvgKgPerCrate(parseFloat(e.target.value) || 12.52)}
                                style={{ width: '45px', padding: '2px 4px', fontSize: '0.75rem', fontWeight: 800, textAlign: 'center', borderRadius: '4px', border: '1px solid #CBD5E1' }}
                            /> kg
                        </div>
                    </div>
                </div>
            </div>

            {/* Layout Principal: Dos Columnas (Grilla 150 a la izquierda, Lista editable a la derecha) */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.1fr', gap: '1.5rem', alignItems: 'start' }}>
                
                {/* Cuadrícula Visual de la Nave de Bodega (1 a 150) */}
                <div style={{ backgroundColor: '#FFFFFF', padding: '1.5rem', borderRadius: '12px', border: '1px solid #CBD5E1', boxShadow: '0 4px 15px rgba(0,0,0,0.04)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.75rem' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0F172A' }}>
                                Distribución Física en Planta (Bahías 1 a 150)
                            </h3>
                            <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                Verde: Asignado &bull; Gris: Espacio libre para tránsito o contingencia
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', fontSize: '0.70rem', alignItems: 'center' }}>
                            <span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '3px', backgroundColor: '#ECFDF5', border: '1px solid #0D7A57' }}></span> Ocupado
                            <span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '3px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', marginLeft: '6px' }}></span> Libre
                        </div>
                    </div>

                    {/* Grilla 150 Casillas */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '6px' }}>
                        {grid150.map(slot => {
                            const isOccupied = slot.occupiedBy !== null;
                            return (
                                <div
                                    key={slot.slotNum}
                                    style={{
                                        border: isOccupied ? '1.5px solid #0D7A57' : '1px dashed #CBD5E1',
                                        backgroundColor: isOccupied ? '#F0FDF4' : '#FAFAFA',
                                        borderRadius: '6px',
                                        padding: '4px',
                                        minHeight: '48px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'space-between',
                                        transition: 'transform 0.1s ease',
                                        cursor: isOccupied ? 'pointer' : 'default'
                                    }}
                                    title={isOccupied ? `Espacio ${slot.slotNum}: ${slot.occupiedBy.customerName} (${slot.occupiedBy.totalKg} kg)` : `Espacio ${slot.slotNum} Libre`}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.62rem', fontWeight: 900, color: isOccupied ? '#0D7A57' : '#94A3B8' }}>
                                        <span>#{String(slot.slotNum).padStart(2, '0')}</span>
                                        {isOccupied && (
                                            <span style={{ fontSize: '0.50rem', backgroundColor: '#0D7A57', color: '#FFF', padding: '1px 3px', borderRadius: '2px' }}>
                                                {slot.occupiedBy.crates}c
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '0.55rem', fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.1 }}>
                                        {isOccupied ? slot.occupiedBy.customerName : ''}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Lista Editable de Clientes y Espacios */}
                <div style={{ backgroundColor: '#FFFFFF', padding: '1.5rem', borderRadius: '12px', border: '1px solid #CBD5E1', boxShadow: '0 4px 15px rgba(0,0,0,0.04)' }}>
                    <div style={{ marginBottom: '1rem', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.75rem' }}>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0F172A' }}>
                            Relación y Modificación Manual
                        </h3>
                        <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                            Escribe o cambia el espacio de cada cliente (ej. "21" o "4-5" para cuentas grandes).
                        </span>
                    </div>

                    <div style={{ maxHeight: '720px', overflowY: 'auto', paddingRight: '4px' }}>
                        {preparedOrders.map(order => {
                            const assigned = manualSpacesMap[order.id] || [];
                            const { crates, spaces } = calculateCratesAndSpaces(order.total_weight_kg, avgKgPerCrate, spaceCapacity);
                            const label = formatSpaceLabel(assigned);

                            return (
                                <div
                                    key={order.id}
                                    style={{
                                        border: '1px solid #E2E8F0',
                                        backgroundColor: '#F8FAFC',
                                        borderRadius: '8px',
                                        padding: '10px 12px',
                                        marginBottom: '8px',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        gap: '10px'
                                    }}
                                >
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {order.company_name}
                                        </div>
                                        <div style={{ fontSize: '0.64rem', color: '#64748B', display: 'flex', gap: '8px', alignItems: 'center', marginTop: '2px' }}>
                                            <span><strong>{Math.round(order.total_weight_kg)} kg</strong></span>
                                            <span>&bull;</span>
                                            <span>{crates} canastillas</span>
                                            <span>&bull;</span>
                                            <span style={{ color: spaces > 1 ? '#D97706' : '#64748B', fontWeight: spaces > 1 ? 800 : 500 }}>
                                                {spaces} {spaces > 1 ? 'espacios' : 'espacio'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Input de Edición Manual */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>ESP:</span>
                                        <input
                                            type="text"
                                            value={label === 'S/A' ? '' : label}
                                            placeholder="Ej: 4-5"
                                            onChange={e => handleManualSpaceChange(order.id, e.target.value)}
                                            style={{
                                                width: '65px',
                                                padding: '4px 6px',
                                                fontSize: '0.82rem',
                                                fontWeight: 900,
                                                textAlign: 'center',
                                                borderRadius: '6px',
                                                border: '1.5px solid #0F172A',
                                                backgroundColor: '#FFFFFF',
                                                color: '#0D7A57'
                                            }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

            </div>
        </div>
    );
}
