'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { isAbortError } from '@/lib/errorUtils';
import { CATEGORY_MAP } from '@/lib/constants';
import { 
  Calendar, 
  BookOpen, 
  ChevronUp, 
  List, 
  Apple, 
  Package, 
  X, 
  LayoutGrid, 
  RefreshCw, 
  Sparkles, 
  Building2, 
  MapPin, 
  Scale, 
  Clock, 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  Search, 
  Check, 
  Camera, 
  PackageX, 
  ThumbsDown, 
  HelpCircle,
  Truck,
  Eye,
  EyeOff,
  Wrench,
  TrendingUp,
  AlertOctagon,
  AlertCircle
} from 'lucide-react';

// Interfaces
interface Product {
    name: string;
    unit_of_measure: string;
    category: string;
    inventory_group?: string;
    image_url?: string;
}

interface Purchase {
    id: string;
    product_id: string;
    product: Product;
    quantity: number; // Cantidad original comprada
    picked_quantity?: number; // Cantidad recogida (si aplica)
    status: string;
    cost_center_id?: string;
    rejection_reason?: string;
    voucher_image_url?: string;
    variant_label?: string;
    task_id?: string;
    provider_id?: string;
    provider?: {
        name: string;
    };
}

export default function ReceptionPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [incomingItems, setIncomingItems] = useState<Purchase[]>([]);
    const [selectedItem, setSelectedItem] = useState<Purchase | null>(null);

    // Form States
    const [inputQty, setInputQty] = useState<string>('');
    const [attemptCount, setAttemptCount] = useState(0);
    const [attemptHistory, setAttemptHistory] = useState<{ value: number, status: 'valid' | 'invalid' }[]>([]);
    const [validationMessage, setValidationMessage] = useState<string | null>(null);
    const [qualityStatus, setQualityStatus] = useState<'green' | 'yellow' | 'red' | null>(null);
    const [showRejectionOptions, setShowRejectionOptions] = useState(false);
    const [processing, setProcessing] = useState(false);

    // Filter/Tab State
    const [activeTab, setActiveTab] = useState<'transport' | 'received'>('transport');
    const [targetDateLabel, setTargetDateLabel] = useState('');
    const [activeCategory, setActiveCategory] = useState<string>('Todas');
    const [showFilterGrid, setShowFilterGrid] = useState(false);
    const [showGuide, setShowGuide] = useState(false);
    const [guideStep, setGuideStep] = useState(0);
    const [expandedVouchers, setExpandedVouchers] = useState<Record<string, boolean>>({});
    const [rejectionFile, setRejectionFile] = useState<File | null>(null);
    const [rejectionPreview, setRejectionPreview] = useState<string | null>(null);

    const getCategoryBadgeStyle = (category: string) => {
        switch (category) {
            case 'FR': // Frutas
                return {
                    backgroundColor: 'rgba(245, 158, 11, 0.15)',
                    color: '#F59E0B'
                };
            case 'TU': // Tubérculos
                return {
                    backgroundColor: 'rgba(168, 85, 247, 0.15)',
                    color: '#A855F7'
                };
            case 'VE': // Verduras
            case 'HO': // Hortalizas
                return {
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    color: '#10B981'
                };
            default: // Despensa / Abarrotes
                return {
                    backgroundColor: 'rgba(6, 182, 212, 0.15)',
                    color: '#06B6D4'
                };
        }
    };

    const formatDateFriendly = (dateStr: string) => {
        if (!dateStr) return "";
        const date = new Date(`${dateStr}T12:00:00`); // Force mid-day to avoid TZ shifts
        const dayName = date.toLocaleDateString("es-ES", { weekday: "long" });
        const day = date.getDate();
        const month = date.toLocaleDateString("es-ES", { month: "short" });
        // Capitalize first letter
        return `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} ${day} ${month}`;
    };

    const currentTime = new Date();
    const timeString = currentTime.getHours().toString().padStart(2, '0') + ':' + currentTime.getMinutes().toString().padStart(2, '0');
    const isLocked = false; // Suspended for today

    useEffect(() => {
        fetchIncoming();
        const interval = setInterval(fetchIncoming, 30000);
        return () => clearInterval(interval);
    }, [activeTab]);

    const fetchIncoming = async () => {
        setLoading(true);
        try {
            const nowBogota = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
            const year = nowBogota.getFullYear();
            const month = String(nowBogota.getMonth() + 1).padStart(2, '0');
            const day = String(nowBogota.getDate()).padStart(2, '0');
            const todayBogota = `${year}-${month}-${day}`;
            setTargetDateLabel(todayBogota);

            // Fetch ALL relevant statuses for Reception context to calculate global progress
            const { data, error } = await supabase
                .from('purchases')
                .select(`
                    *,
                    product:products (
                        name,
                        unit_of_measure,
                        category,
                        inventory_group,
                        image_url
                    ),
                    provider:providers (
                        name
                    )
                `)
                .gte('created_at', todayBogota)
                .in('status', ['picked_up', 'partial_pickup', 'receiving', 'received_ok', 'received_review', 'received_rejected', 'received_partial'])
                .order('created_at', { ascending: false });

            if (error) throw error;
            setIncomingItems(data || []);
        } catch (err: any) {
            if (isAbortError(err)) return;
            console.error('Error fetching incoming items details:', {
                message: err?.message,
                code: err?.code,
                details: err?.details,
                hint: err?.hint,
                raw: err
            });
        } finally {
            setLoading(false);
        }
    };

    const handleStartReception = async (item: Purchase) => {
        // Al hacer click, lo pasamos a "En Recepción" y abrimos modal
        try {
            if (item.status !== 'receiving') {
                await supabase
                    .from('purchases')
                    .update({ status: 'receiving' })
                    .eq('id', item.id);
                item.status = 'receiving'; // Update local
            }
            setSelectedItem(item);
            setInputQty('');
            setAttemptCount(0);
            setAttemptHistory([]);
            setValidationMessage(null);
            setQualityStatus(null);
            setShowRejectionOptions(false);
        } catch (err: unknown) {
            if (isAbortError(err)) return;
            console.error(err);
            alert('Error al iniciar recepción');
        }
    };

    const handleValidateQuantity = () => {
        if (!selectedItem || !inputQty) return;

        const measured = parseFloat(inputQty);
        // La "Verdad" es lo que recogió el transportador (si existe) o lo comprado
        const expected = selectedItem.picked_quantity || selectedItem.quantity;

        // Tolerancia pequeña por decimales
        const isValid = Math.abs(measured - expected) < 0.05 || measured > expected;

        // Registrar intento
        setAttemptHistory(prev => [...prev, { value: measured, status: isValid ? 'valid' : 'invalid' }]);

        if (isValid) {
            // Caso: Exacto o Exceso (Aceptable)
            // Pasar a Calidad
            setValidationMessage(null);
            setAttemptCount(0); // Reset
            // Aquí podríamos pasar directo a una vista de "Calidad",
            // por ahora usamos un flag o estado visual en el modal
            setValidationMessage('✅ Cantidad Correcta. Verifique Calidad.');
        } else {
            // Caso: Déficit (Falta mercancía)
            if (attemptCount === 0) {
                setAttemptCount(1);
                setValidationMessage('⚠️ Diferencia detectada. Por favor, pese nuevamente.');
                setInputQty(''); // Limpiar para obligar a re-escribir
            } else {
                // Segundo fallo
                setValidationMessage('🛑 Diferencia confirmada. Proceda con validación de excepción.');
            }
        }
    };

    const handleSubmitResult = async (finalStatus: string, finalReason?: string) => {
        if (!selectedItem) return;
        setProcessing(true);
        try {
            let finalVoucherUrl = selectedItem.voucher_image_url || null;

            // Upload photo for rejection if present
            if (finalStatus === 'received_rejected' && rejectionFile) {
                const fileExt = rejectionFile.name.split('.').pop();
                const fileName = `rejection_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
                const filePath = `${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('vouchers')
                    .upload(filePath, rejectionFile);

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('vouchers')
                    .getPublicUrl(filePath);
                
                finalVoucherUrl = publicUrl;
            }

            const updateData: Record<string, any> = { 
                status: finalStatus,
                voucher_image_url: finalVoucherUrl
            };
            if (finalReason) updateData.rejection_reason = finalReason;

            // Use inputQty if available (as a number), otherwise fallback to the expected quantity
            const receivedQty = inputQty ? parseFloat(inputQty) : (selectedItem.picked_quantity || selectedItem.quantity);

            // 1. Update purchase status
            const { error: purchaseError } = await supabase
                .from('purchases')
                .update(updateData)
                .eq('id', selectedItem.id);

            if (purchaseError) throw purchaseError;

            // Reopen buyer task and log provider novelty if rejected in receiving
            if (finalStatus === 'received_rejected' && selectedItem.task_id) {
                const baseQtyToDeduct = selectedItem.quantity;

                const { data: task, error: taskFetchError } = await supabase
                    .from('procurement_tasks')
                    .select('id, total_requested, total_purchased, unit')
                    .eq('id', selectedItem.task_id)
                    .single();

                if (taskFetchError) {
                    console.error('Error fetching procurement task:', taskFetchError);
                } else if (task) {
                    let baseQtyToDeductConverted = baseQtyToDeduct;

                    if (selectedItem.product.unit_of_measure && task.unit && selectedItem.product.unit_of_measure !== task.unit) {
                        const { data: convData, error: convErr } = await supabase
                            .from('product_conversions')
                            .select('conversion_factor')
                            .eq('product_id', selectedItem.product_id)
                            .eq('from_unit', selectedItem.product.unit_of_measure)
                            .eq('to_unit', task.unit)
                            .maybeSingle();

                        if (convErr) {
                            console.error('Error fetching conversion factor:', convErr);
                        } else if (convData && parseFloat(convData.conversion_factor) > 0) {
                            baseQtyToDeductConverted = baseQtyToDeduct * parseFloat(convData.conversion_factor);
                        }
                    }

                    const newPurchased = Math.max(0, (task.total_purchased || 0) - baseQtyToDeductConverted);
                    
                    let newTaskStatus = 'pending';
                    if (newPurchased > 0) {
                        if (newPurchased >= task.total_requested) {
                            newTaskStatus = 'completed';
                        } else {
                            newTaskStatus = 'partial';
                        }
                    }

                    const { error: taskUpdateError } = await supabase
                        .from('procurement_tasks')
                        .update({
                            total_purchased: newPurchased,
                            status: newTaskStatus
                        })
                        .eq('id', task.id);

                    if (taskUpdateError) {
                        console.error('Error updating procurement task:', taskUpdateError);
                    }
                }

                // Log the novelty in provider_novelties table
                const noveltyPayload = {
                    purchase_id: selectedItem.id,
                    task_id: selectedItem.task_id || null,
                    provider_id: selectedItem.provider_id || null,
                    product_id: selectedItem.product_id,
                    variant_label: selectedItem.variant_label || null,
                    novelty_type: 'rejection',
                    quantity: selectedItem.quantity,
                    unit: selectedItem.product.unit_of_measure || null,
                    reason: finalReason || 'Rechazado en recepción',
                    description: `Rechazado en bodega durante el recibo por control de calidad.`,
                    evidence_url: finalVoucherUrl || null,
                };

                const { error: noveltyError } = await supabase
                    .from('provider_novelties')
                    .insert([noveltyPayload]);

                if (noveltyError) {
                    console.error('Error inserting provider novelty:', noveltyError);
                }
            }

            // Calculate excess (Sobrante)
            const expected = selectedItem.picked_quantity || selectedItem.quantity;
            let notePrefix = '';
            if (finalStatus !== 'received_rejected' && receivedQty > expected) {
                const diff = parseFloat((receivedQty - expected).toFixed(2));
                notePrefix = `[Sobrante: +${diff} ${selectedItem.product.unit_of_measure}] `;
            }

            // 2. Inventory Integration
            const { data: warehouseData } = await supabase.from('warehouses').select('id').limit(1).single();
            
            if (warehouseData) {
                if (finalStatus !== 'received_rejected') {
                    const statusTo = (finalStatus === 'received_ok') ? 'available' : 'in_process';
                    
                    await supabase.from('inventory_movements').insert([{
                        product_id: selectedItem.product_id,
                        warehouse_id: warehouseData.id,
                        quantity: receivedQty,
                        type: 'entry',
                        status_to: statusTo,
                        notes: `${notePrefix}Ingreso por recepción: ${selectedItem.variant_label ? `(${selectedItem.variant_label}) ` : ''}- ${finalReason || 'OK'}`,
                        reference_type: 'purchase_reception',
                        reference_id: selectedItem.id
                    }]);
                } else {
                    // Record absolute rejection in inventory movements with quantity 0
                    await supabase.from('inventory_movements').insert([{
                        product_id: selectedItem.product_id,
                        warehouse_id: warehouseData.id,
                        quantity: 0,
                        type: 'entry',
                        status_to: 'rejected',
                        notes: `Rechazo en recepción: ${selectedItem.variant_label ? `(${selectedItem.variant_label}) ` : ''}- ${finalReason || 'Motivo no especificado'}`,
                        reference_type: 'purchase_reception',
                        reference_id: selectedItem.id
                    }]);
                }
            }

            window.showToast?.('Recepción registrada e inventario actualizado', 'success');
            setSelectedItem(null);
            setRejectionFile(null);
            setRejectionPreview(null);
            fetchIncoming();
        } catch (err: unknown) {
            console.error('Error in handleSubmitResult:', err);
            const message = err instanceof Error ? err.message : 'Error desconocido';
            alert('Error al guardar recepción: ' + message);
        } finally {
            setProcessing(false);
        }
    };

    const handleCloseModal = async () => {
        if (!selectedItem) return;

        // Si el usuario cierra sin finalizar, devolvemos el item a "picked_up" (pendiente)
        // para que no quede bloqueado en "En Recepción"
        if (selectedItem.status === 'receiving') {
            await supabase
                .from('purchases')
                .update({ status: 'picked_up' })
                .eq('id', selectedItem.id);

            // Actualizar UI inmediatamente
            setIncomingItems(prev => prev.map(i => i.id === selectedItem.id ? { ...i, status: 'picked_up' } : i));
        }

        setShowRejectionOptions(false);
        setRejectionFile(null);
        setRejectionPreview(null);
        setSelectedItem(null);
    };

    // Helper to identify inventory group (prioritizing product field, falling back dynamically on category)
    const getInventoryGroup = (item: Purchase) => {
        if (item.product.inventory_group) return item.product.inventory_group;
        const cat = item.product.category;
        if (['LA', 'DE', 'CO'].includes(cat)) return "INVENTARIO DE ABARROTES, FRUTOS SECOS, LACTEOS Y CARNES FRIAS";
        if (cat === 'FR') return "INVENTARIO DE FRUTAS Y OTROS";
        if (cat === 'HO') return "INVENTARIO DE HORTALIZAS";
        if (cat === 'TU') return "INVENTARIO DE PAPAS, PLATANO, TOMATE Y AGUACATES";
        if (cat === 'VE') return "INVENTARIO DE VERDURAS";
        return "INVENTARIO DE ABARROTES, FRUTOS SECOS, LACTEOS Y CARNES FRIAS"; // Default fallback
    };

    // Category mappings for stats and filters
    const categoryStats = [
        { name: "ABARROTES & LÁCTEOS", dbValue: "INVENTARIO DE ABARROTES, FRUTOS SECOS, LACTEOS Y CARNES FRIAS" },
        { name: "FRUTAS", dbValue: "INVENTARIO DE FRUTAS Y OTROS" },
        { name: "HORTALIZAS", dbValue: "INVENTARIO DE HORTALIZAS" },
        { name: "PAPAS, PLÁTANO, TOMATE", dbValue: "INVENTARIO DE PAPAS, PLATANO, TOMATE Y AGUACATES" },
        { name: "VERDURAS", dbValue: "INVENTARIO DE VERDURAS" }
    ].map(cat => {
        const catItems = incomingItems.filter(i => getInventoryGroup(i) === cat.dbValue);
        const completed = catItems.filter(i => ['received_ok', 'received_review', 'received_partial'].includes(i.status)).length;
        const percentage = catItems.length > 0 ? Math.round((completed / catItems.length) * 100) : 0;
        return {
            name: cat.name,
            dbValue: cat.dbValue,
            percentage,
            count: catItems.length
        };
    });

    const visibleItems = incomingItems.filter(item => {
        // Special Filter: Rejecteds (Global)
        if (activeCategory === 'Rechazados') return item.status === 'received_rejected';

        // Category Filter
        if (activeCategory !== 'Todas') {
            const groupObj = categoryStats.find(s => s.name === activeCategory);
            if (groupObj && getInventoryGroup(item) !== groupObj.dbValue) {
                return false;
            }
        }

        // Tab Filter
        if (activeTab === 'transport') return ['picked_up', 'partial_pickup', 'receiving', 'received_partial'].includes(item.status);
        // 'received' tab
        return ['received_ok', 'received_review', 'received_rejected'].some(s => item.status.includes(s));
    }).sort((a, b) => {
        if (a.status === 'received_partial' && b.status !== 'received_partial') return -1;
        if (a.status !== 'received_partial' && b.status === 'received_partial') return 1;
        return 0;
    });

    // PENDIENTES: Lo que viene en camino (completo) o se está recibiendo ahora
    const pendingCount = incomingItems.filter(p => ['picked_up', 'receiving'].includes(p.status)).length;
    
    // PARCIALES: Lo que llegó incompleto del mercado O lo que recibió incompleto la bodega
    const partialCount = incomingItems.filter(p => ['partial_pickup', 'received_partial'].includes(p.status)).length;

    // ÉXITO: Recibido conforme
    const successCount = incomingItems.filter(p => ['received_ok', 'received_review'].includes(p.status)).length;
    
    // RECHAZO: No recibido en bodega
    const rejectedCount = incomingItems.filter(p => p.status === 'received_rejected').length;

    const completedCount = successCount + partialCount; // Definimos progreso como lo que ya entró (aunque sea parcial)
    const totalCount = incomingItems.length;
    
    // El progreso real hacia la meta de bodega (sin contar rechazados como "avance exitoso")
    const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    
    const successPct = totalCount > 0 ? (successCount / totalCount) * 100 : 0;
    const partialPct = totalCount > 0 ? (partialCount / totalCount) * 100 : 0;
    // El porcentaje restante es lo que falta (Transito + Rechazo)

    return (
        <div style={{ fontFamily: 'Inter, sans-serif', backgroundColor: 'var(--ops-bg)', minHeight: '100vh', padding: '1rem', paddingBottom: '5rem' }}>

            {/* Título y Botón (No pegajosos, se ocultan al hacer scroll) */}
            <div
                className="no-print"
                style={{
                    paddingTop: "0.5rem",
                    paddingBottom: "0.5rem",
                    backgroundColor: "var(--ops-bg)",
                }}
            >
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "0.5rem",
                        padding: "0 0.5rem",
                        flexWrap: "wrap",
                        gap: "0.5rem"
                    }}
                >
                    <div>
                        <h1 
                            className="header-title-container"
                            onClick={() => router.push('/ops')}
                            style={{ fontSize: "1.5rem", fontWeight: "900", margin: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "nowrap" }}
                        >
                            <span style={{ whiteSpace: "nowrap" }}>Recepción <span style={{ color: "var(--ops-primary)" }}>Bodega</span></span>
                            <span className="header-date-badge" style={{ fontSize: "0.8rem", color: "#F59E0B", fontWeight: "800", backgroundColor: "rgba(245, 158, 11, 0.12)", padding: "2px 8px", borderRadius: "6px", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                <Calendar size={14} /> {formatDateFriendly(targetDateLabel) || "Cargando..."}
                            </span>
                        </h1>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                        <button
                            onClick={() => { setShowGuide(true); setGuideStep(0); }}
                            className="header-tutor-btn"
                            style={{
                                backgroundColor: 'var(--ops-surface)', color: 'var(--ops-primary)', border: '1px solid var(--ops-primary)',
                                padding: '0.5rem 0.75rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: '900', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap'
                            }}
                        >
                            <BookOpen size={14} /> TUTOR
                        </button>
                    </div>
                </div>
            </div>

            {/* STICKY CONTAINER (Barra de progreso + Dashboard de estados) */}
            <div
                className="no-print"
                style={{
                    position: "sticky",
                    top: "57px",
                    zIndex: 50,
                    backgroundColor: "var(--ops-bg)",
                    paddingBottom: "0.8rem",
                    marginBottom: "1rem",
                    borderBottom: "1px solid var(--ops-border)",
                }}
            >
                {/* Barra de Progreso Lineal (General) */}
                {totalCount > 0 && (
                    <div style={{ width: "100%", marginTop: "0.4rem", marginBottom: "1rem", padding: "0 0.5rem" }}>
                        <div style={{
                            width: "100%",
                            height: "8px",
                            backgroundColor: "var(--ops-surface)",
                            borderRadius: "4px",
                            overflow: "hidden",
                            border: "1px solid var(--ops-border)",
                        }}>
                            <div
                                style={{
                                    width: `${progress}%`,
                                    height: "100%",
                                    backgroundImage: progress === 100
                                        ? "linear-gradient(90deg, #059669, #10B981)"
                                        : "linear-gradient(90deg, #3B82F6, #06B6D4)",
                                    transition: "width 1s cubic-bezier(0.4, 0, 0.2, 1)",
                                    borderRadius: "4px",
                                }}
                            />
                        </div>
                    </div>
                )}

                {/* Dashboard de Estados (Semáforo) */}
                {totalCount > 0 && (
                    <div
                        style={{
                            backgroundColor: "var(--ops-surface)",
                            padding: "0.6rem 0.8rem",
                            borderRadius: "16px",
                            border: "1px solid var(--ops-border)",
                            boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                            display: "flex",
                            justifyContent: "space-evenly",
                            alignItems: "center",
                        }}
                    >
                        {/* Pendientes */}
                        <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: "1.1rem", fontWeight: "900", color: "var(--ops-text-muted)" }}>
                                {pendingCount}
                            </div>
                            <div style={{ fontSize: "0.55rem", fontWeight: "bold", color: "var(--ops-text-muted)", textTransform: "uppercase" }}>
                                PENDIENTES
                            </div>
                        </div>

                        {/* Parciales */}
                        <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: "1.1rem", fontWeight: "900", color: "#F59E0B" }}>
                                {partialCount}
                            </div>
                            <div style={{ fontSize: "0.55rem", fontWeight: "bold", color: "#F59E0B", textTransform: "uppercase" }}>
                                PARCIALES
                            </div>
                        </div>

                        {/* Recibidos */}
                        <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: "1.1rem", fontWeight: "900", color: "var(--ops-primary)" }}>
                                {successCount}
                            </div>
                            <div style={{ fontSize: "0.55rem", fontWeight: "bold", color: "var(--ops-primary)", textTransform: "uppercase" }}>
                                RECIBIDOS
                            </div>
                        </div>

                        {/* Rechazados */}
                        <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: "1.1rem", fontWeight: "900", color: "#EF4444" }}>
                                {rejectedCount}
                            </div>
                            <div style={{ fontSize: "0.55rem", fontWeight: "bold", color: "#EF4444", textTransform: "uppercase" }}>
                                RECHAZADOS
                            </div>
                        </div>

                        {/* Avance Badge */}
                        <div
                            style={{
                                textAlign: "center",
                                borderLeft: "1px solid var(--ops-border)",
                                paddingLeft: "0.8rem",
                                marginLeft: "0.2rem",
                                display: "flex",
                                alignItems: "center",
                                gap: "0.4rem"
                            }}
                        >
                            <div
                                style={{
                                    backgroundColor: progress === 100 ? "var(--ops-primary)" : "rgba(59, 130, 246, 0.15)",
                                    padding: "0.4rem 0.6rem",
                                    borderRadius: "10px",
                                    border: `1px solid ${progress === 100 ? "var(--ops-primary)" : "rgba(59, 130, 246, 0.3)"}`,
                                    boxShadow: progress > 0 ? "0 0 15px rgba(59, 130, 246, 0.2)" : "none",
                                    transition: "all 0.4s ease",
                                }}
                            >
                                <div style={{ fontSize: "1.2rem", fontWeight: "900", color: progress === 100 ? "white" : "var(--ops-text)", lineHeight: "1" }}>
                                    {Math.round(progress)}%
                                </div>
                                <div style={{ fontSize: "0.5rem", fontWeight: "900", color: progress === 100 ? "white" : "var(--ops-text)", opacity: 0.8, marginTop: "2px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                    AVANCE
                                </div>
                            </div>
                            <button
                                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                                style={{
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    border: '1px solid var(--ops-border)',
                                    color: 'var(--ops-text)',
                                    borderRadius: '8px',
                                    width: '28px',
                                    height: '28px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    fontSize: '0.8rem',
                                    transition: 'all 0.2s',
                                    flexShrink: 0
                                }}
                                title="Subir al inicio"
                            >
                                <ChevronUp size={16} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Category Filter — Colapsable (Mismo lenguaje de compras) */}
            <div style={{ marginBottom: "0.6rem" }}>
                <style dangerouslySetInnerHTML={{ __html: `
                    @keyframes fadeSlideDown {
                        from { opacity: 0; transform: translateY(-6px); }
                        to   { opacity: 1; transform: translateY(0); }
                    }
                `}} />

                {/* Barra activa: siempre visible */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    {/* Pill de categoría activa */}
                    <div
                        style={{
                            flex: 1,
                            padding: "0.5rem 1rem",
                            borderRadius: "12px",
                            backgroundColor: activeCategory === 'Rechazados' ? "rgba(239, 68, 68, 0.12)" : "rgba(16, 185, 129, 0.12)",
                            border: activeCategory === 'Rechazados' ? "1px solid #EF4444" : "1px solid var(--ops-primary)",
                            color: activeCategory === 'Rechazados' ? "#EF4444" : "var(--ops-text)",
                            fontSize: "0.75rem",
                            fontWeight: "800",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                        }}
                    >
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                            {activeCategory === "Todas" ? (
                                <><List size={14} /> Ver Todo</>
                            ) : activeCategory === "Rechazados" ? (
                                <><XCircle size={14} /> Rechazados</>
                            ) : (
                                (() => {
                                    const s = categoryStats.find(s => s.name === activeCategory);
                                    return `${activeCategory}${s ? ` · ${s.percentage}%` : ""}`;
                                })()
                            )}
                        </span>
                        {activeCategory !== "Todas" && (
                            <span style={{ opacity: 0.7, fontSize: "0.65rem" }}>activo</span>
                        )}
                    </div>

                    {/* Botón toggle del grid */}
                    <button
                        onClick={() => setShowFilterGrid(v => !v)}
                        title={showFilterGrid ? "Ocultar filtros" : "Cambiar categoría"}
                        style={{
                            width: "40px",
                            height: "40px",
                            borderRadius: "12px",
                            border: `1px solid ${showFilterGrid ? "var(--ops-primary)" : "var(--ops-border)"}`,
                            backgroundColor: showFilterGrid ? "rgba(16,185,129,0.15)" : "var(--ops-surface)",
                            color: showFilterGrid ? "var(--ops-primary)" : "var(--ops-text-muted)",
                            fontSize: "1rem",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            flexShrink: 0,
                            transition: "all 0.2s ease",
                        }}
                    >
                        {showFilterGrid ? <X size={16} /> : <LayoutGrid size={16} />}
                    </button>
                </div>

                {/* Grid de Filtros */}
                {showFilterGrid && (
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: "0.4rem",
                            marginTop: "0.5rem",
                            animation: "fadeSlideDown 0.18s ease-out",
                        }}
                    >
                        {["Todas", ...categoryStats.map(s => s.name), "Rechazados"].map((cat) => {
                            const stat = categoryStats.find(s => s.name === cat);
                            const isActive = activeCategory === cat;
                            const pct = cat === "Todas" ? progress : (stat?.percentage ?? null);

                            // Custom styling for Rechazados button in grid
                            if (cat === "Rechazados") {
                                return (
                                    <button
                                        key={cat}
                                        onClick={() => {
                                            setActiveCategory(cat);
                                            setShowFilterGrid(false);
                                        }}
                                        style={{
                                            padding: "0.55rem 0.75rem",
                                            borderRadius: "10px",
                                            border: isActive ? "1px solid #EF4444" : "1px solid #7F1D1D",
                                            backgroundColor: isActive ? "rgba(239, 68, 68, 0.12)" : "var(--ops-surface)",
                                            color: isActive ? "#EF4444" : "#F87171",
                                            fontSize: "0.7rem",
                                            fontWeight: "700",
                                            textAlign: "left",
                                            cursor: "pointer",
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: "2px",
                                            transition: "all 0.15s ease",
                                        }}
                                    >
                                        <span style={{ textTransform: "uppercase", letterSpacing: "0.03em", lineHeight: 1.2, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                            <XCircle size={14} /> RECHAZADOS
                                        </span>
                                        <span style={{ fontSize: "0.65rem", fontWeight: "900", color: "#EF4444" }}>
                                            {rejectedCount} rechazados
                                        </span>
                                    </button>
                                );
                            }

                            return (
                                <button
                                    key={cat}
                                    onClick={() => {
                                        setActiveCategory(cat);
                                        setShowFilterGrid(false);
                                    }}
                                    style={{
                                        padding: "0.55rem 0.75rem",
                                        borderRadius: "10px",
                                        border: isActive 
                                            ? "1px solid var(--ops-primary)" 
                                            : pct === 100 
                                                ? "1px solid rgba(16, 185, 129, 0.6)" 
                                                : "1px solid var(--ops-border)",
                                        backgroundColor: isActive
                                            ? "rgba(16, 185, 129, 0.12)"
                                            : pct === 100 
                                                ? "rgba(16, 185, 129, 0.15)"
                                                : "var(--ops-surface)",
                                        color: isActive ? "var(--ops-text)" : pct === 100 ? "#059669" : "var(--ops-text-muted)",
                                        fontSize: "0.7rem",
                                        fontWeight: "700",
                                        textAlign: "left",
                                        cursor: "pointer",
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: "2px",
                                        transition: "all 0.15s ease",
                                        boxShadow: pct === 100 && !isActive ? "0 0 12px rgba(16, 185, 129, 0.25)" : "none",
                                        transform: pct === 100 && !isActive ? "scale(1.02)" : "scale(1)",
                                    }}
                                >
                                    <span style={{ textTransform: "uppercase", letterSpacing: "0.03em", lineHeight: 1.2, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                        {cat === "Todas" ? <List size={12} /> : null}
                                        {cat === "Todas" ? "VER TODO" : (
                                            <>
                                                {cat} {pct === 100 && <Sparkles size={12} style={{ color: "var(--ops-primary)", display: "inline-flex" }} />}
                                            </>
                                        )}
                                    </span>
                                    {pct !== null && (
                                        <span
                                            style={{
                                                fontSize: "0.65rem",
                                                fontWeight: "900",
                                                opacity: isActive ? 0.85 : 0.9,
                                                color: isActive
                                                    ? (pct === 100 ? "#10B981" : pct > 0 ? "#F59E0B" : "inherit")
                                                    : pct === 100 ? "#10B981" : pct > 0 ? "#F59E0B" : "inherit",
                                                textShadow: pct === 100 && !isActive ? "0 0 8px rgba(16, 185, 129, 0.4)" : "none",
                                            }}
                                        >
                                            {pct === 100 ? "✓ 100% LISTO" : `${pct}% listo`}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Segmented Control Selector (Mismo estilo glassmorphic que recogida) */}
            <div style={{ 
                background: 'color-mix(in srgb, var(--ops-surface) 65%, transparent)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                padding: '4px',
                borderRadius: '12px',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                marginBottom: '0.65rem',
                border: '1px solid color-mix(in srgb, var(--ops-border) 60%, transparent)',
                marginLeft: '0.5rem',
                marginRight: '0.5rem',
                boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.04)',
            }}>
                <button
                    onClick={() => setActiveTab('transport')}
                    style={{
                        padding: '0.45rem 0.2rem',
                        borderRadius: '8px',
                        border: 'none',
                        backgroundColor: activeTab === 'transport' ? 'var(--ops-primary)' : 'transparent',
                        color: activeTab === 'transport' ? '#FFFFFF' : 'var(--ops-text-muted)',
                        fontWeight: '900',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.3rem',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    }}
                >
                    <Truck size={14} /> Tránsito
                </button>
                <button
                    onClick={() => setActiveTab('received')}
                    style={{
                        padding: '0.45rem 0.2rem',
                        borderRadius: '8px',
                        border: 'none',
                        backgroundColor: activeTab === 'received' ? 'var(--ops-primary)' : 'transparent',
                        color: activeTab === 'received' ? '#FFFFFF' : 'var(--ops-text-muted)',
                        fontWeight: '900',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.3rem',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    }}
                >
                    <CheckCircle size={14} /> Historial
                </button>
            </div>

            {/* MAIN GRID */}
            <div style={{ padding: '1rem 0.5rem' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: '#9CA3AF' }}>Cargando entradas...</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                        {visibleItems.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '4rem', backgroundColor: 'var(--ops-surface)', border: '1px solid var(--ops-border)', borderRadius: '16px', color: 'var(--ops-text-muted)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                                <p style={{ fontSize: '1.2rem', fontWeight: '500' }}>No hay mercancía en esta sección.</p>
                            </div>
                        )}

                        {visibleItems.map(item => {
                            const isDone = ['received_ok', 'received_review'].includes(item.status);
                            const isPartial = item.status === 'received_partial';
                            const isRejected = item.status === 'received_rejected';
                            const isReceiving = item.status === 'receiving';

                            let statusText = 'PENDIENTE';
                            let statusColor = 'var(--ops-text-muted)';
                            let leftBorderColor = 'var(--ops-border)';

                            if (isDone) {
                                statusText = 'RECIBIDO';
                                statusColor = 'var(--ops-primary)';
                                leftBorderColor = 'var(--ops-primary)';
                            } else if (isPartial) {
                                statusText = 'PARCIAL';
                                statusColor = '#F59E0B';
                                leftBorderColor = '#F59E0B';
                            } else if (isRejected) {
                                statusText = 'RECHAZADO';
                                statusColor = '#EF4444';
                                leftBorderColor = '#EF4444';
                            } else if (isReceiving) {
                                statusText = 'EN PROCESO';
                                statusColor = '#3B82F6';
                                leftBorderColor = '#3B82F6';
                            }

                            return (
                                <div
                                    key={item.id}
                                    onClick={() => activeTab === 'transport' ? handleStartReception(item) : null}
                                    style={{
                                        backgroundColor: 'var(--ops-surface)',
                                        borderRadius: '16px',
                                        padding: '1rem',
                                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
                                        border: '1px solid var(--ops-border)',
                                        borderLeft: `5px solid ${leftBorderColor}`,
                                        cursor: activeTab === 'transport' ? 'pointer' : 'default',
                                        transition: 'all 0.2s ease',
                                        display: 'grid',
                                        gridTemplateColumns: '70px 1fr',
                                        gap: '0.8rem',
                                        alignItems: 'center',
                                        opacity: (isDone || isRejected) ? 0.8 : 1,
                                    }}
                                >
                                    {/* Product image */}
                                    <div style={{
                                        width: '70px',
                                        height: '70px',
                                        borderRadius: '10px',
                                        overflow: 'hidden',
                                        backgroundColor: 'var(--ops-bg)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        border: '1px solid var(--ops-border)'
                                    }}>
                                        {item.product?.image_url ? (
                                            <img src={item.product.image_url} alt={item.product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : (
                                            <Package size={24} style={{ opacity: 0.6, color: 'var(--ops-text-muted)' }} />
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem', gap: '0.5rem' }}>
                                            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                                <span style={{
                                                    backgroundColor: getCategoryBadgeStyle(item.product.category).backgroundColor,
                                                    color: getCategoryBadgeStyle(item.product.category).color,
                                                    padding: '0.15rem 0.5rem',
                                                    borderRadius: '999px',
                                                    fontSize: '0.65rem',
                                                    fontWeight: '700'
                                                }}>
                                                    {CATEGORY_MAP[item.product.category] || item.product.category}
                                                </span>
                                                {item.voucher_image_url && activeTab === 'received' && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setExpandedVouchers(prev => ({
                                                                ...prev,
                                                                [item.id]: !prev[item.id]
                                                            }));
                                                        }}
                                                        style={{
                                                            backgroundColor: expandedVouchers[item.id] ? 'var(--ops-primary)' : 'rgba(59, 130, 246, 0.1)',
                                                            color: expandedVouchers[item.id] ? '#FFFFFF' : '#3B82F6',
                                                            border: 'none',
                                                            borderRadius: '999px',
                                                            padding: '0.15rem 0.5rem',
                                                            fontSize: '0.65rem',
                                                            fontWeight: '700',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '2px',
                                                            transition: 'all 0.2s'
                                                        }}
                                                    >
                                                        <Camera size={12} /> {expandedVouchers[item.id] ? 'Ocultar Soporte' : 'Ver Soporte'}
                                                    </button>
                                                )}
                                            </div>
                                            <span style={{ fontSize: '0.65rem', fontWeight: '900', color: statusColor }}>{statusText}</span>
                                        </div>

                                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '800', color: isDone ? 'var(--ops-text-muted)' : 'var(--ops-text)', lineHeight: '1.3' }}>
                                            {item.product.name}
                                            {item.variant_label && (
                                                <span style={{ color: 'var(--ops-primary)', fontWeight: 'bold', marginLeft: '0.3rem', fontSize: '0.8rem' }}>
                                                    ({item.variant_label})
                                                </span>
                                            )}
                                        </h3>

                                        <div style={{ fontSize: '0.8rem', color: 'var(--ops-text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.2rem' }}>
                                            <span>Unidad:</span>
                                            <strong style={{ color: 'var(--ops-text)' }}>{item.product.unit_of_measure}</strong>
                                        </div>

                                        {item.provider && (
                                            <div style={{ fontSize: '0.8rem', color: 'var(--ops-text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.2rem' }}>
                                                <Building2 size={14} /> <span>Prov:</span>
                                                <strong style={{ color: 'var(--ops-text)' }}>{item.provider.name}</strong>
                                            </div>
                                        )}

                                        {item.voucher_image_url && activeTab === 'received' && expandedVouchers[item.id] && (
                                            <div style={{ 
                                                width: '100%', maxHeight: '200px', borderRadius: '12px', overflow: 'hidden', 
                                                marginTop: '0.5rem', border: '1px solid var(--ops-border)', cursor: 'pointer'
                                            }} onClick={(e) => { e.stopPropagation(); window.open(item.voucher_image_url, '_blank'); }}>
                                                <img 
                                                    src={item.voucher_image_url} 
                                                    alt="Voucher" 
                                                    style={{ width: '100%', maxHeight: '200px', objectFit: 'contain', backgroundColor: '#000' }} 
                                                />
                                            </div>
                                        )}

                                        {item.status === 'received_rejected' && (
                                            <div style={{ marginTop: '0.5rem', padding: '0.4rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', color: '#EF4444', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                                Motivo: {item.rejection_reason || 'Sin especificar'}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>


            {/* MODAL DE RECEPCIÓN */}
            {
                selectedItem && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)',
                        display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000
                    }}>
                        <style dangerouslySetInnerHTML={{ __html: `
                            @keyframes slideUpModal {
                                from { transform: translateY(100%); }
                                to { transform: translateY(0); }
                            }
                            .mobile-bottom-sheet {
                                animation: slideUpModal 0.25s cubic-bezier(0.16, 1, 0.3, 1);
                            }
                        `}} />
                        <div 
                            className="mobile-bottom-sheet"
                            style={{
                                position: 'relative',
                                backgroundColor: 'var(--ops-surface)',
                                color: 'var(--ops-text)',
                                borderTop: '1px solid var(--ops-border)',
                                borderLeft: '1px solid var(--ops-border)',
                                borderRight: '1px solid var(--ops-border)',
                                width: '100%',
                                maxWidth: '600px',
                                borderTopLeftRadius: '28px',
                                borderTopRightRadius: '28px',
                                padding: '2rem',
                                paddingBottom: 'calc(2rem + env(safe-area-inset-bottom, 0px))',
                                boxShadow: '0 -10px 30px rgba(0, 0, 0, 0.3)',
                                maxHeight: '90vh',
                                overflowY: 'auto'
                            }}
                        >
                            <h2 style={{ fontSize: '1.5rem', fontWeight: '900', color: 'var(--ops-text)', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                Validar Entrada <Scale size={18} style={{ color: 'var(--ops-primary)' }} />
                            </h2>
                            <button
                                onClick={() => { setQualityStatus(null); setShowRejectionOptions(true); }}
                                style={{
                                    display: 'block', background: 'none', border: 'none', color: '#DC2626',
                                    fontSize: '0.8rem', fontWeight: '800', cursor: 'pointer', textDecoration: 'underline',
                                    marginBottom: '1rem', padding: 0
                                }}
                            >
                                ¿Rechazar Entrada?
                            </button>
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                                <div style={{ backgroundColor: 'var(--ops-bg)', border: '1px solid var(--ops-border)', padding: '0.5rem 1rem', borderRadius: '8px' }}>
                                    <span style={{ fontSize: '0.85rem', color: 'var(--ops-text-muted)', display: 'block' }}>Producto</span>
                                    <strong style={{ color: 'var(--ops-text)' }}>
                                        {selectedItem.product.name}
                                        {selectedItem.variant_label && ` (${selectedItem.variant_label})`}
                                    </strong>
                                </div>
                                <div style={{ backgroundColor: 'var(--ops-bg)', border: '1px solid var(--ops-border)', padding: '0.5rem 1rem', borderRadius: '8px' }}>
                                    <span style={{ fontSize: '0.85rem', color: 'var(--ops-text-muted)', display: 'block' }}>Unidad</span>
                                    <strong style={{ color: 'var(--ops-text)' }}>{selectedItem.product.unit_of_measure}</strong>
                                </div>

                                {/* Intentos Dinámicos */}
                                {attemptHistory.map((attempt, idx) => (
                                    <div key={idx} style={{
                                        backgroundColor: attempt.status === 'valid' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                        padding: '0.5rem 1rem', borderRadius: '8px',
                                        border: attempt.status === 'valid' ? '1px solid #10B981' : '1px solid #EF4444'
                                    }}>
                                        <span style={{ fontSize: '0.85rem', color: attempt.status === 'valid' ? '#10B981' : '#EF4444', display: 'block' }}>
                                            {idx === 0 ? '1er' : '2do'} intento
                                        </span>
                                        <strong style={{ color: attempt.status === 'valid' ? '#10B981' : '#EF4444', fontSize: '1.2rem' }}>
                                            {attempt.value}
                                        </strong>
                                    </div>
                                ))}
                            </div>

                            {showRejectionOptions ? (
                                <div style={{ animation: 'fadeIn 0.3s' }}>
                                    <h3 style={{ textAlign: 'center', color: '#EF4444', marginBottom: '1rem', fontSize: '1.2rem', fontWeight: '800' }}>¿Por qué se rechaza?</h3>
                                    
                                    {/* PHOTO EVIDENCE INPUT */}
                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <input
                                            type="file"
                                            id="rejectionPhotoInput"
                                            accept="image/*"
                                            capture="environment"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                    setRejectionFile(file);
                                                    setRejectionPreview(URL.createObjectURL(file));
                                                }
                                            }}
                                            style={{ display: 'none' }}
                                        />
                                        {rejectionPreview ? (
                                            <div style={{ position: 'relative', width: '100%', height: '180px', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--ops-border)', backgroundColor: '#000' }}>
                                                <img src={rejectionPreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                                <div style={{ position: 'absolute', bottom: '0.5rem', right: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                                                    <button onClick={(e) => { e.preventDefault(); document.getElementById("rejectionPhotoInput")?.click(); }} style={{ padding: '0.4rem 0.8rem', background: 'rgba(0,0,0,0.7)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><RefreshCw size={12} /> Cambiar Foto</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div
                                                onClick={() => document.getElementById("rejectionPhotoInput")?.click()}
                                                style={{
                                                    width: '100%',
                                                    minHeight: '110px',
                                                    borderRadius: '12px',
                                                    backgroundColor: 'rgba(239, 68, 68, 0.05)',
                                                    border: '2px dashed #EF4444',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    color: '#EF4444',
                                                    cursor: 'pointer',
                                                    padding: '1.2rem'
                                                }}
                                            >
                                                <Camera size={32} />
                                                <span style={{ fontSize: '0.85rem', fontWeight: '900', marginTop: '0.3rem' }}>FOTO OBLIGATORIA — TAP PARA AGREGAR</span>
                                                <span style={{ fontSize: '0.7rem', marginTop: '0.2rem', opacity: 0.8 }}>Se requiere evidencia para registrar el rechazo</span>
                                            </div>
                                        )}
                                    </div>

                                    {!rejectionFile && (
                                        <div style={{ textAlign: 'center', padding: '0.5rem', marginBottom: '1rem', backgroundColor: 'rgba(239, 68, 68, 0.08)', borderRadius: '10px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                                            <span style={{ fontSize: '0.8rem', color: '#EF4444', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '4px', justifyContent: 'center', width: '100%' }}><Camera size={14} /> Agrega la foto antes de seleccionar el motivo</span>
                                        </div>
                                    )}

                                    <div style={{ display: 'grid', gap: '0.8rem' }}>
                                        <button
                                            disabled={!rejectionFile || processing}
                                            onClick={() => handleSubmitResult('received_rejected', 'Mala Calidad / Feo')}
                                            style={{ 
                                                padding: '1rem', borderRadius: '12px', 
                                                backgroundColor: rejectionFile ? '#FEE2E2' : 'var(--ops-border)', 
                                                color: rejectionFile ? '#DC2626' : 'var(--ops-text-muted)', 
                                                border: 'none', fontWeight: 'bold', fontSize: '1rem', 
                                                cursor: rejectionFile ? 'pointer' : 'not-allowed',
                                                opacity: rejectionFile ? 1 : 0.5,
                                                display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'center'
                                            }}
                                        >
                                            <ThumbsDown size={14} /> Mala Calidad / Feo
                                        </button>
                                        <button
                                            disabled={!rejectionFile || processing}
                                            onClick={() => handleSubmitResult('received_rejected', 'Producto Equivocado')}
                                            style={{ 
                                                padding: '1rem', borderRadius: '12px', 
                                                backgroundColor: rejectionFile ? '#FEE2E2' : 'var(--ops-border)', 
                                                color: rejectionFile ? '#DC2626' : 'var(--ops-text-muted)', 
                                                border: 'none', fontWeight: 'bold', fontSize: '1rem', 
                                                cursor: rejectionFile ? 'pointer' : 'not-allowed',
                                                opacity: rejectionFile ? 1 : 0.5,
                                                display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'center'
                                            }}
                                        >
                                            <XCircle size={14} /> Producto Equivocado
                                        </button>
                                        <button
                                            disabled={!rejectionFile || processing}
                                            onClick={() => handleSubmitResult('received_rejected', 'Averiado / Roto')}
                                            style={{ 
                                                padding: '1rem', borderRadius: '12px', 
                                                backgroundColor: rejectionFile ? '#FEE2E2' : 'var(--ops-border)', 
                                                color: rejectionFile ? '#DC2626' : 'var(--ops-text-muted)', 
                                                border: 'none', fontWeight: 'bold', fontSize: '1rem', 
                                                cursor: rejectionFile ? 'pointer' : 'not-allowed',
                                                opacity: rejectionFile ? 1 : 0.5,
                                                display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'center'
                                            }}
                                        >
                                            <Wrench size={14} /> Averiado / Roto
                                        </button>
                                        <button
                                            disabled={!rejectionFile || processing}
                                            onClick={() => {
                                                if (!rejectionFile) return;
                                                const reason = prompt("Describe el motivo:");
                                                if (reason) handleSubmitResult('received_rejected', reason);
                                            }}
                                            style={{ 
                                                padding: '1rem', borderRadius: '12px', 
                                                backgroundColor: rejectionFile ? 'var(--ops-bg)' : 'var(--ops-border)', 
                                                color: rejectionFile ? 'var(--ops-text)' : 'var(--ops-text-muted)', 
                                                border: rejectionFile ? '1px solid var(--ops-border)' : 'none', 
                                                fontWeight: 'bold', fontSize: '1rem', 
                                                cursor: rejectionFile ? 'pointer' : 'not-allowed',
                                                opacity: rejectionFile ? 1 : 0.5,
                                                display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'center'
                                            }}
                                        >
                                            <HelpCircle size={14} /> Otro Motivo...
                                        </button>
                                        <button
                                            onClick={handleCloseModal}
                                            style={{ marginTop: '0.5rem', background: 'none', border: 'none', textDecoration: 'underline', color: 'var(--ops-text-muted)', cursor: 'pointer', fontSize: '0.9rem' }}
                                        >
                                            Cancelar y Volver
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                !validationMessage || validationMessage.includes('Diferencia') ? (
                                    // FASE 1: INGRESO CIEGO
                                    <div style={{ marginBottom: '2rem' }}>
                                        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem', color: 'var(--ops-text-muted)' }}>
                                            Ingrese Cantidad Recibida
                                        </label>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            <input
                                                type="number"
                                                value={inputQty ?? ''}
                                                onChange={e => setInputQty(e.target.value)}
                                                placeholder="0.00"
                                                autoFocus
                                                style={{
                                                    width: '100%', padding: '1rem', fontSize: '1.5rem', fontWeight: 'bold',
                                                    borderRadius: '12px', border: '2px solid var(--ops-border)', outline: 'none',
                                                    color: 'var(--ops-text)', backgroundColor: 'var(--ops-bg)',
                                                    textAlign: 'center'
                                                }}
                                            />
                                            <button
                                                onClick={handleValidateQuantity}
                                                disabled={!inputQty}
                                                style={{
                                                    width: '100%', padding: '1rem', borderRadius: '12px', backgroundColor: 'var(--ops-primary)', color: 'white',
                                                    border: 'none', fontWeight: 'bold', fontSize: '1.1rem', cursor: 'pointer'
                                                }}
                                            >
                                                Validar
                                            </button>
                                        </div>

                                        {validationMessage && (
                                            <div style={{ animation: 'fadeIn 0.3s' }}>
                                                <div style={{ marginTop: '1rem', padding: '0.8rem', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#EF4444', borderRadius: '8px', fontWeight: 'bold' }}>
                                                    {validationMessage}
                                                </div>

                                                {/* Opción de Parcial Anticipado */}
                                                <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', padding: '1rem', backgroundColor: 'rgba(245, 158, 11, 0.12)', borderRadius: '12px', border: '1px dashed #FCD34D' }}>
                                                    <span style={{ fontSize: '0.85rem', color: '#F59E0B', fontWeight: 'bold' }}>¿Es una entrega parcial conocida?</span>
                                                    <button
                                                        onClick={() => handleSubmitResult('received_partial', 'Parcial confirmado por operador (Diferencia)')}
                                                        style={{
                                                            padding: '0.8rem 1.2rem', borderRadius: '8px',
                                                            backgroundColor: '#F59E0B', color: 'white', border: 'none',
                                                            fontWeight: 'bold', cursor: 'pointer', fontSize: '0.95rem',
                                                            boxShadow: '0 2px 4px rgba(245, 158, 11, 0.2)',
                                                            display: 'inline-flex', alignItems: 'center', gap: '4px'
                                                        }}
                                                    >
                                                        <AlertTriangle size={14} /> Confirmar como PARCIAL
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Si falló 2 veces... */}
                                        {attemptCount > 1 && (
                                            <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--ops-border)', paddingTop: '1.5rem' }}>
                                                <p style={{ fontWeight: 'bold', marginBottom: '1rem' }}>¿Cómo desea proceder?</p>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                                    <button
                                                        onClick={() => handleSubmitResult('received_partial', 'Déficit confirmado en recepción')}
                                                        style={{ padding: '1rem', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                                                        <AlertTriangle size={14} /> Recibir como PARCIAL
                                                    </button>
                                                    <button
                                                        onClick={() => setShowRejectionOptions(true)}
                                                        style={{ padding: '1rem', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#EF4444', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                                                        <XCircle size={14} /> RECHAZAR TODO
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    // FASE 2: CALIDAD
                                    <div style={{ animation: 'fadeIn 0.3s' }}>
                                        <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10B981', padding: '1rem', borderRadius: '12px', fontWeight: 'bold', marginBottom: '2rem', textAlign: 'center' }}>
                                            ✅ Cantidad Correcta
                                        </div>

                                        <h3 style={{ textAlign: 'center', marginBottom: '1rem', color: 'var(--ops-text)' }}>Validar Calidad</h3>
                                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginBottom: '2rem' }}>
                                            <button
                                                onClick={() => { setQualityStatus('green'); setShowRejectionOptions(false); }}
                                                style={{
                                                    width: '70px', height: '70px', borderRadius: '50%',
                                                    backgroundColor: qualityStatus === 'green' ? '#10B981' : 'var(--ops-border)',
                                                    border: qualityStatus === 'green' ? '4px solid #D1FAE5' : 'none',
                                                    color: qualityStatus === 'green' ? 'white' : 'var(--ops-text)',
                                                    fontSize: '1.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s',
                                                    transform: qualityStatus === 'green' ? 'scale(1.1)' : 'scale(1)',
                                                    cursor: 'pointer'
                                                }}
                                            ><Check size={20} /></button>
                                            <button
                                                onClick={() => { setQualityStatus('yellow'); setShowRejectionOptions(false); }}
                                                style={{
                                                    width: '70px', height: '70px', borderRadius: '50%',
                                                    backgroundColor: qualityStatus === 'yellow' ? '#F59E0B' : 'var(--ops-border)',
                                                    border: qualityStatus === 'yellow' ? '4px solid #FEF3C7' : 'none',
                                                    color: qualityStatus === 'yellow' ? 'white' : 'var(--ops-text)',
                                                    fontSize: '1.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s',
                                                    transform: qualityStatus === 'yellow' ? 'scale(1.1)' : 'scale(1)',
                                                    cursor: 'pointer'
                                                }}
                                            ><AlertTriangle size={20} /></button>
                                            <button
                                                onClick={() => { setQualityStatus('red'); setShowRejectionOptions(true); }}
                                                style={{
                                                    width: '70px', height: '70px', borderRadius: '50%',
                                                    backgroundColor: qualityStatus === 'red' ? '#EF4444' : 'var(--ops-border)',
                                                    border: qualityStatus === 'red' ? '4px solid #FEE2E2' : 'none',
                                                    color: qualityStatus === 'red' ? 'white' : 'var(--ops-text)',
                                                    fontSize: '1.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s',
                                                    transform: qualityStatus === 'red' ? 'scale(1.1)' : 'scale(1)',
                                                    cursor: 'pointer'
                                                }}
                                            ><X size={20} /></button>
                                        </div>

                                        <div style={{ textAlign: 'center', marginTop: '-1rem', marginBottom: '1.5rem', fontWeight: '600', color: qualityStatus === 'green' ? '#10B981' : qualityStatus === 'yellow' ? '#F59E0B' : '#EF4444' }}>
                                            {qualityStatus === 'green' ? 'Conforme' : qualityStatus === 'yellow' ? 'Para Revisión' : qualityStatus === 'red' ? 'No Conforme' : ''}
                                        </div>

                                        {/* Intermediate Reject Prompt */}
                                        {qualityStatus === 'red' && (
                                            <div style={{ textAlign: 'center', marginBottom: '1.5rem', animation: 'fadeIn 0.3s' }}>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setShowRejectionOptions(true);
                                                    }}
                                                    style={{
                                                        background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#EF4444',
                                                        padding: '0.5rem 1rem', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer',
                                                        fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem'
                                                    }}
                                                >
                                                    <AlertTriangle size={14} /> ¿Quieres rechazar el pedido?
                                                </button>
                                            </div>
                                        )}

                                        {/* Actions */}
                                        <button
                                            disabled={!qualityStatus || processing}
                                            onClick={() => {
                                                let finalStatus = 'received_ok';
                                                if (qualityStatus === 'yellow' || qualityStatus === 'red') finalStatus = 'received_review';
                                                handleSubmitResult(finalStatus);
                                            }}
                                            style={{
                                                width: '100%', padding: '1.2rem', borderRadius: '14px',
                                                backgroundColor: 'var(--ops-primary)', color: 'white', border: 'none',
                                                fontWeight: '900', fontSize: '1.1rem', cursor: 'pointer',
                                                opacity: (!qualityStatus || processing) ? 0.5 : 1
                                            }}
                                        >
                                            {processing ? 'Guardando...' : 'FINALIZAR RECEPCIÓN'}
                                        </button>
                                    </div>
                                )
                            )}

                            <button
                                onClick={handleCloseModal}
                                style={{
                                    position: 'absolute', top: '1.2rem', right: '1.2rem',
                                    backgroundColor: 'var(--ops-bg)', color: 'var(--ops-text-muted)',
                                    borderRadius: '50%', width: '40px', height: '40px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    border: '1px solid var(--ops-border)', cursor: 'pointer',
                                    transition: 'background-color 0.2s'
                                }}
                            >
                                <X size={20} />
                            </button>
                        </div>
                    </div>
                )
            }

            {/* Onboarding Guide Modal (Carrusel del Profesor) */}
            {showGuide && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(15, 23, 42, 0.8)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    zIndex: 9000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '1.5rem',
                    animation: 'fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
                }}>
                    <style dangerouslySetInnerHTML={{__html: `
                        @keyframes float {
                            0%, 100% { transform: translateY(0px); }
                            50% { transform: translateY(-6px); }
                        }
                        @keyframes pulse-glow {
                            0%, 100% { transform: scale(1); opacity: 0.6; }
                            50% { transform: scale(1.05); opacity: 1; }
                        }
                        @keyframes modalEntrance {
                            from { transform: scale(0.95); opacity: 0; }
                            to { transform: scale(1); opacity: 1; }
                        }
                        .animate-float { animation: float 3s ease-in-out infinite; }
                        .animate-pulse-glow { animation: pulse-glow 2s ease-in-out infinite; }
                        .modal-content-card {
                            animation: modalEntrance 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                        }
                    `}} />

                    <div 
                        className="modal-content-card"
                        style={{
                            backgroundColor: 'rgba(30, 41, 59, 0.9)',
                            backdropFilter: 'blur(20px)',
                            WebkitBackdropFilter: 'blur(20px)',
                            borderRadius: '28px',
                            width: '100%',
                            maxWidth: '440px',
                            padding: '2.2rem',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            boxShadow: '0 20px 40px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.05)',
                            color: '#F8FAFC',
                            position: 'relative'
                        }}
                    >
                        {/* Close Button */}
                        <button
                            onClick={() => setShowGuide(false)}
                            style={{
                                position: 'absolute', top: '1.25rem', right: '1.25rem',
                                width: '32px', height: '32px', borderRadius: '50%',
                                backgroundColor: 'rgba(255,255,255,0.08)',
                                border: 'none', color: '#94A3B8',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', transition: 'all 0.2s ease',
                                fontWeight: 'bold'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
                                e.currentTarget.style.color = '#EF4444';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)';
                                e.currentTarget.style.color = '#94A3B8';
                            }}
                        >
                            ✕
                        </button>

                        {/* Step Content */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                            
                            {/* Animated Illustration Area */}
                            <div style={{ height: '130px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem', width: '100%' }}>
                                {guideStep === 0 && (
                                    <svg width="120" height="120" viewBox="0 0 120 120" className="animate-float">
                                        <circle cx="60" cy="60" r="45" fill="rgba(16, 185, 129, 0.15)" className="animate-pulse-glow" />
                                        {/* Scale SVG */}
                                        <path d="M 30 90 L 90 90 M 60 90 L 60 40 M 45 40 L 75 40" stroke="#10B981" strokeWidth="4" strokeLinecap="round" />
                                        <path d="M 40 40 L 30 70 M 80 40 L 90 70" stroke="#10B981" strokeWidth="2" />
                                        <path d="M 20 70 C 20 80, 40 80, 40 70 Z M 70 70 C 70 80, 90 80, 90 70 Z" fill="none" stroke="#10B981" strokeWidth="3" />
                                    </svg>
                                )}
                                {guideStep === 1 && (
                                    <svg width="120" height="120" viewBox="0 0 120 120" className="animate-float">
                                        <circle cx="60" cy="60" r="45" fill="rgba(59, 130, 246, 0.15)" className="animate-pulse-glow" />
                                        {/* Blind Validation magnifying glass + weight box */}
                                        <rect x="40" y="55" width="40" height="30" rx="4" fill="none" stroke="#3B82F6" strokeWidth="3" />
                                        <text x="60" y="77" fill="#3B82F6" fontSize="18" fontWeight="bold" textAnchor="middle">?</text>
                                        <circle cx="80" cy="45" r="15" fill="none" stroke="#F59E0B" strokeWidth="3" />
                                        <line x1="91" y1="56" x2="102" y2="67" stroke="#F59E0B" strokeWidth="4" strokeLinecap="round" />
                                    </svg>
                                )}
                                {guideStep === 2 && (
                                    <svg width="120" height="120" viewBox="0 0 120 120" className="animate-float">
                                        <circle cx="60" cy="60" r="45" fill="rgba(245, 158, 11, 0.15)" className="animate-pulse-glow" />
                                        {/* Traffic lights / quality status */}
                                        <circle cx="35" cy="60" r="12" fill="#10B981" />
                                        <circle cx="60" cy="60" r="12" fill="#F59E0B" />
                                        <circle cx="85" cy="60" r="12" fill="#EF4444" />
                                        <path d="M 30 60 L 33 63 L 40 57" stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                                        <text x="60" y="65" fill="white" fontSize="16" fontWeight="bold" textAnchor="middle">!</text>
                                        <text x="85" y="65" fill="white" fontSize="16" fontWeight="bold" textAnchor="middle">×</text>
                                    </svg>
                                )}
                            </div>

                            {/* Header */}
                            <h3 style={{ fontSize: '1.4rem', fontWeight: '900', color: '#FFFFFF', marginBottom: '0.8rem' }}>
                                {guideStep === 0 && "Recepción Bodega"}
                                {guideStep === 1 && "Validación Ciega"}
                                {guideStep === 2 && "Calidad y Excepciones"}
                            </h3>

                            {/* Description */}
                            <p style={{ fontSize: '0.92rem', color: '#94A3B8', lineHeight: '1.6', margin: '0 0 2rem 0' }}>
                                {guideStep === 0 && "¡Bienvenido al panel de Recepción! Aquí controlamos la entrada de mercancía de los proveedores, verificamos los pesos registrados por transporte y calificamos la calidad física del producto."}
                                {guideStep === 1 && "Al seleccionar un producto en tránsito, debes digitar el peso medido. Si no coincide con la cantidad esperada, se te pedirá realizar una segunda pesada para confirmar y autorizar diferencias."}
                                {guideStep === 2 && "Finalmente, debes calificar el lote como Conforme, Revisión o Rechazado. Un veredicto favorable ingresa automáticamente la mercancía al inventario y notifica la finalización."}
                            </p>

                            {/* Action Buttons */}
                            <div style={{ display: 'flex', width: '100%', gap: '0.8rem' }}>
                                {guideStep > 0 && (
                                    <button
                                        onClick={() => setGuideStep(prev => prev - 1)}
                                        style={{
                                            flex: 1, padding: '0.85rem 1rem', borderRadius: '12px',
                                            backgroundColor: 'rgba(255, 255, 255, 0.08)', color: '#F8FAFC',
                                            border: 'none', fontWeight: 'bold', cursor: 'pointer',
                                            transition: 'background-color 0.2s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'}
                                    >
                                        Atrás
                                    </button>
                                )}
                                
                                <button
                                    onClick={() => {
                                        if (guideStep < 2) {
                                            setGuideStep(prev => prev + 1);
                                        } else {
                                            setShowGuide(false);
                                        }
                                    }}
                                    style={{
                                        flex: 2, padding: '0.85rem 1rem', borderRadius: '12px',
                                        backgroundColor: '#10B981', color: '#FFFFFF',
                                        border: 'none', fontWeight: 'bold', cursor: 'pointer',
                                        boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
                                        transition: 'background-color 0.2s'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#059669'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#10B981'}
                                >
                                    {guideStep < 2 ? "Siguiente" : "Comenzar"}
                                </button>
                            </div>

                            {/* Dots Indicator */}
                            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '1.5rem' }}>
                                {[0, 1, 2].map(idx => (
                                    <div 
                                        key={idx}
                                        style={{
                                            width: idx === guideStep ? '20px' : '6px',
                                            height: '6px',
                                            borderRadius: '999px',
                                            backgroundColor: idx === guideStep ? '#10B981' : 'rgba(255, 255, 255, 0.2)',
                                            transition: 'all 0.3s ease'
                                        }}
                                    />
                                ))}
                            </div>

                        </div>
                    </div>
                </div>
            )}
            <style dangerouslySetInnerHTML={{ __html: `
                ::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }
                html, body { -ms-overflow-style: none !important; scrollbar-width: none !important; }

                @media (max-width: 480px) {
                    .header-title-container {
                        font-size: 1.15rem !important;
                        gap: 0.35rem !important;
                    }
                    .header-date-badge {
                        font-size: 0.68rem !important;
                        padding: 2px 6px !important;
                    }
                    .header-tutor-btn {
                        font-size: 0.68rem !important;
                        padding: 0.4rem 0.6rem !important;
                    }
                }
            `}} />
        </div>
    );
}
