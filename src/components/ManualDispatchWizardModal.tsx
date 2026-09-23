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
    Printer, 
    Sparkles, 
    Save, 
    CheckCircle2, 
    RefreshCw, 
    ExternalLink, 
    FileText, 
    Truck, 
    Tag, 
    ShieldAlert, 
    ArrowRight, 
    ArrowLeft, 
    X,
    Layers,
    Download
} from 'lucide-react';
import { THEME } from '@/lib/adminTheme';
import Link from 'next/link';
import * as XLSX from 'xlsx';

interface ManualDispatchWizardModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedOrderIds: Set<string>;
    orders: any[];
    deliveryDate: string;
    onSuccess: () => void;
}

export default function ManualDispatchWizardModal({
    isOpen,
    onClose,
    selectedOrderIds,
    orders,
    deliveryDate,
    onSuccess
}: ManualDispatchWizardModalProps) {
    const [currentStep, setCurrentStep] = useState<number>(1);
    const [loading, setLoading] = useState<boolean>(false);
    const [savingSpaces, setSavingSpaces] = useState<boolean>(false);
    const [spacesSavedSuccess, setSpacesSavedSuccess] = useState<boolean>(false);
    const [finalizingLoading, setFinalizingLoading] = useState<boolean>(false);

    // Checklist de Conformidad por Bloque
    const [step1Confirmed, setStep1Confirmed] = useState<boolean>(false);
    const [step2Confirmed, setStep2Confirmed] = useState<boolean>(false);
    const [step3Confirmed, setStep3Confirmed] = useState<boolean>(false);
    const [step4Confirmed, setStep4Confirmed] = useState<boolean>(false);

    // Mapeo local de bahías: { [orderId]: number[] }
    const [manualSpacesMap, setManualSpacesMap] = useState<Record<string, number[]>>({});
    
    // Toggle para previsualizar la cuadrícula de 150 bahías en el paso 1
    const [showFloorGridPreview, setShowFloorGridPreview] = useState<boolean>(false);

    // Filtrar los pedidos seleccionados
    const selectedOrdersList = useMemo(() => {
        return orders.filter(o => selectedOrderIds.has(o.id));
    }, [orders, selectedOrderIds]);

    // Inicializar mapa de bahías a partir de las órdenes recibidas
    useEffect(() => {
        if (!isOpen) return;
        const initialMap: Record<string, number[]> = {};
        let ordersWithSpaces = 0;
        selectedOrdersList.forEach(o => {
            if (Array.isArray(o.warehouse_spaces) && o.warehouse_spaces.length > 0) {
                initialMap[o.id] = o.warehouse_spaces;
                ordersWithSpaces++;
            }
        });

        // Poka-Yoke: si las órdenes seleccionadas no tienen bahías en DB, calcularlas automáticamente
        if (ordersWithSpaces === 0 && selectedOrdersList.length > 0) {
            const rawInputs: OrderStagingInput[] = selectedOrdersList.map(o => {
                const totalKg = Number(o.total_weight_kg) || 
                    (o.order_items || []).reduce((sum: number, it: any) => sum + (Number(it.quantity) || 0) * (Number(it.products?.weight_kg) || 1), 0);
                return {
                    id: o.id,
                    sequence_id: o.sequence_id,
                    client_id: o.profile_id || o.profiles?.id,
                    customer_name: o.customer_name || o.profiles?.contact_name,
                    company_name: o.profiles?.company_name || o.customer_name || 'Cliente sin nombre',
                    shipping_address: o.shipping_address || o.profiles?.address || '',
                    neighborhood: o.profiles?.neighborhood || '',
                    delivery_slot: o.delivery_slot || '',
                    manual_delivery_time: o.manual_delivery_time || '',
                    is_manual_delivery: o.is_manual_delivery || false,
                    total_weight_kg: totalKg > 0 ? totalKg : 15,
                    existing_spaces: []
                };
            });
            const autoAssigned = allocateStagingSpacesGeographically(rawInputs, {
                avg_kg_per_crate: 12.5,
                space_capacity: 36,
                max_spaces: 150
            });
            autoAssigned.forEach(a => {
                initialMap[a.order_id] = a.assigned_spaces;
            });
        }

        setManualSpacesMap(initialMap);
    }, [isOpen, selectedOrdersList]);

    // Enriquecer pedidos para el algoritmo de asignación
    const preparedOrders: OrderStagingInput[] = useMemo(() => {
        return selectedOrdersList.map(o => {
            const totalKg = Number(o.total_weight_kg) || 
                (o.order_items || []).reduce((sum: number, it: any) => sum + (Number(it.quantity) || 0) * (Number(it.products?.weight_kg) || 1), 0);
            
            return {
                id: o.id,
                sequence_id: o.sequence_id,
                client_id: o.profile_id || o.profiles?.id,
                customer_name: o.customer_name || o.profiles?.contact_name,
                company_name: o.profiles?.company_name || o.customer_name || 'Cliente sin nombre',
                shipping_address: o.shipping_address || o.profiles?.address || '',
                neighborhood: o.profiles?.neighborhood || '',
                delivery_slot: o.delivery_slot || '',
                manual_delivery_time: o.manual_delivery_time || '',
                is_manual_delivery: o.is_manual_delivery || false,
                total_weight_kg: totalKg > 0 ? totalKg : 15,
                existing_spaces: manualSpacesMap[o.id] || o.warehouse_spaces || []
            };
        });
    }, [selectedOrdersList, manualSpacesMap]);

    // Asignación calculada automática
    const autoAllocations = useMemo(() => {
        return allocateStagingSpacesGeographically(preparedOrders, {
            avg_kg_per_crate: 12.5,
            space_capacity: 36,
            max_spaces: 150
        });
    }, [preparedOrders]);

    // Aplicar asignación automática
    const handleApplyAutoClustering = () => {
        const newMap: Record<string, number[]> = {};
        autoAllocations.forEach(a => {
            newMap[a.order_id] = a.assigned_spaces;
        });
        setManualSpacesMap(newMap);
        setSpacesSavedSuccess(false);
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
        setSpacesSavedSuccess(false);
    };

    // Guardar asignación en base de datos
    const handleSaveSpacesToDatabase = async () => {
        setSavingSpaces(true);
        setSpacesSavedSuccess(false);
        try {
            const updates = Object.entries(manualSpacesMap).map(([orderId, spaces]) => {
                return supabase
                    .from('orders')
                    .update({ warehouse_spaces: spaces })
                    .eq('id', orderId);
            });

            const results = await Promise.all(updates);
            const failed = results.find(r => r.error);
            if (failed?.error) throw failed.error;

            // Mantener coherencia en el objeto de órdenes en memoria
            selectedOrdersList.forEach(o => {
                if (manualSpacesMap[o.id]) {
                    o.warehouse_spaces = manualSpacesMap[o.id];
                }
            });

            setSpacesSavedSuccess(true);
            setTimeout(() => setSpacesSavedSuccess(false), 5000);
        } catch (err: any) {
            console.error('Error guardando bahías de muelle:', err);
            alert(`Error al guardar bahías: ${err?.message || 'Error desconocido'}`);
        } finally {
            setSavingSpaces(false);
        }
    };

    // Refrescar bahías desde la base de datos (por si se editaron en la pestaña de muelle)
    const handleRefreshSpacesFromDB = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('orders')
                .select('id, warehouse_spaces')
                .in('id', Array.from(selectedOrderIds));
            
            if (error) throw error;
            const freshMap: Record<string, number[]> = {};
            (data || []).forEach(o => {
                if (Array.isArray(o.warehouse_spaces) && o.warehouse_spaces.length > 0) {
                    freshMap[o.id] = o.warehouse_spaces;
                }
            });
            setManualSpacesMap(freshMap);
            setSpacesSavedSuccess(true);
            setTimeout(() => setSpacesSavedSuccess(false), 2000);
        } catch (err: any) {
            console.error('Error refrescando bahías:', err);
        } finally {
            setLoading(false);
        }
    };

    // Conteo de pedidos con bahía guardada / asignada
    const assignedCount = useMemo(() => {
        return selectedOrdersList.filter(o => {
            const sp = manualSpacesMap[o.id];
            return Array.isArray(sp) && sp.length > 0;
        }).length;
    }, [selectedOrdersList, manualSpacesMap]);

    // Cuadrícula visual de las 150 bahías con desglose fraccionado
    const floorGrid150 = useMemo(() => {
        const slots: Record<number, any> = {};
        preparedOrders.forEach(o => {
            const spaces = manualSpacesMap[o.id] || [];
            const totalSpaces = spaces.length;
            const { crates, spaces: theoreticalSpaces } = calculateCratesAndSpaces(o.total_weight_kg, 12.5, 36);
            spaces.forEach((slot, idx) => {
                if (slot >= 1 && slot <= 150) {
                    const slotCrates = totalSpaces > 1 ? Math.max(1, Math.round(crates / totalSpaces)) : crates;
                    slots[slot] = {
                        customerName: o.company_name,
                        totalKg: o.total_weight_kg,
                        crates,
                        slotCrates,
                        slotIndex: idx,
                        totalSpaces,
                        theoreticalSpaces
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
    }, [preparedOrders, manualSpacesMap]);

    // Lanzamiento final a Proceso Logístico (status = para_compra)
    const handleFinalizeLaunch = async () => {
        setFinalizingLoading(true);
        try {
            const { error } = await supabase
                .from('orders')
                .update({ status: 'para_compra' })
                .in('id', Array.from(selectedOrderIds));

            if (error) throw error;

            alert('✅ Tanda sellada y enviada a Proceso Logístico con éxito (status: PARA COMPRA).');
            onSuccess();
            onClose();
        } catch (err: any) {
            console.error('Error al finalizar tanda:', err);
            alert(`❌ Error al sellar tanda: ${err?.message || 'Error desconocido'}`);
        } finally {
            setFinalizingLoading(false);
        }
    };

    // Formateador de fecha larga en español para la cabecera A1 del Excel
    const formatSpanishLongDate = (dateStr?: string) => {
        if (!dateStr) {
            const now = new Date();
            return `${now.getDate()} de ${now.toLocaleDateString('es-CO', { month: 'long' })} de ${now.getFullYear()}`;
        }
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            const [y, m, d] = parts;
            const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
            const monthName = dateObj.toLocaleDateString('es-CO', { month: 'long' });
            return `${Number(d)} de ${monthName} de ${y}`;
        }
        return dateStr;
    };

    // Generador oficial del Excel Maestro de Compras (11 Columnas) idéntico a compras_YYYY-MM-DD.xlsx
    const handleExportMasterPurchasesExcel = async () => {
        try {
            // Recopilar y consolidar productos de todos los pedidos seleccionados
            const productMap = new Map<string, {
                inventory: number | string;
                obsInventory: string;
                accountingId: number | string;
                productName: string;
                purchaseType: string;
                group: string;
                kg: number;
                un: number;
                observations: Set<string>;
                detail: string;
                operationMark: string;
            }>();

            selectedOrdersList.forEach(order => {
                (order.order_items || []).forEach((item: any) => {
                    const prod = item.products || {};
                    const name = prod.name || item.nickname || 'Producto Sin Nombre';
                    const accountingId = prod.accounting_id || '';
                    const key = accountingId ? `ID_${accountingId}` : `NAME_${name.toLowerCase().trim()}`;

                    const purchaseType = prod.purchase_sublist || 'Generales';
                    const group = (prod.category || prod.inventory_group || 'HORTALIZA SELECCIONADA').toUpperCase();
                    const unit = (item.unit || prod.unit_of_measure || 'Kg').toLowerCase();
                    const qty = Number(item.quantity || 0);

                    if (!productMap.has(key)) {
                        productMap.set(key, {
                            inventory: '',
                            obsInventory: '',
                            accountingId: accountingId || '',
                            productName: name,
                            purchaseType: purchaseType,
                            group: group,
                            kg: 0,
                            un: 0,
                            observations: new Set<string>(),
                            detail: '',
                            operationMark: ''
                        });
                    }

                    const rec = productMap.get(key)!;
                    if (unit.includes('kg') || unit.includes('kilo')) {
                        rec.kg += qty;
                    } else if (unit.includes('un') || unit.includes('und') || unit.includes('paq') || unit.includes('frasco') || unit.includes('bolsa') || unit.includes('bandeja')) {
                        rec.un += qty;
                    } else {
                        if (prod.weight_kg && prod.weight_kg > 0 && prod.weight_kg !== 1) {
                            rec.kg += qty * prod.weight_kg;
                        } else {
                            rec.kg += qty;
                        }
                    }

                    // Observaciones especiales de preparación o cliente
                    if (item.nickname && item.nickname !== name) {
                        rec.observations.add(item.nickname);
                    }
                    if (item.variant_label) {
                        rec.observations.add(item.variant_label);
                    }
                    if (item.notes) {
                        rec.observations.add(item.notes);
                    }
                });
            });

            // Ordenar por Tipo Compra, Grupo y Producto
            const sortedProducts = Array.from(productMap.values()).sort((a, b) => {
                if (a.purchaseType !== b.purchaseType) {
                    return a.purchaseType.localeCompare(b.purchaseType);
                }
                if (a.group !== b.group) {
                    return a.group.localeCompare(b.group);
                }
                return a.productName.localeCompare(b.productName);
            });

            // Ensamblar matriz de filas (11 columnas exactas)
            const dateFormatted = formatSpanishLongDate(deliveryDate);
            const rows: any[][] = [
                [`FECHA: ${dateFormatted}`],
                [],
                [
                    'Inventario',
                    'Obs. Inventario',
                    'ID Producto',
                    'Producto',
                    'Tipo Compra',
                    'Grupo',
                    'KG',
                    'UN',
                    'Observación',
                    'Detalle',
                    'Marca Operación'
                ]
            ];

            sortedProducts.forEach(p => {
                rows.push([
                    p.inventory,                                                    // 1. Inventario
                    p.obsInventory,                                                 // 2. Obs. Inventario
                    p.accountingId,                                                 // 3. ID Producto
                    p.productName,                                                  // 4. Producto
                    p.purchaseType,                                                 // 5. Tipo Compra
                    p.group,                                                        // 6. Grupo
                    p.kg > 0 ? Number(p.kg.toFixed(2)) : '',                        // 7. KG
                    p.un > 0 ? Number(p.un.toFixed(0)) : '',                        // 8. UN
                    Array.from(p.observations).join(' | '),                         // 9. Observación
                    p.detail,                                                       // 10. Detalle
                    p.operationMark                                                 // 11. Marca Operación
                ]);
            });

            // Generar libro con XLSX
            const ws = XLSX.utils.aoa_to_sheet(rows);

            // Anchos de columnas calibrados para visualización industrial
            ws['!cols'] = [
                { wch: 12 }, // Inventario
                { wch: 16 }, // Obs. Inventario
                { wch: 14 }, // ID Producto
                { wch: 34 }, // Producto
                { wch: 14 }, // Tipo Compra
                { wch: 26 }, // Grupo
                { wch: 12 }, // KG
                { wch: 10 }, // UN
                { wch: 28 }, // Observación
                { wch: 14 }, // Detalle
                { wch: 16 }  // Marca Operación
            ];

            const wb = XLSX.utils.book_new();
            const cleanDateStr = deliveryDate || new Date().toISOString().split('T')[0];
            const sheetName = `Compra_${cleanDateStr}`.substring(0, 31);
            XLSX.utils.book_append_sheet(wb, ws, sheetName);

            const fileName = `compras_${cleanDateStr}.xlsx`;
            XLSX.writeFile(wb, fileName);
        } catch (err: any) {
            console.error('Error generando Excel de compras:', err);
            alert(`Error al generar el archivo Excel: ${err?.message || 'Error desconocido'}`);
        }
    };

    if (!isOpen) return null;

    const orderIdsParam = Array.from(selectedOrderIds).join(',');

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 2200, backdropFilter: 'blur(8px)', padding: '1rem'
        }}>
            <div style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '24px',
                width: '96%',
                maxWidth: '1120px',
                maxHeight: '94vh',
                overflowY: 'auto',
                padding: '2rem 2.25rem',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3), 0 0 0 1px rgba(0,0,0,0.06)',
                display: 'flex', flexDirection: 'column', gap: '1.25rem',
                color: '#0F172A',
                position: 'relative',
                fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif'
            }}>

                {/* Header Superior con Insignia BCP */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', paddingBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: '54px', height: '54px', borderRadius: '16px',
                            backgroundColor: '#FEF3C7', border: '1.5px solid #FCD34D', color: '#B45309'
                        }}>
                            <ShieldAlert size={28} />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '900', color: '#0F172A', letterSpacing: '-0.02em' }}>
                                    Asistente Guiado de Despacho Manual (BCP)
                                </h2>
                                <span style={{ fontSize: '0.72rem', backgroundColor: '#FEF3C7', color: '#92400E', fontWeight: '900', padding: '2px 8px', borderRadius: '6px', border: '1px solid #FCD34D' }}>
                                    FLUJO POKA-YOKE
                                </span>
                            </div>
                            <p style={{ color: '#64748B', margin: '4px 0 0', fontSize: '0.84rem' }}>
                                Tanda Programada: <strong>{deliveryDate}</strong> &bull; <strong>{selectedOrderIds.size} Pedidos Seleccionados</strong> &bull; 4 Bloques Secuenciales Obligatorios
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        style={{ background: '#F1F5F9', border: 'none', borderRadius: '10px', padding: '8px', cursor: 'pointer', color: '#64748B' }}
                        title="Cerrar asistente"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Stepper Bar (Indicador de Progreso 4 Pasos) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                    {[
                        { num: 1, title: '1. Muelle & Bahías', subtitle: 'Distribución & Sábana', icon: Grid, confirmed: step1Confirmed },
                        { num: 2, title: '2. Compras & Recibo', subtitle: 'Corabastos e Ingreso', icon: FileText, confirmed: step2Confirmed },
                        { num: 3, title: '3. Remisiones Carta', subtitle: 'Duplicado Legal & Flota', icon: Truck, confirmed: step3Confirmed },
                        { num: 4, title: '4. Rótulos Térmicos', subtitle: 'Etiquetas & Lanzamiento', icon: Tag, confirmed: step4Confirmed }
                    ].map(step => {
                        const isActive = currentStep === step.num;
                        const isPast = currentStep > step.num;
                        return (
                            <div 
                                key={step.num}
                                onClick={() => {
                                    if (step.num <= currentStep || (step.num === currentStep + 1 && (step.num === 2 ? step1Confirmed : step.num === 3 ? step2Confirmed : step3Confirmed))) {
                                        setCurrentStep(step.num);
                                    }
                                }}
                                style={{
                                    padding: '10px 12px',
                                    borderRadius: '12px',
                                    border: `1.5px solid ${isActive ? '#0D7A57' : isPast ? '#A7F3D0' : '#E2E8F0'}`,
                                    backgroundColor: isActive ? '#F0FDF4' : isPast ? '#F8FAFC' : '#FAFAFA',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <div style={{
                                    width: '32px', height: '32px', borderRadius: '8px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    backgroundColor: isActive ? '#0D7A57' : isPast ? '#10B981' : '#E2E8F0',
                                    color: isActive || isPast ? '#FFFFFF' : '#64748B',
                                    fontWeight: '900', fontSize: '0.85rem'
                                }}>
                                    {isPast || step.confirmed ? <CheckCircle2 size={18} /> : step.num}
                                </div>
                                <div style={{ overflow: 'hidden' }}>
                                    <div style={{ fontSize: '0.78rem', fontWeight: '900', color: isActive ? '#0D7A57' : '#0F172A', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                                        {step.title}
                                    </div>
                                    <div style={{ fontSize: '0.68rem', color: '#64748B', whiteSpace: 'nowrap' }}>
                                        {step.subtitle}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* ========================================================================= */}
                {/* PASO 1: TOPOLOGÍA DE PLANTA & MUELLE (BAHÍAS 1 A 150)                      */}
                {/* ========================================================================= */}
                {currentStep === 1 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {/* Status Alert Banner */}
                        <div style={{
                            backgroundColor: assignedCount === selectedOrdersList.length ? '#F0FDF4' : '#FEF3C7',
                            border: `1.5px solid ${assignedCount === selectedOrdersList.length ? '#86EFAC' : '#FCD34D'}`,
                            borderRadius: '14px',
                            padding: '12px 16px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '10px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                {assignedCount === selectedOrdersList.length ? (
                                    <CheckCircle2 size={22} color="#16A34A" />
                                ) : (
                                    <Sparkles size={22} color="#D97706" />
                                )}
                                <div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: '900', color: assignedCount === selectedOrdersList.length ? '#166534' : '#92400E' }}>
                                        Estado de Bahías: {assignedCount} de {selectedOrdersList.length} pedidos con bahía asignada
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                        Cálculo contrastado con ventanas de entrega (LIFO) y cubicaje de canastillas (36 por bahía).
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                <button
                                    onClick={handleApplyAutoClustering}
                                    style={{
                                        padding: '7px 12px', borderRadius: '8px', border: '1px solid #CBD5E1',
                                        backgroundColor: '#FFFFFF', color: '#0F172A', fontWeight: '800',
                                        fontSize: '0.74rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px'
                                    }}
                                >
                                    <Sparkles size={13} color="#D97706" /> Auto-Asignar (LIFO + Clúster)
                                </button>

                                <Link
                                    href={`/admin/logistics/staging-spaces?date=${deliveryDate}`}
                                    target="_blank"
                                    style={{
                                        padding: '7px 12px', borderRadius: '8px', border: '1px solid #4F46E5',
                                        backgroundColor: '#EEF2FF', color: '#4338CA', fontWeight: '800',
                                        fontSize: '0.74rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px'
                                    }}
                                >
                                    <Grid size={13} /> Centro de Mando Completo <ExternalLink size={11} />
                                </Link>

                                <button
                                    onClick={() => setShowFloorGridPreview(!showFloorGridPreview)}
                                    style={{
                                        padding: '7px 12px', borderRadius: '8px', border: '1px solid #0284C7',
                                        backgroundColor: showFloorGridPreview ? '#0284C7' : '#F0F9FF',
                                        color: showFloorGridPreview ? '#FFFFFF' : '#0369A1', fontWeight: '800',
                                        fontSize: '0.74rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px'
                                    }}
                                >
                                    <Layers size={13} /> {showFloorGridPreview ? 'Ocultar Cuadrícula' : 'Ver Cuadrícula 150 Bahías'}
                                </button>

                                <button
                                    onClick={handleRefreshSpacesFromDB}
                                    style={{
                                        padding: '7px 10px', borderRadius: '8px', border: '1px solid #CBD5E1',
                                        backgroundColor: '#FFFFFF', color: '#475569', cursor: 'pointer'
                                    }}
                                    title="Refrescar desde base de datos"
                                >
                                    <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                                </button>

                                <button
                                    onClick={handleSaveSpacesToDatabase}
                                    disabled={savingSpaces}
                                    style={{
                                        padding: '7px 14px', borderRadius: '8px', border: 'none',
                                        backgroundColor: spacesSavedSuccess ? '#059669' : THEME.colors.primary,
                                        color: '#FFFFFF', fontWeight: '900', fontSize: '0.75rem',
                                        cursor: savingSpaces ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px',
                                        boxShadow: '0 2px 6px rgba(13, 122, 87, 0.3)'
                                    }}
                                >
                                    {spacesSavedSuccess ? <CheckCircle2 size={13} /> : <Save size={13} />}
                                    {savingSpaces ? 'Guardando...' : spacesSavedSuccess ? '¡Guardado!' : 'Guardar Bahías en BD'}
                                </button>
                            </div>
                        </div>

                        {/* Cuadrícula Visual Desplegable (Andon / Visual Factory) */}
                        {showFloorGridPreview && (
                            <div style={{ backgroundColor: '#F8FAFC', border: '1.5px solid #CBD5E1', borderRadius: '16px', padding: '1rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '0.76rem', fontWeight: '900', color: '#0F172A', textTransform: 'uppercase' }}>
                                        Plano Físico de Nave Central (Bahías 1 a 150)
                                    </span>
                                    <div style={{ display: 'flex', gap: '10px', fontSize: '0.68rem', fontWeight: '700' }}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                            <span style={{ width: '10px', height: '10px', backgroundColor: '#ECFDF5', border: '1px solid #0D7A57', borderRadius: '2px' }}></span> Asignado
                                        </span>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                            <span style={{ width: '10px', height: '10px', backgroundColor: '#FFFFFF', border: '1px dashed #CBD5E1', borderRadius: '2px' }}></span> Libre
                                        </span>
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(15, 1fr)', gap: '4px', maxHeight: '200px', overflowY: 'auto', padding: '4px' }}>
                                    {floorGrid150.map(slot => (
                                        <div
                                            key={slot.slotNum}
                                            title={slot.occupiedBy 
                                                ? `${slot.occupiedBy.customerName} (${slot.occupiedBy.totalSpaces > 1 ? `~${slot.occupiedBy.slotCrates}c [${slot.occupiedBy.slotIndex + 1}/${slot.occupiedBy.totalSpaces}]` : `${slot.occupiedBy.crates}c`} - ${Math.round(slot.occupiedBy.totalKg)} kg)` 
                                                : 'Bahía Libre'}
                                            style={{
                                                padding: '4px 2px',
                                                textAlign: 'center',
                                                borderRadius: '4px',
                                                border: slot.occupiedBy ? '1px solid #0D7A57' : '1px dashed #CBD5E1',
                                                backgroundColor: slot.occupiedBy ? '#ECFDF5' : '#FFFFFF',
                                                color: slot.occupiedBy ? '#065F46' : '#94A3B8',
                                                fontSize: '0.62rem',
                                                fontWeight: '800',
                                                minHeight: '28px',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                justifyContent: 'center',
                                                alignItems: 'center'
                                            }}
                                        >
                                            <div>{slot.slotNum}</div>
                                            {slot.occupiedBy && (
                                                <div style={{ fontSize: '0.48rem', fontWeight: 900, color: '#047857', whiteSpace: 'nowrap' }}>
                                                    {slot.occupiedBy.totalSpaces > 1 
                                                        ? `${slot.occupiedBy.slotCrates}c [${slot.occupiedBy.slotIndex + 1}/${slot.occupiedBy.totalSpaces}]`
                                                        : `${slot.occupiedBy.crates}c`}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Tabla Editable Compacta de Pedidos con Bahías */}
                        <div style={{ border: '1px solid #E2E8F0', borderRadius: '14px', overflow: 'hidden' }}>
                            <div style={{ maxHeight: '310px', overflowY: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem' }}>
                                    <thead style={{ position: 'sticky', top: 0, backgroundColor: '#0F172A', color: '#FFFFFF', zIndex: 10 }}>
                                        <tr>
                                            <th style={{ padding: '8px 10px', textAlign: 'left', width: '5%' }}>#Seq</th>
                                            <th style={{ padding: '8px 10px', textAlign: 'left', width: '28%' }}>Cliente / Sede</th>
                                            <th style={{ padding: '8px 10px', textAlign: 'left', width: '22%' }}>Dirección / Zona</th>
                                            <th style={{ padding: '8px 10px', textAlign: 'center', width: '15%' }}>Ventana Entrega</th>
                                            <th style={{ padding: '8px 10px', textAlign: 'right', width: '10%' }}>Kilos</th>
                                            <th style={{ padding: '8px 10px', textAlign: 'center', width: '8%' }}>Can.</th>
                                            <th style={{ padding: '8px 10px', textAlign: 'center', width: '12%', backgroundColor: '#1E293B' }}>Bahía (1-150)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {autoAllocations.map((item, idx) => {
                                            const currentSpaces = manualSpacesMap[item.order_id] || item.assigned_spaces || [];
                                            const currentLabel = formatSpaceLabel(currentSpaces);
                                            return (
                                                <tr key={item.order_id} style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}>
                                                    <td style={{ padding: '6px 10px', fontWeight: '800', color: '#64748B' }}>#{item.sequence_id || idx + 1}</td>
                                                    <td style={{ padding: '6px 10px', fontWeight: '800', color: '#0F172A' }}>
                                                        {item.customer_name}
                                                    </td>
                                                    <td style={{ padding: '6px 10px', color: '#475569', fontSize: '0.70rem' }}>
                                                        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '210px' }}>
                                                            {item.shipping_address}
                                                        </div>
                                                        <span style={{ fontSize: '0.62rem', color: '#0369A1', fontWeight: '700' }}>{item.zone_name}</span>
                                                    </td>
                                                    <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                                                        <span style={{ fontSize: '0.68rem', backgroundColor: '#EFF6FF', color: '#1E40AF', padding: '2px 6px', borderRadius: '4px', fontWeight: '700' }}>
                                                            {item.delivery_window_label || '07:00 AM'}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '800' }}>
                                                        {Math.round(item.total_weight_kg)} kg
                                                    </td>
                                                    <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: '800', color: '#D97706' }}>
                                                        {item.estimated_crates}
                                                    </td>
                                                    <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                                                        <input
                                                            type="text"
                                                            value={currentLabel === 'S/A' ? '' : currentLabel}
                                                            placeholder="ej. 4-5"
                                                            onChange={(e) => handleManualSpaceChange(item.order_id, e.target.value)}
                                                            style={{
                                                                width: '65px',
                                                                padding: '3px 6px',
                                                                fontSize: '0.74rem',
                                                                fontWeight: '900',
                                                                textAlign: 'center',
                                                                borderRadius: '6px',
                                                                border: currentSpaces.length > 0 
                                                                    ? (currentSpaces.length !== item.spaces_needed ? '1.5px solid #F59E0B' : '1.5px solid #0D7A57') 
                                                                    : '1.5px solid #EF4444',
                                                                backgroundColor: currentSpaces.length > 0 
                                                                    ? (currentSpaces.length !== item.spaces_needed ? '#FFFBEB' : '#F0FDF4') 
                                                                    : '#FEF2F2',
                                                                color: currentSpaces.length > 0 
                                                                    ? (currentSpaces.length !== item.spaces_needed ? '#B45309' : '#065F46') 
                                                                    : '#991B1B',
                                                                outline: 'none'
                                                            }}
                                                        />
                                                        {currentSpaces.length > 0 && currentSpaces.length !== item.spaces_needed && (
                                                            <div style={{ fontSize: '0.55rem', color: '#B45309', fontWeight: 800, marginTop: '2px', whiteSpace: 'nowrap' }}>
                                                                {currentSpaces.length > item.spaces_needed ? `Sobran (${currentSpaces.length} vs ${item.spaces_needed})` : `Faltan (${currentSpaces.length} vs ${item.spaces_needed})`}
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Bloque de Impresión 1: Documentos de Planta */}
                        <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Printer size={18} color="#0D7A57" />
                                <div>
                                    <div style={{ fontSize: '0.82rem', fontWeight: '900', color: '#0F172A' }}>
                                        Documentos Físicos de Planta (Muelle &amp; Alistamiento)
                                    </div>
                                    <div style={{ fontSize: '0.70rem', color: '#64748B' }}>
                                        Genera la sábana de 12 células con la columna LUGAR y el plano para la pared de bodega.
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <Link
                                    href={`/admin/orders/alistamiento-print?orderIds=${orderIdsParam}&date=${deliveryDate}`}
                                    target="_blank"
                                    style={{
                                        padding: '7px 12px', backgroundColor: '#FFFFFF', color: '#0D7A57', border: '1.5px solid #0D7A57',
                                        borderRadius: '8px', fontSize: '0.74rem', fontWeight: '900', textDecoration: 'none',
                                        display: 'inline-flex', alignItems: 'center', gap: '4px'
                                    }}
                                    title="Descargar Sábana de Alistamiento en formato PDF (Oficio)"
                                >
                                    <Download size={13} /> PDF
                                </Link>
                                <Link
                                    href={`/admin/orders/alistamiento-print?orderIds=${orderIdsParam}&date=${deliveryDate}`}
                                    target="_blank"
                                    style={{
                                        padding: '7px 14px', backgroundColor: '#0D7A57', color: '#FFFFFF',
                                        borderRadius: '8px', fontSize: '0.74rem', fontWeight: '900', textDecoration: 'none',
                                        display: 'inline-flex', alignItems: 'center', gap: '5px', boxShadow: '0 2px 6px rgba(13, 122, 87, 0.25)'
                                    }}
                                >
                                    <Printer size={13} /> Imprimir Sábana (Oficio) <ExternalLink size={11} />
                                </Link>
                                <Link
                                    href={`/admin/logistics/staging-spaces?date=${deliveryDate}`}
                                    target="_blank"
                                    style={{
                                        padding: '7px 12px', backgroundColor: '#FFFFFF', color: '#0F172A',
                                        border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '0.74rem', fontWeight: '800',
                                        textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px'
                                    }}
                                >
                                    Plano de Muelle
                                </Link>
                            </div>
                        </div>

                        {/* Footer de Paso 1 con Checkbox Poka-Yoke */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.5rem', borderTop: '1px solid #E2E8F0' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: '800', color: '#0F172A' }}>
                                <input 
                                    type="checkbox" 
                                    checked={step1Confirmed} 
                                    onChange={(e) => setStep1Confirmed(e.target.checked)}
                                    style={{ width: '16px', height: '16px', accentColor: '#0D7A57', cursor: 'pointer' }}
                                />
                                He inspeccionado la cuadrícula gráfica de muelle y tengo la Sábana de Alistamiento impresa.
                            </label>

                            <button
                                onClick={() => {
                                    if (assignedCount < selectedOrdersList.length) {
                                        if (!confirm('⚠️ Hay pedidos sin bahía asignada. ¿Deseas continuar de todas formas?')) return;
                                    }
                                    setStep1Confirmed(true);
                                    setCurrentStep(2);
                                }}
                                disabled={!step1Confirmed && assignedCount === 0}
                                style={{
                                    padding: '9px 18px', backgroundColor: '#0F172A', color: '#FFFFFF',
                                    border: 'none', borderRadius: '10px', fontWeight: '900', fontSize: '0.82rem',
                                    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px'
                                }}
                            >
                                Continuar a Compras &amp; Recibo <ArrowRight size={14} />
                            </button>
                        </div>
                    </div>
                )}

                {/* ========================================================================= */}
                {/* PASO 2: ABASTECIMIENTO, COMPRAS CORABASTOS & INGRESO A CIEGAS             */}
                {/* ========================================================================= */}
                {currentStep === 2 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '1.25rem' }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: '900', color: '#0F172A', textTransform: 'uppercase', marginBottom: '4px' }}>
                                Cruce de Demanda vs. Inventario en Bodega (Corabastos)
                            </div>
                            <p style={{ margin: 0, fontSize: '0.76rem', color: '#64748B', lineHeight: '1.4' }}>
                                El sistema cruza la demanda consolidada de los {selectedOrdersList.length} pedidos contra el inventario inicial de bodega (INV). Genera las planillas independientes con salto de página para los compradores de plaza y el formato de control de llegada a ciegas.
                            </p>
                        </div>

                        {/* Tarjetas de Acción de Compras */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                            {/* Card 2A: Planilla por Sublistas */}
                            <div style={{ backgroundColor: '#FFFFFF', border: '1.5px solid #A7F3D0', borderRadius: '14px', padding: '1.2rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#065F46', fontWeight: '900', fontSize: '0.82rem' }}>
                                        <FileText size={16} /> Planillas de Plaza
                                    </div>
                                    <div style={{ fontWeight: '900', fontSize: '0.92rem', color: '#0F172A', marginTop: '6px' }}>
                                        Compras por Sublista
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px', lineHeight: '1.35' }}>
                                        Hojas individuales para Papa, Plátano, Frutas y Hortalizas con casillas de precio en puesto.
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '6px', marginTop: '1rem' }}>
                                    <Link
                                        href={`/admin/orders/contingency-print?mode=purchases&orderIds=${orderIdsParam}`}
                                        target="_blank"
                                        style={{
                                            flex: 1, padding: '8px 8px', backgroundColor: '#FFFFFF', color: '#0D7A57', border: '1.5px solid #0D7A57',
                                            borderRadius: '8px', fontSize: '0.73rem', fontWeight: '900', textDecoration: 'none',
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
                                        }}
                                        title="Descargar Planillas de Plaza en PDF"
                                    >
                                        <Download size={13} /> PDF
                                    </Link>
                                    <Link
                                        href={`/admin/orders/contingency-print?mode=purchases&orderIds=${orderIdsParam}`}
                                        target="_blank"
                                        style={{
                                            flex: 1.4, padding: '8px 10px', backgroundColor: '#0D7A57', color: '#FFFFFF',
                                            borderRadius: '8px', fontSize: '0.73rem', fontWeight: '900', textDecoration: 'none',
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
                                        }}
                                    >
                                        <Printer size={13} /> Imprimir <ExternalLink size={10} />
                                    </Link>
                                </div>
                            </div>

                            {/* Card 2B: Excel Maestro (11 Cols) */}
                            <div style={{ backgroundColor: '#FFFFFF', border: '1.5px solid #BAE6FD', borderRadius: '14px', padding: '1.2rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#0369A1', fontWeight: '900', fontSize: '0.82rem' }}>
                                        <Download size={16} /> Dataset Digital
                                    </div>
                                    <div style={{ fontWeight: '900', fontSize: '0.92rem', color: '#0F172A', marginTop: '6px' }}>
                                        Excel Maestro (11 Cols)
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px', lineHeight: '1.35' }}>
                                        Archivo oficial para compras, directores y cruce contable con World Office.
                                    </div>
                                </div>
                                <button
                                    onClick={handleExportMasterPurchasesExcel}
                                    style={{
                                        marginTop: '1rem', padding: '8px 12px', backgroundColor: '#0284C7', color: '#FFFFFF',
                                        borderRadius: '8px', fontSize: '0.75rem', fontWeight: '900', border: 'none', cursor: 'pointer',
                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                        boxShadow: '0 2px 6px rgba(2, 132, 199, 0.3)'
                                    }}
                                    title="Descarga directa del dataset compras_YYYY-MM-DD.xlsx con las 11 columnas maestras"
                                >
                                    <Download size={14} /> Exportar Excel (.xlsx)
                                </button>
                            </div>

                            {/* Card 2C: Ingreso a Ciegas */}
                            <div style={{ backgroundColor: '#FFFFFF', border: '1.5px solid #FDE68A', borderRadius: '14px', padding: '1.2rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#B45309', fontWeight: '900', fontSize: '0.82rem' }}>
                                        <Layers size={16} /> Muelle de Recibo
                                    </div>
                                    <div style={{ fontWeight: '900', fontSize: '0.92rem', color: '#0F172A', marginTop: '6px' }}>
                                        Control de Llegada a Ciegas
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px', lineHeight: '1.35' }}>
                                        Planilla con kilos en blanco para que el chequeador de las 2:00 AM pese obligatoriamente en báscula.
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '6px', marginTop: '1rem' }}>
                                    <Link
                                        href={`/admin/orders/contingency-print?mode=picking&orderIds=${orderIdsParam}`}
                                        target="_blank"
                                        style={{
                                            flex: 1, padding: '8px 8px', backgroundColor: '#FFFFFF', color: '#D97706', border: '1.5px solid #D97706',
                                            borderRadius: '8px', fontSize: '0.73rem', fontWeight: '900', textDecoration: 'none',
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
                                        }}
                                        title="Descargar Planilla de Recibo a Ciegas en PDF"
                                    >
                                        <Download size={13} /> PDF
                                    </Link>
                                    <Link
                                        href={`/admin/orders/contingency-print?mode=picking&orderIds=${orderIdsParam}`}
                                        target="_blank"
                                        style={{
                                            flex: 1.4, padding: '8px 10px', backgroundColor: '#D97706', color: '#FFFFFF',
                                            borderRadius: '8px', fontSize: '0.73rem', fontWeight: '900', textDecoration: 'none',
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
                                        }}
                                    >
                                        <Printer size={13} /> Imprimir <ExternalLink size={10} />
                                    </Link>
                                </div>
                            </div>
                        </div>

                        {/* Footer Paso 2 */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '1rem', borderTop: '1px solid #E2E8F0' }}>
                            <button
                                onClick={() => setCurrentStep(1)}
                                style={{
                                    padding: '8px 14px', backgroundColor: '#F1F5F9', color: '#475569',
                                    border: 'none', borderRadius: '8px', fontWeight: '800', fontSize: '0.78rem',
                                    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px'
                                }}
                            >
                                <ArrowLeft size={14} /> Volver al Paso 1
                            </button>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: '800', color: '#0F172A' }}>
                                <input 
                                    type="checkbox" 
                                    checked={step2Confirmed} 
                                    onChange={(e) => setStep2Confirmed(e.target.checked)}
                                    style={{ width: '16px', height: '16px', accentColor: '#0D7A57', cursor: 'pointer' }}
                                />
                                Planillas de compra y planilla de recibo a ciegas emitidas para Corabastos.
                            </label>

                            <button
                                onClick={() => {
                                    setStep2Confirmed(true);
                                    setCurrentStep(3);
                                }}
                                style={{
                                    padding: '9px 18px', backgroundColor: '#0F172A', color: '#FFFFFF',
                                    border: 'none', borderRadius: '10px', fontWeight: '900', fontSize: '0.82rem',
                                    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px'
                                }}
                            >
                                Continuar a Remisiones Carta <ArrowRight size={14} />
                            </button>
                        </div>
                    </div>
                )}

                {/* ========================================================================= */}
                {/* PASO 3: REMISIONES FÍSICAS DUPLICADAS & MANIFIESTO (CARTA / LÁSER)         */}
                {/* ========================================================================= */}
                {currentStep === 3 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        <div style={{ backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '16px', padding: '1.25rem' }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: '900', color: '#1E40AF', textTransform: 'uppercase', marginBottom: '4px' }}>
                                Bandeja Carta / Impresora Láser (Títulos Valor y Soporte Contable)
                            </div>
                            <p style={{ margin: 0, fontSize: '0.76rem', color: '#1E3A8A', lineHeight: '1.4' }}>
                                Cada pedido genera <strong>2 páginas continuas obligatorias</strong>: Impar (`[ ORIGINAL - CLIENTE ]`) y Par (`[ COPIA - ARCHIVO Y CONTABILIDAD ]`). Las remisiones ya llevan estampado el recuadro superior <strong>Bahía de Piso: ESPACIO [ XX ]</strong> que coincide matemáticamente con la sábana de muelle.
                            </p>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.2rem' }}>
                            {/* 3A. Remisiones Duplicadas */}
                            <div style={{ backgroundColor: '#FFFFFF', border: '1.5px solid #93C5FD', borderRadius: '14px', padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#1D4ED8', fontWeight: '900', fontSize: '0.84rem' }}>
                                            <FileText size={16} /> Remisiones de Entrega
                                        </div>
                                        <span style={{ fontSize: '0.66rem', backgroundColor: '#DBEAFE', color: '#1E40AF', padding: '2px 8px', borderRadius: '6px', fontWeight: '800' }}>
                                            {selectedOrdersList.length * 2} Páginas Carta
                                        </span>
                                    </div>
                                    <div style={{ fontWeight: '900', fontSize: '1rem', color: '#0F172A', marginTop: '8px' }}>
                                        Juegos de Remisión (Original + Copia)
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '6px', lineHeight: '1.4' }}>
                                        Incluye membrete formal de <em>Investments Cortés S.A.S.</em>, casilla manuscrita para <strong>KG-UN recibe</strong>, cuadro de firmas, cédula, sello húmedo y comodato de canastillas.
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px', marginTop: '1.2rem' }}>
                                    <Link
                                        href={`/admin/orders/contingency-print?mode=remissions&orderIds=${orderIdsParam}`}
                                        target="_blank"
                                        style={{
                                            flex: 1, padding: '9px 10px', backgroundColor: '#FFFFFF', color: '#1D4ED8', border: '1.5px solid #1D4ED8',
                                            borderRadius: '8px', fontSize: '0.76rem', fontWeight: '900', textDecoration: 'none',
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px'
                                        }}
                                        title="Descargar Remisiones en formato PDF"
                                    >
                                        <Download size={14} /> Descargar PDF
                                    </Link>
                                    <Link
                                        href={`/admin/orders/contingency-print?mode=remissions&orderIds=${orderIdsParam}`}
                                        target="_blank"
                                        style={{
                                            flex: 1.4, padding: '9px 12px', backgroundColor: '#1D4ED8', color: '#FFFFFF',
                                            borderRadius: '8px', fontSize: '0.76rem', fontWeight: '900', textDecoration: 'none',
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                                            boxShadow: '0 2px 6px rgba(29, 78, 216, 0.3)'
                                        }}
                                    >
                                        <Printer size={14} /> Imprimir ({selectedOrdersList.length}) <ExternalLink size={10} />
                                    </Link>
                                </div>
                            </div>

                            {/* 3B. Manifiesto de Despacho & Control de Canastillas */}
                            <div style={{ backgroundColor: '#FFFFFF', border: '1.5px solid #CBD5E1', borderRadius: '14px', padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#475569', fontWeight: '900', fontSize: '0.84rem' }}>
                                            <Truck size={16} /> Salida de Planta
                                        </div>
                                        <span style={{ fontSize: '0.66rem', backgroundColor: '#F1F5F9', color: '#475569', padding: '2px 8px', borderRadius: '6px', fontWeight: '800' }}>
                                            Portería &amp; Vigilancia
                                        </span>
                                    </div>
                                    <div style={{ fontWeight: '900', fontSize: '1rem', color: '#0F172A', marginTop: '8px' }}>
                                        Manifiesto de Ruta &amp; Balance Canastillas
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '6px', lineHeight: '1.4' }}>
                                        Control físico en puerta: Placa, conductor, total de canastillas plásticas entregadas al camión, devueltas vacías y firmas de salida.
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px', marginTop: '1.2rem' }}>
                                    <Link
                                        href={`/admin/orders/contingency-print?mode=dispatch&orderIds=${orderIdsParam}`}
                                        target="_blank"
                                        style={{
                                            flex: 1, padding: '9px 10px', backgroundColor: '#FFFFFF', color: '#0F172A', border: '1.5px solid #0F172A',
                                            borderRadius: '8px', fontSize: '0.76rem', fontWeight: '900', textDecoration: 'none',
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px'
                                        }}
                                        title="Descargar Manifiesto de Flota en formato PDF"
                                    >
                                        <Download size={14} /> Descargar PDF
                                    </Link>
                                    <Link
                                        href={`/admin/orders/contingency-print?mode=dispatch&orderIds=${orderIdsParam}`}
                                        target="_blank"
                                        style={{
                                            flex: 1.4, padding: '9px 12px', backgroundColor: '#0F172A', color: '#FFFFFF',
                                            borderRadius: '8px', fontSize: '0.76rem', fontWeight: '900', textDecoration: 'none',
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px'
                                        }}
                                    >
                                        <Printer size={14} /> Imprimir Manifiesto <ExternalLink size={10} />
                                    </Link>
                                </div>
                            </div>
                        </div>

                        {/* Footer Paso 3 */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '1rem', borderTop: '1px solid #E2E8F0' }}>
                            <button
                                onClick={() => setCurrentStep(2)}
                                style={{
                                    padding: '8px 14px', backgroundColor: '#F1F5F9', color: '#475569',
                                    border: 'none', borderRadius: '8px', fontWeight: '800', fontSize: '0.78rem',
                                    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px'
                                }}
                            >
                                <ArrowLeft size={14} /> Volver al Paso 2
                            </button>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: '800', color: '#0F172A' }}>
                                <input 
                                    type="checkbox" 
                                    checked={step3Confirmed} 
                                    onChange={(e) => setStep3Confirmed(e.target.checked)}
                                    style={{ width: '16px', height: '16px', accentColor: '#0D7A57', cursor: 'pointer' }}
                                />
                                Remisiones duplicadas y manifiesto de flota en bandeja de salida láser.
                            </label>

                            <button
                                onClick={() => {
                                    setStep3Confirmed(true);
                                    setCurrentStep(4);
                                }}
                                style={{
                                    padding: '9px 18px', backgroundColor: '#0F172A', color: '#FFFFFF',
                                    border: 'none', borderRadius: '10px', fontWeight: '900', fontSize: '0.82rem',
                                    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px'
                                }}
                            >
                                Continuar a Rótulos Térmicos <ArrowRight size={14} />
                            </button>
                        </div>
                    </div>
                )}

                {/* ========================================================================= */}
                {/* PASO 4: RÓTULOS TÉRMICOS DE CANASTILLA & CIERRE OPERATIVO                  */}
                {/* ========================================================================= */}
                {currentStep === 4 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        <div style={{ backgroundColor: '#FAF5FF', border: '1px solid #E9D5FF', borderRadius: '16px', padding: '1.25rem' }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: '900', color: '#7E22CE', textTransform: 'uppercase', marginBottom: '4px' }}>
                                Rollo Térmico Continuo (100x50mm) / Impresora Térmica
                            </div>
                            <p style={{ margin: 0, fontSize: '0.76rem', color: '#6B21A8', lineHeight: '1.4' }}>
                                Los rótulos térmicos salen ordenados bajo la <strong>misma secuencia sincrónica de ruta</strong> que las remisiones, permitiendo que el personal grape o rotule las canastillas plásticas sin cruzar pedidos.
                            </p>
                        </div>

                        {/* Card Rótulos Térmicos */}
                        <div style={{ backgroundColor: '#FFFFFF', border: '1.5px solid #C084FC', borderRadius: '14px', padding: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#7E22CE', fontWeight: '900', fontSize: '0.84rem' }}>
                                    <Tag size={16} /> Identificación de Canastillas
                                </div>
                                <div style={{ fontWeight: '900', fontSize: '1rem', color: '#0F172A', marginTop: '6px' }}>
                                    Rótulos Térmicos Adhesivos con QR
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px' }}>
                                    Cliente, Secuencia, Bahía de Piso, Franja Horaria y recuadro [ Canastilla ___ de ___ ].
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '8px' }}>
                                <Link
                                    href={`/admin/orders/print-labels?orderIds=${orderIdsParam}`}
                                    target="_blank"
                                    style={{
                                        padding: '9px 12px', backgroundColor: '#FFFFFF', color: '#7E22CE', border: '1.5px solid #7E22CE',
                                        borderRadius: '8px', fontSize: '0.76rem', fontWeight: '900', textDecoration: 'none',
                                        display: 'inline-flex', alignItems: 'center', gap: '5px'
                                    }}
                                    title="Descargar Rótulos Térmicos en PDF"
                                >
                                    <Download size={14} /> PDF
                                </Link>
                                <Link
                                    href={`/admin/orders/print-labels?orderIds=${orderIdsParam}`}
                                    target="_blank"
                                    style={{
                                        padding: '9px 14px', backgroundColor: '#7E22CE', color: '#FFFFFF',
                                        borderRadius: '8px', fontSize: '0.76rem', fontWeight: '900', textDecoration: 'none',
                                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                                        boxShadow: '0 2px 6px rgba(126, 34, 206, 0.3)'
                                    }}
                                >
                                    <Printer size={14} /> Imprimir Rótulos ({selectedOrdersList.length}) <ExternalLink size={10} />
                                </Link>
                            </div>
                        </div>

                        {/* Checklist Final de Lanzamiento */}
                        <div style={{ backgroundColor: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '16px', padding: '1.25rem' }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: '900', color: '#0F172A', marginBottom: '8px' }}>
                                Resumen del Kit de Contingencia Preparado:
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', fontSize: '0.74rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: step1Confirmed ? '#166534' : '#64748B' }}>
                                    <CheckCircle2 size={16} color={step1Confirmed ? '#16A34A' : '#94A3B8'} />
                                    1. Bahías de muelle asignadas &bull; Sábana alistamiento impresa
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: step2Confirmed ? '#166534' : '#64748B' }}>
                                    <CheckCircle2 size={16} color={step2Confirmed ? '#16A34A' : '#94A3B8'} />
                                    2. Compras por sublista &bull; Planilla recibo a ciegas
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: step3Confirmed ? '#166534' : '#64748B' }}>
                                    <CheckCircle2 size={16} color={step3Confirmed ? '#16A34A' : '#94A3B8'} />
                                    3. {selectedOrdersList.length} Remisiones duplicadas (Original/Copia)
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: step4Confirmed ? '#166534' : '#64748B' }}>
                                    <CheckCircle2 size={16} color={step4Confirmed ? '#16A34A' : '#94A3B8'} />
                                    4. Rótulos térmicos de canastillas emitidos
                                </div>
                            </div>
                        </div>

                        {/* Botón de Impresión de Contingencia Total 1-Clic */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FEF3C7', border: '1.5px solid #FCD34D', borderRadius: '14px', padding: '12px 16px', flexWrap: 'wrap', gap: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ backgroundColor: '#FDE68A', padding: '6px', borderRadius: '8px', display: 'flex' }}>
                                    <Printer size={18} color="#92400E" />
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.82rem', fontWeight: '900', color: '#92400E' }}>
                                        Impresión Completa del Kit de Contingencia (1-Clic)
                                    </div>
                                    <div style={{ fontSize: '0.70rem', color: '#B45309' }}>
                                        Envía a imprimir todos los documentos físicos de la tanda juntos: Compras, Sábana, Remisiones y Rótulos.
                                    </div>
                                </div>
                            </div>
                            <Link
                                href={`/admin/orders/contingency-print?mode=all&orderIds=${orderIdsParam}`}
                                target="_blank"
                                style={{
                                    padding: '8px 14px',
                                    backgroundColor: '#B45309',
                                    color: '#FFFFFF',
                                    borderRadius: '8px',
                                    fontSize: '0.76rem',
                                    fontWeight: '900',
                                    textDecoration: 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: '0 2px 6px rgba(180, 83, 9, 0.3)'
                                }}
                            >
                                <Printer size={13} /> Imprimir Kit 1-Clic Completo <ExternalLink size={10} />
                            </Link>
                        </div>

                        {/* Footer Paso 4 & Botón de Sello Final */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '1rem', borderTop: '1px solid #E2E8F0', flexWrap: 'wrap', gap: '12px' }}>
                            <button
                                onClick={() => setCurrentStep(3)}
                                style={{
                                    padding: '8px 14px', backgroundColor: '#F1F5F9', color: '#475569',
                                    border: 'none', borderRadius: '8px', fontWeight: '800', fontSize: '0.78rem',
                                    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px'
                                }}
                            >
                                <ArrowLeft size={14} /> Volver al Paso 3
                            </button>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: '800', color: '#0F172A' }}>
                                <input 
                                    type="checkbox" 
                                    checked={step4Confirmed} 
                                    onChange={(e) => setStep4Confirmed(e.target.checked)}
                                    style={{ width: '16px', height: '16px', accentColor: '#7E22CE', cursor: 'pointer' }}
                                />
                                Rótulos térmicos y documentos físicos verificados.
                            </label>

                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                <button
                                    onClick={handleFinalizeLaunch}
                                    disabled={finalizingLoading}
                                    style={{
                                        padding: '12px 24px',
                                        backgroundColor: '#059669',
                                        color: '#FFFFFF',
                                        border: 'none',
                                        borderRadius: '12px',
                                        fontWeight: '900',
                                        fontSize: '0.90rem',
                                        letterSpacing: '0.01em',
                                        cursor: finalizingLoading ? 'wait' : 'pointer',
                                        boxShadow: '0 4px 14px rgba(5, 150, 105, 0.4)',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    <CheckCircle2 size={18} />
                                    {finalizingLoading ? 'Sellando Tanda en Base de Datos...' : 'FINALIZAR Y ENVIAR A PROCESO LOGÍSTICO'}
                                </button>
                                <span style={{ fontSize: '0.66rem', color: '#64748B', fontWeight: '600' }}>
                                    Pasa pedidos a <strong>para_compra</strong> (Compras Corabastos &amp; Alistamiento)
                                </span>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
