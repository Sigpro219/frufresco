'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { isSandboxMode } from '@/lib/sandboxGuard';
import { THEME, formatNumber, formatMoney } from '@/lib/adminTheme';
import { formatBogotaDate } from '@/lib/dateUtils';
import { getOperationalTargetDate } from '@/lib/ops/operationalCells';
import { getOrderSpaceDisplayLabel } from '@/lib/stagingSpaceAllocator';
import {
    classifyOrderGps,
    resolveOrderDisplayWindow,
    buildGoogleMapsDirectionChunks
} from '@/lib/transport/gpsHygiene';
import { normalizeFleetOwnership, isThirdPartyVehicle } from '@/lib/transport/fleetOwnership';
import { RouteSpaghettiMapModal } from '@/components/RouteSpaghettiMapModal';
import { 
    Calendar, 
    Scale, 
    MapPin, 
    Building2, 
    Clock, 
    AlertTriangle, 
    Sparkles, 
    Check, 
    Trash2, 
    X, 
    Truck, 
    Settings, 
    Activity,
    FileText,
    Users,
    Banknote,
    Package,
    Zap,
    Bot,
    ShoppingBag,
    CheckCircle2,
    Coins,
    Star,
    Search,
    Sliders,
    ArrowDownUp,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    Printer,
    MessageSquare,
    Navigation,
    Route,
    ExternalLink,
    Info
} from 'lucide-react';

interface Order {
    id: string;
    customer_name: string;
    status: string;
    total_weight_kg: number;
    delivery_slot: string;
    delivery_zone?: string;
    is_b2b?: boolean;
    latitude?: number;
    longitude?: number;
    address?: string;
    crates?: number;
    novedad?: string;
    address_complement?: string;
    display_slot?: string;
    slot_type?: 'manual' | 'profile' | 'b2c_slot' | 'flexible';
    payment_method?: string;
    payment_status?: string;
    warehouse_spaces?: number[] | null;
    logistics_data?: Record<string, any> | null;
    profiles?: {
        latitude?: number | null;
        longitude?: number | null;
    } | null;
}

interface Vehicle {
    id: string;
    plate: string;
    vehicle_type: string;
    capacity_kg: number;
    driver_id?: string;
    driver_name?: string;
    driver_avatar?: string;
    driver?: {
        contact_name: string;
        avatar_url?: string;
    } | null;
    max_crates_capacity: number;
}

