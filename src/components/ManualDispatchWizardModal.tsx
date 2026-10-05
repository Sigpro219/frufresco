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
    FileSpreadsheet,
    Truck, 
    Tag, 
    ShieldAlert, 
    ArrowRight, 
    ArrowLeft, 
    X,
    Layers,
    Download,
    ClipboardList,
    Package,
    AlertTriangle,
    ChevronDown,
    ChevronUp
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
    // Mapeo de texto crudo en inputs para permitir escribir libremente comas ("4, 5, 6"): { [orderId]: string }
    const [spaceInputTexts, setSpaceInputTexts] = useState<Record<string, string>>({});
    
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
        const initialTextMap: Record<string, string> = {};
        Object.entries(initialMap).forEach(([orderId, spaces]) => {
            if (Array.isArray(spaces) && spaces.length > 0) {
                initialTextMap[orderId] = spaces.join(', ');
            }
        });
        setSpaceInputTexts(initialTextMap);
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
        const newTextMap: Record<string, string> = {};
        autoAllocations.forEach(a => {
            newMap[a.order_id] = a.assigned_spaces;
            if (Array.isArray(a.assigned_spaces) && a.assigned_spaces.length > 0) {
                newTextMap[a.order_id] = a.assigned_spaces.join(', ');
            }
        });
        setManualSpacesMap(newMap);
        setSpaceInputTexts(newTextMap);
        setSpacesSavedSuccess(false);
    };

    // Parser ultra-resiliente que soporta:
    // - Comas: "4, 5, 6", "4,5,6"
    // - Guiones de rango: "4-6" -> [4, 5, 6]
    // - Espacios o puntos y comas: "4 5 6", "4; 5; 6"
    // - Mixtos: "1-2, 5" -> [1, 2, 5]
    const parseSpacesInput = (text: string): number[] => {
        if (!text || !text.trim()) return [];
        const spacesSet = new Set<number>();
        const tokens = text.split(/[,;\s]+/).map(t => t.trim()).filter(Boolean);
        for (const token of tokens) {
            if (token.includes('-')) {
                const parts = token.split('-').map(p => parseInt(p.trim(), 10)).filter(p => !isNaN(p));
                if (parts.length === 2 && parts[0] <= parts[1]) {
                    for (let i = parts[0]; i <= parts[1]; i++) {
                        if (i >= 1 && i <= 150) spacesSet.add(i);
                    }
                }
            } else {
                const num = parseInt(token, 10);
                if (!isNaN(num) && num >= 1 && num <= 150) {
                    spacesSet.add(num);
                }
            }
        }
        return Array.from(spacesSet).sort((a, b) => a - b);
    };

    // Cambiar manualmente el espacio de una orden permitiendo escribir libremente comas y espacios
    const handleManualSpaceChange = (orderId: string, valueStr: string) => {
        // 1. Guardar el texto crudo para que el input no trague comas o espacios mientras el usuario escribe
        setSpaceInputTexts(prev => ({
            ...prev,
            [orderId]: valueStr
        }));

        // 2. Parsear el array de bahías para actualizar el mapa numérico y las validaciones
        const spaces = parseSpacesInput(valueStr);
        setManualSpacesMap(prev => ({
            ...prev,
            [orderId]: spaces
        }));
        setSpacesSavedSuccess(false);
    };

    // Al perder el foco (onBlur), formatear amigablemente como lista limpia ("4, 5, 6")
    const handleManualSpaceBlur = (orderId: string) => {
        const raw = spaceInputTexts[orderId];
        if (raw !== undefined) {
            const parsed = parseSpacesInput(raw);
            const formatted = parsed.length > 0 ? parsed.join(', ') : '';
            setSpaceInputTexts(prev => ({
                ...prev,
                [orderId]: formatted
            }));
        }
    };

    // Guardar asignación en base de datos
    const handleSaveSpacesToDatabase = async (): Promise<boolean> => {
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
            return true;
        } catch (err: any) {
            console.error('Error guardando bahías de muelle:', err);
            alert(`Error al guardar bahías: ${err?.message || 'Error desconocido'}`);
            return false;
        } finally {
            setSavingSpaces(false);
        }
    };

    // Avanzar a Paso 2 con auto-guardado atómico en base de datos
    const handleContinueToStep2 = async () => {
        if (assignedCount < selectedOrdersList.length) {
            if (!confirm('Hay pedidos sin bahía asignada. ¿Deseas continuar de todas formas?')) return;
        }

        const saved = await handleSaveSpacesToDatabase();
        if (!saved) return;

        setStep1Confirmed(true);
        setCurrentStep(2);
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
            const freshTextMap: Record<string, string> = {};
            (data || []).forEach(o => {
                if (Array.isArray(o.warehouse_spaces) && o.warehouse_spaces.length > 0) {
                    freshMap[o.id] = o.warehouse_spaces;
                    freshTextMap[o.id] = o.warehouse_spaces.join(', ');
                }
            });
            setManualSpacesMap(freshMap);
            setSpaceInputTexts(freshTextMap);
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

    // Total de canastillas estimadas para la tanda de pedidos seleccionados
    const totalEstimatedCrates = useMemo(() => {
        return preparedOrders.reduce((sum, o) => {
            const { crates } = calculateCratesAndSpaces(o.total_weight_kg, 12.5, 36);
            return sum + crates;
        }, 0);
    }, [preparedOrders]);

    // Lanzamiento final a Proceso Logístico (status = para_compra)
    const handleFinalizeLaunch = async () => {
        if (!selectedOrderIds || selectedOrderIds.size === 0) {
            alert('No hay pedidos seleccionados para lanzar.');
            return;
        }
        if (!step4Confirmed) {
            alert('Debes confirmar la verificación de los rótulos térmicos y documentos físicos antes de finalizar.');
            return;
        }

        setFinalizingLoading(true);
        try {
            const { error } = await supabase
                .from('orders')
                .update({ status: 'para_compra' })
                .in('id', Array.from(selectedOrderIds));

            if (error) throw error;

            alert('Tanda sellada y enviada a Proceso Logístico con éxito (status: PARA COMPRA).');
            onSuccess();
            onClose();
        } catch (err: any) {
            console.error('Error al finalizar tanda:', err);
            alert(`Error al sellar tanda: ${err?.message || 'Error desconocido'}`);
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
                        { num: 1, title: '1. Muelle & Bahías', subtitle: 'Asignación de espacios', icon: Grid, confirmed: step1Confirmed },
                        { num: 2, title: '2. Compras & Recibo', subtitle: 'Corabastos e ingreso', icon: FileText, confirmed: step2Confirmed },
                        { num: 3, title: '3. Remisiones & Manifiesto', subtitle: 'Entrega a clientes y ruta', icon: Truck, confirmed: step3Confirmed },
                        { num: 4, title: '4. Rótulos Térmicos', subtitle: 'Etiquetas de canastilla', icon: Tag, confirmed: step4Confirmed }
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
                        {/* Status Alert Banner Limpio & Contextual */}
                        <div style={{
                            backgroundColor: assignedCount === selectedOrdersList.length ? '#F0FDF4' : '#FFFBEB',
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
                                        padding: '7px 14px', borderRadius: '8px',
                                        border: assignedCount === selectedOrdersList.length ? '1px solid #86EFAC' : '1.5px solid #F59E0B',
                                        backgroundColor: assignedCount === selectedOrdersList.length ? '#DCFCE7' : '#FEF3C7',
                                        color: assignedCount === selectedOrdersList.length ? '#166534' : '#92400E',
                                        fontWeight: '900', fontSize: '0.75rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                                    }}
                                >
                                    <Sparkles size={14} color={assignedCount === selectedOrdersList.length ? '#16A34A' : '#D97706'} />
                                    {assignedCount === selectedOrdersList.length ? 'Re-calcular (LIFO)' : 'Auto-Asignar (LIFO + Clúster)'}
                                </button>

                                <button
                                    onClick={handleRefreshSpacesFromDB}
                                    style={{
                                        padding: '7px 10px', borderRadius: '8px', border: '1px solid #CBD5E1',
                                        backgroundColor: '#FFFFFF', color: '#475569', cursor: 'pointer',
                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
                                    }}
                                    title="Sincronizar con base de datos"
                                >
                                    <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                                </button>
                            </div>
                        </div>

                        {/* Tabla Editable Compacta de Pedidos con Bahías (PROTAGONISTA VISUAL ABOVE THE FOLD) */}
                        <div style={{ border: '1px solid #E2E8F0', borderRadius: '14px', overflow: 'hidden' }}>
                            <div style={{ maxHeight: '310px', overflowY: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem' }}>
                                    <thead style={{ position: 'sticky', top: 0, backgroundColor: '#0F172A', color: '#FFFFFF', zIndex: 10 }}>
                                        <tr>
                                            <th style={{ padding: '8px 10px', textAlign: 'left', width: '4%' }}>#Seq</th>
                                            <th style={{ padding: '8px 10px', textAlign: 'left', width: '25%' }}>Cliente / Sede</th>
                                            <th style={{ padding: '8px 10px', textAlign: 'left', width: '20%' }}>Dirección / Zona</th>
                                            <th style={{ padding: '8px 10px', textAlign: 'center', width: '13%' }}>Ventana Entrega</th>
                                            <th style={{ padding: '8px 10px', textAlign: 'right', width: '9%' }}>Kilos</th>
                                            <th style={{ padding: '8px 10px', textAlign: 'center', width: '7%' }}>Can.</th>
                                            <th style={{ padding: '8px 10px', textAlign: 'center', width: '10%', backgroundColor: '#1E293B' }}>Muelles Req.</th>
                                            <th style={{ padding: '8px 10px', textAlign: 'center', width: '12%', backgroundColor: '#0F172A' }}>Bahía (1-150)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {autoAllocations.map((item, idx) => {
                                            const currentSpaces = manualSpacesMap[item.order_id] || item.assigned_spaces || [];
                                            const displayValue = spaceInputTexts[item.order_id] !== undefined
                                                ? spaceInputTexts[item.order_id]
                                                : (currentSpaces.length > 0 ? currentSpaces.join(', ') : '');
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
                                                    {/* Muelles Necesarios Calculados Explícitamente */}
                                                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                                        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
                                                            <span style={{
                                                                backgroundColor: '#EFF6FF',
                                                                color: '#1D4ED8',
                                                                fontWeight: '900',
                                                                fontSize: '0.74rem',
                                                                padding: '2px 8px',
                                                                borderRadius: '6px',
                                                                border: '1px solid #BFDBFE',
                                                                whiteSpace: 'nowrap',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '4px'
                                                            }}>
                                                                <Package size={13} color="#1D4ED8" />
                                                                {item.spaces_needed} {item.spaces_needed === 1 ? 'muelle' : 'muelles'}
                                                            </span>
                                                            <span style={{ fontSize: '0.56rem', color: '#64748B', marginTop: '1px', fontWeight: '600' }}>
                                                                ({item.estimated_crates}c / 36)
                                                            </span>
                                                        </div>
                                                    </td>
                                                    {/* Input Editable de Bahías con soporte para comas: "4, 5, 6" */}
                                                    <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                                                        <input
                                                            type="text"
                                                            value={displayValue}
                                                            placeholder="ej. 4, 5, 6"
                                                            onChange={(e) => handleManualSpaceChange(item.order_id, e.target.value)}
                                                            onBlur={() => handleManualSpaceBlur(item.order_id)}
                                                            style={{
                                                                width: '100px',
                                                                padding: '4px 8px',
                                                                fontSize: '0.78rem',
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
                                                        {currentSpaces.length === item.spaces_needed && (
                                                            <div style={{ fontSize: '0.56rem', color: '#059669', fontWeight: 800, marginTop: '2px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
                                                                <CheckCircle2 size={10} color="#059669" /> {currentSpaces.length} de {item.spaces_needed} asignados
                                                            </div>
                                                        )}
                                                        {currentSpaces.length > 0 && currentSpaces.length !== item.spaces_needed && (
                                                            <div style={{ fontSize: '0.56rem', color: '#B45309', fontWeight: 800, marginTop: '2px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
                                                                <AlertTriangle size={10} color="#B45309" />
                                                                {currentSpaces.length > item.spaces_needed 
                                                                    ? `Sobran (${currentSpaces.length} de ${item.spaces_needed})` 
                                                                    : `Faltan (${currentSpaces.length} de ${item.spaces_needed})`}
                                                            </div>
                                                        )}
                                                        {currentSpaces.length === 0 && (
                                                            <div style={{ fontSize: '0.56rem', color: '#DC2626', fontWeight: 800, marginTop: '2px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
                                                                <AlertTriangle size={10} color="#DC2626" /> Requiere {item.spaces_needed} {item.spaces_needed === 1 ? 'muelle' : 'muelles'}
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

                        {/* Acordeón Desplegable para el Plano Físico de Nave Central */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
                            <button
                                type="button"
                                onClick={() => setShowFloorGridPreview(!showFloorGridPreview)}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1',
                                    backgroundColor: showFloorGridPreview ? '#EEF2FF' : '#F8FAFC',
                                    color: showFloorGridPreview ? '#4338CA' : '#475569',
                                    fontSize: '0.74rem',
                                    fontWeight: '800',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                <Layers size={13} color={showFloorGridPreview ? '#4338CA' : '#64748B'} />
                                <span>{showFloorGridPreview ? 'Ocultar Plano Físico de Nave (150 Bahías)' : 'Inspeccionar Plano Físico de Nave Central (150 Bahías)'}</span>
                                {showFloorGridPreview ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            </button>

                            <Link
                                href={`/admin/logistics/staging-spaces?date=${deliveryDate}`}
                                target="_blank"
                                style={{
                                    fontSize: '0.70rem',
                                    fontWeight: '700',
                                    color: '#6366F1',
                                    textDecoration: 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                            >
                                Configuración Avanzada de Muelle <ExternalLink size={10} />
                            </Link>
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
                                    <Download size={13} /> Descargar PDF
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

                        {/* Footer de Paso 1 con Checkbox Poka-Yoke & Auto-guardado al Avanzar */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.5rem', borderTop: '1px solid #E2E8F0', flexWrap: 'wrap', gap: '10px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: '800', color: '#0F172A' }}>
                                <input 
                                    type="checkbox" 
                                    checked={step1Confirmed} 
                                    onChange={(e) => setStep1Confirmed(e.target.checked)}
                                    style={{ width: '16px', height: '16px', accentColor: '#0D7A57', cursor: 'pointer' }}
                                />
                                He verificado las bahías de muelle y tengo la Sábana de Alistamiento impresa.
                            </label>

                            <button
                                onClick={handleContinueToStep2}
                                disabled={savingSpaces || (!step1Confirmed && assignedCount === 0)}
                                style={{
                                    padding: '9px 20px', backgroundColor: '#0F172A', color: '#FFFFFF',
                                    border: 'none', borderRadius: '10px', fontWeight: '900', fontSize: '0.82rem',
                                    cursor: savingSpaces ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px',
                                    boxShadow: '0 2px 8px rgba(15, 23, 42, 0.25)'
                                }}
                            >
                                {savingSpaces ? (
                                    <>
                                        <RefreshCw size={14} className="animate-spin" /> Guardando bahías...
                                    </>
                                ) : (
                                    <>
                                        Continuar a Compras &amp; Recibo <ArrowRight size={14} />
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {/* ========================================================================= */}
                {/* PASO 2: ABASTECIMIENTO & COMPRAS CORABASTOS                               */}
                {/* ========================================================================= */}
                {currentStep === 2 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '1.25rem' }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: '900', color: '#0F172A', textTransform: 'uppercase', marginBottom: '4px' }}>
                                Cruce de Demanda vs. Inventario en Bodega
                            </div>
                            <p style={{ margin: 0, fontSize: '0.76rem', color: '#64748B', lineHeight: '1.4' }}>
                                Cruce de demanda contra el inventario de bodega para {selectedOrdersList.length} pedidos. Genera las planillas de compra para Corabastos, el consolidado en Excel, el control de ingreso y el conteo físico.
                            </p>
                        </div>

                        {/* Tarjetas de Acción de Compras e Inventario */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
                            {/* Card 2A: Planillas de Compra en Plaza (Corabastos) */}
                            <div style={{ backgroundColor: '#FFFFFF', border: '1.5px solid #A7F3D0', borderRadius: '14px', padding: '1rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#065F46', fontWeight: '900', fontSize: '0.80rem' }}>
                                        <FileText size={15} /> Compras en Plaza
                                    </div>
                                    <div style={{ fontWeight: '900', fontSize: '0.88rem', color: '#0F172A', marginTop: '4px' }}>
                                        Planillas de Compra (Plaza)
                                    </div>
                                    <div style={{ fontSize: '0.70rem', color: '#64748B', marginTop: '4px', lineHeight: '1.3' }}>
                                        Hojas por sublista (Papa, Plátano, Frutas, Hortalizas) con casillas de precio y puesto.
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '4px', marginTop: '0.85rem' }}>
                                    <Link
                                        href={`/admin/procurement/purchases-print?date=${deliveryDate}&orderIds=${orderIdsParam}`}
                                        target="_blank"
                                        style={{
                                            flex: 1, padding: '7px 6px', backgroundColor: '#FFFFFF', color: '#0D7A57', border: '1.5px solid #0D7A57',
                                            borderRadius: '7px', fontSize: '0.70rem', fontWeight: '900', textDecoration: 'none',
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '3px'
                                        }}
                                        title="Descargar Planillas de Plaza en PDF"
                                    >
                                        <Download size={12} /> PDF
                                    </Link>
                                    <Link
                                        href={`/admin/procurement/purchases-print?date=${deliveryDate}&orderIds=${orderIdsParam}`}
                                        target="_blank"
                                        style={{
                                            flex: 1.2, padding: '7px 8px', backgroundColor: '#0D7A57', color: '#FFFFFF',
                                            borderRadius: '7px', fontSize: '0.70rem', fontWeight: '900', textDecoration: 'none',
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '3px'
                                        }}
                                    >
                                        <Printer size={12} /> Imprimir <ExternalLink size={9} />
                                    </Link>
                                </div>
                            </div>

                            {/* Card 2B: Consolidado Maestro en Excel */}
                            <div style={{ backgroundColor: '#FFFFFF', border: '1.5px solid #BAE6FD', borderRadius: '14px', padding: '1rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#0369A1', fontWeight: '900', fontSize: '0.80rem' }}>
                                        <FileSpreadsheet size={15} /> Consolidado Digital
                                    </div>
                                    <div style={{ fontWeight: '900', fontSize: '0.88rem', color: '#0F172A', marginTop: '4px' }}>
                                        Consolidado Maestro (Excel)
                                    </div>
                                    <div style={{ fontSize: '0.70rem', color: '#64748B', marginTop: '4px', lineHeight: '1.3' }}>
                                        Matriz oficial en Excel para compras, directores y cruce contable World Office.
                                    </div>
                                </div>
                                <button
                                    onClick={handleExportMasterPurchasesExcel}
                                    style={{
                                        marginTop: '0.85rem', padding: '7px 10px', backgroundColor: '#0284C7', color: '#FFFFFF',
                                        borderRadius: '7px', fontSize: '0.72rem', fontWeight: '900', border: 'none', cursor: 'pointer',
                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                                        boxShadow: '0 2px 6px rgba(2, 132, 199, 0.3)'
                                    }}
                                    title="Descarga directa compras_YYYY-MM-DD.xlsx con matriz consolidada"
                                >
                                    <Download size={13} /> Exportar Excel (.xlsx)
                                </button>
                            </div>

                            {/* Card 2C: Control de Ingreso y Báscula (Patio / Muelle de Recibo) */}
                            <div style={{ backgroundColor: '#FFFFFF', border: '1.5px solid #FDE68A', borderRadius: '14px', padding: '1rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#B45309', fontWeight: '900', fontSize: '0.80rem' }}>
                                        <Truck size={15} /> Muelle &amp; Báscula
                                    </div>
                                    <div style={{ fontWeight: '900', fontSize: '0.88rem', color: '#0F172A', marginTop: '4px' }}>
                                        Control de Ingreso y Báscula
                                    </div>
                                    <div style={{ fontSize: '0.70rem', color: '#64748B', marginTop: '4px', lineHeight: '1.3' }}>
                                        Planilla en Carta (2 cols A-Z) para pesaje en patio, conteo a ciegas y calidad.
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '4px', marginTop: '0.85rem' }}>
                                    <Link
                                        href={`/admin/procurement/receiving-print?date=${deliveryDate}&orderIds=${orderIdsParam}`}
                                        target="_blank"
                                        style={{
                                            flex: 1, padding: '7px 6px', backgroundColor: '#FFFFFF', color: '#D97706', border: '1.5px solid #D97706',
                                            borderRadius: '7px', fontSize: '0.70rem', fontWeight: '900', textDecoration: 'none',
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '3px'
                                        }}
                                        title="Descargar Control de Ingreso y Báscula en PDF"
                                    >
                                        <Download size={12} /> PDF
                                    </Link>
                                    <Link
                                        href={`/admin/procurement/receiving-print?date=${deliveryDate}&orderIds=${orderIdsParam}`}
                                        target="_blank"
                                        style={{
                                            flex: 1.2, padding: '7px 8px', backgroundColor: '#D97706', color: '#FFFFFF',
                                            borderRadius: '7px', fontSize: '0.70rem', fontWeight: '900', textDecoration: 'none',
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '3px'
                                        }}
                                    >
                                        <Printer size={12} /> Imprimir <ExternalLink size={9} />
                                    </Link>
                                </div>
                            </div>

                            {/* Card 2D: Toma Física de Inventario en Bodega */}
                            <div style={{ backgroundColor: '#FFFFFF', border: '1.5px solid #DDD6FE', borderRadius: '14px', padding: '1rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#6D28D9', fontWeight: '900', fontSize: '0.80rem' }}>
                                        <ClipboardList size={15} /> Piso de Bodega
                                    </div>
                                    <div style={{ fontWeight: '900', fontSize: '0.88rem', color: '#0F172A', marginTop: '4px' }}>
                                        Toma Física de Inventario
                                    </div>
                                    <div style={{ fontSize: '0.70rem', color: '#64748B', marginTop: '4px', lineHeight: '1.3' }}>
                                        Hojas de conteo en bodega por familias de producto para auditar existencias iniciales.
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '4px', marginTop: '0.85rem' }}>
                                    <Link
                                        href={`/admin/inventory/physical-count-print?date=${deliveryDate}`}
                                        target="_blank"
                                        style={{
                                            flex: 1, padding: '7px 6px', backgroundColor: '#FFFFFF', color: '#6D28D9', border: '1.5px solid #6D28D9',
                                            borderRadius: '7px', fontSize: '0.70rem', fontWeight: '900', textDecoration: 'none',
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '3px'
                                        }}
                                        title="Descargar Toma Física de Inventario en PDF"
                                    >
                                        <Download size={12} /> PDF
                                    </Link>
                                    <Link
                                        href={`/admin/inventory/physical-count-print?date=${deliveryDate}`}
                                        target="_blank"
                                        style={{
                                            flex: 1.2, padding: '7px 8px', backgroundColor: '#6D28D9', color: '#FFFFFF',
                                            borderRadius: '7px', fontSize: '0.70rem', fontWeight: '900', textDecoration: 'none',
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '3px'
                                        }}
                                    >
                                        <Printer size={12} /> Imprimir <ExternalLink size={9} />
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
                                Planillas de compra, recibo y conteo físico emitidas.
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
                                Continuar a Remisiones &amp; Manifiesto <ArrowRight size={14} />
                            </button>
                        </div>
                    </div>
                )}

                {/* ========================================================================= */}
                {/* PASO 3: REMISIONES & MANIFIESTO DE DESPACHO                               */}
                {/* ========================================================================= */}
                {currentStep === 3 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        <div style={{ backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '16px', padding: '1.25rem' }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: '900', color: '#1E40AF', textTransform: 'uppercase', marginBottom: '4px' }}>
                                Remisiones de Entrega y Manifiesto de Despacho
                            </div>
                            <p style={{ margin: 0, fontSize: '0.76rem', color: '#1E3A8A', lineHeight: '1.4' }}>
                                Genera las remisiones en duplicado (Original y Copia) con la bahía asignada estampada y el manifiesto de ruta para control en portería.
                            </p>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.2rem' }}>
                            {/* 3A. Remisiones Duplicadas */}
                            <div style={{ backgroundColor: '#FFFFFF', border: '1.5px solid #93C5FD', borderRadius: '14px', padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#1D4ED8', fontWeight: '900', fontSize: '0.84rem' }}>
                                            <FileText size={16} /> Entrega a Clientes
                                        </div>
                                        <span style={{ fontSize: '0.66rem', backgroundColor: '#DBEAFE', color: '#1E40AF', padding: '2px 8px', borderRadius: '6px', fontWeight: '800' }}>
                                            {selectedOrdersList.length * 2} Hojas (Original + Copia)
                                        </span>
                                    </div>
                                    <div style={{ fontWeight: '900', fontSize: '1rem', color: '#0F172A', marginTop: '8px' }}>
                                        Remisiones de Entrega
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '6px', lineHeight: '1.4' }}>
                                        Juegos en duplicado (Original Cliente y Copia Archivo) con bahía, casillas de recibido y control de canastillas.
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
                                            <Truck size={16} /> Portería y Ruta
                                        </div>
                                        <span style={{ fontSize: '0.66rem', backgroundColor: '#F1F5F9', color: '#475569', padding: '2px 8px', borderRadius: '6px', fontWeight: '800' }}>
                                            Control de Flota
                                        </span>
                                    </div>
                                    <div style={{ fontWeight: '900', fontSize: '1rem', color: '#0F172A', marginTop: '8px' }}>
                                        Manifiesto de Despacho
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '6px', lineHeight: '1.4' }}>
                                        Relación de pedidos por vehículo, conductor, balance de canastillas y firmas de salida.
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
                                        title="Descargar Manifiesto de Despacho en formato PDF"
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
                                Remisiones de entrega y manifiesto de despacho impresos.
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
                                Rótulos Térmicos de Canastilla
                            </div>
                            <p style={{ margin: 0, fontSize: '0.76rem', color: '#6B21A8', lineHeight: '1.4' }}>
                                Etiquetas adhesivas ordenadas en la misma secuencia de entrega para rotular las canastillas por cliente y bahía.
                            </p>
                        </div>

                        {/* Card Rótulos Térmicos */}
                        <div style={{ backgroundColor: '#FFFFFF', border: '1.5px solid #C084FC', borderRadius: '14px', padding: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#7E22CE', fontWeight: '900', fontSize: '0.84rem' }}>
                                    <Tag size={16} /> Identificación de Canastillas
                                </div>
                                <div style={{ fontWeight: '900', fontSize: '1rem', color: '#0F172A', marginTop: '6px' }}>
                                    Rótulos Térmicos con QR
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px' }}>
                                    Etiquetas con cliente, bahía de muelle, horario de entrega y control de canastillas.
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
                                    title="Abrir visor web y guardar en PDF (formato 100x50mm)"
                                >
                                    <Download size={14} /> Visor PDF
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
                                    title="Imprimir rótulos térmicos en rollo continuo 100x50mm"
                                >
                                    <Printer size={14} /> Imprimir Rótulos ({totalEstimatedCrates} canastillas) <ExternalLink size={10} />
                                </Link>
                            </div>
                        </div>

                        {/* Checklist Final de Lanzamiento */}
                        <div style={{ backgroundColor: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '16px', padding: '1.25rem' }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: '900', color: '#0F172A', marginBottom: '8px' }}>
                                Resumen del Kit de Despacho Preparado:
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', fontSize: '0.74rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: step1Confirmed ? '#166534' : '#64748B' }}>
                                    <CheckCircle2 size={16} color={step1Confirmed ? '#16A34A' : '#94A3B8'} />
                                    1. Bahías de muelle asignadas &bull; Sábana alistamiento impresa
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: step2Confirmed ? '#166534' : '#64748B' }}>
                                    <CheckCircle2 size={16} color={step2Confirmed ? '#16A34A' : '#94A3B8'} />
                                    2. Compras en plaza &bull; Ingreso y báscula &bull; Conteo físico
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: step3Confirmed ? '#166534' : '#64748B' }}>
                                    <CheckCircle2 size={16} color={step3Confirmed ? '#16A34A' : '#94A3B8'} />
                                    3. Remisiones de entrega y manifiesto de despacho
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: step4Confirmed ? '#166534' : '#64748B' }}>
                                    <CheckCircle2 size={16} color={step4Confirmed ? '#16A34A' : '#94A3B8'} />
                                    4. Rótulos térmicos de canastilla emitidos
                                </div>
                            </div>
                        </div>

                        {/* Botón de Impresión de Despacho Total 1-Clic */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FEF3C7', border: '1.5px solid #FCD34D', borderRadius: '14px', padding: '12px 16px', flexWrap: 'wrap', gap: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ backgroundColor: '#FDE68A', padding: '6px', borderRadius: '8px', display: 'flex' }}>
                                    <Printer size={18} color="#92400E" />
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.82rem', fontWeight: '900', color: '#92400E' }}>
                                        Impresión Completa del Kit de Despacho (1-Clic)
                                    </div>
                                    <div style={{ fontSize: '0.70rem', color: '#B45309' }}>
                                        Imprime todos los documentos físicos de la tanda: Compras, Sábana, Remisiones y Rótulos.
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
                                    disabled={finalizingLoading || !step4Confirmed || selectedOrderIds.size === 0}
                                    style={{
                                        padding: '12px 24px',
                                        backgroundColor: (!step4Confirmed || selectedOrderIds.size === 0) ? '#94A3B8' : '#059669',
                                        color: '#FFFFFF',
                                        border: 'none',
                                        borderRadius: '12px',
                                        fontWeight: '900',
                                        fontSize: '0.90rem',
                                        letterSpacing: '0.01em',
                                        cursor: finalizingLoading ? 'wait' : (!step4Confirmed || selectedOrderIds.size === 0) ? 'not-allowed' : 'pointer',
                                        boxShadow: (!step4Confirmed || selectedOrderIds.size === 0) ? 'none' : '0 4px 14px rgba(5, 150, 105, 0.4)',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        transition: 'all 0.15s ease',
                                        opacity: (!step4Confirmed || selectedOrderIds.size === 0) ? 0.75 : 1
                                    }}
                                    title={!step4Confirmed ? 'Debes marcar la casilla de verificación antes de finalizar' : 'Sellar y lanzar tanda'}
                                >
                                    <CheckCircle2 size={18} />
                                    {finalizingLoading ? 'Sellando Tanda en Base de Datos...' : 'FINALIZAR Y ENVIAR A PROCESO LOGÍSTICO'}
                                </button>
                                <span style={{ fontSize: '0.66rem', color: !step4Confirmed ? '#DC2626' : '#64748B', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    {!step4Confirmed ? (
                                        <>
                                            <AlertTriangle size={12} color="#DC2626" />
                                            Requiere verificación de rótulos para habilitar el botón
                                        </>
                                    ) : (
                                        <>
                                            Pasa pedidos a <strong>para_compra</strong> (Compras Corabastos &amp; Alistamiento)
                                        </>
                                    )}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
