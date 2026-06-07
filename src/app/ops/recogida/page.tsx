'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
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
  AlertOctagon
} from 'lucide-react';

interface Purchase {
    id: string;
    product_id: string;
    task_id?: string;
    provider_id?: string;
    quantity: number;
    purchase_unit: string;
    pickup_location: string;
    estimated_pickup_time: string;
    status: string;
    voucher_image_url?: string;
    picked_up_quantity?: number;
    variant_label?: string;
    product?: {
        name: string;
        unit_of_measure: string;
        category: string;
        image_url?: string;
    };
    provider?: {
        name: string;
    };
}

export default function RecogidaPage() {
    const [loading, setLoading] = useState(true);
    const [purchases, setPurchases] = useState<Purchase[]>([]);
    const [selectedSection, setSelectedSection] = useState<string>('Ver Todo');
    const [showFilterGrid, setShowFilterGrid] = useState(false);
    const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
    const [groupMode, setGroupMode] = useState<'provider' | 'bodega'>('provider');
    const [showGuide, setShowGuide] = useState(false);
    const [guideStep, setGuideStep] = useState(0);
    const [targetDateLabel, setTargetDateLabel] = useState('');

    const formatDateFriendly = (dateStr: string) => {
        if (!dateStr) return "";
        const date = new Date(`${dateStr}T12:00:00`); // Force mid-day to avoid TZ shifts
        const dayName = date.toLocaleDateString("es-ES", { weekday: "long" });
        const day = date.getDate();
        const month = date.toLocaleDateString("es-ES", { month: "short" });
        // Capitalize first letter
        return `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} ${day} ${month}`;
    };

    // Utility: Parse Bodega Name from pickup_location
    const getBodegaName = (location: string | null | undefined): string => {
        if (!location) return 'Sin Bodega / Otros';
        const match = location.match(/\[BODEGA\]\s*#?\s*([^\s|]+)/i) || location.match(/BODEGA\s*\]?\s*:?\s*#?\s*([^\s|]+)/i);
        if (match && match[1]) {
            const cleanVal = match[1].replace(/[:,\s]/g, '').trim();
            if (cleanVal) {
                return `Bodega ${cleanVal}`;
            }
        }
        const fallbackMatch = location.match(/bodega\s*#?(\d+)/i);
        if (fallbackMatch && fallbackMatch[1]) {
            return `Bodega ${fallbackMatch[1]}`;
        }
        return 'Sin Bodega / Otros';
    };

    // Utility: Calculate total and picked-up weights in kilograms
    const getGroupWeightStats = (groupPurchases: Purchase[]) => {
        let totalKg = 0;
        let pickedUpKg = 0;
        const otherUnits: Record<string, { total: number; pickedUp: number }> = {};

        groupPurchases.forEach(p => {
            const unit = (p.purchase_unit || 'Kg').trim().toLowerCase();
            const qty = p.quantity || 0;
            const picked = p.picked_up_quantity || 0;

            if (unit === 'kg' || unit === 'kgs' || unit === 'kilo' || unit === 'kilos' || unit === 'kilogramo' || unit === 'kilogramos') {
                totalKg += qty;
                pickedUpKg += picked;
            } else {
                let factor = 1;
                let isWeightUnit = false;
                if (unit === 'arroba' || unit === '@' || unit === 'arr') {
                    factor = 12.5;
                    isWeightUnit = true;
                } else if (unit === 'bulto' || unit === 'bultos' || unit === 'saco' || unit === 'sacos' || unit === 'blt') {
                    factor = 50;
                    isWeightUnit = true;
                } else if (unit === 'libra' || unit === 'libras' || unit === 'lb') {
                    factor = 0.5;
                    isWeightUnit = true;
                } else if (unit === 'caja' || unit === 'cajas') {
                    factor = 20;
                    isWeightUnit = true;
                }

                if (isWeightUnit) {
                    totalKg += qty * factor;
                    pickedUpKg += picked * factor;
                } else {
                    const normUnit = p.purchase_unit || 'Unidad';
                    if (!otherUnits[normUnit]) {
                        otherUnits[normUnit] = { total: 0, pickedUp: 0 };
                    }
                    otherUnits[normUnit].total += qty;
                    otherUnits[normUnit].pickedUp += picked;
                }
            }
        });

        return {
            totalKg: Math.round(totalKg * 10) / 10,
            pickedUpKg: Math.round(pickedUpKg * 10) / 10,
            otherUnits
        };
    };

    // Pickup Form State
    const [receivedQty, setReceivedQty] = useState<string>('');
    const [quality, setQuality] = useState<'green' | 'yellow' | 'red' | null>(null);
    const [notes, setNotes] = useState('');
    const [processing, setProcessing] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [showRejectionOptions, setShowRejectionOptions] = useState(false);
    const [rejectionFile, setRejectionFile] = useState<File | null>(null);
    const [rejectionPreview, setRejectionPreview] = useState<string | null>(null);
    const [showVoucherZoom, setShowVoucherZoom] = useState(false);

    const router = useRouter();

    const fetchPurchases = useCallback(async (isBackground = false) => {
        if (!isBackground) setLoading(true);
        try {
            const nowBogota = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
            const year = nowBogota.getFullYear();
            const month = String(nowBogota.getMonth() + 1).padStart(2, '0');
            const day = String(nowBogota.getDate()).padStart(2, '0');
            const todayBogota = `${year}-${month}-${day}`;

            // Jornada de Compra starts at 5:00 PM (17:00) of previous day (Colombia time)
            const startOfShift = new Date(nowBogota);
            if (nowBogota.getHours() >= 17) {
                startOfShift.setHours(17, 0, 0, 0);
            } else {
                startOfShift.setDate(nowBogota.getDate() - 1);
                startOfShift.setHours(17, 0, 0, 0);
            }
            const y = startOfShift.getFullYear();
            const m = String(startOfShift.getMonth() + 1).padStart(2, '0');
            const d = String(startOfShift.getDate()).padStart(2, '0');
            const shiftStartISO = `${y}-${m}-${d}T22:00:00.000Z`; // 17:00 Bogota is 22:00 UTC

            // Fetch pending pickups (active) and today's completed/rejected pickups (since shift start)
            const { data, error } = await supabase
                .from('purchases')
                .select(`
                    *,
                    product:products (
                        name,
                        unit_of_measure,
                        category,
                        image_url
                    ),
                    provider:providers (
                        name
                    )
                `)
                .or(`status.eq.pending_pickup,status.eq.partial_pickup,and(status.eq.picked_up,created_at.gte.${shiftStartISO}),and(status.eq.rejected,created_at.gte.${shiftStartISO})`)
                .order('estimated_pickup_time', { ascending: true });

            if (error) throw error;

            setPurchases(data || []);
            setTargetDateLabel(todayBogota);
        } catch (err: unknown) {
            console.error('Error fetching pickups:', err);
        } finally {
            if (!isBackground) setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPurchases(false);
        const interval = setInterval(() => fetchPurchases(true), 30000); // Poll every 30s
        return () => clearInterval(interval);
    }, [fetchPurchases]);

    const handlePickupSubmit = async (status: 'picked_up' | 'partial_pickup' | 'rejected', rejectionReason?: string) => {
        if (!selectedPurchase) return;
        setFormError(null);

        // For rejection, we don't need quality check unless manually required, but let's clear validation if rejected
        // If status is NOT rejected, quality is mandatory
        if (status !== 'rejected' && !quality) {
            setFormError('Debes indicar la calidad del producto antes de confirmar.');
            return;
        }

        if (status !== 'rejected' && (quality === 'yellow' || quality === 'red') && !notes.trim()) {
            setFormError('Debes escribir una observación detallando el estado de calidad.');
            return;
        }

        setProcessing(true);

        try {
            // Accumulate quantities and detect status
            let finalStatus = status;
            let enteredQty = parseFloat(receivedQty || '0');
            let newPickedUpQty = 0;

            if (status === 'rejected' || quality === 'red') {
                finalStatus = 'rejected';
                newPickedUpQty = 0;
            } else {
                newPickedUpQty = (selectedPurchase.picked_up_quantity || 0) + enteredQty;
                if (status === 'partial_pickup' && newPickedUpQty < selectedPurchase.quantity) {
                    finalStatus = 'partial_pickup';
                } else {
                    finalStatus = 'picked_up';
                }
            }

            let finalVoucherUrl = selectedPurchase.voucher_image_url || null;

            if (finalStatus === 'rejected' && rejectionFile) {
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

            const finalRejectionReason = rejectionReason || (quality === 'red' ? `Rechazado por Calidad Roja: ${notes}` : null);

            const updatePayload: Record<string, any> = {
                status: finalStatus,
                picked_up_quantity: newPickedUpQty,
                quality_status: quality,
                quality_notes: notes,
                rejection_reason: finalRejectionReason,
                voucher_image_url: finalVoucherUrl,
            };

            const { error } = await supabase
                .from('purchases')
                .update(updatePayload)
                .eq('id', selectedPurchase.id);

            if (error) throw error;

            // Calculate deficit to deduct from buyer task
            let baseQtyToDeduct = 0;
            if (finalStatus === 'rejected') {
                baseQtyToDeduct = selectedPurchase.quantity;
            } else if (finalStatus === 'picked_up') {
                const deficit = selectedPurchase.quantity - newPickedUpQty;
                if (deficit > 0) {
                    baseQtyToDeduct = deficit;
                }
            }

            if (baseQtyToDeduct > 0 && selectedPurchase.task_id) {
                const { data: task, error: taskFetchError } = await supabase
                    .from('procurement_tasks')
                    .select('id, total_requested, total_purchased, unit')
                    .eq('id', selectedPurchase.task_id)
                    .single();

                if (taskFetchError) {
                    console.error('Error fetching procurement task:', taskFetchError);
                } else if (task) {
                    let baseQtyToDeductConverted = baseQtyToDeduct;

                    if (selectedPurchase.purchase_unit && task.unit && selectedPurchase.purchase_unit !== task.unit) {
                        const { data: convData, error: convErr } = await supabase
                            .from('product_conversions')
                            .select('conversion_factor')
                            .eq('product_id', selectedPurchase.product_id)
                            .eq('from_unit', selectedPurchase.purchase_unit)
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
            }

            // Log the novelty in provider_novelties table
            let noveltyPayload: Record<string, any> | null = null;
            if (finalStatus === 'rejected') {
                noveltyPayload = {
                    purchase_id: selectedPurchase.id,
                    task_id: selectedPurchase.task_id || null,
                    provider_id: selectedPurchase.provider_id || null,
                    product_id: selectedPurchase.product_id,
                    variant_label: selectedPurchase.variant_label || null,
                    novelty_type: 'rejection',
                    quantity: selectedPurchase.quantity,
                    unit: selectedPurchase.purchase_unit || null,
                    reason: finalRejectionReason,
                    description: notes || null,
                    evidence_url: finalVoucherUrl || null,
                };
            } else if (finalStatus === 'picked_up' && selectedPurchase.quantity - newPickedUpQty > 0) {
                noveltyPayload = {
                    purchase_id: selectedPurchase.id,
                    task_id: selectedPurchase.task_id || null,
                    provider_id: selectedPurchase.provider_id || null,
                    product_id: selectedPurchase.product_id,
                    variant_label: selectedPurchase.variant_label || null,
                    novelty_type: 'deficit',
                    quantity: selectedPurchase.quantity - newPickedUpQty,
                    unit: selectedPurchase.purchase_unit || null,
                    reason: 'Faltante en entrega',
                    description: notes || 'Proveedor no entregó la cantidad completa',
                    evidence_url: finalVoucherUrl || null,
                };
            } else if (quality === 'yellow') {
                noveltyPayload = {
                    purchase_id: selectedPurchase.id,
                    task_id: selectedPurchase.task_id || null,
                    provider_id: selectedPurchase.provider_id || null,
                    product_id: selectedPurchase.product_id,
                    variant_label: selectedPurchase.variant_label || null,
                    novelty_type: 'warning',
                    quantity: newPickedUpQty,
                    unit: selectedPurchase.purchase_unit || null,
                    reason: 'Advertencia de Calidad',
                    description: notes || null,
                    evidence_url: finalVoucherUrl || null,
                };
            }

            if (noveltyPayload) {
                const { error: noveltyError } = await supabase
                    .from('provider_novelties')
                    .insert(noveltyPayload);
                if (noveltyError) {
                    console.error('Error logging provider novelty:', noveltyError);
                }
            }

            let alertMsg = 'Recogida registrada correctamente.';
            if (finalStatus === 'rejected') {
                alertMsg = 'Producto marcado como NO RECIBIDO (Tarea de compra reabierta).';
            } else if (finalStatus === 'picked_up' && selectedPurchase.quantity - newPickedUpQty > 0) {
                alertMsg = `Recogida finalizada con un faltante de ${(selectedPurchase.quantity - newPickedUpQty).toFixed(2)} ${selectedPurchase.purchase_unit} (Tarea de compra reabierta por el faltante).`;
            }
            alert(alertMsg);
            setSelectedPurchase(null);
            fetchPurchases();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Error desconocido';
            alert('Error al guardar recogida: ' + message);
        } finally {
            setProcessing(false);
        }
    };

    // Stats calculation based on full dataset
    const fruitPurchases = purchases.filter(p => p.product?.category === 'FR');
    const otherPurchases = purchases.filter(p => p.product?.category !== 'FR');

    const getCategoryPercentage = (items: Purchase[]) => {
        if (items.length === 0) return 0;
        const completed = items.filter(p => p.status === 'picked_up' || p.status === 'rejected').length;
        return Math.round((completed / items.length) * 100);
    };

    const stats = [
        { name: 'Frutas', percentage: getCategoryPercentage(fruitPurchases), count: fruitPurchases.length },
        { name: 'Otros', percentage: getCategoryPercentage(otherPurchases), count: otherPurchases.length }
    ];

    const filteredPurchases = purchases.filter((p: Purchase) => {
        if (selectedSection === 'Frutas') {
            return p.product?.category === 'FR';
        }
        if (selectedSection === 'Otros') {
            return p.product?.category !== 'FR';
        }
        return true; // 'Ver Todo'
    });

    const sortedPurchases = [...filteredPurchases].sort((a: Purchase, b: Purchase) => {
        const now = new Date().getTime();
        const score = (s: string) => {
            if (s === 'partial_pickup' || s === 'pending_pickup') return 0; // Active
            if (s === 'picked_up') return 1;
            return 2; // Rejected
        };

        const scoreA = score(a.status);
        const scoreB = score(b.status);

        if (scoreA !== scoreB) {
            return scoreA - scoreB;
        }

        if (scoreA === 0) {
            const timeA = new Date(a.estimated_pickup_time).getTime();
            const timeB = new Date(b.estimated_pickup_time).getTime();

            const isAvailA = now >= timeA;
            const isAvailB = now >= timeB;

            if (isAvailA && !isAvailB) return -1;
            if (!isAvailA && isAvailB) return 1;

            return timeA - timeB;
        } else {
            const subScore = (s: string) => s === 'picked_up' ? 0 : 1;
            return subScore(a.status) - subScore(b.status);
        }
    });

    interface Group {
        key: string;
        purchases: Purchase[];
    }

    const getGroupedPurchases = (): Group[] => {
        const groups: Record<string, Purchase[]> = {};

        sortedPurchases.forEach(p => {
            let key = '';
            if (groupMode === 'provider') {
                key = p.provider?.name || 'Proveedor Desconocido';
            } else {
                key = getBodegaName(p.pickup_location);
            }

            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(p);
        });

        return Object.keys(groups)
            .sort((a, b) => {
                const isAOther = a.includes('Desconocido') || a.includes('Sin Bodega') || a.includes('Otros');
                const isBOther = b.includes('Desconocido') || b.includes('Sin Bodega') || b.includes('Otros');
                if (isAOther && !isBOther) return 1;
                if (!isAOther && isBOther) return -1;
                if (isAOther && isBOther) return a.localeCompare(b);

                // Try numerical sorting if both contain digits
                const numA = parseInt(a.replace(/\D/g, ''), 10);
                const numB = parseInt(b.replace(/\D/g, ''), 10);
                if (!isNaN(numA) && !isNaN(numB)) {
                    return numA - numB;
                }
                return a.localeCompare(b);
            })
            .map(key => ({
                key,
purchases: groups[key]
            }));
    };

    return (
        <div style={{ padding: '1rem', paddingBottom: '5rem', backgroundColor: 'var(--ops-bg)', minHeight: '100vh' }}>            {/* Título y Botón (No pegajosos, se ocultan al hacer scroll) */}
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
                    }}
                >
                    <div>
                        <h1 
                            className="header-title-container"
                            onClick={() => router.push('/ops')}
                            style={{ fontSize: "1.5rem", fontWeight: "900", margin: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "nowrap" }}
                        >
                            <span style={{ whiteSpace: "nowrap" }}>Recogidas <span style={{ color: "var(--ops-primary)" }}>Hoy</span></span>
                            <span className="header-date-badge" style={{ fontSize: "0.8rem", color: "#F59E0B", fontWeight: "800", backgroundColor: "rgba(245, 158, 11, 0.12)", padding: "2px 8px", borderRadius: "6px", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                <Calendar size={14} /> {formatDateFriendly(targetDateLabel) || "Cargando..."}
                            </span>
                        </h1>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button
                            className="header-tutor-btn"
                            onClick={() => { setShowGuide(true); setGuideStep(0); }}
                            style={{
                                backgroundColor: "var(--ops-surface)",
                                color: "var(--ops-primary)",
                                border: "1px solid var(--ops-primary)",
                                padding: "0.5rem 0.75rem",
                                borderRadius: "8px",
                                fontSize: "0.75rem",
                                fontWeight: "900",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
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
                {filteredPurchases.length > 0 && (() => {
                    const total = filteredPurchases.length;
                    const completed = filteredPurchases.filter(p => p.status === 'picked_up' || p.status === 'rejected').length;
                    const progress = Math.round((completed / total) * 100);

                    return (
                        <div style={{ width: "100%", marginTop: "0.4rem", marginBottom: "1rem", padding: "0 0.5rem" }}>
                            <div
                                style={{
                                    width: "100%",
                                    height: "8px",
                                    backgroundColor: "var(--ops-surface)",
                                    borderRadius: "4px",
                                    overflow: "hidden",
                                    border: "1px solid var(--ops-border)",
                                }}
                            >
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
                    );
                })()}

                {/* Dashboard de Estados (Semáforo) */}
                {filteredPurchases.length > 0 && (() => {
                    const pending = filteredPurchases.filter(p => p.status === 'pending_pickup').length;
                    const partial = filteredPurchases.filter(p => p.status === 'partial_pickup').length;
                    const done = filteredPurchases.filter(p => p.status === 'picked_up' || p.status === 'rejected').length;
                    const total = filteredPurchases.length;
                    const progress = total > 0 ? (done / total) * 100 : 0;

                    return (
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
                                <div
                                    style={{
                                        fontSize: "1.1rem",
                                        fontWeight: "900",
                                        color: "var(--ops-text-muted)",
                                    }}
                                >
                                    {pending}
                                </div>
                                <div
                                    style={{
                                        fontSize: "0.55rem",
                                        fontWeight: "bold",
                                        color: "var(--ops-text-muted)",
                                        textTransform: "uppercase",
                                    }}
                                >
                                    Pendientes
                                </div>
                            </div>

                            {/* En Proceso */}
                            <div style={{ textAlign: "center", position: "relative" }}>
                                <div
                                    style={{
                                        fontSize: "1.1rem",
                                        fontWeight: "900",
                                        color: "#F59E0B",
                                    }}
                                >
                                    {partial}
                                </div>
                                <div
                                    style={{
                                        fontSize: "0.55rem",
                                        fontWeight: "bold",
                                        color: "#F59E0B",
                                        textTransform: "uppercase",
                                    }}
                                >
                                    En Proceso
                                </div>
                                {partial > 0 && (
                                    <div
                                        style={{
                                            position: "absolute",
                                            top: -4,
                                            right: -4,
                                            width: "5px",
                                            height: "5px",
                                            borderRadius: "50%",
                                            background: "#F59E0B",
                                        }}
                                    />
                                )}
                            </div>

                            {/* Completados */}
                            <div style={{ textAlign: "center" }}>
                                <div
                                    style={{
                                        fontSize: "1.1rem",
                                        fontWeight: "900",
                                        color: "var(--ops-primary)",
                                    }}
                                >
                                    {done}
                                </div>
                                <div
                                    style={{
                                        fontSize: "0.55rem",
                                        fontWeight: "bold",
                                        color: "var(--ops-primary)",
                                        textTransform: "uppercase",
                                    }}
                                >
                                    Listos
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
                                    <div
                                        style={{
                                            fontSize: "1.2rem",
                                            fontWeight: "900",
                                            color: progress === 100 ? "white" : "var(--ops-text)",
                                            lineHeight: "1",
                                        }}
                                    >
                                        {Math.round(progress)}%
                                    </div>
                                    <div
                                        style={{
                                            fontSize: "0.5rem",
                                            fontWeight: "900",
                                            color: progress === 100 ? "white" : "var(--ops-text)",
                                            opacity: 0.8,
                                            marginTop: "2px",
                                            textTransform: "uppercase",
                                            letterSpacing: "0.05em",
                                        }}
                                    >
                                        TOTAL AVANCE
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
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'}
                                >
                                    <ChevronUp size={16} />
                                </button>
                            </div>
                        </div>
                    );
                })()}
            </div>

            {/* Category Filter — Colapsable */}
            <div style={{ marginBottom: "0.6rem" }}>
                {/* Barra activa: siempre visible */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    {/* Pill de categoría activa */}
                    <div
                        style={{
                            flex: 1,
                            padding: "0.5rem 1rem",
                            borderRadius: "12px",
                            backgroundColor: "rgba(16, 185, 129, 0.12)",
                            border: "1px solid var(--ops-primary)",
                            color: "var(--ops-text)",
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
                            {selectedSection === "Ver Todo" ? (
                                <><List size={14} /> Ver Todo</>
                            ) : (
                                (() => {
                                    const s = stats.find(s => s.name === selectedSection);
                                    return (
                                        <>
                                            {selectedSection === "Frutas" ? <Apple size={14} /> : <Package size={14} />}
                                            {selectedSection}
                                            {s ? ` · ${s.percentage}%` : ""}
                                        </>
                                    );
                                })()
                            )}
                        </span>
                        {selectedSection !== "Ver Todo" && (
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

                {/* Grid 1×3 — se muestra/oculta */}
                {showFilterGrid && (
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr 1fr",
                            gap: "0.4rem",
                            marginTop: "0.5rem",
                            animation: "fadeSlideDown 0.18s ease-out",
                        }}
                    >
                        <style dangerouslySetInnerHTML={{ __html: `
                            @keyframes fadeSlideDown {
                                from { opacity: 0; transform: translateY(-6px); }
                                to   { opacity: 1; transform: translateY(0); }
                            }
                        `}} />
                        {["Ver Todo", "Frutas", "Otros"].map((cat) => {
                            const stat = stats.find(s => s.name === cat);
                            const isActive = selectedSection === cat;
                            const pct = stat?.percentage ?? null;
                            return (
                                <button
                                    key={cat}
                                    onClick={() => {
                                        setSelectedSection(cat);
                                        setShowFilterGrid(false);
                                    }}
                                    style={{
                                        padding: "0.55rem 0.75rem",
                                        borderRadius: "10px",
                                        border: `1px solid ${isActive ? "var(--ops-primary)" : "var(--ops-border)"}`,
                                        backgroundColor: isActive
                                            ? "rgba(16, 185, 129, 0.12)"
                                            : "var(--ops-surface)",
                                        color: isActive ? "var(--ops-text)" : "var(--ops-text-muted)",
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
                                        {cat === "Ver Todo" ? <List size={12} /> : cat === "Frutas" ? <Apple size={12} /> : <Package size={12} />}
                                        {cat === "Ver Todo" ? "Ver Todo" : cat === "Frutas" ? "Frutas" : "Otros"}
                                    </span>
                                    {pct !== null && (
                                        <span
                                            style={{
                                                fontSize: "0.65rem",
                                                fontWeight: "900",
                                                opacity: isActive ? 0.85 : 0.6,
                                                color: isActive
                                                    ? "white"
                                                    : pct === 100 ? "#10B981" : pct > 0 ? "#F59E0B" : "inherit",
                                            }}
                                        >
                                            {pct}% listo
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Tasks List */}
            {loading ? (
                <div style={{ textAlign: "center", padding: "4rem 2rem", animation: "pulse 2s infinite", display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
                    <RefreshCw size={36} className="animate-spin" style={{ color: "var(--ops-primary)", animation: "spin 2s linear infinite" }} />
                    <p style={{ color: "var(--ops-text-muted)", fontWeight: "700", letterSpacing: "0.05em" }}>
                        CARGANDO RECOGIDAS...
                    </p>
                </div>
            ) : filteredPurchases.length === 0 ? (
                <div style={{
                    textAlign: "center",
                    padding: "4rem 2rem",
                    backgroundColor: "rgba(16, 185, 129, 0.05)",
                    borderRadius: "24px",
                    border: "1px dashed rgba(16, 185, 129, 0.2)",
                    margin: "0 0.5rem"
                }}>
                    <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.5rem" }}>
                        <Sparkles size={48} style={{ color: "var(--ops-primary)" }} />
                    </div>
                    <h3 style={{ color: "var(--ops-primary)", fontSize: "1.5rem", fontWeight: "900", margin: "0 0 0.5rem 0" }}>
                        ¡Todo bajo control!
                    </h3>
                    <p style={{ color: "var(--ops-text-muted)", fontSize: "1rem", maxWidth: "250px", margin: "0 auto", lineHeight: "1.4" }}>
                        No hay recogidas pendientes en la categoría de {selectedSection}.
                    </p>
                </div>
            ) : (
                <div>
                    {/* Segmented Control Selector */}
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
                            onClick={() => setGroupMode('provider')}
                            style={{
                                padding: '0.45rem 0.2rem',
                                borderRadius: '8px',
                                border: 'none',
                                backgroundColor: groupMode === 'provider' ? 'var(--ops-primary)' : 'transparent',
                                color: groupMode === 'provider' ? '#FFFFFF' : 'var(--ops-text-muted)',
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
                            <Building2 size={14} /> Por Proveedor
                        </button>
                        <button
                            onClick={() => setGroupMode('bodega')}
                            style={{
                                padding: '0.45rem 0.2rem',
                                borderRadius: '8px',
                                border: 'none',
                                backgroundColor: groupMode === 'bodega' ? 'var(--ops-primary)' : 'transparent',
                                color: groupMode === 'bodega' ? '#FFFFFF' : 'var(--ops-text-muted)',
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
                            <MapPin size={14} /> Por Bodega
                        </button>
                    </div>

                    {/* Grouped Tasks */}
                    <div style={{ display: 'grid', gap: '1.5rem' }}>
                        {getGroupedPurchases().map(group => {
                            const stats = getGroupWeightStats(group.purchases);
                            const allDone = group.purchases.every(p => p.status === 'picked_up' || p.status === 'rejected');

                            return (
                                <div key={group.key} style={{
                                    backgroundColor: 'var(--ops-surface)',
                                    borderRadius: '20px',
                                    border: '1px solid var(--ops-border)',
                                    padding: '1rem',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                                    opacity: allDone ? 0.75 : 1,
                                    transition: 'opacity 0.2s ease'
                                }}>
                                    {/* Group Header */}
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'flex-start',
                                        borderBottom: '1px solid var(--ops-border)',
                                        paddingBottom: '0.8rem',
                                        marginBottom: '1rem'
                                    }}>
                                        <div>
                                            <h2 style={{
                                                margin: 0,
                                                fontSize: '1.2rem',
                                                fontWeight: '900',
                                                color: 'var(--ops-text)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.4rem'
                                            }}>
                                                {groupMode === 'provider' ? <Building2 size={18} style={{ color: 'var(--ops-primary)' }} /> : <MapPin size={18} style={{ color: 'var(--ops-primary)' }} />} {group.key}
                                            </h2>
                                            <span style={{
                                                fontSize: '0.75rem',
                                                fontWeight: '700',
                                                color: 'var(--ops-text-muted)',
                                                textTransform: 'uppercase'
                                            }}>
                                                {group.purchases.length} {group.purchases.length === 1 ? 'tarea' : 'tareas'}
                                            </span>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            {/* Kilos indicator */}
                                            <div style={{
                                                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                                                border: '1px solid rgba(16, 185, 129, 0.2)',
                                                borderRadius: '10px',
                                                padding: '0.3rem 0.6rem',
                                                display: 'inline-block'
                                            }}>
                                                <span style={{
                                                    fontSize: '0.85rem',
                                                    fontWeight: '900',
                                                    color: 'var(--ops-primary)'
                                                }}>
                                                    <Scale size={14} style={{ marginRight: '4px' }} /> {stats.pickedUpKg} / {stats.totalKg} Kg
                                                </span>
                                            </div>
                                            {/* Other units breakdown */}
                                            {Object.keys(stats.otherUnits).length > 0 && (
                                                <div style={{
                                                    fontSize: '0.7rem',
                                                    color: 'var(--ops-text-muted)',
                                                    fontWeight: 'bold',
                                                    marginTop: '0.2rem'
                                                }}>
                                                    {Object.entries(stats.otherUnits).map(([unit, val]) => 
                                                        `${val.pickedUp}/${val.total} ${unit}`
                                                    ).join(', ')}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Group Items */}
                                    <div style={{ display: 'grid', gap: '0.8rem' }}>
                                        {group.purchases.map(p => {
                                            const isDone = p.status === 'picked_up';
                                            const isPartial = p.status === 'partial_pickup';
                                            const isRejected = p.status === 'rejected';

                                            let statusText = 'PENDIENTE';
                                            let statusColor = 'var(--ops-text-muted)';

                                            if (isDone) {
                                                statusText = 'COMPLETADO';
                                                statusColor = 'var(--ops-primary)';
                                            } else if (isPartial) {
                                                statusText = 'PARCIAL';
                                                statusColor = '#F59E0B';
                                            } else if (isRejected) {
                                                statusText = 'NO RECIBIDO';
                                                statusColor = '#EF4444';
                                            }

                                            return (
                                                <div
                                                    key={p.id}
                                                    onClick={() => {
                                                        setSelectedPurchase(p);
                                                        const remaining = p.quantity - (p.picked_up_quantity || 0);
                                                        setReceivedQty(remaining.toString());
                                                        setQuality(null);
                                                        setNotes('');
                                                        setProcessing(false);
                                                        setShowRejectionOptions(false);
                                                        setFormError(null);
                                                        setRejectionFile(null);
                                                        setRejectionPreview(null);
                                                    }}
                                                    className="card-op"
                                                    style={{
                                                        display: 'grid',
                                                        gridTemplateColumns: '70px 1fr',
                                                        gap: '0.8rem',
                                                        alignItems: 'center',
                                                        borderLeft: `5px solid ${
                                                            isDone ? 'var(--ops-primary)' :
                                                            isPartial ? '#F59E0B' :
                                                            isRejected ? '#EF4444' :
                                                            'var(--ops-border)'
                                                        }`,
                                                        opacity: (isDone || isRejected) ? 0.75 : 1,
                                                        cursor: 'pointer',
                                                        position: 'relative',
                                                        transition: 'all 0.2s ease',
                                                        backgroundColor: 'var(--ops-bg)',
                                                        padding: '0.8rem',
                                                        borderRadius: '12px',
                                                        marginBottom: 0
                                                    }}
                                                >
                                                    {/* Product image */}
                                                    <div style={{
                                                        width: '70px', height: '70px',
                                                        borderRadius: '10px', overflow: 'hidden',
                                                        backgroundColor: 'var(--ops-surface)',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        border: '1px solid var(--ops-border)'
                                                    }}>
                                                        {p.product?.image_url ? (
                                                            <img src={p.product.image_url} alt={p.product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                        ) : (
                                                            <Package size={24} style={{ opacity: 0.6, color: 'var(--ops-text-muted)' }} />
                                                        )}
                                                    </div>

                                                    {/* Info */}
                                                    <div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                                                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '800', color: isDone ? 'var(--ops-text-muted)' : 'var(--ops-text)' }}>
                                                                {p.product?.name}
                                                                {p.variant_label && (
                                                                    <span style={{ fontSize: '0.8rem', color: 'var(--ops-primary)', fontWeight: 'bold', marginLeft: '0.3rem' }}>
                                                                        ({p.variant_label})
                                                                    </span>
                                                                )}
                                                            </h3>
                                                            <span style={{ fontSize: '0.65rem', fontWeight: '900', color: statusColor }}>{statusText}</span>
                                                        </div>

                                                        {/* Progress Bar */}
                                                        {(isPartial || isDone) && (
                                                            <div style={{ marginBottom: '0.4rem' }}>
                                                                <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--ops-border)', borderRadius: '3px', overflow: 'hidden' }}>
                                                                    <div style={{
                                                                        width: `${Math.min(100, ((p.picked_up_quantity || 0) / p.quantity) * 100)}%`,
                                                                        height: '100%',
                                                                        backgroundColor: isDone ? 'var(--ops-primary)' : '#F59E0B',
                                                                        borderRadius: '3px',
                                                                        transition: 'width 0.3s ease'
                                                                    }} />
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Show provider if grouped by bodega; show bodega if grouped by provider */}
                                                        {groupMode === 'bodega' ? (
                                                            <div style={{ fontSize: '0.8rem', color: 'var(--ops-text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.2rem' }}>
                                                                <Building2 size={14} /> <span>{p.provider?.name || 'Proveedor desconocido'}</span>
                                                            </div>
                                                        ) : null}

                                                        <div style={{ fontSize: '0.8rem', color: 'var(--ops-text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.2rem' }}>
                                                            <MapPin size={14} /> 
                                                            {p.pickup_location ? (
                                                                <span style={{ lineHeight: 1.4, wordBreak: 'break-word' }}>
                                                                    {p.pickup_location.split(/(\[BODEGA\]|\[PUESTO\])/g).map((part: string, i: number) => {
                                                                        if (part === '[BODEGA]' || part === '[PUESTO]') {
                                                                            return (
                                                                                <span key={i} style={{ 
                                                                                    backgroundColor: "rgba(16, 185, 129, 0.15)", 
                                                                                    color: "var(--ops-primary)", 
                                                                                    padding: "0.1rem 0.3rem", 
                                                                                    borderRadius: "4px", 
                                                                                    fontWeight: "900",
                                                                                    fontSize: "0.7rem",
                                                                                    marginRight: "0.15rem",
                                                                                    marginLeft: i > 0 ? "0.15rem" : "0"
                                                                                }}>
                                                                                    {part.replace('[', '').replace(']', '')}
                                                                                </span>
                                                                            );
                                                                        }
                                                                        return <span key={i}>{part}</span>;
                                                                    })}
                                                                </span>
                                                            ) : (
                                                                <span>Ubicación desconocida</span>
                                                            )}
                                                        </div>

                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                                                            <div style={{ fontSize: '0.9rem', color: 'var(--ops-text)' }}>
                                                                <span style={{ fontWeight: '900' }}>
                                                                    {p.status === 'picked_up' ? p.picked_up_quantity : p.quantity} {p.purchase_unit}
                                                                </span>
                                                                {isPartial && <span style={{ marginLeft: '0.4rem', color: '#F59E0B', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                                                    (Faltan {parseFloat((p.quantity - (p.picked_up_quantity || 0)).toFixed(2))})
                                                                </span>}
                                                            </div>
                                                            <div>
                                                                {(() => {
                                                                    const purchaseDate = p.estimated_pickup_time ? p.estimated_pickup_time.split('T')[0] : '';
                                                                    const isOverdue = purchaseDate && purchaseDate < targetDateLabel;
                                                                    if (isOverdue) {
                                                                        const formattedPDate = formatDateFriendly(purchaseDate);
                                                                        return (
                                                                            <div style={{ 
                                                                                fontSize: '0.75rem', 
                                                                                fontWeight: '800',
                                                                                color: '#EF4444',
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                gap: '0.3rem',
                                                                                padding: '0.15rem 0.4rem',
                                                                                borderRadius: '5px',
                                                                                backgroundColor: 'rgba(239, 68, 68, 0.08)'
                                                                            }}>
                                                                                <AlertTriangle size={12} />
                                                                                HISTÓRICO - Pendiente {formattedPDate}
                                                                            </div>
                                                                        );
                                                                    }
                                                                    const diffMs = new Date().getTime() - new Date(p.estimated_pickup_time).getTime();
                                                                    const diffMins = Math.floor(Math.abs(diffMs) / 60000);
                                                                    const isAvailable = diffMs >= 0;
                                                                    return (
                                                                        <div style={{ 
                                                                            fontSize: '0.75rem', 
                                                                            fontWeight: '800',
                                                                            color: isAvailable ? 'var(--ops-primary)' : '#F59E0B',
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            gap: '0.3rem',
                                                                            padding: '0.15rem 0.4rem',
                                                                            borderRadius: '5px',
                                                                            backgroundColor: isAvailable ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)'
                                                                        }}>
                                                                            {isAvailable ? (
                                                                                <>
                                                                                    <span style={{ 
                                                                                        width: '6px', height: '6px', borderRadius: '50%', 
                                                                                        backgroundColor: 'var(--ops-primary)', 
                                                                                        display: 'inline-block',
                                                                                        animation: 'pulse 2s infinite' 
                                                                                    }} />
                                                                                    Disponible
                                                                                </>
                                                                            ) : (
                                                                                <>
                                                                                    <Clock size={12} />
                                                                                    en {diffMins} min
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })()}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Modal de Recogida */}
            {selectedPurchase && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 1000,
                    display: 'flex', alignItems: 'flex-end', justifyContent: 'center'
                }}>
                    <div style={{
                        backgroundColor: 'var(--ops-surface)',
                        width: '100%', maxWidth: '600px',
                        borderTopLeftRadius: '24px', borderTopRightRadius: '24px',
                        padding: '1.5rem',
                        animation: 'slideUp 0.3s ease-out',
                        maxHeight: '90vh', overflowY: 'auto',
                        color: 'var(--ops-text)'
                    }}>
                        {selectedPurchase.status === 'picked_up' || selectedPurchase.status === 'rejected' ? (
                            <div style={{
                                padding: '2rem 1.5rem',
                                textAlign: 'center',
                                backgroundColor: selectedPurchase.status === 'picked_up' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                border: `1px solid ${selectedPurchase.status === 'picked_up' ? 'var(--ops-primary)' : '#EF4444'}`,
                                borderRadius: '16px'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                                    {selectedPurchase.status === 'picked_up' ? <CheckCircle size={48} style={{ color: 'var(--ops-primary)' }} /> : <XCircle size={48} style={{ color: '#EF4444' }} />}
                                </div>
                                <h3 style={{
                                    color: selectedPurchase.status === 'picked_up' ? 'var(--ops-primary)' : '#EF4444',
                                    margin: '0 0 0.5rem 0',
                                    fontWeight: '900'
                                }}>
                                    {selectedPurchase.status === 'picked_up' ? '¡Recogida Finalizada!' : '¡Producto Rechazado!'}
                                </h3>
                                <p style={{ color: 'var(--ops-text-muted)', fontSize: '0.9rem', margin: 0 }}>
                                    {selectedPurchase.status === 'picked_up'
                                        ? `Ya se recogieron las ${selectedPurchase.picked_up_quantity} ${selectedPurchase.purchase_unit}. Tarea cerrada.`
                                        : 'El producto fue marcado como NO RECIBIDO.'
                                    }
                                </p>
                                <button
                                    onClick={() => setSelectedPurchase(null)}
                                    style={{
                                        marginTop: '1.5rem', width: '100%', padding: '1rem',
                                        borderRadius: '12px',
                                        backgroundColor: selectedPurchase.status === 'picked_up' ? 'var(--ops-primary)' : '#EF4444',
                                        color: 'white', border: 'none', fontWeight: 'bold', cursor: 'pointer'
                                    }}
                                >
                                    VOLVER A LA LISTA
                                </button>
                            </div>
                        ) : (
                            <>
                                {/* Header Modal */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                                    <div>
                                        <h2 style={{ fontSize: '1.4rem', fontWeight: '900', margin: 0, color: 'var(--ops-text)' }}>
                                            {showRejectionOptions ? 'Rechazar Producto' : 'Validar Recogida'}
                                        </h2>
                                        <p style={{ color: 'var(--ops-text-muted)', margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>
                                            {selectedPurchase.product?.name}
                                            {selectedPurchase.variant_label && (
                                                <span style={{ color: 'var(--ops-primary)', fontWeight: 'bold', marginLeft: '0.3rem' }}>
                                                    ({selectedPurchase.variant_label})
                                                </span>
                                            )}
                                        </p>

                                        {/* Info Diferencia Cantidades */}
                                        {!showRejectionOptions && (() => {
                                            const remaining = selectedPurchase.quantity - (selectedPurchase.picked_up_quantity || 0);
                                            const entering = parseFloat(receivedQty || '0');
                                            const leftAfterCurrent = parseFloat((remaining - entering).toFixed(2));
                                            return (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.85rem' }}>
                                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                                        <p style={{ margin: 0, color: 'var(--ops-text-muted)' }}>
                                                            Pedido: <span style={{ fontWeight: '800', color: 'var(--ops-text)' }}>{selectedPurchase.quantity} {selectedPurchase.purchase_unit}</span>
                                                        </p>
                                                        {selectedPurchase.picked_up_quantity ? (
                                                            <p style={{ margin: 0, color: 'var(--ops-primary)' }}>
                                                                Ya Recogido: <span style={{ fontWeight: '800' }}>{selectedPurchase.picked_up_quantity} {selectedPurchase.purchase_unit}</span>
                                                            </p>
                                                        ) : null}
                                                    </div>
                                                    {leftAfterCurrent > 0 ? (
                                                        <p style={{ margin: 0, color: '#F59E0B' }}>
                                                            Faltarán: <span style={{ fontWeight: '800' }}>{leftAfterCurrent} {selectedPurchase.purchase_unit}</span>
                                                        </p>
                                                    ) : null}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                    <button onClick={() => setSelectedPurchase(null)} style={{ background: 'none', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ops-text-muted)', cursor: 'pointer' }}><X size={20} /></button>
                                </div>

                                {!showRejectionOptions ? (
                                    <div style={{ animation: 'fadeIn 0.2s' }}>
                                        {/* Voucher Full */}
                                        {selectedPurchase.voucher_image_url && (
                                            <div style={{ marginBottom: '1.5rem', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--ops-border)', cursor: 'zoom-in' }} onClick={() => setShowVoucherZoom(true)}>
                                                <img src={selectedPurchase.voucher_image_url} alt="Vale" style={{ width: '100%', maxHeight: '300px', objectFit: 'contain', backgroundColor: 'var(--ops-bg)' }} />
                                                <div style={{ padding: '0.5rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--ops-primary)', fontWeight: 'bold', backgroundColor: 'var(--ops-bg)' }}>
                                                    <Search size={14} style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: '4px' }} /> Tocar para ampliar foto del vale
                                                </div>
                                            </div>
                                        )}

                                        {/* Form */}
                                        <div style={{ marginBottom: '1.5rem' }}>
                                            <label style={{ display: 'block', fontWeight: '700', marginBottom: '0.5rem', color: 'var(--ops-text-muted)' }}>
                                                Cantidad en este acarreo ({selectedPurchase.purchase_unit})
                                                {selectedPurchase.picked_up_quantity && selectedPurchase.picked_up_quantity > 0 ? (
                                                    <span style={{ color: 'var(--ops-primary)', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '0.2rem', fontWeight: '900' }}>
                                                        <Clock size={14} /> Historial: Recogido {selectedPurchase.picked_up_quantity} de {selectedPurchase.quantity} {selectedPurchase.purchase_unit}
                                                    </span>
                                                ) : null}
                                            </label>
                                            <input
                                                type="number"
                                                value={receivedQty}
                                                onChange={e => setReceivedQty(e.target.value)}
                                                style={{
                                                    width: '100%',
                                                    padding: '1rem',
                                                    fontSize: '1.2rem',
                                                    borderRadius: '12px',
                                                    border: '1px solid var(--ops-border)',
                                                    fontWeight: 'bold',
                                                    color: 'var(--ops-text)',
                                                    backgroundColor: 'var(--ops-bg)'
                                                }}
                                            />
                                        </div>

                                        {/* Semáforo Calidad */}
                                        <div style={{ marginBottom: '2rem' }}>
                                            <label style={{ display: 'block', fontWeight: '700', marginBottom: '0.8rem', color: 'var(--ops-text-muted)', textAlign: 'center' }}>Calidad del Producto</label>
                                            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                                                <button
                                                    onClick={() => {
                                                        setQuality('green');
                                                        setShowRejectionOptions(false);
                                                    }}
                                                    style={{
                                                        width: '60px', height: '60px', borderRadius: '50%',
                                                        backgroundColor: quality === 'green' ? '#10B981' : 'var(--ops-border)',
                                                        border: quality === 'green' ? '4px solid #D1FAE5' : 'none',
                                                        color: quality === 'green' ? 'white' : 'var(--ops-text)',
                                                        fontSize: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        transition: 'all 0.2s', transform: quality === 'green' ? 'scale(1.1)' : 'scale(1)',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <Check size={20} />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setQuality('yellow');
                                                        setShowRejectionOptions(false);
                                                    }}
                                                    style={{
                                                        width: '60px', height: '60px', borderRadius: '50%',
                                                        backgroundColor: quality === 'yellow' ? '#F59E0B' : 'var(--ops-border)',
                                                        border: quality === 'yellow' ? '4px solid #FEF3C7' : 'none',
                                                        color: quality === 'yellow' ? 'white' : 'var(--ops-text)',
                                                        fontSize: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        transition: 'all 0.2s', transform: quality === 'yellow' ? 'scale(1.1)' : 'scale(1)',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <AlertTriangle size={20} />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setQuality('red');
                                                        setShowRejectionOptions(true);
                                                    }}
                                                    style={{
                                                        width: '60px', height: '60px', borderRadius: '50%',
                                                        backgroundColor: quality === 'red' ? '#EF4444' : 'var(--ops-border)',
                                                        border: quality === 'red' ? '4px solid #FEE2E2' : 'none',
                                                        color: quality === 'red' ? 'white' : 'var(--ops-text)',
                                                        fontSize: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        transition: 'all 0.2s', transform: quality === 'red' ? 'scale(1.1)' : 'scale(1)',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <X size={20} />
                                                </button>
                                            </div>
                                            <div style={{ textAlign: 'center', marginTop: '0.5rem', fontWeight: '600', color: quality === 'green' ? '#10B981' : quality === 'yellow' ? '#F59E0B' : '#EF4444' }}>
                                                {quality === 'green' ? 'Conforme' : quality === 'yellow' ? 'Para Revisión' : quality === 'red' ? 'No Conforme' : ''}
                                            </div>

                                            {/* Observaciones de Calidad - Solo para Amarillo (Para Revisión) */}
                                            {quality === 'yellow' && (
                                                <div style={{ marginTop: '1.5rem', animation: 'fadeIn 0.2s', textAlign: 'left' }}>
                                                    <label style={{ display: 'block', fontWeight: '700', marginBottom: '0.5rem', color: 'var(--ops-text-muted)', fontSize: '0.85rem' }}>
                                                        Observaciones de Calidad (Obligatorio)
                                                    </label>
                                                    <textarea
                                                        value={notes}
                                                        onChange={e => setNotes(e.target.value)}
                                                        placeholder="Describe qué revisión requiere..."
                                                        rows={3}
                                                        style={{
                                                            width: '100%',
                                                            padding: '0.8rem',
                                                            fontSize: '0.95rem',
                                                            borderRadius: '12px',
                                                            border: '1px solid var(--ops-border)',
                                                            fontWeight: 'bold',
                                                            color: 'var(--ops-text)',
                                                            backgroundColor: 'var(--ops-bg)',
                                                            resize: 'vertical'
                                                        }}
                                                    />
                                                </div>
                                            )}
                                        </div>

                                        {/* Form Error */}
                                        {formError && (
                                            <div style={{
                                                padding: '1rem', backgroundColor: 'rgba(239, 68, 68, 0.15)', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.3)',
                                                color: '#EF4444', fontWeight: 'bold', textAlign: 'center', marginBottom: '1rem',
                                                fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
                                            }}>
                                                <AlertTriangle size={14} /> {formError}
                                            </div>
                                        )}

                                        {/* Actions */}
                                        <div style={{ display: 'grid', gap: '1rem' }}>
                                            <button
                                                onClick={() => handlePickupSubmit('picked_up')}
                                                disabled={processing || !receivedQty || !quality || ((quality === 'yellow' || quality === 'red') && !notes.trim())}
                                                style={{
                                                    width: '100%', padding: '1.2rem', borderRadius: '14px',
                                                    backgroundColor: 'var(--ops-primary)', color: 'white', border: 'none',
                                                    fontWeight: '900', fontSize: '1.1rem',
                                                    opacity: (processing || !receivedQty || !quality || ((quality === 'yellow' || quality === 'red') && !notes.trim())) ? 0.5 : 1,
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {processing ? 'Guardando...' : 'Confirmar Recogida Total'}
                                            </button>

                                            <div style={{ display: 'flex', gap: '1rem' }}>
                                                <button
                                                    onClick={() => handlePickupSubmit('partial_pickup')}
                                                    disabled={processing || !receivedQty || !quality || ((quality === 'yellow' || quality === 'red') && !notes.trim())}
                                                    style={{
                                                        flex: 1, padding: '1rem', borderRadius: '12px',
                                                        backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B', border: '1px solid rgba(245, 158, 11, 0.3)',
                                                        fontWeight: '700',
                                                        opacity: (processing || !receivedQty || !quality || ((quality === 'yellow' || quality === 'red') && !notes.trim())) ? 0.5 : 1,
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    Parcial (Volveré)
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setShowRejectionOptions(true);
                                                    }}
                                                    disabled={processing}
                                                    style={{
                                                        flex: 1, padding: '1rem', borderRadius: '12px',
                                                        backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#EF4444', border: '1px solid rgba(239, 68, 68, 0.3)',
                                                        fontWeight: '700', cursor: 'pointer'
                                                    }}
                                                >
                                                    Rechazar
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ animation: 'fadeIn 0.3s' }}>
                                        <h3 style={{ textAlign: 'center', color: '#EF4444', marginBottom: '1.2rem', fontWeight: '800' }}>¿Por qué no se recibió?</h3>
                                        
                                        {/* Foto de Evidencia de Rechazo Stylized like Compras */}
                                        <div style={{ marginBottom: '1.5rem' }}>
                                            <input
                                                type="file"
                                                id="rejectionPhotoInput"
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file) {
                                                        setRejectionFile(file);
                                                        setRejectionPreview(URL.createObjectURL(file));
                                                    }
                                                }}
                                                style={{
                                                     position: 'absolute',
                                                     width: '1px',
                                                     height: '1px',
                                                     padding: '0',
                                                     margin: '-1px',
                                                     overflow: 'hidden',
                                                     clip: 'rect(0, 0, 0, 0)',
                                                     whiteSpace: 'nowrap',
                                                     border: '0'
                                                 }}
                                            />
                                            {rejectionPreview ? (
                                                <div style={{ position: 'relative', width: '100%', height: '180px', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--ops-border)', backgroundColor: '#000' }}>
                                                    <img src={rejectionPreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                                    <div style={{ position: 'absolute', bottom: '0.5rem', right: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                                                        <label htmlFor="rejectionPhotoInput" style={{ padding: '0.4rem 0.8rem', background: 'rgba(0,0,0,0.7)', color: 'white', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><RefreshCw size={12} /> Cambiar Foto</label>
                                                    </div>
                                                </div>
                                            ) : (
                                                <label
                                                    htmlFor="rejectionPhotoInput"
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
                                                        padding: '1.2rem',
                                                        animation: 'pulse-red-border 2s infinite'
                                                    }}
                                                >
                                                    <Camera size={32} />
                                                    <span style={{ fontSize: '0.85rem', fontWeight: '900', marginTop: '0.3rem' }}>FOTO OBLIGATORIA — TAP PARA AGREGAR</span>
                                                    <span style={{ fontSize: '0.7rem', marginTop: '0.2rem', opacity: 0.8 }}>Sin foto no se puede rechazar</span>
                                                </label>
                                            )}
                                        </div>

                                        {/* Rejection Buttons */}
                                        {!rejectionFile && (
                                            <div style={{ textAlign: 'center', padding: '0.5rem', backgroundColor: 'rgba(239, 68, 68, 0.08)', borderRadius: '10px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                                                <span style={{ fontSize: '0.8rem', color: '#EF4444', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '4px', justifyContent: 'center', width: '100%' }}><Camera size={14} /> Agrega la foto antes de seleccionar el motivo</span>
                                            </div>
                                        )}
                                        <div style={{ display: 'grid', gap: '0.8rem' }}>
                                            <button
                                                onClick={() => handlePickupSubmit('rejected', 'Sin Stock')}
                                                disabled={!rejectionFile}
                                                style={{ padding: '1rem', borderRadius: '12px', backgroundColor: rejectionFile ? 'rgba(239, 68, 68, 0.15)' : 'rgba(100,116,139,0.1)', color: rejectionFile ? '#EF4444' : 'var(--ops-text-muted)', border: `1px solid ${rejectionFile ? 'rgba(239, 68, 68, 0.3)' : 'var(--ops-border)'}`, fontWeight: 'bold', cursor: rejectionFile ? 'pointer' : 'not-allowed', opacity: rejectionFile ? 1 : 0.5, display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}
                                            >
                                                <PackageX size={14} /> Proveedor Sin Stock
                                            </button>
                                            <button
                                                onClick={() => handlePickupSubmit('rejected', 'Mala Calidad')}
                                                disabled={!rejectionFile}
                                                style={{ padding: '1rem', borderRadius: '12px', backgroundColor: rejectionFile ? 'rgba(239, 68, 68, 0.15)' : 'rgba(100,116,139,0.1)', color: rejectionFile ? '#EF4444' : 'var(--ops-text-muted)', border: `1px solid ${rejectionFile ? 'rgba(239, 68, 68, 0.3)' : 'var(--ops-border)'}`, fontWeight: 'bold', cursor: rejectionFile ? 'pointer' : 'not-allowed', opacity: rejectionFile ? 1 : 0.5, display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}
                                            >
                                                <ThumbsDown size={14} /> Mala Calidad / Feo
                                            </button>
                                            <button
                                                onClick={() => {
                                                    if (!rejectionFile) return;
                                                    const reason = prompt("Describe el motivo:");
                                                    if (reason) handlePickupSubmit('rejected', reason);
                                                }}
                                                disabled={!rejectionFile}
                                                style={{ padding: '1rem', borderRadius: '12px', backgroundColor: rejectionFile ? 'var(--ops-bg)' : 'rgba(100,116,139,0.1)', color: rejectionFile ? 'var(--ops-text)' : 'var(--ops-text-muted)', border: `1px solid ${rejectionFile ? 'var(--ops-border)' : 'var(--ops-border)'}`, fontWeight: 'bold', cursor: rejectionFile ? 'pointer' : 'not-allowed', opacity: rejectionFile ? 1 : 0.5, display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}
                                            >
                                                <HelpCircle size={14} /> Otro Motivo...
                                            </button>
                                            <button
                                                onClick={() => setShowRejectionOptions(false)}
                                                style={{ marginTop: '0.5rem', padding: '0.8rem', background: 'none', border: 'none', color: 'var(--ops-text-muted)', textDecoration: 'underline', cursor: 'pointer' }}
                                            >
                                                Volver a Validación
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}
            {/* Voucher Image Fullscreen Lightbox Zoom */}
            {showVoucherZoom && selectedPurchase?.voucher_image_url && (
                <div 
                    style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.95)', zIndex: 10000,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '1.5rem',
                        animation: 'fadeIn 0.2s ease-out'
                    }}
                    onClick={() => setShowVoucherZoom(false)}
                >
                    <img 
                        src={selectedPurchase.voucher_image_url} 
                        alt="Zoomed Vale" 
                        style={{ maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain', borderRadius: '12px' }} 
                    />
                    <button 
                        style={{ 
                            position: 'absolute', top: '1.5rem', right: '1.5rem', 
                            background: 'rgba(255,255,255,0.15)', border: 'none', color: '#FFF', 
                            width: '40px', height: '40px', borderRadius: '50%', fontSize: '1.2rem', 
                            cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                        onClick={() => setShowVoucherZoom(false)}
                    >
                        ✕
                    </button>
                </div>
            )}

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
                        @keyframes dash {
                            to {
                                stroke-dashoffset: -20;
                            }
                        }
                        @keyframes modalEntrance {
                            from { transform: scale(0.95); opacity: 0; }
                            to { transform: scale(1); opacity: 1; }
                        }
                        .animate-float { animation: float 3s ease-in-out infinite; }
                        .animate-pulse-glow { animation: pulse-glow 2s ease-in-out infinite; }
                        .animate-dash { stroke-dasharray: 6; animation: dash 1.5s linear infinite; }
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
                                        <rect x="35" y="40" width="50" height="45" rx="8" fill="none" stroke="#10B981" strokeWidth="3" />
                                        <line x1="35" y1="52" x2="85" y2="52" stroke="#10B981" strokeWidth="2" />
                                        <circle cx="50" cy="65" r="4" fill="#3B82F6" />
                                        <circle cx="70" cy="65" r="4" fill="#3B82F6" />
                                        <path d="M 52 74 Q 60 79 68 74" stroke="#F59E0B" strokeWidth="3" fill="none" strokeLinecap="round" />
                                        <path d="M 60 20 L 60 30" stroke="#10B981" strokeWidth="3" strokeLinecap="round" />
                                        <circle cx="60" cy="16" r="3" fill="#10B981" />
                                    </svg>
                                )}
                                {guideStep === 1 && (
                                    <svg width="160" height="120" viewBox="0 0 160 120" className="animate-float">
                                        <rect x="15" y="45" width="55" height="35" rx="8" fill="none" stroke="#64748B" strokeWidth="2.5" />
                                        <text x="42" y="67" fill="#94A3B8" fontSize="9" fontWeight="bold" textAnchor="middle">PROVEEDOR</text>
                                        
                                        <line x1="70" y1="62" x2="90" y2="62" stroke="#3B82F6" strokeWidth="2" strokeDasharray="4" className="animate-dash" />
                                        
                                        <rect x="90" y="45" width="55" height="35" rx="8" fill="none" stroke="#10B981" strokeWidth="2.5" />
                                        <text x="117" y="67" fill="#10B981" fontSize="9" fontWeight="bold" textAnchor="middle">BODEGA</text>
                                    </svg>
                                )}
                                {guideStep === 2 && (
                                    <svg width="120" height="120" viewBox="0 0 120 120">
                                        <circle cx="60" cy="60" r="35" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
                                        <circle cx="60" cy="35" r="12" fill="rgba(239, 68, 68, 0.2)" stroke="#EF4444" strokeWidth="2.5" className="animate-pulse-glow" />
                                        <circle cx="60" cy="35" r="5" fill="#EF4444" />
                                        <circle cx="35" cy="75" r="12" fill="rgba(245, 158, 11, 0.2)" stroke="#F59E0B" strokeWidth="2.5" style={{ animation: 'pulse-glow 2s infinite', animationDelay: '0.6s' }} />
                                        <circle cx="35" cy="75" r="5" fill="#F59E0B" />
                                        <circle cx="85" cy="75" r="12" fill="rgba(16, 185, 129, 0.2)" stroke="#10B981" strokeWidth="2.5" style={{ animation: 'pulse-glow 2s infinite', animationDelay: '1.2s' }} />
                                        <circle cx="85" cy="75" r="5" fill="#10B981" />
                                    </svg>
                                )}
                                {guideStep === 3 && (
                                    <svg width="120" height="120" viewBox="0 0 120 120" className="animate-float">
                                        <circle cx="60" cy="60" r="45" fill="rgba(239, 68, 68, 0.1)" />
                                        <path d="M40 80 L40 50 A20 20 0 0 1 80 50 L80 80 Z" fill="none" stroke="#EF4444" strokeWidth="3.5" />
                                        <circle cx="60" cy="45" r="5" fill="#EF4444" />
                                        <circle cx="60" cy="65" r="8" fill="none" stroke="#EF4444" strokeWidth="3" />
                                    </svg>
                                )}
                            </div>

                            {/* Title */}
                            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', fontWeight: '900', color: '#FFFFFF' }}>
                                {guideStep === 0 && "¡Bienvenido a Recogidas!"}
                                {guideStep === 1 && "Agrupación en Pestañas"}
                                {guideStep === 2 && "Registro de Calidad"}
                                {guideStep === 3 && "Foto de Evidencia Obligatoria"}
                            </h4>

                            {/* Description */}
                            <p style={{ margin: 0, fontSize: '0.85rem', color: '#94A3B8', lineHeight: '1.5', minHeight: '60px' }}>
                                {guideStep === 0 && "Esta interfaz te permite ver qué productos debes recoger y validar hoy de tus proveedores o bodegas programados para el turno."}
                                {guideStep === 1 && "Alterna rápidamente entre las vistas 'Por Proveedor' o 'Por Bodega'. El selector estilo pestaña optimiza el espacio en tu pantalla móvil."}
                                {guideStep === 2 && "Presiona en cualquier producto para abrir el formulario, confirmar cantidades y registrar la calidad: Verde (Conforme), Amarillo (Para Revisión) o Rojo (No Conforme)."}
                                {guideStep === 3 && "Si rechazas un producto (Rojo), la app bloqueará la confirmación hasta que subas una foto de evidencia para respaldar la novedad."}
                            </p>

                            {/* Progress Dots */}
                            <div style={{ display: 'flex', gap: '0.5rem', margin: '1.5rem 0' }}>
                                {[0, 1, 2, 3].map((step) => (
                                    <div
                                        key={step}
                                        onClick={() => setGuideStep(step)}
                                        style={{
                                            width: guideStep === step ? '20px' : '8px',
                                            height: '8px',
                                            borderRadius: '4px',
                                            backgroundColor: guideStep === step ? 'var(--ops-primary)' : '#475569',
                                            cursor: 'pointer',
                                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                                        }}
                                    />
                                ))}
                            </div>

                            {/* Navigation Buttons */}
                            <div style={{ display: 'flex', width: '100%', gap: '0.75rem', marginTop: '0.5rem' }}>
                                {guideStep > 0 ? (
                                    <button
                                        onClick={() => setGuideStep(prev => prev - 1)}
                                        style={{
                                            flex: 1, padding: '0.75rem', borderRadius: '12px',
                                            backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                                            color: '#F8FAFC', fontWeight: 'bold', fontSize: '0.85rem', cursor: 'pointer',
                                            transition: 'all 0.2s ease'
                                        }}
                                    >
                                        Atrás
                                    </button>
                                ) : (
                                    <div style={{ flex: 1 }} />
                                )}

                                {guideStep < 3 ? (
                                    <button
                                        onClick={() => setGuideStep(prev => prev + 1)}
                                        style={{
                                            flex: 2, padding: '0.75rem', borderRadius: '12px',
                                            backgroundColor: 'var(--ops-primary)', border: 'none',
                                            color: 'white', fontWeight: 'bold', fontSize: '0.85rem', cursor: 'pointer',
                                            transition: 'all 0.2s ease',
                                            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)'
                                        }}
                                    >
                                        Siguiente
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => setShowGuide(false)}
                                        style={{
                                            flex: 2, padding: '0.75rem', borderRadius: '12px',
                                            backgroundColor: 'var(--ops-primary)', border: 'none',
                                            color: 'white', fontWeight: 'bold', fontSize: '0.85rem', cursor: 'pointer',
                                            transition: 'all 0.2s ease',
                                            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)'
                                        }}
                                    >
                                        Comenzar
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Ocultar Barra de Scroll (Estilo App Nativa) y Estilos de Animación */}
            <style
                dangerouslySetInnerHTML={{
                    __html: `
                        ::-webkit-scrollbar { width: 0 !important; display: none; }
                        html, body { -ms-overflow-style: none; scrollbar-width: none; }

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
                        
                        /* Ocultar flechas de input number */
                        input[type=number]::-webkit-inner-spin-button, 
                        input[type=number]::-webkit-outer-spin-button { 
                            -webkit-appearance: none; 
                            margin: 0; 
                        }
                        input[type=number] {
                            -moz-appearance: textfield;
                        }

                        @keyframes slideUp {
                            from { transform: translateY(100%); opacity: 0; }
                            to { transform: translateY(0); opacity: 1; }
                        }
                        @keyframes fadeIn {
                            from { opacity: 0; }
                            to { opacity: 1; }
                        }
                        @keyframes pulse {
                            0% { opacity: 1; transform: scale(1); }
                            50% { opacity: 0.6; transform: scale(0.98); }
                            100% { opacity: 1; transform: scale(1); }
                        }
                        @keyframes pulse-red-border {
                            0%, 100% { border-color: #EF4444; box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
                            50% { border-color: #F87171; box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
                        }
                    `
                }}
            />
        </div>
    );
}