export default function RoutePlanner({ readOnly = false }: { readOnly?: boolean }) {
    const [orders, setOrders] = useState<Order[]>([]);
    const [priorityOrderIds, setPriorityOrderIds] = useState<string[]>([]);

    useEffect(() => {
        const validIds = new Set(orders.map(o => String(o.id)));
        setPriorityOrderIds(prev => {
            const filtered = prev.filter(id => validIds.has(id));
            return filtered.length === prev.length ? prev : filtered;
        });
    }, [orders]);

    const togglePriorityOrder = (orderId: string) => {
        if (readOnly) return;
        const targetId = String(orderId);
        const clicked = orders.find(o => String(o.id) === targetId);
        const parentId = clicked?.logistics_data?.is_off_agreement_split && clicked?.logistics_data?.parent_order_id
            ? String(clicked.logistics_data.parent_order_id)
            : targetId;
        const familyIds = new Set<string>([parentId]);
        orders.forEach(o => {
            if (o?.logistics_data?.is_off_agreement_split && String(o?.logistics_data?.parent_order_id || '') === parentId) {
                familyIds.add(String(o.id));
            }
        });
        setPriorityOrderIds(prev => {
            const isCurrentlyPriority = Array.from(familyIds).some(id => prev.includes(id));
            if (isCurrentlyPriority) {
                return prev.filter(id => !familyIds.has(id));
            }
            const next = new Set(prev);
            familyIds.forEach(id => next.add(id));
            return Array.from(next);
        });
    };
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [tableSearch, setTableSearch] = useState<string>('');
    const [tableFilter, setTableFilter] = useState<'all' | 'pending' | 'priority'>('all');
    const [sortField, setSortField] = useState<'type' | 'customer' | 'esp' | 'load' | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const toggleSort = (field: 'type' | 'customer' | 'esp' | 'load') => {
        if (sortField !== field) {
            setSortField(field);
            setSortDir('asc');
        } else if (sortDir === 'asc') {
            setSortDir('desc');
        } else {
            setSortField(null);
            setSortDir('asc');
        }
    };
    const renderSortIcon = (field: 'type' | 'customer' | 'esp' | 'load') => {
        if (sortField !== field) return <ArrowUpDown size={11} style={{ opacity: 0.45 }} />;
        return sortDir === 'asc'
            ? <ArrowUp size={11} color="#0D7A57" />
            : <ArrowDown size={11} color="#0D7A57" />;
    };
    const [routeViewMode, setRouteViewMode] = useState<'delivery' | 'lifo'>('delivery');
    const [loading, setLoading] = useState(true);
    const [optimizing, setOptimizing] = useState(false);
    const [optimizationError, setOptimizationError] = useState<string | null>(null);
    const [confirmationError, setConfirmationError] = useState<string | null>(null);
    const [copiedWhatsApp, setCopiedWhatsApp] = useState<boolean>(false);
    const [popupBlockedWarning, setPopupBlockedWarning] = useState<boolean>(false);
    const [showAiModal, setShowAiModal] = useState(false);
    const [aiReportText, setAiReportText] = useState('');
    const [debugInfo, setDebugInfo] = useState({ targetDate: '', count: 0, cutoff: false, driversFound: '' });

    const [selectedDeliveryDate, setSelectedDeliveryDate] = useState<string>(() => {
        if (typeof window !== 'undefined') {
            const urlDate = new URLSearchParams(window.location.search).get('date');
            if (urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate)) {
                return urlDate;
            }
        }
        return getOperationalTargetDate(20);
    });
    const [showAllDates, setShowAllDates] = useState<boolean>(false);

    const [showSettings, setShowSettings] = useState(false);
    const [params, setParams] = useState<Record<string, any>>({
        b2b_kg_min: 10,
        b2c_kg_min: 5,
        base_setup_time: 4,               // X: Tiempo base alistamiento
        time_per_10_crates_unload: 4,      // Y: Descarga física de 10 canastillas
        time_per_10_crates_delivery: 10,   // Z: Recepción/Revisión de 10 canastillas
        avg_kg_per_crate: 12.5,
        space_capacity: 36,               // Capacidad de canastillas por bahía física
        driver_break_mins: 45,
        fleet_start_time: '04:30',
        fleet_end_time: '19:00',
        optimization_strategy: 'balanced',
        warehouse_base_load_time: 15,
        warehouse_time_per_10_crates_load: 5,
        b2b_default_window_start: '06:00',
        b2b_default_window_end: '10:00',
        b2c_default_window_start: '10:00',
        b2c_default_window_end: '14:00'
    });
    const [windowSettingsError, setWindowSettingsError] = useState<string | null>(null);
    const [assignments, setAssignments] = useState<Record<string, string[]>>({}); 
    const [routeStartTimes, setRouteStartTimes] = useState<Record<string, string>>({});
    const [stopEtas, setStopEtas] = useState<Record<string, string>>({});
    const [confirmedManifest, setConfirmedManifest] = useState<any[] | null>(null);
    const [showPreConfirm, setShowPreConfirm] = useState(false);
    const [optimizationSource, setOptimizationSource] = useState<'google' | null>(null);
    const [routePolylines, setRoutePolylines] = useState<Record<string, string>>({});
    const [routeMetrics, setRouteMetrics] = useState<Record<string, { distance_km: number; travel_min: number; total_min: number; wait_min: number; break_min: number; service_min?: number; return_eta?: string }>>({});
    const [stopLegMetrics, setStopLegMetrics] = useState<Record<string, { distance_km: number; travel_min: number; is_same_site_followup?: boolean; service_min?: number; cluster_size?: number }>>({});
    const [trafficMode, setTrafficMode] = useState<'live_predictive' | 'weekday_projected' | null>(null);
    const [optimizerErrorBanner, setOptimizerErrorBanner] = useState<string | null>(null);
    const [excludedNoGpsIds, setExcludedNoGpsIds] = useState<string[]>([]);
    const [skippedWarnings, setSkippedWarnings] = useState<Array<{ orderId: string; reasons: any[] }>>([]);
    const [spaghettiOpen, setSpaghettiOpen] = useState<boolean>(false);
    const [spaghettiVehicleId, setSpaghettiVehicleId] = useState<string | null>(null);

    const isMounted = useRef(true);
    const isSandbox = isSandboxMode();
    const activeDraftScope = (showAllDates || !selectedDeliveryDate) ? 'ALL' : selectedDeliveryDate;
    const loadedDraftScopeRef = useRef<string | null>(null);
    const lastSavedJsonRef = useRef<string>('');
    const fetchSeqRef = useRef<number>(0);
    const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearDraftForScope = async (scope: string) => {
        if (saveDebounceRef.current) {
            clearTimeout(saveDebounceRef.current);
            saveDebounceRef.current = null;
        }
        lastSavedJsonRef.current = '';
        try {
            if (isSandbox) {
                localStorage.removeItem(`frufresco_route_planner_draft_${scope}`);
            } else {
                localStorage.removeItem('frufresco_route_planner_draft');
            }
        } catch (_) {}
        if (isSandbox) {
            const { error } = await supabase
                .from('app_settings')
                .delete()
                .eq('key', `route_planner_draft_${scope}`);
            if (error) {
                console.warn('Error limpiando borrador Sandbox en app_settings:', error.message);
            }
        }
    };

    useEffect(() => {
        isMounted.current = true;
        fetchInitialData();
        return () => { isMounted.current = false; };
    }, [selectedDeliveryDate, showAllDates]);

    const fetchInitialData = async () => {
        const mySeq = ++fetchSeqRef.current;
        const scopeForFetch = (showAllDates || !selectedDeliveryDate) ? 'ALL' : selectedDeliveryDate;
        if (isSandbox) {
            loadedDraftScopeRef.current = null;
            lastSavedJsonRef.current = '';
            setAssignments({});
            setIsOptimized(false);
            setOptimizationSource(null);
            setStopEtas({});
            setRouteStartTimes({});
            setTheoreticalMetrics(null);
            setRouteMetrics({});
            setStopLegMetrics({});
            setTrafficMode(null);
            setRoutePolylines({});
            setAiReportText('');
        }
        try {
            setLoading(true);
            
            // 1. Fetch Logistic Parameters
            const { data: paramData, error: pErr } = await supabase.from('logistic_parameters').select('*');
            if (pErr) console.warn('Note: Could not fetch logistic parameters:', pErr.message);
            
            let avgCrateWeight = 12.5; // default fallback
            if (paramData && isMounted.current && fetchSeqRef.current === mySeq) {
                const pMap: Record<string, any> = {};
                paramData.forEach((p: any) => {
                    const valFloat = parseFloat(p.value);
                    pMap[p.id] = isNaN(valFloat) || p.value.includes(':') ? p.value : valFloat;
                });
                setParams(prev => ({ ...prev, ...pMap }));
                if (pMap.avg_kg_per_crate) {
                    avgCrateWeight = pMap.avg_kg_per_crate;
                }
            }

            // 2. Fetch Orders (with date filter or all dates)
            let apiUrl = '/api/transport/orders';
            if (!showAllDates && selectedDeliveryDate) {
                apiUrl += `?date=${selectedDeliveryDate}&t=${Date.now()}`;
            } else {
                apiUrl += `?t=${Date.now()}`;
            }

            const response = await fetch(apiUrl, { cache: 'no-store' });
            if (!response.ok) throw new Error('Failed to fetch orders');
            const orderData = await response.json();

            // 3. Fetch Fleet with Driver Join (Matching FleetManagement logic)
            const { data: fleetData, error: fErr } = await supabase
                .from('fleet_vehicles')
                .select(`
                    *,
                    driver:collaborators!driver_id (
                        id,
                        contact_name
                    )
                `)
                .eq('status', 'available');

            if (!isMounted.current || fetchSeqRef.current !== mySeq) return;
            if (fErr) throw fErr;

            if (isMounted.current) {
                setDebugInfo({ 
                    targetDate: showAllDates ? 'TODOS' : selectedDeliveryDate, 
                    count: (orderData || []).length,
                    cutoff: !showAllDates,
                    driversFound: 'Sincronizado con FLOTA'
                });
            }

            const enhancedFleet = (fleetData || []).map(v => ({
                ...v,
                vehicle_type: normalizeFleetOwnership(v.vehicle_type),
                driver_name: v.driver?.contact_name || 'Sin Asignar'
            }));

            // Update State
            setVehicles(enhancedFleet);
            
            const mappedOrders = (orderData || []).map((o: any) => {
                let name = o.customer_name || 'Sin Nombre';
                if (o.profiles) {
                    if (o.profiles.role === 'b2b_client') {
                        name = o.profiles.company_name || 'Sin Razón Social';
                    } else {
                        name = o.profiles.contact_name || o.profiles.company_name || 'Cliente Registrado';
                    }
                } else if (o.admin_notes && o.admin_notes.includes('CLIENTE HOGAR')) {
                    const nameMatch = o.admin_notes.match(/Nombre: (.*?) \|/);
                    if (nameMatch) name = nameMatch[1];
                }

                // Extraer solo la restricción o instrucción logística real, omitiendo volcados de email y logs
                let notes = o.admin_notes || '';
                if (notes) {
                    notes = notes.replace(/\[PAGO:.*?\]/gi, '')
                                 .replace(/\[ORIGIN:.*?\]/gi, '')
                                 .replace(/\[CLIENTE HOGAR.*?\]/gi, '')
                                 .replace(/\[Audit[^\]]*\]/gi, '')
                                 .replace(/\[AUDITOR[IÍ]A[^\]]*\]/gi, '')
                                 .replace(/\[ORDEN DE COMPRA[^\]]*\]/gi, '')
                                 .replace(/CLIENTE HOGAR.*?(\||\n|$)/gi, '')
                                 .replace(/\[PEDIDO CORREO\][\s\S]*$/gi, '')
                                 .replace(/Asunto:[\s\S]*$/gi, '')
                                 .replace(/De:[\s\S]*$/gi, '')
                                 .replace(/Enviado el:[\s\S]*$/gi, '')
                                 .replace(/Estimados señores[\s\S]*$/gi, '')
                                 .replace(/Pago en línea verificado.*?(\.|\n|$)/gi, '')
                                 .replace(/Pago contra entrega.*?(\.|\n|$)/gi, '')
                                 .replace(/Pago en efectivo.*?(\.|\n|$)/gi, '')
                                 .replace(/Contraentrega.*?(\.|\n|$)/gi, '')
                                 .replace(/Wompi.*?(\.|\n|$)/gi, '')
                                 .replace(/Aprobado.*?(\.|\n|$)/gi, '')
                                 .replace(/Nombre:.*?(\||\n|$)/gi, '')
                                 .replace(/Tel:.*?(\||\n|$)/gi, '')
                                 .replace(/ID:[a-f0-9-]{36}/gi, '') // Removes UUIDs
                                 .replace(/ID:.*?(\||\n|$)/gi, '')
                                 .replace(/\|/g, '') // Remove remaining separators
                                 .trim();
                }




                const resolvedIsB2B = !!o.is_b2b || (o.type?.toLowerCase().includes('b2b') ?? false) || o.profiles?.role === 'b2b_client' || o.profiles?.role === 'b2b';

                // Resolve display time window and type
                let displaySlot = 'Flexible';
                let slotType: 'manual' | 'profile' | 'b2c_slot' | 'flexible' = 'flexible';

                if (o.is_manual_delivery && o.manual_delivery_time) {
                    // Si tiene una hora específica en la cabecera (como los pedidos que generamos)
                    // ej. 08:30 y margen 60 -> 07:30 - 09:30
                    const margin = o.manual_delivery_margin || 60;
                    const [h, m] = o.manual_delivery_time.split(':').map(Number);
                    
                    const pad = (n: number) => n.toString().padStart(2, '0');
                    
                    // Calcular hora de inicio
                    const totalMinStart = (h * 60 + m - margin + 1440) % 1440;
                    const startH = Math.floor(totalMinStart / 60);
                    const startM = totalMinStart % 60;
                    
                    // Calcular hora de fin
                    const totalMinEnd = (h * 60 + m + margin) % 1440;
                    const endH = Math.floor(totalMinEnd / 60);
                    const endM = totalMinEnd % 60;

                    displaySlot = `${pad(startH)}:${pad(startM)} - ${pad(endH)}:${pad(endM)}`;
                    slotType = 'manual';
                } else if (resolvedIsB2B) {
                    if (o.is_manual_delivery && o.logistics_data?.windows?.[0]) {
                        const win = o.logistics_data.windows[0];
                        if (win.startTime && win.endTime) {
                            displaySlot = `${win.startTime} - ${win.endTime}`;
                            slotType = 'manual';
                        }
                    } else if (o.profiles?.logistics_data?.windows?.[0]) {
                        const win = o.profiles.logistics_data.windows[0];
                        if (win.startTime && win.endTime) {
                            displaySlot = `${win.startTime} - ${win.endTime}`;
                            slotType = 'profile';
                        }
                    }
                }

                return {
                    ...o,
                    customer_name: name,
                    address: o.shipping_address || 'Sin Dirección',
                    address_complement: o.profiles?.address_complement || '',
                    latitude: o.latitude ?? o.profiles?.latitude ?? undefined,
                    longitude: o.longitude ?? o.profiles?.longitude ?? undefined,
                    crates: o.crates || (o.total_weight_kg ? Math.ceil(o.total_weight_kg / avgCrateWeight) : 0),
                    novedad: notes,
                    total_weight_kg: o.total_weight_kg || 0,
                    is_b2b: resolvedIsB2B,
                    delivery_zone: o.delivery_zone || '',
                    display_slot: displaySlot,
                    slot_type: slotType,
                    payment_method: o.payment_method,
                    payment_status: o.payment_status
                };
            });
            setOrders(mappedOrders);

            // Cargar asignaciones guardadas (Sandbox: app_settings + localStorage por fecha; Prod: localStorage legado)
            try {
                const validOrderIds = new Set(mappedOrders.map((o: any) => String(o.id)));
                const applyDraftState = (savedData: any) => {
                    const filteredAssignments: Record<string, string[]> = {};
                    Object.keys(savedData.assignments || {}).forEach(vehicleId => {
                        const oids = (savedData.assignments[vehicleId] || []).filter((oid: string) => validOrderIds.has(String(oid)));
                        if (oids.length > 0) {
                            filteredAssignments[vehicleId] = oids;
                        }
                    });
                    setAssignments(filteredAssignments);
                    const isGoogleSaved = savedData.optimizationSource === 'google';
                    setIsOptimized(isGoogleSaved && Boolean(savedData.isOptimized));
                    setOptimizationSource(isGoogleSaved ? 'google' : null);
                    if (savedData.stopEtas && typeof savedData.stopEtas === 'object') {
                        setStopEtas(savedData.stopEtas);
                    }
                    if (savedData.routeStartTimes && typeof savedData.routeStartTimes === 'object') {
                        setRouteStartTimes(savedData.routeStartTimes);
                    }
                    if (savedData.theoreticalMetrics) {
                        setTheoreticalMetrics(savedData.theoreticalMetrics);
                    }
                    if (savedData.routeMetrics && typeof savedData.routeMetrics === 'object') {
                        setRouteMetrics(savedData.routeMetrics);
                    }
                    if (savedData.stopLegMetrics && typeof savedData.stopLegMetrics === 'object') {
                        setStopLegMetrics(savedData.stopLegMetrics);
                    }
                    if (savedData.trafficMode === 'live_predictive' || savedData.trafficMode === 'weekday_projected') {
                        setTrafficMode(savedData.trafficMode);
                    }
                    if (savedData.routePolylines && typeof savedData.routePolylines === 'object') {
                        setRoutePolylines(savedData.routePolylines);
                    }
                    if (savedData.aiReportText) {
                        setAiReportText(savedData.aiReportText);
                    }
                    return filteredAssignments;
                };

                if (isSandbox) {
                    let localDraft: any = null;
                    try {
                        const localStr = localStorage.getItem(`frufresco_route_planner_draft_${scopeForFetch}`);
                        if (localStr) localDraft = JSON.parse(localStr);
                    } catch (_) {}

                    let remoteDraft: any = null;
                    let remoteUpdatedAt = '';
                    try {
                        const { data: remoteRow } = await supabase
                            .from('app_settings')
                            .select('value, updated_at')
                            .eq('key', `route_planner_draft_${scopeForFetch}`)
                            .maybeSingle();
                        if (!isMounted.current || fetchSeqRef.current !== mySeq) return;
                        if (remoteRow?.value) {
                            remoteDraft = JSON.parse(remoteRow.value);
                            remoteUpdatedAt = remoteRow.updated_at || '';
                        }
                    } catch (remoteErr) {
                        console.warn('Error leyendo borrador Sandbox desde app_settings:', remoteErr);
                    }

                    const remoteTs = remoteDraft ? String(remoteDraft.savedAt || remoteUpdatedAt || '') : '';
                    const localTs = localDraft ? String(localDraft.savedAt || '') : '';
                    const winningDraft = remoteDraft && (!localDraft || remoteTs >= localTs)
                        ? remoteDraft
                        : localDraft;

                    if (winningDraft) {
                        const hydratedAssignments = applyDraftState(winningDraft);
                        const canonicalHydrated = {
                            targetDate: scopeForFetch,
                            assignments: hydratedAssignments,
                            isOptimized: (winningDraft.optimizationSource === 'google') && Boolean(winningDraft.isOptimized),
                            optimizationSource: winningDraft.optimizationSource === 'google' ? 'google' : null,
                            stopEtas: winningDraft.stopEtas || {},
                            routeStartTimes: winningDraft.routeStartTimes || {},
                            theoreticalMetrics: winningDraft.theoreticalMetrics || null,
                            routeMetrics: winningDraft.routeMetrics || {},
                            stopLegMetrics: winningDraft.stopLegMetrics || {},
                            trafficMode: (winningDraft.trafficMode === 'live_predictive' || winningDraft.trafficMode === 'weekday_projected') ? winningDraft.trafficMode : null,
                            aiReportText: winningDraft.aiReportText || '',
                            routePolylines: winningDraft.routePolylines || {}
                        };
                        lastSavedJsonRef.current = JSON.stringify(canonicalHydrated);
                    }
                    loadedDraftScopeRef.current = scopeForFetch;
                } else {
                    const savedDataStr = localStorage.getItem('frufresco_route_planner_draft');
                    if (savedDataStr) {
                        const savedData = JSON.parse(savedDataStr);
                        if (savedData.targetDate === selectedDeliveryDate) {
                            applyDraftState(savedData);
                        }
                    }
                }
            } catch (e) {
                console.error("Error al cargar borrador:", e);
                if (isSandbox) loadedDraftScopeRef.current = scopeForFetch;
            }

        } catch (err: any) {
            console.error('Error fetching planner data:', err.message || err.details || err);
        } finally {
            if (isMounted.current && fetchSeqRef.current === mySeq) setLoading(false);
        }
    };

    const [isOptimized, setIsOptimized] = useState(false);
    const [theoreticalMetrics, setTheoreticalMetrics] = useState<{distance_km: number, travel_min?: number, duration_min: number} | null>(null);
    const [dragOverVehicleId, setDragOverVehicleId] = useState<string | null>(null);
    const [dragOverSidebar, setDragOverSidebar] = useState<boolean>(false);

    // Guardar automáticamente el borrador (Sandbox: app_settings debounced + localStorage por fecha; Prod: localStorage legado)
    useEffect(() => {
        if (loading) return;
        if (isSandbox) {
            if (readOnly || loadedDraftScopeRef.current !== activeDraftScope) return;
            const hasAnyAssignment = Object.values(assignments).some(arr => Array.isArray(arr) && arr.length > 0);
            if (!hasAnyAssignment) return;

            const canonicalDraft = {
                targetDate: activeDraftScope,
                assignments,
                isOptimized,
                optimizationSource,
                stopEtas,
                routeStartTimes,
                theoreticalMetrics,
                routeMetrics,
                stopLegMetrics,
                trafficMode,
                aiReportText,
                routePolylines
            };
            const canonicalJson = JSON.stringify(canonicalDraft);
            if (canonicalJson === lastSavedJsonRef.current) return;

            const savedAt = new Date().toISOString();
            const fullPayload = JSON.stringify({ ...canonicalDraft, savedAt });
            const baseWithoutPolylines = JSON.stringify({
                ...canonicalDraft,
                routePolylines: {},
                savedAt
            });

            try {
                localStorage.setItem(
                    `frufresco_route_planner_draft_${activeDraftScope}`,
                    fullPayload.length < 200000 ? fullPayload : baseWithoutPolylines
                );
            } catch (_) {
                try {
                    localStorage.setItem(`frufresco_route_planner_draft_${activeDraftScope}`, baseWithoutPolylines);
                } catch (fallbackErr) {
                    console.error("Error al guardar borrador en localStorage:", fallbackErr);
                }
            }

            if (saveDebounceRef.current) {
                clearTimeout(saveDebounceRef.current);
            }
            const scopeToSave = activeDraftScope;
            const payloadToSave = fullPayload.length < 350000 ? fullPayload : baseWithoutPolylines;
            saveDebounceRef.current = setTimeout(async () => {
                if (readOnly || loadedDraftScopeRef.current !== scopeToSave) return;
                const { error } = await supabase
                    .from('app_settings')
                    .upsert(
                        {
                            key: `route_planner_draft_${scopeToSave}`,
                            value: payloadToSave,
                            description: `Borrador persistente Planeación Transporte Sandbox (${scopeToSave})`
                        },
                        { onConflict: 'key' }
                    );
                if (error) {
                    console.warn('Error guardando borrador Sandbox en app_settings:', error.message);
                } else {
                    lastSavedJsonRef.current = canonicalJson;
                }
            }, 700);

            return () => {
                if (saveDebounceRef.current) {
                    clearTimeout(saveDebounceRef.current);
                    saveDebounceRef.current = null;
                }
            };
        }

        const targetDate = selectedDeliveryDate || getOperationalTargetDate(20);
        const baseDraft = {
            targetDate,
            assignments,
            isOptimized,
            optimizationSource,
            stopEtas,
            routeStartTimes,
            theoreticalMetrics,
            routeMetrics,
            stopLegMetrics,
            trafficMode,
            aiReportText
        };
        try {
            const draftWithPolylines = {
                ...baseDraft,
                routePolylines
            };
            const serialized = JSON.stringify(draftWithPolylines);
            if (serialized.length < 200000) {
                localStorage.setItem('frufresco_route_planner_draft', serialized);
            } else {
                localStorage.setItem('frufresco_route_planner_draft', JSON.stringify(baseDraft));
            }
        } catch (e) {
            try {
                localStorage.setItem('frufresco_route_planner_draft', JSON.stringify(baseDraft));
            } catch (fallbackErr) {
                console.error("Error al guardar borrador en localStorage:", fallbackErr);
            }
        }
    }, [assignments, isOptimized, optimizationSource, stopEtas, routeStartTimes, theoreticalMetrics, routeMetrics, stopLegMetrics, trafficMode, routePolylines, aiReportText, loading, selectedDeliveryDate, showAllDates, readOnly]);

    const handleAutoOptimize = async () => {
        if (readOnly) return;
        try {
            setOptimizing(true);
            setOptimizationError(null);
            setOptimizerErrorBanner(null);
            setExcludedNoGpsIds([]);
            setSkippedWarnings([]);
            
            const response = await fetch('/api/transport/optimize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orders,
                    vehicles,
                    parameters: params,
                    priorityOrderIds
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.detail || errData.error || errData.title || `Error en el servidor de optimización (código ${response.status})`);
            }

            const result = await response.json();
            
            if (result.routes) {
                setAssignments(result.routes);
                setOptimizationSource('google');
                setIsOptimized(true);
                setRouteStartTimes(result.route_start_times || {});
                setStopEtas(result.stop_etas || {});
                setTheoreticalMetrics(result.theoretical_metrics || null);
                setRoutePolylines(result.route_polylines || {});
                setRouteMetrics(result.route_metrics || {});
                setStopLegMetrics(result.stop_leg_metrics || {});
                setTrafficMode(result.traffic_mode || null);
            }
            setExcludedNoGpsIds(Array.isArray(result.excluded_no_gps_order_ids) ? result.excluded_no_gps_order_ids.map(String) : []);
            setSkippedWarnings(Array.isArray(result.skipped_orders) ? result.skipped_orders : []);

            if (result.explanation) {
                setAiReportText(result.explanation);
                setShowAiModal(true);
            }

        } catch (err: any) {
            console.error('Optimization failed:', err);
            const msg = err?.message || 'Ocurrió un error al procesar las rutas.';
            setOptimizationError(msg);
            setOptimizerErrorBanner(msg);
        } finally {
            setOptimizing(false);
        }
    };

    const getInitials = (name: string) => {
        if (!name || name === 'Sin Asignar') return '';
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    const renderAiReport = (text: string) => {
        if (!text) return null;

        const formatInline = (raw: string) =>
            raw.split(/(\*\*.*?\*\*|\*[^*]+\*)/g).map((part, pIdx) => {
                if (part.startsWith('**') && part.endsWith('**')) {
                    return <strong key={pIdx} style={{ fontWeight: '800', color: '#0F172A' }}>{part.slice(2, -2)}</strong>;
                }
                if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
                    return <em key={pIdx} style={{ color: '#475569' }}>{part.slice(1, -1)}</em>;
                }
                return part;
            });

        const lines = text.split('\n');
        return lines.map((line, idx) => {
            const trimmed = line.trim();
            if (!trimmed) return <div key={idx} style={{ height: '0.5rem' }} />;
            if (/^-{3,}$/.test(trimmed)) {
                return <hr key={idx} style={{ border: 'none', borderTop: '1px solid #E2E8F0', margin: '0.75rem 0' }} />;
            }
            if (/^#{1,3}\s+/.test(trimmed)) {
                const heading = trimmed.replace(/^#{1,3}\s+/, '');
                return (
                    <h4 key={idx} style={{ margin: '0.25rem 0 0.6rem 0', fontSize: '0.92rem', fontWeight: '900', color: '#0F172A', letterSpacing: '-0.01em' }}>
                        {formatInline(heading)}
                    </h4>
                );
            }
            if (/^[-*•]\s+/.test(trimmed)) {
                const cleanContent = trimmed.replace(/^[-*•]\s+/, '');
                return (
                    <div key={idx} style={{ display: 'flex', gap: '0.55rem', marginBottom: '0.55rem', alignItems: 'flex-start', lineHeight: 1.45 }}>
                        <span style={{ color: '#0D7A57', fontWeight: '900', marginTop: '0.05rem' }}>•</span>
                        <span style={{ flex: 1, color: '#334155' }}>{formatInline(cleanContent)}</span>
                    </div>
                );
            }
            return (
                <p key={idx} style={{ margin: '0 0 0.6rem 0', color: '#334155', lineHeight: 1.45 }}>
                    {formatInline(trimmed)}
                </p>
            );
        });
    };

    const handleConfirmRoutes = async () => {
        if (readOnly) return;
        try {
            setLoading(true);
            // Construir un mapeo de vehículo -> hora de salida (dinámica calculada o default)
            const dynamicStartTimes: Record<string, string> = {};
            Object.keys(assignments).forEach(vehicleId => {
                dynamicStartTimes[vehicleId] = routeStartTimes[vehicleId] || params.fleet_start_time || '04:30';
            });

            const response = await fetch('/api/transport/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    assignments,
                    vehicles,
                    isOptimized,
                    theoreticalMetrics,
                    params,
                    routeStartTimes: dynamicStartTimes, // Pasar las horas de salida estimadas dinámicas
                    preserveExistingSpaces: true,
                    ...(Object.keys(stopEtas).length > 0 ? { stopEtas } : {})
                })
            });


            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || 'Error al confirmar las rutas en el servidor');
            }

            const result = await response.json();
            
            if (result.routeConfirmations && Array.isArray(result.routeConfirmations)) {
                const enrichedConfirmations = result.routeConfirmations.map((route: any) => {
                    const stops = (route.order_ids || []).map((oid: string) => {
                        const localOrder = orders.find(o => String(o.id) === String(oid));
                        return {
                            id: oid,
                            customer_name: localOrder?.customer_name || 'Cliente',
                            total_weight_kg: localOrder?.total_weight_kg || 0,
                            crates: localOrder?.crates || 0,
                            address: localOrder?.address || 'Sin Dirección',
                            warehouse_spaces: route.order_spaces?.[oid] || [],
                            logistics_data: localOrder?.logistics_data || null
                        };
                    });
                    return {
                        ...route,
                        stops
                    };
                });
                setConfirmedManifest(enrichedConfirmations);
            }
            
            // Limpiar borrador del día al confirmar
            await clearDraftForScope(activeDraftScope);
            setAssignments({});
            setStopEtas({});
            setTheoreticalMetrics(null);
            setRoutePolylines({});
            setRouteMetrics({});
            setStopLegMetrics({});
            setTrafficMode(null);
            setOptimizationSource(null);
            setIsOptimized(false);
            setPriorityOrderIds([]);
            await fetchInitialData();

        } catch (err: any) {
            console.error('Error confirming routes:', err);
            const msg = err?.message || 'Error al confirmar las rutas';
            setConfirmationError(msg);
            setTimeout(() => setConfirmationError(null), 8000);
        } finally {
            setLoading(false);
        }
    };

    const getVehicleLoad = (vehicleId: string) => {
        const orderIds = assignments[vehicleId] || [];
        return orders.filter(o => orderIds.includes(o.id)).reduce((sum, o) => sum + o.total_weight_kg, 0);
    };

    const getOrderCrates = (order?: Order | null) => {
        const avgKg = parseFloat(String(params.avg_kg_per_crate || '12.5').replace(',', '.')) || 12.5;
        const w = Number(order?.total_weight_kg) || 0;
        return Math.max(1, Math.ceil(w / avgKg));
    };

    const getVehicleCrates = (vehicleId: string) => {
        const orderIds = assignments[vehicleId] || [];
        return orderIds.reduce((sum, oid) => {
            const ord = orders.find(o => o.id === oid);
            return sum + (ord ? getOrderCrates(ord) : 0);
        }, 0);
    };

    const NUMERIC_PARAM_IDS = new Set([
        'base_setup_time',
        'time_per_10_crates_unload',
        'time_per_10_crates_delivery',
        'driver_break_mins',
        'avg_kg_per_crate',
        'warehouse_base_load_time',
        'warehouse_time_per_10_crates_load',
        'space_capacity',
        'b2b_kg_min',
        'b2c_kg_min'
    ]);

    const WINDOW_PARAM_IDS = new Set([
        'b2b_default_window_start',
        'b2b_default_window_end',
        'b2c_default_window_start',
        'b2c_default_window_end'
    ]);

    const clearGoogleRouteTelemetry = () => {
        setIsOptimized(false);
        setOptimizationSource(null);
        setTheoreticalMetrics(null);
        setRouteStartTimes({});
        setStopEtas({});
        setRoutePolylines({});
        setRouteMetrics({});
        setStopLegMetrics({});
        setTrafficMode(null);
    };

    const updateParameter = async (id: string, value: any) => {
        if (readOnly) return;
        const nextParams = { ...params, [id]: value };
        setParams(nextParams);

        if (WINDOW_PARAM_IDS.has(id)) {
            const timeRegex = /^\d{2}:\d{2}$/;
            const isB2B = id.startsWith('b2b_');
            const startVal = String(isB2B ? nextParams.b2b_default_window_start : nextParams.b2c_default_window_start || '');
            const endVal = String(isB2B ? nextParams.b2b_default_window_end : nextParams.b2c_default_window_end || '');
            if (!timeRegex.test(startVal) || !timeRegex.test(endVal) || startVal >= endVal) {
                setWindowSettingsError(
                    `Ventana ${isB2B ? 'Institucional (B2B)' : 'Hogar (B2C)'} inválida: usa formato HH:MM con inicio menor que fin.`
                );
                return;
            }
            setWindowSettingsError(null);
            await supabase.from('logistic_parameters').upsert({ id, value: String(value) });
            return;
        }

        if (NUMERIC_PARAM_IDS.has(id)) {
            const norm = String(value ?? '').replace(',', '.').trim();
            if (!norm || norm.endsWith('.')) return;
            const parsedNum = Number(norm);
            if (!Number.isFinite(parsedNum) || parsedNum < 0) return;
            await supabase.from('logistic_parameters').upsert({ id, value: String(parsedNum) });
            return;
        }
        await supabase.from('logistic_parameters').upsert({ id, value: String(value) });
    };

    const toggleAssignment = (orderId: string, vehicleId: string) => {
        if (readOnly) return;
        clearGoogleRouteTelemetry();
        const currentOrders = assignments[vehicleId] || [];
        if (currentOrders.includes(orderId)) {
            setAssignments({ ...assignments, [vehicleId]: currentOrders.filter(id => id !== orderId) });
        } else {
            const cleaned = { ...assignments };
            Object.keys(cleaned).forEach(vid => {
                cleaned[vid] = cleaned[vid].filter(id => id !== orderId);
            });
            cleaned[vehicleId] = [...(cleaned[vehicleId] || []), orderId];
            setAssignments(cleaned);
        }
    };

    // Drag and Drop Handlers
    const handleDragStart = (e: React.DragEvent, orderId: string, sourceVehicleId?: string, sourceIndex?: number) => {
        if (readOnly || (sourceVehicleId && routeViewMode === 'lifo')) {
            e.preventDefault();
            return;
        }
        e.dataTransfer.setData('text/plain', orderId);
        if (sourceVehicleId) {
            e.dataTransfer.setData('sourceVehicleId', sourceVehicleId);
        }
        if (sourceIndex !== undefined) {
            e.dataTransfer.setData('sourceIndex', String(sourceIndex));
        }
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDropOnVehicle = (e: React.DragEvent, targetVehicleId: string, targetIndex?: number) => {
        e.preventDefault();
        if (readOnly) return;
        if (targetIndex !== undefined && routeViewMode === 'lifo') return;
        const orderId = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('orderId');
        if (!orderId) return;

        setAssignments(prev => {
            const cleaned = { ...prev };
            
            // Remove the order from whichever vehicle it was previously assigned to
            Object.keys(cleaned).forEach(vid => {
                cleaned[vid] = (cleaned[vid] || []).filter(id => id !== orderId);
            });

            // Insert the order into the target vehicle's list at the target index (or append to end)
            const targetList = [...(cleaned[targetVehicleId] || [])];
            if (targetIndex !== undefined) {
                targetList.splice(targetIndex, 0, orderId);
            } else {
                targetList.push(orderId);
            }
            cleaned[targetVehicleId] = targetList;
            return cleaned;
        });
        clearGoogleRouteTelemetry();
    };

    const handleSidebarDrop = (e: React.DragEvent) => {
        e.preventDefault();
        if (readOnly) return;
        const orderId = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('orderId');
        if (orderId) {
            setAssignments(prev => {
                const cleaned = { ...prev };
                Object.keys(cleaned).forEach(vid => {
                    cleaned[vid] = (cleaned[vid] || []).filter(id => id !== orderId);
                });
                return cleaned;
            });
            clearGoogleRouteTelemetry();
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        if (readOnly) {
            e.dataTransfer.dropEffect = 'none';
            return;
        }
        e.dataTransfer.dropEffect = 'move';
    };

    const getEstimatedTimesForVehicle = (vehicleId: string, totalCrates: number) => {
        // Departure time (dynamic per vehicle from optimization, or default fleet start)
        const departureTimeStr = routeStartTimes[vehicleId] || params.fleet_start_time || '04:30';
        const [h, m] = departureTimeStr.split(':').map(Number);
        const totalMinutes = h * 60 + m;


        // Calculate load time in minutes: base_load + (crates * (time_per_10_crates / 10))
        const baseLoad = parseFloat(params.warehouse_base_load_time) || 15;
        const timePer10 = parseFloat(params.warehouse_time_per_10_crates_load) || 5;
        const loadDuration = Math.round(baseLoad + (totalCrates * (timePer10 / 10)));

        // Load start time
        let loadMinutes = totalMinutes - loadDuration;
        if (loadMinutes < 0) loadMinutes += 1440; // wrap around day if needed

        const loadH = Math.floor(loadMinutes / 60);
        const loadM = loadMinutes % 60;

        const formatTime = (hh: number, mm: number) => {
            const ampm = hh >= 12 ? 'PM' : 'AM';
            const displayH = hh % 12 || 12;
            const displayM = mm.toString().padStart(2, '0');
            return `${displayH}:${displayM} ${ampm}`;
        };

        return {
            loadStart: formatTime(loadH, loadM),
            departure: formatTime(h, m),
            duration: loadDuration
        };
    };

    const printManifestViaNewWindow = () => {
        if (!confirmedManifest) return;

        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            setPopupBlockedWarning(true);
            setTimeout(() => setPopupBlockedWarning(false), 6000);
            return;
        }

        const dateStr = formatBogotaDate(new Date(), { day: 'numeric', month: 'long', year: 'numeric' });

        const routesHtml = confirmedManifest.map((route: any, idx: number) => {
            const stopsHtml = route.stops && route.stops.length > 0 
                ? `
                <div style="margin-top: 1rem;">
                    <div style="font-size: 10px; font-weight: 800; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem;">Secuencia de Carga y Entrega</div>
                    <div style="display: flex; flex-direction: column; gap: 0.4rem;">
                        ${route.stops.map((stop: any, sIdx: number) => `
                            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; padding: 0.25rem 0; border-bottom: 1px solid #F1F5F9;">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="background-color: #E2E8F0; color: #475569; font-size: 0.65rem; font-weight: 800; border-radius: 50%; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center;">${sIdx + 1}</span>
                                    <span style="font-weight: 700; color: #1E293B;">${stop.customer_name}</span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 12px;">
                                    <span style="font-size: 0.75rem; color: #64748B;">${formatNumber(stop.total_weight_kg || 0, 1)} kg (${stop.crates} can.)</span>
                                    <span style="font-size: 0.7rem; font-weight: 850; background-color: rgba(14, 165, 233, 0.08); color: #0284C7; padding: 2px 6px; border-radius: 4px;">
                                        ${(() => {
                                            const label = getOrderSpaceDisplayLabel({ warehouse_spaces: stop.warehouse_spaces, logistics_data: stop.logistics_data });
                                            return label ? `ESP ${label}` : (stop.warehouse_spaces && stop.warehouse_spaces.length > 0 ? `ESP ${stop.warehouse_spaces.join(', ')}` : 'Sin Espacio');
                                        })()}
                                    </span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                `
                : '';

            return `
            <div class="page-break-inside-avoid" style="border: 1px solid #E2E8F0; border-radius: 16px; padding: 1.25rem; background-color: #F8FAFC; margin-bottom: 1rem; display: flex; flex-direction: column; gap: 1rem;">
                <div style="display: grid; grid-template-columns: 1.2fr 1fr 1fr; gap: 1rem; align-items: center; border-bottom: ${route.stops && route.stops.length > 0 ? '1px solid #F1F5F9' : 'none'}; padding-bottom: ${route.stops && route.stops.length > 0 ? '0.75rem' : 0};">
                    <div>
                        <div style="font-weight: 900; color: #0F172A; font-size: 0.95rem;">${route.vehicle_plate}</div>
                        <div style="font-size: 0.75rem; color: #64748B; font-weight: 700; margin-top: 2px;">Conductor: ${route.driver_name}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: #64748B; font-weight: 800;">ENTREGAS / PESO</div>
                        <div style="font-weight: 800; color: #1E293B; font-size: 0.85rem; margin-top: 2px;">${route.stops_count} entregas • ${formatNumber(route.total_kilos || 0, 1)} kg</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: #64748B; font-weight: 800;">ESPACIOS BODEGA</div>
                        <div style="font-weight: 900; color: #0EA5E9; font-size: 0.85rem; margin-top: 2px;">
                            ${route.warehouse_spaces && route.warehouse_spaces.length > 0 
                                ? `[${route.warehouse_spaces.join(', ')}]` 
                                : 'Por asignar'}
                        </div>
                    </div>
                </div>
                ${stopsHtml}
            </div>
            `;
        }).join('');

        const logoUrl = window.location.origin + '/assets/branding/logo_corporate.png?v=3';

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Manifiesto de Despacho - Investments Cortes</title>
                <style>
                    @page { margin: 15mm 15mm; size: letter; }
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #ffffff !important; margin: 0; color: #1f2937; }
                    .page-break-inside-avoid { page-break-inside: avoid !important; break-inside: avoid !important; }
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                </style>
            </head>
            <body style="background-color: #ffffff; margin: 0;">
                <div style="max-width: 210mm; margin: 0 auto; min-height: 297mm; padding: 2rem; display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box;">
                    <div>
                        <!-- Header -->
                        <header style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 0.5rem; margin-bottom: 1.5rem;">
                            <div>
                                <img src="${logoUrl}" alt="Investments Cortes Logo" style="height: 65px; width: auto; object-fit: contain;" />
                            </div>
                            <div style="text-align: right; font-size: 0.8rem; color: #4b5563; line-height: 1.4;">
                                <div style="font-weight: 800; color: #111827; font-size: 1.1rem; text-transform: uppercase; margin-bottom: 0.25rem;">Investments Cortes S.A.S</div>
                                <div>NIT: 901.393.217-5</div>
                                <div style="font-weight: 700; color: #1E293B;">Contáctanos</div>
                                <div>30154217612</div>
                                <div>pedidos@frufresco.com</div>
                                <div style="color: #0D7A57; font-weight: 600;">www.frufresco.com</div>
                            </div>
                        </header>

                        <!-- Meta -->
                        <div style="margin-bottom: 2rem; display: flex; justify-content: space-between; font-size: 0.9rem; color: #6b7280;">
                            <div>Fecha: <span style="font-weight: 700; color: #374151;">${dateStr}</span></div>
                            <div>Ref: <span style="font-weight: 700; color: #374151;">Manifiesto de Despacho</span></div>
                        </div>

                        <!-- Title -->
                        <h1 style="font-size: 1.5rem; font-weight: 900; color: #111827; margin-bottom: 1.5rem; text-align: center; text-transform: uppercase; letter-spacing: -0.025em;">
                            Manifiesto de Despacho y Plan de Rutas
                        </h1>

                        <!-- Content -->
                        <div>
                            ${routesHtml}
                        </div>
                    </div>

                    <!-- Footer -->
                    <footer style="margin-top: 3rem; border-top: 1px solid #f3f4f6; padding-top: 1.5rem; font-size: 0.75rem; color: #9ca3af; text-align: center;">
                        <p>Este documento es propiedad de Investments Cortes S.A.S. Prohibida su reproducción total o parcial sin autorización.</p>
                        <div style="margin-top: 0.5rem; font-weight: 600; color: #4b5563; letter-spacing: 0.05em;">CORTESÍA • CALIDAD • COMPROMISO</div>
                    </footer>
                </div>
                
                <script>
                    (function() {
                        var printed = false;
                        function doPrint() {
                            if (printed) return;
                            printed = true;
                            try {
                                window.focus();
                                window.print();
                            } catch (e) {
                                console.error('Error al imprimir manifiesto:', e);
                            }
                        }
                        if (document.readyState === 'complete') {
                            setTimeout(doPrint, 200);
                        } else {
                            window.addEventListener('load', function() { setTimeout(doPrint, 150); });
                            setTimeout(doPrint, 600);
                        }
                    })();
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    };

    if (loading) return <div style={{ color: '#64748B', textAlign: 'center', padding: '2rem' }}>Iniciando motores...</div>;

    return (
        <>
            <div className="rp-layout">
            {/* SECCIÓN 1: PEDIDOS PICKING (Relevo Sticky nativo Perfil B: Línea 2 top:133px + Línea 3 thead top:181px) */}
            <section
                onDragOver={(e) => { e.preventDefault(); setDragOverSidebar(true); }}
                onDragLeave={() => setDragOverSidebar(false)}
                onDrop={(e) => { handleSidebarDrop(e); setDragOverSidebar(false); }}
                style={{
                    backgroundColor: dragOverSidebar ? '#ECFDF5' : '#FFFFFF',
                    borderRadius: '14px',
                    border: dragOverSidebar ? '2px dashed #0D7A57' : '1px solid #E2E8F0',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'visible',
                    transition: 'border-color 0.2s, background-color 0.2s'
                }}
            >
                {/* Línea 2 Sticky Bar: 48px exactos -> 133 + 48 = 181px (0px gap bleed con thead) */}
                <div style={{
                    position: 'sticky',
                    top: '133px',
                    height: '48px',
                    boxSizing: 'border-box',
                    zIndex: 40,
                    backgroundColor: '#FFFFFF',
                    borderBottom: '1px solid #E2E8F0',
                    borderTopLeftRadius: '13px',
                    borderTopRightRadius: '13px',
                    padding: '0 0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    overflowX: 'auto',
                    scrollbarWidth: 'none'
                }}>
                    <h3 style={{ margin: 0, fontSize: '0.78rem', fontWeight: '900', color: '#0F172A', letterSpacing: '-0.02em', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        PEDIDOS PICKING
                    </h3>

                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        backgroundColor: '#F8FAFC',
                        border: '1px solid #CBD5E1',
                        borderRadius: '7px',
                        padding: '3px 7px',
                        flexShrink: 0
                    }}>
                        <Calendar size={12} color="#64748B" />
                        <input
                            type="date"
                            value={selectedDeliveryDate}
                            disabled={showAllDates}
                            onChange={(e) => setSelectedDeliveryDate(e.target.value)}
                            style={{
                                border: 'none',
                                background: 'transparent',
                                fontSize: '0.70rem',
                                fontWeight: '800',
                                color: showAllDates ? '#94A3B8' : '#0F172A',
                                outline: 'none',
                                cursor: showAllDates ? 'not-allowed' : 'pointer'
                            }}
                        />
                    </div>

                    <button
                        type="button"
                        onClick={() => setShowAllDates(prev => !prev)}
                        style={{
                            border: '1px solid #CBD5E1',
                            borderRadius: '7px',
                            padding: '4px 8px',
                            fontSize: '0.66rem',
                            fontWeight: '800',
                            backgroundColor: showAllDates ? '#ECFDF5' : '#FFFFFF',
                            color: showAllDates ? '#065F46' : '#475569',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            flexShrink: 0
                        }}
                        title={showAllDates ? 'Filtrar por fecha específica' : 'Mostrar todos los pedidos sin filtro de fecha'}
                    >
                        {showAllDates ? 'Solo Fecha' : 'Ver Todos'}
                    </button>

                    {/* Buscador elástico */}
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: '1 1 180px', minWidth: '150px' }}>
                        <Search size={13} style={{ position: 'absolute', left: '9px', color: '#64748B', pointerEvents: 'none' }} />
                        <input
                            type="text"
                            value={tableSearch}
                            onChange={(e) => setTableSearch(e.target.value)}
                            placeholder="Buscar cliente, dirección o ESP..."
                            style={{
                                width: '100%',
                                padding: '5px 24px 5px 27px',
                                borderRadius: '8px',
                                border: '1px solid #CBD5E1',
                                backgroundColor: '#FFFFFF',
                                fontSize: '0.72rem',
                                fontWeight: '600',
                                color: '#0F172A',
                                outline: 'none'
                            }}
                        />
                        {tableSearch && (
                            <button
                                type="button"
                                onClick={() => setTableSearch('')}
                                aria-label="Limpiar búsqueda"
                                style={{ position: 'absolute', right: '6px', background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', padding: '2px', display: 'flex' }}
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>

                    {/* Píldoras de filtro */}
                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                        {(() => {
                            const pendingCount = orders.filter(o => !Object.values(assignments).some(ids => ids.includes(o.id))).length;
                            const pills: Array<{ id: 'all' | 'pending' | 'priority'; label: string }> = [
                                { id: 'all', label: `Todos (${orders.length})` },
                                { id: 'pending', label: `Pendientes (${pendingCount})` },
                                { id: 'priority', label: `Prioritarios (${priorityOrderIds.length})` }
                            ];
                            return pills.map(p => {
                                const active = tableFilter === p.id;
                                return (
                                    <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => setTableFilter(p.id)}
                                        style={{
                                            padding: '4px 9px',
                                            borderRadius: '9999px',
                                            fontSize: '0.66rem',
                                            fontWeight: '800',
                                            border: active ? '1px solid #0D7A57' : '1px solid #E2E8F0',
                                            backgroundColor: active ? '#ECFDF5' : '#FFFFFF',
                                            color: active ? '#065F46' : '#475569',
                                            cursor: 'pointer',
                                            whiteSpace: 'nowrap',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '3px'
                                        }}
                                    >
                                        {p.id === 'priority' && <Star size={10} fill={active ? '#F59E0B' : 'none'} stroke={active ? '#B45309' : '#64748B'} />}
                                        {p.label}
                                    </button>
                                );
                            });
                        })()}
                    </div>

                    {/* KPIs compactos */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#F1F5F9', color: '#0F172A', padding: '4px 8px', borderRadius: '7px', border: '1px solid #E2E8F0', fontSize: '0.66rem', fontWeight: '800', whiteSpace: 'nowrap' }}>
                            <Scale size={11} strokeWidth={2} />
                            {formatNumber(orders.reduce((acc, curr) => acc + curr.total_weight_kg, 0) / 1000, 2)} t
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#ECFDF5', color: '#065F46', padding: '4px 8px', borderRadius: '7px', border: '1px solid #A7F3D0', fontSize: '0.66rem', fontWeight: '800', whiteSpace: 'nowrap' }}>
                            <Package size={11} strokeWidth={2} />
                            {orders.reduce((acc, curr) => acc + getOrderCrates(curr), 0)} can
                        </span>
                    </div>
                </div>

                {/* Banner resumen de Higiene GPS antes de Auto-Asignar */}
                {(() => {
                    const invalidGpsOrders = orders.filter(o => classifyOrderGps(o.latitude, o.longitude).status !== 'valid');
                    if (invalidGpsOrders.length === 0) return null;
                    return (
                        <div style={{
                            backgroundColor: '#FEF2F2',
                            borderBottom: '1px solid #FECACA',
                            padding: '0.45rem 0.85rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '8px',
                            fontSize: '0.72rem',
                            fontWeight: '700',
                            color: '#991B1B'
                        }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                <AlertTriangle size={14} color="#DC2626" />
                                <span>
                                    <strong>{invalidGpsOrders.length}</strong> {invalidGpsOrders.length === 1 ? 'pedido sin GPS válido' : 'pedidos sin GPS válido'} (Sin GPS / GPS Genérico) — serán excluidos del ruteo automático de Google y requieren asignación manual o corrección de coordenadas.
                                </span>
                            </span>
                        </div>
                    );
                })()}

                {/* Tabla sin overflow-y interno para permitir sticky nativo de ventana */}
                <div style={{ overflow: 'visible', padding: 0 }}>
                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.74rem' }}>
                        <thead>
                            <tr>
                                <th style={{ position: 'sticky', top: '181px', zIndex: 30, backgroundColor: '#F1F5F9', color: '#0F172A', fontWeight: '800', textAlign: 'left', padding: '0.55rem 0.75rem', borderBottom: '2px solid #CBD5E1', width: '92px' }}>
                                    <button type="button" onClick={() => toggleSort('type')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', font: 'inherit', color: 'inherit' }}>
                                        TIPO {renderSortIcon('type')}
                                    </button>
                                </th>
                                <th style={{ position: 'sticky', top: '181px', zIndex: 30, backgroundColor: '#F1F5F9', color: '#0F172A', fontWeight: '800', textAlign: 'left', padding: '0.55rem 0.65rem', borderBottom: '2px solid #CBD5E1' }}>
                                    <button type="button" onClick={() => toggleSort('customer')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', font: 'inherit', color: 'inherit' }}>
                                        CLIENTE &amp; LOGÍSTICA {renderSortIcon('customer')}
                                    </button>
                                </th>
                                <th style={{ position: 'sticky', top: '181px', zIndex: 30, backgroundColor: '#F1F5F9', color: '#0F172A', fontWeight: '800', textAlign: 'center', padding: '0.55rem 0.55rem', borderBottom: '2px solid #CBD5E1', width: '98px' }}>
                                    <button type="button" onClick={() => toggleSort('esp')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', font: 'inherit', color: 'inherit' }}>
                                        ESP {renderSortIcon('esp')}
                                    </button>
                                </th>
                                <th style={{ position: 'sticky', top: '181px', zIndex: 30, backgroundColor: '#F1F5F9', color: '#0F172A', fontWeight: '800', textAlign: 'right', padding: '0.55rem 0.65rem', borderBottom: '2px solid #CBD5E1', width: '110px' }}>
                                    <button type="button" onClick={() => toggleSort('load')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', font: 'inherit', color: 'inherit', marginLeft: 'auto' }}>
                                        CARGA {renderSortIcon('load')}
                                    </button>
                                </th>
                                {!readOnly && (
                                    <th style={{ position: 'sticky', top: '181px', zIndex: 30, backgroundColor: '#F1F5F9', color: '#0F172A', fontWeight: '800', textAlign: 'right', padding: '0.55rem 0.75rem', borderBottom: '2px solid #CBD5E1', width: '150px' }}>
                                        CAMIÓN
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {[...orders]
                                .filter(order => {
                                    const isAssigned = Object.values(assignments).some(ids => ids.includes(order.id));
                                    const isPriority = priorityOrderIds.includes(String(order.id));
                                    if (tableFilter === 'pending' && isAssigned) return false;
                                    if (tableFilter === 'priority' && !isPriority) return false;
                                    if (tableSearch.trim()) {
                                        const q = tableSearch.trim().toLowerCase();
                                        const espLabel = (getOrderSpaceDisplayLabel(order) || '').toLowerCase();
                                        const hay = `${order.customer_name || ''} ${order.address || ''} ${order.delivery_zone || ''} esp ${espLabel} ${espLabel}`.toLowerCase();
                                        if (!hay.includes(q)) return false;
                                    }
                                    return true;
                                })
                                .sort((a, b) => {
                                    const tieBreak = () => {
                                        const cmpName = String(a.customer_name || '').localeCompare(String(b.customer_name || ''), 'es', { sensitivity: 'base', numeric: true });
                                        return cmpName !== 0 ? cmpName : String(a.id).localeCompare(String(b.id));
                                    };
                                    if (!sortField) {
                                        const aAssigned = Object.values(assignments).some(ids => ids.includes(a.id));
                                        const bAssigned = Object.values(assignments).some(ids => ids.includes(b.id));
                                        if (aAssigned && !bAssigned) return 1;
                                        if (!aAssigned && bAssigned) return -1;
                                        const aPrio = priorityOrderIds.includes(String(a.id)) ? 1 : 0;
                                        const bPrio = priorityOrderIds.includes(String(b.id)) ? 1 : 0;
                                        if (aPrio !== bPrio) return bPrio - aPrio;
                                        return 0;
                                    }
                                    const mult = sortDir === 'asc' ? 1 : -1;
                                    if (sortField === 'type') {
                                        const aType = a.is_b2b ? 'B2B' : 'B2C';
                                        const bType = b.is_b2b ? 'B2B' : 'B2C';
                                        const cmp = aType.localeCompare(bType);
                                        return cmp !== 0 ? cmp * mult : tieBreak();
                                    }
                                    if (sortField === 'customer') {
                                        return tieBreak() * mult;
                                    }
                                    if (sortField === 'esp') {
                                        const aNums = Array.isArray(a.warehouse_spaces) ? a.warehouse_spaces.map(Number).filter(n => Number.isFinite(n) && n > 0) : [];
                                        const bNums = Array.isArray(b.warehouse_spaces) ? b.warehouse_spaces.map(Number).filter(n => Number.isFinite(n) && n > 0) : [];
                                        const aHas = aNums.length > 0;
                                        const bHas = bNums.length > 0;
                                        // S/A siempre al final tanto en asc como en desc
                                        if (!aHas && !bHas) return tieBreak();
                                        if (!aHas) return 1;
                                        if (!bHas) return -1;
                                        const aMin = Math.min(...aNums);
                                        const bMin = Math.min(...bNums);
                                        if (aMin !== bMin) return (aMin - bMin) * mult;
                                        const aLabel = getOrderSpaceDisplayLabel(a) || '';
                                        const bLabel = getOrderSpaceDisplayLabel(b) || '';
                                        const cmpLabel = aLabel.localeCompare(bLabel, 'es', { numeric: true });
                                        return cmpLabel !== 0 ? cmpLabel * mult : tieBreak();
                                    }
                                    if (sortField === 'load') {
                                        const diff = (Number(a.total_weight_kg) || 0) - (Number(b.total_weight_kg) || 0);
                                        return diff !== 0 ? diff * mult : tieBreak();
                                    }
                                    return 0;
                                })
                                .map(order => {
                                    const assignedVehicleId = Object.keys(assignments).find(vid => (assignments[vid] || []).includes(order.id));
                                    const assignedVehicle = assignedVehicleId ? vehicles.find(v => v.id === assignedVehicleId) : null;
                                    const isAssigned = Boolean(assignedVehicleId);
                                    const isPriority = priorityOrderIds.includes(String(order.id));
                                    const rowBg = isPriority ? '#FFFBEB' : (isAssigned ? '#F8FAFC' : '#FFFFFF');
                                    const rowHoverBg = isPriority ? '#FEF3C7' : (isAssigned ? '#F1F5F9' : '#F8FAFC');
                                    const spaceLabel = getOrderSpaceDisplayLabel(order);
                                    const orderCrates = getOrderCrates(order);
                                    return (
                                    <tr 
                                        key={order.id} 
                                        draggable={!readOnly}
                                        onDragStart={(e) => handleDragStart(e, order.id)}
                                        style={{ 
                                            backgroundColor: rowBg,
                                            cursor: readOnly ? 'default' : 'grab'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = rowHoverBg}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = rowBg}
                                    >
                                        <td style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #E2E8F0', borderLeft: isAssigned ? '3px solid #10B981' : '3px solid transparent', verticalAlign: 'middle' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                <button
                                                    type="button"
                                                    disabled={readOnly}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        togglePriorityOrder(String(order.id));
                                                    }}
                                                    title={isPriority ? 'Quitar prioridad de salida temprana' : 'Marcar como pedido prioritario (1-2 por camión)'}
                                                    aria-label={isPriority ? 'Quitar prioridad' : 'Marcar como prioritario'}
                                                    style={{
                                                        width: '22px',
                                                        height: '22px',
                                                        borderRadius: '6px',
                                                        border: `1px solid ${isPriority ? '#F59E0B' : '#CBD5E1'}`,
                                                        backgroundColor: isPriority ? '#FEF3C7' : '#FFFFFF',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        cursor: readOnly ? 'default' : 'pointer',
                                                        flexShrink: 0,
                                                        padding: 0
                                                    }}
                                                >
                                                    <Star
                                                        size={12}
                                                        fill={isPriority ? '#F59E0B' : 'none'}
                                                        stroke={isPriority ? '#B45309' : '#94A3B8'}
                                                        strokeWidth={2}
                                                    />
                                                </button>
                                                <div style={{ 
                                                    width: '28px', height: '22px', borderRadius: '6px', 
                                                    backgroundColor: order.is_b2b ? '#E0F2FE' : '#F1F5F9', 
                                                    color: order.is_b2b ? '#0369A1' : '#334155', 
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontWeight: '900', fontSize: '0.60rem', border: `1px solid ${order.is_b2b ? '#BAE6FD' : '#CBD5E1'}`,
                                                    flexShrink: 0
                                                }}>
                                                    {order.is_b2b ? 'B2B' : 'B2C'}
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.5rem 0.65rem', borderBottom: '1px solid #E2E8F0', verticalAlign: 'middle' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                <span style={{ fontWeight: '800', color: isAssigned ? '#334155' : '#0F172A', lineHeight: 1.25 }}>
                                                    {order.customer_name}
                                                </span>
                                                {(() => {
                                                    const resolvedWin = resolveOrderDisplayWindow(order, params);
                                                    return (
                                                        <span style={{
                                                            fontSize: '0.60rem',
                                                            fontWeight: '800',
                                                            padding: '1px 6px',
                                                            borderRadius: '4px',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '3px',
                                                            backgroundColor: resolvedWin.slotType === 'manual' ? '#EFF6FF' : resolvedWin.slotType === 'profile' ? '#ECFDF5' : '#F8FAFC',
                                                            color: resolvedWin.slotType === 'manual' ? '#1D4ED8' : resolvedWin.slotType === 'profile' ? '#065F46' : '#475569',
                                                            border: `1px solid ${resolvedWin.slotType === 'manual' ? '#BFDBFE' : resolvedWin.slotType === 'profile' ? '#A7F3D0' : '#E2E8F0'}`
                                                        }}>
                                                            <Clock size={9} strokeWidth={2} /> {resolvedWin.displayLabel}
                                                        </span>
                                                    );
                                                })()}
                                                {(() => {
                                                    const gps = classifyOrderGps(order.latitude, order.longitude);
                                                    if (gps.status === 'valid') return null;
                                                    const badgeText = gps.status === 'generic_centroid'
                                                        ? 'GPS Genérico'
                                                        : gps.status === 'out_of_bounds'
                                                            ? 'GPS Fuera Zona'
                                                            : 'Sin GPS';
                                                    return (
                                                        <span
                                                            title={gps.reason || 'Sin coordenadas GPS válidas'}
                                                            style={{
                                                                fontSize: '0.58rem',
                                                                fontWeight: '800',
                                                                backgroundColor: '#FEF2F2',
                                                                color: '#B91C1C',
                                                                border: '1px solid #FECACA',
                                                                padding: '1px 5px',
                                                                borderRadius: '4px',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '3px'
                                                            }}
                                                        >
                                                            <AlertTriangle size={9} />
                                                            {badgeText}
                                                        </span>
                                                    );
                                                })()}
                                                {!order.is_b2b && order.payment_method === 'contra_entrega' && order.payment_status !== 'Pagado' && (
                                                    <span style={{ fontSize: '0.58rem', fontWeight: '800', color: '#B45309', backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', padding: '1px 5px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                                                        <Coins size={8} strokeWidth={2} /> Por Cobrar
                                                    </span>
                                                )}
                                                {order.novedad && (
                                                    <span title={order.novedad} style={{ fontSize: '0.58rem', fontWeight: '800', color: '#475569', backgroundColor: '#F1F5F9', border: '1px solid #CBD5E1', padding: '1px 5px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '2px', cursor: 'help' }}>
                                                        <MessageSquare size={9} strokeWidth={2} /> Nota
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: '0.65rem', color: '#64748B', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <MapPin size={10} strokeWidth={1.5} style={{ flexShrink: 0 }} />
                                                <span>{order.address}</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.5rem 0.55rem', borderBottom: '1px solid #E2E8F0', textAlign: 'center', verticalAlign: 'middle' }}>
                                            {spaceLabel ? (
                                                <span style={{ fontSize: '0.64rem', fontWeight: '900', color: '#0369A1', backgroundColor: '#E0F2FE', border: '1px solid #BAE6FD', padding: '2px 7px', borderRadius: '5px', whiteSpace: 'nowrap' }}>
                                                    ESP {spaceLabel}
                                                </span>
                                            ) : (
                                                <span style={{ fontSize: '0.62rem', fontWeight: '700', color: '#94A3B8' }}>S/A</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.65rem', borderBottom: '1px solid #E2E8F0', textAlign: 'right', verticalAlign: 'middle', fontVariantNumeric: 'tabular-nums' }}>
                                            <div style={{ fontWeight: '900', color: '#0F172A' }}>{formatNumber(order.total_weight_kg, 1)} <span style={{fontSize:'0.60rem', color:'#64748B'}}>kg</span></div>
                                            <div style={{ fontSize: '0.62rem', color: '#0D7A57', fontWeight: '800', marginTop: '1px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '2px' }}>
                                                <Package size={10} /> {orderCrates} can.
                                            </div>
                                        </td>
                                        {!readOnly && (
                                            <td style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #E2E8F0', textAlign: 'right', verticalAlign: 'middle' }}>
                                                <select
                                                    aria-label={`Asignar camión para ${order.customer_name}`}
                                                    value={assignedVehicleId || ''}
                                                    onChange={(e) => {
                                                        const targetVid = e.target.value;
                                                        if (!targetVid) {
                                                            if (assignedVehicleId) toggleAssignment(order.id, assignedVehicleId);
                                                        } else if (targetVid !== assignedVehicleId) {
                                                            toggleAssignment(order.id, targetVid);
                                                        }
                                                    }}
                                                    style={{
                                                        width: '100%',
                                                        padding: '4px 6px',
                                                        borderRadius: '7px',
                                                        border: assignedVehicle ? '1px solid #1E3A5F' : '1px solid #CBD5E1',
                                                        backgroundColor: assignedVehicle ? '#EFF6FF' : '#FFFFFF',
                                                        color: assignedVehicle ? '#1E3A5F' : '#475569',
                                                        fontSize: '0.68rem',
                                                        fontWeight: '800',
                                                        cursor: 'pointer',
                                                        outline: 'none'
                                                    }}
                                                >
                                                    <option value="">Sin asignar</option>
                                                    {vehicles.map(v => (
                                                        <option key={v.id} value={v.id}>{v.plate}</option>
                                                    ))}
                                                </select>
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

            </section>

            {/* SECCIÓN 2: FLOTA Y RUTAS (Toma el relevo sticky en top:133px al pasar el último pedido) */}
            <section style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', position: 'relative', minWidth: 0, overflow: 'visible' }}>
                <div style={{
                    position: 'sticky',
                    top: '133px',
                    zIndex: 40,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #CBD5E1',
                    borderRadius: '12px',
                    padding: '0.55rem 0.9rem',
                    boxShadow: '0 4px 12px -4px rgba(15, 23, 42, 0.08)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: '900', color: '#0F172A' }}>FLOTA Y RUTAS</h3>
                        <span style={{ fontSize: '0.65rem', backgroundColor: '#F1F5F9', color: '#334155', padding: '0.2rem 0.5rem', borderRadius: '6px', fontWeight: '800', border: '1px solid #E2E8F0' }}>
                            {Object.values(assignments).reduce((acc, curr) => acc + curr.length, 0)} ASIGNADOS
                        </span>
                        {/* Segmented Toggle: Entrega 1->N vs Cargue LIFO */}
                        <div style={{ display: 'inline-flex', alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: '8px', padding: '2px', border: '1px solid #E2E8F0' }}>
                            <button
                                type="button"
                                onClick={() => setRouteViewMode('delivery')}
                                style={{
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    fontSize: '0.64rem',
                                    fontWeight: '800',
                                    cursor: 'pointer',
                                    backgroundColor: routeViewMode === 'delivery' ? '#1E3A5F' : 'transparent',
                                    color: routeViewMode === 'delivery' ? '#FFFFFF' : '#475569'
                                }}
                                title="Ver paradas en orden de entrega (1ra parada arriba)"
                            >
                                Entrega 1→N
                            </button>
                            <button
                                type="button"
                                onClick={() => setRouteViewMode('lifo')}
                                style={{
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    fontSize: '0.64rem',
                                    fontWeight: '800',
                                    cursor: 'pointer',
                                    backgroundColor: routeViewMode === 'lifo' ? '#0D7A57' : 'transparent',
                                    color: routeViewMode === 'lifo' ? '#FFFFFF' : '#475569',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px'
                                }}
                                title="Ver orden físico de cargue LIFO en muelle (Fondo → Puerta)"
                            >
                                <ArrowDownUp size={10} /> Cargue LIFO
                            </button>
                        </div>
                    </div>
                    {!readOnly && (
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <button 
                                onClick={() => setShowSettings(!showSettings)}
                                title="Ajustes de Optimización"
                                style={{ 
                                    backgroundColor: showSettings ? '#E5E7EB' : '#F3F4F6', 
                                    border: '1px solid #E5E7EB', 
                                    borderRadius: '8px', 
                                    padding: '0.4rem 0.6rem', 
                                    fontSize: '0.75rem', 
                                    color: '#4B5563', 
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    transition: 'all 0.2s ease'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#E5E7EB'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
                            >
                                <Settings size={14} />
                            </button>
                        <button 
                            onClick={handleAutoOptimize}
                            disabled={optimizing}
                            style={{ 
                                padding: '0.4rem 1.0rem', 
                                borderRadius: '8px', 
                                backgroundColor: optimizing ? '#94A3B8' : '#1E3A5F', 
                                color: 'white', 
                                border: 'none', 
                                fontWeight: '800', 
                                cursor: optimizing ? 'not-allowed' : 'pointer', 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '0.35rem',
                                fontSize: '0.74rem',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            {optimizing ? 'Optimizando...' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Sparkles size={12} strokeWidth={1.8} /> Auto-Asignar</span>}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setSpaghettiVehicleId(null);
                                setSpaghettiOpen(true);
                            }}
                            title="Abrir Mapa Espagueti de Rutas"
                            style={{
                                padding: '0.4rem 0.75rem',
                                borderRadius: '8px',
                                backgroundColor: '#FFFFFF',
                                color: '#0F172A',
                                border: '1px solid #CBD5E1',
                                fontWeight: '800',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                fontSize: '0.72rem'
                            }}
                        >
                            <Route size={13} color="#2563EB" /> Mapa Espagueti
                        </button>
                        {(() => {
                            const totalAssigned = Object.values(assignments).reduce((s, l) => s + l.length, 0);
                            if (optimizationSource === 'google') {
                                const displayMin = theoreticalMetrics
                                    ? Math.round(theoreticalMetrics.travel_min ?? theoreticalMetrics.duration_min ?? 0)
                                    : 0;
                                return (
                                    <span style={{
                                        padding: '0.32rem 0.65rem',
                                        borderRadius: '8px',
                                        fontSize: '0.68rem',
                                        fontWeight: '800',
                                        backgroundColor: '#ECFDF5',
                                        color: '#065F46',
                                        border: '1px solid #A7F3D0',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}>
                                        <Navigation size={11} />
                                        Google Tráfico Real
                                        {theoreticalMetrics ? ` · ${formatNumber(theoreticalMetrics.distance_km, 1)} km · ${displayMin} min` : ''}
                                        {trafficMode === 'weekday_projected' && (
                                            <span style={{ fontSize: '0.60rem', fontWeight: '700', color: '#B45309', marginLeft: '2px' }}>
                                                (Proyectado mismo día)
                                            </span>
                                        )}
                                    </span>
                                );
                            }
                            if (!isOptimized && totalAssigned > 0) {
                                return (
                                    <span style={{
                                        padding: '0.32rem 0.65rem',
                                        borderRadius: '8px',
                                        fontSize: '0.68rem',
                                        fontWeight: '800',
                                        backgroundColor: '#F1F5F9',
                                        color: '#334155',
                                        border: '1px solid #CBD5E1',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}>
                                        <Sliders size={11} /> Ajustado manualmente
                                    </span>
                                );
                            }
                            return null;
                        })()}
                        {Object.keys(assignments).some(k => assignments[k].length > 0) && (
                            <button 
                                onClick={() => setShowPreConfirm(true)}
                                disabled={loading}
                                style={{ 
                                    padding: '0.4rem 1.0rem', 
                                    borderRadius: '8px', 
                                    backgroundColor: '#0D7A57', 
                                    color: 'white', 
                                    border: 'none', 
                                    fontWeight: '800', 
                                    cursor: 'pointer',
                                    fontSize: '0.74rem',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Check size={12} strokeWidth={2} /> Confirmar</span>
                            </button>
                        )}
                        {Object.keys(assignments).some(k => assignments[k].length > 0) && (
                            <button
                                onClick={async () => {
                                    if (confirm('¿Seguro que quieres limpiar todas las asignaciones? Los pedidos volverán al tablero sin asignar.')) {
                                        await clearDraftForScope(activeDraftScope);
                                        setAssignments({});
                                        setPriorityOrderIds([]);
                                        clearGoogleRouteTelemetry();
                                        setRouteStartTimes({});
                                        setExcludedNoGpsIds([]);
                                        setSkippedWarnings([]);
                                        setOptimizerErrorBanner(null);
                                    }
                                }}
                                style={{ 
                                    padding: '0.4rem 1rem', 
                                    borderRadius: '8px', 
                                    backgroundColor: 'transparent',
                                    color: '#EF4444',
                                    border: '1px solid #EF4444',
                                    fontWeight: '800', 
                                    cursor: 'pointer',
                                    fontSize: '0.7rem',
                                    transition: 'all 0.2s ease'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = '#FEE2E2';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                }}
                            >
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Trash2 size={12} strokeWidth={1.5} /> Limpiar</span>
                            </button>
                        )}
                        </div>
                    )}
                </div>

                {/* Banner persistente Zero-Mock ante error del optimizador */}
                {(optimizerErrorBanner || optimizationError || confirmationError) && (
                    <div style={{
                        marginTop: '0.35rem',
                        backgroundColor: '#FEF2F2',
                        border: '1px solid #FCA5A5',
                        borderRadius: '10px',
                        padding: '0.65rem 0.9rem',
                        color: '#991B1B',
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: '10px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                            <AlertTriangle size={16} color="#DC2626" style={{ flexShrink: 0, marginTop: '1px' }} />
                            <div>
                                <div>
                                    {(optimizerErrorBanner || optimizationError)
                                        ? `Error del optimizador: ${optimizerErrorBanner || optimizationError}`
                                        : `Error al Confirmar: ${confirmationError}`}
                                </div>
                                {(optimizerErrorBanner || optimizationError) && (
                                    <div style={{ fontSize: '0.70rem', fontWeight: 600, color: '#7F1D1D', marginTop: '3px' }}>
                                        No se generaron rutas simuladas. Puedes asignar y ordenar las rutas manualmente arrastrando los pedidos o usando el selector de camión en la tabla.
                                    </div>
                                )}
                            </div>
                        </div>
                        <button
                            type="button"
                            aria-label="Cerrar aviso de error"
                            onClick={() => {
                                setOptimizerErrorBanner(null);
                                setOptimizationError(null);
                                setConfirmationError(null);
                            }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991B1B', padding: '2px', flexShrink: 0 }}
                        >
                            <X size={15} />
                        </button>
                    </div>
                )}

                {/* Alerta persistente de pedidos excluidos sin GPS u omitidos por Google */}
                {(excludedNoGpsIds.length > 0 || skippedWarnings.length > 0) && (
                    <div style={{
                        backgroundColor: '#FFFBEB',
                        border: '1px solid #FDE68A',
                        borderRadius: '10px',
                        padding: '0.65rem 0.9rem',
                        color: '#92400E',
                        fontSize: '0.74rem',
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: '10px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flex: 1 }}>
                            <Info size={16} color="#D97706" style={{ flexShrink: 0, marginTop: '1px' }} />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {excludedNoGpsIds.length > 0 && (
                                    <div>
                                        <strong>Excluidos por GPS inválido ({excludedNoGpsIds.length}):</strong>{' '}
                                        {excludedNoGpsIds.map(oid => orders.find(o => String(o.id) === String(oid))?.customer_name || oid).join(', ')}. Asígnalos manualmente o corrige sus coordenadas.
                                    </div>
                                )}
                                {skippedWarnings.length > 0 && (
                                    <div>
                                        <strong>Omitidos por Google Route Optimization ({skippedWarnings.length}):</strong>
                                        <ul style={{ margin: '2px 0 0 1.1rem', padding: 0 }}>
                                            {skippedWarnings.map((sw, idx) => {
                                                const name = orders.find(o => String(o.id) === String(sw.orderId))?.customer_name || sw.orderId;
                                                const reasonStr = Array.isArray(sw.reasons) && sw.reasons.length > 0
                                                    ? sw.reasons.map((r: any) => typeof r === 'string' ? r : (r?.code || r?.description || JSON.stringify(r))).join(', ')
                                                    : 'Sin razón especificada';
                                                return (
                                                    <li key={idx}>
                                                        <strong>{name}:</strong> {reasonStr}
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </div>
                        <button
                            type="button"
                            aria-label="Cerrar alerta de excluidos"
                            onClick={() => {
                                setExcludedNoGpsIds([]);
                                setSkippedWarnings([]);
                            }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#92400E', padding: '2px', flexShrink: 0 }}
                        >
                            <X size={15} />
                        </button>
                    </div>
                )}

                {/* Settings Drawer */}
                {showSettings && (
                    <div 
                        style={{ 
                            position: 'fixed', 
                            top: 0, 
                            left: 0, 
                            width: '100vw', 
                            height: '100vh', 
                            backgroundColor: 'rgba(15, 23, 42, 0.3)', 
                            backdropFilter: 'blur(5px)', 
                            zIndex: 1000, 
                            display: 'flex',
                            justifyContent: 'flex-end',
                            animation: 'fadeInPlanner 0.25s ease-out'
                        }}
                        onClick={() => setShowSettings(false)}
                    >
                        <style>{`
                            @keyframes fadeInPlanner {
                                from { opacity: 0; }
                                to { opacity: 1; }
                            }
                            @keyframes slideInRightPlanner {
                                from { transform: translateX(100%); }
                                to { transform: translateX(0); }
                            }
                        `}</style>
                        <div 
                            style={{ 
                                width: '380px',
                                maxWidth: '85vw',
                                height: '100%', 
                                backgroundColor: 'white', 
                                padding: '2rem 1.5rem', 
                                boxShadow: '-10px 0 30px rgba(0, 0, 0, 0.15)', 
                                display: 'flex',
                                flexDirection: 'column',
                                overflowY: 'auto',
                                animation: 'slideInRightPlanner 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                                cursor: 'default'
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', alignItems: 'center' }}>
                                <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '900', color: '#111827', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Settings size={18} color="#4F46E5" /> Ajustes del Optimizador
                                </h4>
                                <button 
                                    onClick={() => setShowSettings(false)} 
                                    style={{ 
                                        border: 'none', 
                                        background: '#F3F4F6', 
                                        cursor: 'pointer', 
                                        width: '28px',
                                        height: '28px',
                                        borderRadius: '50%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: '#4B5563',
                                        transition: 'background 0.2s'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#E5E7EB'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = '#F3F4F6'}
                                >
                                    <X size={16} />
                                </button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', flex: 1 }}>
                                <div>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>Tiempo base de alistamiento (min)</label>

                                    <input 
                                        type="text"
                                        inputMode="decimal"
                                        value={params.base_setup_time ?? ''} 
                                        onChange={(e) => updateParameter('base_setup_time', e.target.value)}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: '12px', border: '1px solid #E5E7EB', fontWeight: '700' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>Descarga física de 10 canastillas (min)</label>
                                    <input 
                                        type="text"
                                        inputMode="decimal"
                                        value={params.time_per_10_crates_unload ?? ''} 
                                        onChange={(e) => updateParameter('time_per_10_crates_unload', e.target.value)}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: '12px', border: '1px solid #E5E7EB', fontWeight: '700' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>Revisión/Firma de 10 canastillas (min)</label>
                                    <input 
                                        type="text"
                                        inputMode="decimal"
                                        value={params.time_per_10_crates_delivery ?? ''} 
                                        onChange={(e) => updateParameter('time_per_10_crates_delivery', e.target.value)}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: '12px', border: '1px solid #E5E7EB', fontWeight: '700' }}
                                    />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                                    <div>
                                        <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>Salida de Flota (Inicio)</label>
                                        <input 
                                            type="time" 
                                            value={params.fleet_start_time || '04:30'} 
                                            onChange={(e) => updateParameter('fleet_start_time', e.target.value)}
                                            style={{ width: '100%', padding: '0.5rem', borderRadius: '12px', border: '1px solid #E5E7EB', fontWeight: '700', fontSize: '0.8rem' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>Retorno de Flota (Cierre)</label>
                                        <input 
                                            type="time" 
                                            value={params.fleet_end_time || '19:00'} 
                                            onChange={(e) => updateParameter('fleet_end_time', e.target.value)}
                                            style={{ width: '100%', padding: '0.5rem', borderRadius: '12px', border: '1px solid #E5E7EB', fontWeight: '700', fontSize: '0.8rem' }}
                                        />
                                    </div>
                                </div>
                                <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    <span style={{ fontSize: '0.72rem', fontWeight: '900', color: '#1E3A5F', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Clock size={14} /> Ventanas Horarias por Segmento
                                    </span>
                                    <div>
                                        <label style={{ fontSize: '0.68rem', fontWeight: '800', color: '#475569', display: 'block', marginBottom: '0.35rem' }}>
                                            Ventana Institucional (B2B)
                                        </label>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                                            <input
                                                type="time"
                                                aria-label="Ventana Institucional B2B Inicio"
                                                value={params.b2b_default_window_start || '06:00'}
                                                onChange={(e) => updateParameter('b2b_default_window_start', e.target.value)}
                                                style={{ width: '100%', padding: '0.45rem', borderRadius: '10px', border: '1px solid #E5E7EB', fontWeight: '700', fontSize: '0.78rem' }}
                                            />
                                            <input
                                                type="time"
                                                aria-label="Ventana Institucional B2B Fin"
                                                value={params.b2b_default_window_end || '10:00'}
                                                onChange={(e) => updateParameter('b2b_default_window_end', e.target.value)}
                                                style={{ width: '100%', padding: '0.45rem', borderRadius: '10px', border: '1px solid #E5E7EB', fontWeight: '700', fontSize: '0.78rem' }}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.68rem', fontWeight: '800', color: '#475569', display: 'block', marginBottom: '0.35rem' }}>
                                            Ventana Hogar (B2C)
                                        </label>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                                            <input
                                                type="time"
                                                aria-label="Ventana Hogar B2C Inicio"
                                                value={params.b2c_default_window_start || '10:00'}
                                                onChange={(e) => updateParameter('b2c_default_window_start', e.target.value)}
                                                style={{ width: '100%', padding: '0.45rem', borderRadius: '10px', border: '1px solid #E5E7EB', fontWeight: '700', fontSize: '0.78rem' }}
                                            />
                                            <input
                                                type="time"
                                                aria-label="Ventana Hogar B2C Fin"
                                                value={params.b2c_default_window_end || '14:00'}
                                                onChange={(e) => updateParameter('b2c_default_window_end', e.target.value)}
                                                style={{ width: '100%', padding: '0.45rem', borderRadius: '10px', border: '1px solid #E5E7EB', fontWeight: '700', fontSize: '0.78rem' }}
                                            />
                                        </div>
                                    </div>
                                    {windowSettingsError && (
                                        <div style={{
                                            backgroundColor: '#FEF2F2',
                                            border: '1px solid #FECACA',
                                            color: '#B91C1C',
                                            borderRadius: '8px',
                                            padding: '0.45rem 0.6rem',
                                            fontSize: '0.68rem',
                                            fontWeight: '700',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '5px'
                                        }}>
                                            <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                                            <span>{windowSettingsError}</span>
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>Estrategia de Optimización</label>
                                    <select 
                                        value={params.optimization_strategy || 'balanced'} 
                                        onChange={(e) => updateParameter('optimization_strategy', e.target.value)}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: '12px', border: '1px solid #E5E7EB', fontWeight: '700', fontSize: '0.8rem', backgroundColor: 'white', cursor: 'pointer' }}
                                    >
                                        <option value="balanced">Balanceada (Recomendado)</option>
                                        <option value="minimize_vehicles">Usar menos camiones (Ahorro)</option>
                                        <option value="minimize_time">Terminar más rápido (Velocidad)</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>Descanso de Conductor (minutos)</label>
                                    <input 
                                        type="text"
                                        inputMode="decimal"
                                        value={params.driver_break_mins ?? ''} 
                                        onChange={(e) => updateParameter('driver_break_mins', e.target.value)}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: '12px', border: '1px solid #E5E7EB', fontWeight: '700' }}
                                    />
                                </div>
                                <div style={{ padding: '0.5rem 0' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem', alignItems: 'center' }}>
                                        <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#0891B2' }}>kg / Canastilla Promedio</label>
                                        <span style={{ fontSize: '0.85rem', fontWeight: '900', color: '#111827', backgroundColor: '#ECFEFF', padding: '0.2rem 0.6rem', borderRadius: '8px', border: '1px solid #A5F3FC' }}>
                                            {params.avg_kg_per_crate} kg
                                        </span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="10" 
                                        max="25" 
                                        step="0.01"
                                        value={params.avg_kg_per_crate} 
                                        onChange={(e) => updateParameter('avg_kg_per_crate', parseFloat(e.target.value))}
                                        style={{ width: '100%', accentColor: '#0891B2', cursor: 'grab' }}
                                    />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.3rem', fontSize: '0.55rem', color: '#94A3B8', fontWeight: '700' }}>
                                        <span>10 kg</span>
                                        <span>12.5 kg (Estándar)</span>
                                        <span>25 kg</span>
                                    </div>
                                </div>
                                <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '1rem', marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: '900', color: '#10B981', display: 'flex', alignItems: 'center', gap: '6px', letterSpacing: '-0.01em' }}>
                                        <Package size={16} /> Cargue en Bodega (Tiempos)
                                    </span>
                                    <div>
                                        <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>Alistamiento Fijo Bodega (min)</label>
                                        <input 
                                            type="text"
                                            inputMode="decimal"
                                            value={params.warehouse_base_load_time ?? ''} 
                                            onChange={(e) => updateParameter('warehouse_base_load_time', e.target.value)}
                                            style={{ width: '100%', padding: '0.6rem', borderRadius: '12px', border: '1px solid #E5E7EB', fontWeight: '700' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>Cargue de 10 canastillas (min)</label>
                                        <input 
                                            type="text"
                                            inputMode="decimal"
                                            value={params.warehouse_time_per_10_crates_load ?? ''} 
                                            onChange={(e) => updateParameter('warehouse_time_per_10_crates_load', e.target.value)}
                                            style={{ width: '100%', padding: '0.6rem', borderRadius: '12px', border: '1px solid #E5E7EB', fontWeight: '700' }}
                                        />
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                            <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280' }}>Capacidad por Espacio de Alistamiento</label>
                                            <span style={{ fontSize: '0.75rem', fontWeight: '900', color: '#10B981', backgroundColor: '#ECFDF5', padding: '1px 6px', borderRadius: '6px', border: '1px solid #A7F3D0' }}>
                                                {params.space_capacity || 36} canastillas
                                            </span>
                                        </div>
                                        <input 
                                            type="text"
                                            inputMode="decimal"
                                            value={params.space_capacity ?? 36} 
                                            onChange={(e) => updateParameter('space_capacity', e.target.value)}
                                            style={{ width: '100%', padding: '0.6rem', borderRadius: '12px', border: '1px solid #E5E7EB', fontWeight: '700' }}
                                        />
                                        <span style={{ fontSize: '0.65rem', color: '#94A3B8', marginTop: '4px', display: 'block' }}>
                                            Canastillas máximas por bahía en bodega. Si un pedido supera este valor, se le asignan espacios múltiples (ej: 4-5).
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#F8FAFC', borderRadius: '16px', fontSize: '0.65rem', color: '#64748B', lineHeight: '1.4' }}>
                                Estos valores afectan el cálculo de `service_duration` enviado a Google Maps.
                            </div>
                        </div>
                    </div>
                )}

                {routeViewMode === 'lifo' && (
                    <div style={{
                        backgroundColor: '#ECFDF5',
                        border: '1px solid #A7F3D0',
                        color: '#065F46',
                        borderRadius: '10px',
                        padding: '0.45rem 0.85rem',
                        fontSize: '0.70rem',
                        fontWeight: '700',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px'
                    }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <ArrowDownUp size={13} />
                            <strong>Vista Cargue LIFO (Fondo → Puerta):</strong> arriba aparece lo que entra primero al fondo del furgón. Cambia a <strong>Entrega 1→N</strong> para reordenar paradas.
                        </span>
                    </div>
                )}

                {(() => {
                    const sortedVehicles = [...vehicles].sort((a, b) => {
                        const aOrders = assignments[a.id] || [];
                        const bOrders = assignments[b.id] || [];
                        if (aOrders.length > 0 && bOrders.length === 0) return -1;
                        if (bOrders.length > 0 && aOrders.length === 0) return 1;
                        if (aOrders.length > 0 && bOrders.length > 0) {
                            const getFirstOrderMin = (vId: string) => {
                                const firstOrderId = assignments[vId][0];
                                const order = orders.find(o => o.id === firstOrderId);
                                if (order) {
                                    const win = resolveOrderDisplayWindow(order, params);
                                    if (win.startTime && /^\d{2}:\d{2}$/.test(win.startTime)) {
                                        const [h, m] = win.startTime.split(':').map(Number);
                                        return h * 60 + m;
                                    }
                                }
                                return 9999;
                            };
                            const minA = getFirstOrderMin(a.id);
                            const minB = getFirstOrderMin(b.id);
                            if (minA !== minB) return minA - minB;
                        }
                        return a.plate.localeCompare(b.plate);
                    });

                    const activeVehiclesList = sortedVehicles.filter(v => (assignments[v.id] || []).length > 0);
                    const idleVehiclesList = sortedVehicles.filter(v => (assignments[v.id] || []).length === 0);
                    const vehiclesToRenderMain = activeVehiclesList.length > 0 ? activeVehiclesList : sortedVehicles;

                    return (
                        <>
                            <div className="rp-fleet-grid">
                                {vehiclesToRenderMain.map(vehicle => {
                                    const load = getVehicleLoad(vehicle.id);
                                    const cratesNeeded = getVehicleCrates(vehicle.id);
                                    const kgProgress = vehicle.capacity_kg > 0 ? (load / vehicle.capacity_kg) * 100 : 0;
                                    const crateProgress = vehicle.max_crates_capacity > 0 ? (cratesNeeded / vehicle.max_crates_capacity) * 100 : 0;

                                    const assignedOrders = assignments[vehicle.id] || [];
                                    const priorityInTruck = assignedOrders.filter(oid => priorityOrderIds.includes(String(oid))).length;
                                    const isKgOverloaded = load > vehicle.capacity_kg;
                                    const isCrateOverloaded = vehicle.max_crates_capacity > 0 && cratesNeeded > vehicle.max_crates_capacity;
                                    const isOverloaded = isKgOverloaded || isCrateOverloaded;
                                    const isDragOver = dragOverVehicleId === vehicle.id;

                                    const displayOrders = routeViewMode === 'lifo' ? [...assignedOrders].reverse() : assignedOrders;

                                    return (
                                        <div 
                                            key={vehicle.id} 
                                            onDragOver={(e) => { e.preventDefault(); setDragOverVehicleId(vehicle.id); }}
                                            onDragLeave={() => setDragOverVehicleId(null)}
                                            onDrop={(e) => {
                                                handleDropOnVehicle(e, vehicle.id);
                                                setDragOverVehicleId(null);
                                            }}
                                            style={{ 
                                                backgroundColor: '#FFFFFF', 
                                                borderRadius: '16px', 
                                                border: isDragOver
                                                    ? '2px dashed #0D7A57'
                                                    : (isOverloaded ? '2px solid #EF4444' : '1px solid #E2E8F0'), 
                                                padding: '0.9rem',
                                                boxShadow: isDragOver 
                                                    ? '0 10px 15px -3px rgba(13,122,87,0.12)' 
                                                    : '0 2px 6px rgba(15,23,42,0.04)',
                                                transition: 'all 0.15s'
                                            }}
                                        >
                                            {/* Vehicle Card Header (2 clean rows) */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                                                    <div style={{ minWidth: 0, flex: 1 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                            <span style={{ fontWeight: '900', fontSize: '1.1rem', color: '#0F172A', letterSpacing: '-0.02em', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                                                                {vehicle.plate}
                                                            </span>
                                                            <span style={{ fontSize: '0.62rem', fontWeight: '800', color: '#334155', backgroundColor: '#F1F5F9', border: '1px solid #E2E8F0', padding: '1px 6px', borderRadius: '9999px' }}>
                                                                {assignedOrders.length} parada{assignedOrders.length === 1 ? '' : 's'}
                                                            </span>
                                                            {priorityInTruck > 0 && (
                                                                <span style={{ fontSize: '0.62rem', fontWeight: '800', color: '#B45309', backgroundColor: '#FEF3C7', border: '1px solid #F59E0B', padding: '1px 6px', borderRadius: '9999px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                                    <Star size={10} fill="#F59E0B" stroke="#B45309" strokeWidth={2} /> {priorityInTruck}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div style={{ fontSize: '0.72rem', color: vehicle.driver_name !== 'Sin Asignar' ? '#475569' : '#94A3B8', fontWeight: '700', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={vehicle.driver_name}>
                                                            {vehicle.driver_name}
                                                        </div>
                                                    </div>
                                                    {assignedOrders.length > 0 && (() => {
                                                        const { loadStart, departure, duration } = getEstimatedTimesForVehicle(vehicle.id, cratesNeeded);
                                                        const validStopsForMaps = assignedOrders
                                                            .map(oid => orders.find(o => o.id === oid))
                                                            .filter((o): o is Order => Boolean(o))
                                                            .filter(o => classifyOrderGps(o.latitude, o.longitude).status === 'valid')
                                                            .map(o => ({
                                                                lat: Number(o.latitude),
                                                                lng: Number(o.longitude),
                                                                label: o.customer_name
                                                            }));
                                                        const mapChunks = buildGoogleMapsDirectionChunks(validStopsForMaps);
                                                        const vMetrics = routeMetrics[vehicle.id];
                                                        const totalHours = vMetrics ? Math.floor(vMetrics.total_min / 60) : 0;
                                                        const totalRemMins = vMetrics ? Math.round(vMetrics.total_min % 60) : 0;
                                                        const totalDurationStr = totalHours > 0 ? `${totalHours}h ${totalRemMins}m` : `${totalRemMins}m`;
                                                        return (
                                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px', flexShrink: 0 }}>
                                                                <span style={{ fontSize: '0.60rem', fontWeight: '800', backgroundColor: '#ECFDF5', color: '#065F46', padding: '2px 6px', borderRadius: '6px', border: '1px solid #A7F3D0', whiteSpace: 'nowrap' }}>
                                                                    Cargue {loadStart} ({duration}m) → Salida {departure}
                                                                </span>
                                                                {vMetrics && (
                                                                    <span style={{ fontSize: '0.58rem', fontWeight: '800', color: '#1E3A5F', backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE', padding: '2px 6px', borderRadius: '5px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                                                                        {formatNumber(vMetrics.distance_km, 1)} km · {Math.round(vMetrics.travel_min)}m manejo
                                                                        {typeof vMetrics.service_min === 'number' ? ` · ${Math.round(vMetrics.service_min)}m servicio` : ''}
                                                                        {vMetrics.wait_min > 0 ? ` · ${Math.round(vMetrics.wait_min)}m espera` : ''}
                                                                        {vMetrics.break_min > 0 ? ` · ${Math.round(vMetrics.break_min)}m descanso` : ''}
                                                                        {` · Total ${totalDurationStr}`}
                                                                        {vMetrics.return_eta ? ` (Retorno ~${vMetrics.return_eta})` : ''}
                                                                    </span>
                                                                )}
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setSpaghettiVehicleId(vehicle.id);
                                                                            setSpaghettiOpen(true);
                                                                        }}
                                                                        title={`Ver ${vehicle.plate} en Mapa Espagueti`}
                                                                        style={{
                                                                            fontSize: '0.58rem',
                                                                            fontWeight: '800',
                                                                            color: '#1D4ED8',
                                                                            backgroundColor: '#EFF6FF',
                                                                            border: '1px solid #BFDBFE',
                                                                            borderRadius: '5px',
                                                                            padding: '2px 6px',
                                                                            cursor: 'pointer',
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            gap: '3px'
                                                                        }}
                                                                    >
                                                                        <Route size={10} /> Mapa
                                                                    </button>
                                                                    {mapChunks.length === 1 && (
                                                                        <a
                                                                            href={mapChunks[0].url}
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            style={{
                                                                                fontSize: '0.58rem',
                                                                                fontWeight: '800',
                                                                                color: '#FFFFFF',
                                                                                backgroundColor: '#0F172A',
                                                                                borderRadius: '5px',
                                                                                padding: '2px 6px',
                                                                                textDecoration: 'none',
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                gap: '3px'
                                                                            }}
                                                                        >
                                                                            <ExternalLink size={9} /> Abrir en Google Maps
                                                                        </a>
                                                                    )}
                                                                    {mapChunks.length > 1 && mapChunks.map((chunk, cIdx) => (
                                                                        <a
                                                                            key={cIdx}
                                                                            href={chunk.url}
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            style={{
                                                                                fontSize: '0.58rem',
                                                                                fontWeight: '800',
                                                                                color: '#FFFFFF',
                                                                                backgroundColor: '#0F172A',
                                                                                borderRadius: '5px',
                                                                                padding: '2px 6px',
                                                                                textDecoration: 'none',
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                gap: '3px'
                                                                            }}
                                                                        >
                                                                            <ExternalLink size={9} /> Google Maps · Tramo {cIdx + 1}
                                                                        </a>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>

                                                {/* Dual Capacity Progress Bars */}
                                                <div className="rp-dual-bars" style={{ borderTop: '1px solid #F1F5F9', paddingTop: '0.5rem' }}>
                                                    <div style={{ backgroundColor: isKgOverloaded ? '#FEF2F2' : '#F8FAFC', border: `1px solid ${isKgOverloaded ? '#FECACA' : '#E2E8F0'}`, borderRadius: '8px', padding: '4px 7px' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.62rem', fontWeight: '800', color: isKgOverloaded ? '#DC2626' : '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: isKgOverloaded ? '#DC2626' : '#0D7A57' }}>
                                                                <Scale size={10} /> {formatNumber(load, 1)} / {formatNumber(vehicle.capacity_kg, 0)} kg
                                                            </span>
                                                            <span style={{ color: '#64748B' }}>{Math.round(kgProgress)}%</span>
                                                        </div>
                                                        <div style={{ height: '4px', backgroundColor: '#E2E8F0', borderRadius: '4px', overflow: 'hidden', marginTop: '3px' }}>
                                                            <div style={{ width: `${Math.min(kgProgress, 100)}%`, height: '100%', backgroundColor: isKgOverloaded ? '#EF4444' : kgProgress > 85 ? '#F59E0B' : '#0D7A57' }} />
                                                        </div>
                                                    </div>
                                                    {vehicle.max_crates_capacity > 0 && (
                                                        <div style={{ backgroundColor: isCrateOverloaded ? '#FEF2F2' : '#F8FAFC', border: `1px solid ${isCrateOverloaded ? '#FECACA' : '#E2E8F0'}`, borderRadius: '8px', padding: '4px 7px' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.62rem', fontWeight: '800', color: isCrateOverloaded ? '#DC2626' : '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: isCrateOverloaded ? '#DC2626' : '#1E3A5F' }}>
                                                                    <Package size={10} /> {cratesNeeded} / {vehicle.max_crates_capacity} can.
                                                                </span>
                                                                <span style={{ color: '#64748B' }}>{Math.round(crateProgress)}%</span>
                                                            </div>
                                                            <div style={{ height: '4px', backgroundColor: '#E2E8F0', borderRadius: '4px', overflow: 'hidden', marginTop: '3px' }}>
                                                                <div style={{ width: `${Math.min(crateProgress, 100)}%`, height: '100%', backgroundColor: isCrateOverloaded ? '#EF4444' : crateProgress > 85 ? '#F59E0B' : '#1E3A5F' }} />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Stop List */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                                                {assignedOrders.length === 0 ? (
                                                    <div style={{ 
                                                        padding: '1.25rem', 
                                                        border: '2px dashed #E2E8F0', 
                                                        borderRadius: '12px', 
                                                        textAlign: 'center', 
                                                        color: '#94A3B8', 
                                                        fontSize: '0.75rem',
                                                        backgroundColor: '#F8FAFC'
                                                    }}>
                                                        Arrastra pedidos aquí...
                                                    </div>
                                                ) : (
                                                    displayOrders.map((oid, visualIdx) => {
                                                        const order = orders.find(o => o.id === oid);
                                                        const realStopIndex = routeViewMode === 'lifo' ? (assignedOrders.length - 1 - visualIdx) : visualIdx;
                                                        const stopNumber = realStopIndex + 1;
                                                        const totalStops = assignedOrders.length;
                                                        const loadSequence = totalStops - realStopIndex;
                                                        const isPriority = priorityOrderIds.includes(String(oid));
                                                        const orderCrates = getOrderCrates(order);
                                                        const spaceLabel = order ? getOrderSpaceDisplayLabel(order) : '';
                                                        const etaStr = stopEtas[oid];

                                                        return (
                                                            <div 
                                                                key={oid} 
                                                                draggable={!readOnly && routeViewMode === 'delivery'}
                                                                onDragStart={(e) => handleDragStart(e, oid, vehicle.id, realStopIndex)}
                                                                onDragOver={handleDragOver}
                                                                onDrop={(e) => {
                                                                    e.stopPropagation();
                                                                    if (routeViewMode === 'delivery') {
                                                                        handleDropOnVehicle(e, vehicle.id, realStopIndex);
                                                                    }
                                                                }}
                                                                style={{ 
                                                                    padding: '0.55rem 0.65rem', 
                                                                    backgroundColor: isPriority ? '#FFFBEB' : '#FFFFFF', 
                                                                    borderRadius: '10px', 
                                                                    display: 'flex', 
                                                                    alignItems: 'flex-start',
                                                                    gap: '0.55rem',
                                                                    border: isPriority ? '1px solid #F59E0B' : '1px solid #E2E8F0',
                                                                    cursor: (!readOnly && routeViewMode === 'delivery') ? 'grab' : 'default'
                                                                }}
                                                            >
                                                                {/* Square Monospace Sequence Badge */}
                                                                <div style={{
                                                                    minWidth: '26px',
                                                                    height: '26px',
                                                                    borderRadius: '7px',
                                                                    backgroundColor: isPriority ? '#D97706' : '#1E3A5F',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    color: '#FFFFFF',
                                                                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                                                                    fontWeight: '900',
                                                                    fontSize: '0.70rem',
                                                                    flexShrink: 0,
                                                                    marginTop: '1px'
                                                                }}>
                                                                    #{stopNumber}
                                                                </div>

                                                                {/* Stop Content: Customer + Address + Badges */}
                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '4px' }}>
                                                                        {isPriority && (
                                                                            <Star size={12} fill="#F59E0B" stroke="#B45309" strokeWidth={2} style={{ flexShrink: 0, marginTop: '2px' }} />
                                                                        )}
                                                                        <div className="line-clamp-2" style={{ fontSize: '0.76rem', fontWeight: '800', color: '#0F172A', lineHeight: 1.25 }}>
                                                                            {order?.customer_name || 'Cliente'}
                                                                        </div>
                                                                    </div>
                                                                    {order?.address && (
                                                                        <div style={{ fontSize: '0.64rem', color: '#475569', fontWeight: '600', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={order.address}>
                                                                            <MapPin size={10} style={{ flexShrink: 0, color: '#64748B' }} />
                                                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{order.address}</span>
                                                                        </div>
                                                                    )}
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', flexWrap: 'wrap', fontVariantNumeric: 'tabular-nums' }}>
                                                                        {etaStr && (
                                                                            <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.58rem', fontWeight: '800', backgroundColor: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0', padding: '1px 5px', borderRadius: '4px' }}>
                                                                                ETA {etaStr}
                                                                            </span>
                                                                        )}
                                                                        {(() => {
                                                                            const legMetric = stopLegMetrics[oid];
                                                                            if (!legMetric) return null;
                                                                            if (legMetric.is_same_site_followup) {
                                                                                let leaderStopNum = stopNumber;
                                                                                for (let i = realStopIndex - 1; i >= 0; i--) {
                                                                                    if (!stopLegMetrics[assignedOrders[i]]?.is_same_site_followup) {
                                                                                        leaderStopNum = i + 1;
                                                                                        break;
                                                                                    }
                                                                                }
                                                                                return (
                                                                                    <span style={{ fontSize: '0.58rem', fontWeight: '800', backgroundColor: '#F1F5F9', color: '#475569', border: '1px solid #CBD5E1', padding: '1px 5px', borderRadius: '4px' }}>
                                                                                        Misma parada (#{leaderStopNum})
                                                                                    </span>
                                                                                );
                                                                            }
                                                                            if (typeof legMetric.service_min === 'number' && legMetric.service_min > 0) {
                                                                                return (
                                                                                    <span style={{ fontSize: '0.58rem', fontWeight: '800', backgroundColor: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', padding: '1px 5px', borderRadius: '4px' }}>
                                                                                        ~{legMetric.service_min}m servicio{legMetric.cluster_size && legMetric.cluster_size > 1 ? ` (${legMetric.cluster_size} pedidos)` : ''}
                                                                                    </span>
                                                                                );
                                                                            }
                                                                            return null;
                                                                        })()}
                                                                        {(() => {
                                                                            const resolvedWin = order ? resolveOrderDisplayWindow(order, params) : null;
                                                                            const slotText = resolvedWin?.displayLabel || 'Flexible';
                                                                            const isManualOrProfile = resolvedWin?.slotType === 'manual' || resolvedWin?.slotType === 'profile';
                                                                            return (
                                                                                <span style={{
                                                                                    fontSize: '0.58rem',
                                                                                    fontWeight: '800',
                                                                                    backgroundColor: isManualOrProfile ? '#EFF6FF' : '#F1F5F9',
                                                                                    color: isManualOrProfile ? '#1D4ED8' : '#475569',
                                                                                    border: isManualOrProfile ? '1px solid #BFDBFE' : '1px solid #CBD5E1',
                                                                                    padding: '1px 5px',
                                                                                    borderRadius: '4px',
                                                                                    display: 'inline-flex',
                                                                                    alignItems: 'center',
                                                                                    gap: '3px'
                                                                                }}>
                                                                                    <Clock size={9} />
                                                                                    {slotText}
                                                                                </span>
                                                                            );
                                                                        })()}
                                                                        {(() => {
                                                                            const gps = classifyOrderGps(order?.latitude, order?.longitude);
                                                                            if (gps.status === 'valid') return null;
                                                                            const badgeText = gps.status === 'generic_centroid'
                                                                                ? 'GPS Genérico'
                                                                                : gps.status === 'out_of_bounds'
                                                                                    ? 'GPS Fuera Zona'
                                                                                    : 'Sin GPS';
                                                                            return (
                                                                                <span
                                                                                    title={gps.reason || 'Cliente sin coordenadas GPS válidas'}
                                                                                    style={{ fontSize: '0.58rem', fontWeight: '800', backgroundColor: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA', padding: '1px 5px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                                                                >
                                                                                    <AlertTriangle size={9} />
                                                                                    {badgeText}
                                                                                </span>
                                                                            );
                                                                        })()}
                                                                        {spaceLabel && (
                                                                            <span style={{ fontSize: '0.58rem', fontWeight: '900', color: '#0369A1', backgroundColor: '#E0F2FE', border: '1px solid #BAE6FD', padding: '1px 5px', borderRadius: '4px' }}>
                                                                                ESP {spaceLabel}
                                                                            </span>
                                                                        )}
                                                                        <span style={{ fontSize: '0.60rem', color: '#475569', fontWeight: '700' }}>
                                                                            {formatNumber(order?.total_weight_kg || 0, 1)} kg · {orderCrates} can.
                                                                        </span>
                                                                        <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.56rem', fontWeight: '700', color: '#64748B', backgroundColor: '#F1F5F9', padding: '1px 4px', borderRadius: '4px' }}>
                                                                            {loadSequence === 1 ? 'Carga #1 (Fondo)' : `Carga #${loadSequence}`}
                                                                        </span>
                                                                    </div>
                                                                </div>

                                                                {!readOnly && (
                                                                    <button
                                                                        type="button"
                                                                        title="Quitar pedido del camión"
                                                                        aria-label="Quitar pedido del camión"
                                                                        style={{ 
                                                                            cursor: 'pointer', 
                                                                            color: '#EF4444',
                                                                            backgroundColor: '#FEF2F2',
                                                                            border: '1px solid #FECACA',
                                                                            padding: '3px',
                                                                            borderRadius: '6px',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center',
                                                                            flexShrink: 0
                                                                        }} 
                                                                        onClick={() => toggleAssignment(oid, vehicle.id)}
                                                                    >
                                                                        <X size={12} />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {activeVehiclesList.length > 0 && idleVehiclesList.length > 0 && (
                                <div style={{
                                    marginTop: '0.5rem',
                                    backgroundColor: '#F8FAFC',
                                    border: '1px solid #E2E8F0',
                                    borderRadius: '14px',
                                    padding: '0.75rem 0.9rem'
                                }}>
                                    <div style={{ fontSize: '0.70rem', fontWeight: '900', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
                                        Flota Disponible Sin Asignar ({idleVehiclesList.length})
                                    </div>
                                    <div className="rp-idle-grid">
                                        {idleVehiclesList.map(vehicle => {
                                            const isDragOver = dragOverVehicleId === vehicle.id;
                                            return (
                                                <div
                                                    key={vehicle.id}
                                                    onDragOver={(e) => { e.preventDefault(); setDragOverVehicleId(vehicle.id); }}
                                                    onDragLeave={() => setDragOverVehicleId(null)}
                                                    onDrop={(e) => {
                                                        handleDropOnVehicle(e, vehicle.id);
                                                        setDragOverVehicleId(null);
                                                    }}
                                                    style={{
                                                        backgroundColor: '#FFFFFF',
                                                        border: isDragOver ? '2px dashed #0D7A57' : '1px dashed #CBD5E1',
                                                        borderRadius: '10px',
                                                        padding: '0.55rem 0.75rem',
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        gap: '8px'
                                                    }}
                                                >
                                                    <div style={{ minWidth: 0 }}>
                                                        <div style={{ fontWeight: '900', fontSize: '0.82rem', color: '#0F172A', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                                                            {vehicle.plate}
                                                        </div>
                                                        <div style={{ fontSize: '0.64rem', color: '#64748B', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {vehicle.driver_name}
                                                        </div>
                                                    </div>
                                                    <div style={{ textAlign: 'right', fontSize: '0.62rem', fontWeight: '800', color: '#475569', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                                                        <div>{formatNumber(vehicle.capacity_kg, 0)} kg</div>
                                                        {vehicle.max_crates_capacity > 0 && (
                                                            <div style={{ color: '#64748B' }}>{vehicle.max_crates_capacity} can.</div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </>
                    );
                })()}
            </section>
            {/* Inject keyframes dynamically */}
            <style>{`
                .rp-layout {
                    max-width: 1600px;
                    margin: 0 auto;
                    display: flex;
                    flex-direction: column;
                    gap: 1.5rem;
                }
                .rp-fleet-grid {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: 1rem;
                    align-items: start;
                }
                @media (min-width: 768px) {
                    .rp-fleet-grid {
                        grid-template-columns: repeat(2, minmax(0, 1fr));
                    }
                }
                @media (min-width: 1520px) {
                    .rp-fleet-grid {
                        grid-template-columns: repeat(3, minmax(0, 1fr));
                    }
                }
                .rp-dual-bars {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 0.5rem;
                }
                .rp-idle-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
                    gap: 0.65rem;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                @keyframes pulse {
                    0%, 100% { transform: translate(-50%, -50%) scale(0.95); opacity: 0.8; }
                    50% { transform: translate(-50%, -50%) scale(1.1); opacity: 1; }
                }
                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>

            {optimizing && (
                <OptimizingModal />
            )}

            {showAiModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(15, 23, 42, 0.4)',
                    backdropFilter: 'blur(6px)',
                    zIndex: 9998,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '2rem',
                    fontFamily: 'Inter, system-ui, sans-serif'
                }} onClick={() => setShowAiModal(false)}>
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '24px',
                        width: '100%',
                        maxWidth: '600px',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                        border: '1px solid #F1F5F9',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        maxHeight: '85vh',
                        animation: 'fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                    }} onClick={(e) => e.stopPropagation()}>
                        {/* Header */}
                        <div style={{
                            padding: '1.5rem 2rem',
                            borderBottom: '1px solid #F1F5F9',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: 'linear-gradient(to right, #FAF5FF, #EEF2FF)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <Bot size={22} color="#4F46E5" />
                                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: '#1E1B4B' }}>
                                    Justificación de Ruteo IA
                                </h3>
                            </div>
                            <button 
                                onClick={() => setShowAiModal(false)}
                                style={{
                                    border: 'none',
                                    background: 'none',
                                    color: '#94A3B8',
                                    cursor: 'pointer',
                                    padding: '0.25rem',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'background-color 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F1F5F9'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Content */}
                        <div style={{
                            padding: '2rem',
                            overflowY: 'auto',
                            color: '#334155',
                            fontSize: '0.925rem',
                            lineHeight: '1.6'
                        }}>
                            {renderAiReport(aiReportText)}
                        </div>

                        {/* Footer */}
                        <div style={{
                            padding: '1.25rem 2rem',
                            borderTop: '1px solid #F1F5F9',
                            display: 'flex',
                            justifyContent: 'flex-end',
                            backgroundColor: '#F8FAFC'
                        }}>
                            <button
                                onClick={() => setShowAiModal(false)}
                                style={{
                                    padding: '0.75rem 2rem',
                                    backgroundColor: '#4F46E5',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '12px',
                                    fontSize: '0.875rem',
                                    fontWeight: '700',
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 6px -1px rgba(79, 70, 229, 0.2)',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = '#4338CA';
                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = '#4F46E5';
                                    e.currentTarget.style.transform = 'translateY(0)';
                                }}
                            >
                                Entendido
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showPreConfirm && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(12px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 2000, padding: '2rem'
                }} onClick={() => setShowPreConfirm(false)}>
                    <div style={{
                        backgroundColor: '#FFFFFF', borderRadius: '22px',
                        width: '96%', maxWidth: '1080px', maxHeight: '92vh',
                        padding: '1.5rem 2rem', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)',
                        display: 'flex', flexDirection: 'column', gap: '1rem',
                        position: 'relative', overflow: 'hidden'
                    }} onClick={e => e.stopPropagation()}>
                        {(() => {
                            const activeVehicleIds = Object.keys(assignments).filter(k => (assignments[k] || []).length > 0);
                            const totalAssignedOrders = activeVehicleIds.reduce((sum, vid) => sum + (assignments[vid]?.length || 0), 0);
                            const totalAssignedWeight = activeVehicleIds.reduce((sum, vid) => {
                                const oIds = assignments[vid] || [];
                                return sum + orders.filter(o => oIds.includes(o.id)).reduce((wSum, o) => wSum + o.total_weight_kg, 0);
                            }, 0);
                            const totalAssignedCrates = activeVehicleIds.reduce((sum, vid) => sum + getVehicleCrates(vid), 0);
                            return (
                                <>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #F1F5F9', paddingBottom: '0.85rem' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#0D7A57' }}></div>
                                                <span style={{ fontSize: '0.65rem', fontWeight: '900', color: '#64748B', letterSpacing: '0.1em' }}>TOMA DE DECISIONES / LOGÍSTICA</span>
                                            </div>
                                            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '900', color: '#0F172A', letterSpacing: '-0.02em' }}>
                                                Confirmar Lanzamiento de Despacho
                                            </h2>
                                        </div>
                                        <button
                                            onClick={() => setShowPreConfirm(false)}
                                            style={{
                                                background: '#F1F5F9', border: 'none', width: '34px', height: '34px',
                                                borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                                                justifyContent: 'center', fontWeight: 'bold', color: '#64748B'
                                            }}
                                            title="Cerrar"
                                        ><X size={17} /></button>
                                    </div>

                                    {/* Strip Ejecutivo Fijo (4 KPIs + Aviso compacto) */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.75rem', fontVariantNumeric: 'tabular-nums' }}>
                                        <div style={{ border: '1px solid #E2E8F0', borderRadius: '12px', padding: '0.65rem 0.85rem', backgroundColor: '#F8FAFC' }}>
                                            <div style={{ fontSize: '0.62rem', fontWeight: '800', color: '#64748B', letterSpacing: '0.04em' }}>RUTAS ACTIVAS</div>
                                            <div style={{ fontSize: '1.25rem', fontWeight: '900', color: '#0F172A', marginTop: '2px' }}>{activeVehicleIds.length}</div>
                                        </div>
                                        <div style={{ border: '1px solid #E2E8F0', borderRadius: '12px', padding: '0.65rem 0.85rem', backgroundColor: '#F8FAFC' }}>
                                            <div style={{ fontSize: '0.62rem', fontWeight: '800', color: '#64748B', letterSpacing: '0.04em' }}>PEDIDOS ASIGNADOS</div>
                                            <div style={{ fontSize: '1.25rem', fontWeight: '900', color: '#0F172A', marginTop: '2px' }}>{totalAssignedOrders}</div>
                                        </div>
                                        <div style={{ border: '1px solid #E2E8F0', borderRadius: '12px', padding: '0.65rem 0.85rem', backgroundColor: '#F8FAFC' }}>
                                            <div style={{ fontSize: '0.62rem', fontWeight: '800', color: '#64748B', letterSpacing: '0.04em' }}>CARGA TOTAL</div>
                                            <div style={{ fontSize: '1.15rem', fontWeight: '900', color: '#0F172A', marginTop: '2px' }}>
                                                {(totalAssignedWeight / 1000).toFixed(2)} t <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#64748B' }}>({formatNumber(totalAssignedWeight, 1)} kg)</span>
                                            </div>
                                        </div>
                                        <div style={{ border: '1px solid #E2E8F0', borderRadius: '12px', padding: '0.65rem 0.85rem', backgroundColor: '#F8FAFC' }}>
                                            <div style={{ fontSize: '0.62rem', fontWeight: '800', color: '#64748B', letterSpacing: '0.04em' }}>CANASTILLAS</div>
                                            <div style={{ fontSize: '1.25rem', fontWeight: '900', color: '#0F172A', marginTop: '2px' }}>{totalAssignedCrates}</div>
                                        </div>
                                    </div>

                                    <div style={{
                                        backgroundColor: '#F1F5F9', borderRadius: '10px', padding: '0.6rem 0.9rem',
                                        borderLeft: '4px solid #0D7A57', display: 'flex', alignItems: 'center', gap: '8px',
                                        fontSize: '0.75rem', color: '#334155', fontWeight: '600'
                                    }}>
                                        <AlertTriangle size={15} color="#D97706" style={{ flexShrink: 0 }} />
                                        <span>Al confirmar se sellarán las rutas, bahías de cargue y manifiestos para <strong>Picking / Despacho</strong>.</span>
                                    </div>

                                    {/* Grid 2 Columnas de Vehículos */}
                                    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '0.35rem' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: '0.85rem' }}>
                                            {activeVehicleIds.map((vid) => {
                                                const vehicle = vehicles.find(v => v.id === vid);
                                                const orderIds = assignments[vid] || [];
                                                const routeOrders = orders.filter(o => orderIds.includes(o.id));
                                                const totalWeight = routeOrders.reduce((wSum, o) => wSum + o.total_weight_kg, 0);
                                                const totalCrates = getVehicleCrates(vid);
                                                const capPct = vehicle?.capacity_kg ? Math.round((totalWeight / vehicle.capacity_kg) * 100) : 0;
                                                const capColor = capPct > 95 ? '#EF4444' : capPct > 75 ? '#D97706' : '#059669';
                                                const isThirdParty = isThirdPartyVehicle(vehicle?.vehicle_type);
                                                const vMetrics = routeMetrics[vid];
                                                const { loadStart, departure, duration } = getEstimatedTimesForVehicle(vid, totalCrates);

                                                const clientCounts = new Map<string, number>();
                                                routeOrders.forEach(o => {
                                                    const cname = (o.customer_name || 'Cliente').trim();
                                                    clientCounts.set(cname, (clientCounts.get(cname) || 0) + 1);
                                                });
                                                const dedupClientsText = Array.from(clientCounts.entries())
                                                    .map(([cname, cnt]) => cnt > 1 ? `${cname} (x${cnt})` : cname)
                                                    .join(', ');

                                                return (
                                                    <div key={vid} style={{
                                                        border: '1px solid #E2E8F0', borderRadius: '14px', padding: '0.9rem 1rem',
                                                        backgroundColor: '#FFFFFF', display: 'flex', flexDirection: 'column', gap: '0.5rem',
                                                        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)', fontVariantNumeric: 'tabular-nums'
                                                    }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                                                                <span style={{ fontWeight: '900', color: '#0F172A', fontSize: '0.88rem', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                                                    <Truck size={14} color="#0F172A" /> {vehicle?.plate || 'Desconocido'}
                                                                </span>
                                                                <span style={{
                                                                    fontSize: '0.60rem', fontWeight: '900', padding: '1px 6px', borderRadius: '5px',
                                                                    backgroundColor: isThirdParty ? '#FEF3C7' : '#ECFDF5',
                                                                    color: isThirdParty ? '#92400E' : '#065F46',
                                                                    border: isThirdParty ? '1px solid #FDE68A' : '1px solid #A7F3D0'
                                                                }}>
                                                                    {isThirdParty ? 'TERCERO' : 'PROPIO'}
                                                                </span>
                                                                <span style={{ fontSize: '0.72rem', color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                    {vehicle?.driver_name || 'Sin Asignar'}
                                                                </span>
                                                            </div>
                                                            <span style={{ fontSize: '0.73rem', fontWeight: '900', color: capColor, flexShrink: 0 }}>
                                                                {capPct}% · {formatNumber(totalWeight, 1)} / {formatNumber(vehicle?.capacity_kg || 0, 0)} kg
                                                            </span>
                                                        </div>

                                                        <div style={{ width: '100%', height: '5px', backgroundColor: '#F1F5F9', borderRadius: '9999px', overflow: 'hidden' }}>
                                                            <div style={{ width: `${Math.min(100, capPct)}%`, height: '100%', backgroundColor: capColor, borderRadius: '9999px' }} />
                                                        </div>

                                                        <div style={{ fontSize: '0.73rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
                                                            <span><strong>Pedidos:</strong> {orderIds.length}</span>
                                                            <span><strong>Canastillas:</strong> {totalCrates}</span>
                                                            {vMetrics && (
                                                                <span style={{ color: '#1E3A5F', fontWeight: '700' }}>
                                                                    {formatNumber(vMetrics.distance_km, 1)} km · {Math.round(vMetrics.travel_min)}m manejo
                                                                    {typeof vMetrics.service_min === 'number' ? ` · ${Math.round(vMetrics.service_min)}m servicio` : ''}
                                                                    {vMetrics.return_eta ? ` · Retorno ~${vMetrics.return_eta}` : ''}
                                                                </span>
                                                            )}
                                                        </div>

                                                        <div style={{
                                                            fontSize: '0.72rem', color: '#0F172A', backgroundColor: '#F0FDF4',
                                                            padding: '5px 10px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between',
                                                            border: '1px solid #DCFCE7', fontWeight: '600'
                                                        }}>
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                <Clock size={12} color="#0D7A57" /> <strong>Cargue:</strong> {loadStart} <span style={{ color: '#64748B', fontWeight: 'normal' }}>({duration}m)</span>
                                                            </span>
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                <Truck size={12} color="#0D7A57" /> <strong>Salida:</strong> {departure}
                                                            </span>
                                                        </div>

                                                        <div style={{
                                                            fontSize: '0.70rem', color: '#64748B',
                                                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                                            backgroundColor: '#F8FAFC', padding: '4px 8px', borderRadius: '7px',
                                                            border: '1px dashed #E2E8F0'
                                                        }} title={dedupClientsText}>
                                                            <strong>Clientes:</strong> {dedupClientsText}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Footer Bar */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', borderTop: '1px solid #F1F5F9', paddingTop: '1rem', flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '0.76rem', fontWeight: '700', color: '#64748B', fontVariantNumeric: 'tabular-nums' }}>
                                            {activeVehicleIds.length} rutas · {totalAssignedOrders} pedidos listos para confirmar
                                        </span>
                                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                                            <button
                                                onClick={() => setShowPreConfirm(false)}
                                                style={{
                                                    padding: '0.65rem 1.25rem', borderRadius: '10px',
                                                    backgroundColor: 'transparent', border: '1px solid #CBD5E1',
                                                    color: '#475569', fontWeight: '800', fontSize: '0.82rem',
                                                    cursor: 'pointer', transition: 'all 0.2s'
                                                }}
                                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                            >
                                                Regresar al Planeador
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    setShowPreConfirm(false);
                                                    await handleConfirmRoutes();
                                                }}
                                                style={{
                                                    padding: '0.65rem 1.5rem', borderRadius: '10px',
                                                    backgroundColor: '#10B981', border: 'none',
                                                    color: 'white', fontWeight: '800', fontSize: '0.82rem',
                                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                                                    boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.25)',
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.backgroundColor = '#059669';
                                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.backgroundColor = '#10B981';
                                                    e.currentTarget.style.transform = 'translateY(0)';
                                                }}
                                            >
                                                <Check size={15} strokeWidth={2.5} />
                                                <span>Confirmar y Lanzar</span>
                                            </button>
                                        </div>
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                </div>
            )}

            {confirmedManifest && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(12px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 2000, padding: '2rem'
                }} onClick={() => setConfirmedManifest(null)}>
                    <div style={{
                        backgroundColor: '#FFFFFF', borderRadius: '30px',
                        width: '95%', maxWidth: '750px', maxHeight: '90vh',
                        padding: '2.5rem', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)',
                        display: 'flex', flexDirection: 'column', gap: '1.5rem',
                        position: 'relative', overflow: 'hidden'
                    }} onClick={e => e.stopPropagation()}>
                        
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10B981' }}></div>
                                    <span style={{ fontSize: '0.65rem', fontWeight: '900', color: '#64748B', letterSpacing: '0.1em' }}>DESPACHO / PLAN DE RUTAS</span>
                                </div>
                                <h2 style={{ margin: 0, fontSize: '1.75rem', fontWeight: '900', color: '#1E293B', letterSpacing: '-0.02em' }}>
                                    Manifiesto de Despacho Confirmado
                                </h2>
                            </div>
                            <button
                                onClick={() => setConfirmedManifest(null)}
                                style={{
                                    background: '#F1F5F9', border: 'none', width: '32px', height: '32px',
                                    borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', fontWeight: 'bold', color: '#64748B'
                                }}
                            ><X size={16} /></button>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', paddingRight: '0.5rem' }} className="print-area">
                            <div style={{ fontSize: '0.85rem', color: '#475569', lineHeight: '1.5' }}>
                                Las rutas han sido generadas y enviadas al equipo de alistamiento de bodega (Picking) con éxito. A continuación el resumen para el operador de transporte:
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {confirmedManifest.map((route: any, idx: number) => (
                                    <div key={idx} style={{
                                        border: '1px solid #E2E8F0', borderRadius: '16px',
                                        padding: '1.25rem', backgroundColor: '#F8FAFC',
                                        display: 'flex', flexDirection: 'column', gap: '1rem'
                                    }}>
                                        <div style={{
                                            display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '1rem',
                                            alignItems: 'center', borderBottom: route.stops && route.stops.length > 0 ? '1px solid #F1F5F9' : 'none',
                                            paddingBottom: route.stops && route.stops.length > 0 ? '0.75rem' : 0
                                        }}>
                                            <div>
                                                <div style={{ fontWeight: '900', color: '#0F172A', fontSize: '0.95rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                    <Truck size={14} /> {route.vehicle_plate}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '700', marginTop: '2px' }}>Conductor: {route.driver_name}</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '800' }}>ENTREGAS / PESO</div>
                                                <div style={{ fontWeight: '800', color: '#1E293B', fontSize: '0.85rem', marginTop: '2px' }}>{route.stops_count} entregas • {formatNumber(route.total_kilos || 0, 1)} kg</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '800' }}>ESPACIOS BODEGA</div>
                                                <div style={{ fontWeight: '900', color: '#0EA5E9', fontSize: '0.85rem', marginTop: '2px' }}>
                                                    {route.warehouse_spaces && route.warehouse_spaces.length > 0 
                                                        ? `[${route.warehouse_spaces.join(', ')}]` 
                                                        : 'Por asignar'}
                                                </div>
                                            </div>
                                        </div>

                                        {route.stops && route.stops.length > 0 && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingLeft: '0.25rem' }}>
                                                <div style={{ fontSize: '0.65rem', fontWeight: '800', color: '#94A3B8', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '0.15rem' }}>
                                                    Secuencia de Carga y Entrega
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                                    {route.stops.map((stop: any, sIdx: number) => (
                                                        <div key={sIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: '#334155' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <span style={{ 
                                                                    backgroundColor: '#E2E8F0', color: '#475569', 
                                                                    fontSize: '0.65rem', fontWeight: '800', 
                                                                    borderRadius: '50%', width: '18px', height: '18px', 
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center' 
                                                                }}>{sIdx + 1}</span>
                                                                <span style={{ fontWeight: '700', color: '#1E293B' }}>{stop.customer_name}</span>
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                                <span style={{ fontSize: '0.75rem', color: '#64748B' }}>{formatNumber(stop.total_weight_kg || 0, 1)} kg ({stop.crates} can.)</span>
                                                                <span style={{ 
                                                                    fontSize: '0.7rem', fontWeight: '850', 
                                                                    backgroundColor: 'rgba(14, 165, 233, 0.08)', color: '#0284C7', 
                                                                    padding: '2px 6px', borderRadius: '4px' 
                                                                }}>
                                                                    {(() => {
                                                                        const label = getOrderSpaceDisplayLabel({ warehouse_spaces: stop.warehouse_spaces, logistics_data: stop.logistics_data });
                                                                        return label ? `ESP ${label}` : (stop.warehouse_spaces && stop.warehouse_spaces.length > 0 ? `ESP ${stop.warehouse_spaces.join(', ')}` : 'Sin Espacio');
                                                                    })()}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                            <button
                                onClick={() => {
                                    const dateStr = formatBogotaDate(new Date(), { day: 'numeric', month: 'short', year: 'numeric' });
                                    let text = `*MANIFIESTO DE DESPACHO - FRUFRESCO*\n*Fecha:* ${dateStr}\n\n*Rutas Confirmadas:*\n`;
                                    confirmedManifest.forEach((r, i) => {
                                        text += `----------------------------------------\n*${i+1}. Placa:* ${r.vehicle_plate} | *Conductor:* ${r.driver_name}\n*Espacios Bodega:* ${r.warehouse_spaces && r.warehouse_spaces.length > 0 ? r.warehouse_spaces.join(', ') : 'N/A'}\n*Resumen:* ${r.stops_count} entregas • ${formatNumber(r.total_kilos || 0, 1)} kg • Salida: ${r.departure_time || '04:30'}\n\n*Secuencia de Entregas:*\n`;
                                        if (r.stops && r.stops.length > 0) {
                                            r.stops.forEach((stop: any, sIdx: number) => {
                                                const label = getOrderSpaceDisplayLabel({ warehouse_spaces: stop.warehouse_spaces, logistics_data: stop.logistics_data });
                                                text += `  *${sIdx+1}.* *${stop.customer_name}* (${formatNumber(stop.total_weight_kg || 0, 1)} kg) -> Espacios: ${label || (stop.warehouse_spaces && stop.warehouse_spaces.length > 0 ? stop.warehouse_spaces.join(', ') : 'N/A')}\n`;
                                            });
                                        } else {
                                            text += `  (No hay detalles de paradas)\n`;
                                        }
                                        text += `\n`;
                                    });
                                    text += `----------------------------------------\n\n_¡Listos para cargar! _`;
                                    
                                    navigator.clipboard.writeText(text);
                                    setCopiedWhatsApp(true);
                                    setTimeout(() => setCopiedWhatsApp(false), 4000);
                                }}
                                style={{
                                    flex: 1, padding: '1rem', borderRadius: '14px',
                                    border: `1px solid ${copiedWhatsApp ? '#A7F3D0' : '#CBD5E1'}`,
                                    backgroundColor: copiedWhatsApp ? '#ECFDF5' : 'white',
                                    color: copiedWhatsApp ? '#065F46' : '#334155',
                                    fontWeight: '800', cursor: 'pointer',
                                    fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {copiedWhatsApp ? <CheckCircle2 size={16} strokeWidth={2} color="#059669" /> : <MessageSquare size={16} strokeWidth={2} />}
                                {copiedWhatsApp ? '¡Copiado para WhatsApp!' : 'Copiar WhatsApp'}
                            </button>
                            <button
                                onClick={printManifestViaNewWindow}
                                style={{
                                    flex: 1, padding: '1rem', borderRadius: '14px', border: '1px solid #0EA5E9',
                                    backgroundColor: '#EFF6FF', color: '#0284C7', fontWeight: '800', cursor: 'pointer',
                                    fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <Printer size={16} strokeWidth={2} /> Imprimir Plan
                            </button>
                            <button
                                onClick={() => setConfirmedManifest(null)}
                                style={{
                                    flex: 1.2, padding: '1rem', borderRadius: '14px', border: 'none',
                                    backgroundColor: '#10B981', color: 'white', fontWeight: '900', cursor: 'pointer',
                                    fontSize: '0.9rem', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)',
                                    transition: 'all 0.2s'
                                }}
                            >
                                Finalizar
                            </button>
                        </div>
                        {popupBlockedWarning && (
                            <div style={{
                                marginTop: '0.5rem',
                                padding: '0.45rem 0.75rem',
                                borderRadius: '8px',
                                backgroundColor: '#FEE2E2',
                                border: '1px solid #FCA5A5',
                                color: '#991B1B',
                                fontSize: '0.74rem',
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}>
                                <AlertTriangle size={14} />
                                Por favor habilita las ventanas emergentes (popups) en tu navegador para imprimir.
                            </div>
                        )}
                    </div>
                </div>
            )}
            <RouteSpaghettiMapModal
                isOpen={spaghettiOpen}
                onClose={() => {
                    setSpaghettiOpen(false);
                    setSpaghettiVehicleId(null);
                }}
                vehicles={vehicles}
                orders={orders}
                assignments={assignments}
                routePolylines={routePolylines}
                routeMetrics={routeMetrics}
                stopLegMetrics={stopLegMetrics}
                stopEtas={stopEtas}
                trafficMode={trafficMode}
                initialVehicleId={spaghettiVehicleId}
            />
            </div>
            <style>{`
                @media print {
                    body * {
                        visibility: hidden;
                    }
                    .print-area, .print-area * {
                        visibility: visible;
                    }
                    .print-area {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                    }
                }
            `}</style>
        </>
    );
}

function OptimizingModal() {
    const [elapsed, setElapsed] = useState(0);
    useEffect(() => {
        const timer = setInterval(() => setElapsed(prev => prev + 1), 1000);
        return () => clearInterval(timer);
    }, []);
    const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const secs = (elapsed % 60).toString().padStart(2, '0');

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(8px)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontFamily: 'Inter, system-ui, sans-serif'
        }}>
            <div style={{
                backgroundColor: 'rgba(30, 41, 59, 0.95)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '3rem',
                borderRadius: '24px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                textAlign: 'center',
                maxWidth: '450px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1.5rem'
            }}>
                <div style={{ position: 'relative', width: '80px', height: '80px' }}>
                    <div style={{
                        width: '100%',
                        height: '100%',
                        borderRadius: '50%',
                        border: '4px solid rgba(99, 102, 241, 0.15)',
                        borderTop: '4px solid #6366F1',
                        animation: 'spin 1s linear infinite'
                    }} />
                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        animation: 'pulse 1.5s ease-in-out infinite'
                    }}>
                        <Bot size={34} style={{ color: '#818CF8' }} />
                    </div>
                </div>
                <div>
                    <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', fontWeight: '800', background: 'linear-gradient(135deg, #A5B4FC, #818CF8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        Inteligencia Artificial & Google Engine
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: '#94A3B8', lineHeight: '1.4' }}>
                        Calculando el plan de distribución óptimo...<br/>
                        <span style={{ fontSize: '1.1rem', fontWeight: '700', color: '#fff' }}>{mins}:{secs}</span>
                    </p>
                </div>
            </div>
        </div>
    );
}
