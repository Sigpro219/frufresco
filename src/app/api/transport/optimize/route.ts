import { NextResponse } from 'next/server';
import { z } from 'zod';

export const maxDuration = 60;
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
    executeWithObsolescenceGuard,
    PRIMARY_AI_MODEL,
    CANONICAL_MODEL_CASCADE,
    getGeminiApiKey,
} from '@/lib/ai/aiModelConfig';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { verifySessionAndPermission } from '@/lib/auth';
import { isSandboxMode, areSandboxExternalApisAllowed } from '@/lib/sandboxGuard';

const OptimizeRequestSchema = z.object({
    orders: z.array(z.any()).min(1, 'Se requiere al menos un pedido para optimizar rutas'),
    vehicles: z.array(z.any()).min(1, 'Se requiere al menos un vehículo en la flota'),
    parameters: z.record(z.string(), z.any()).optional(),
    priorityOrderIds: z.array(z.string()).optional().default([])
});

const sanitize = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '');
const supabaseUrl = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseServiceKey = sanitize(process.env.SUPABASE_SERVICE_ROLE_KEY);

// Module-level token cache for GCP OAuth2 (valid for ~55 mins)
let cachedOAuthToken: { token: string; expiresAt: number; projectId: string } | null = null;

// This API serves as a proxy and data-transformer for the Google Maps Route Optimization API
export async function POST(request: Request) {
    const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
    try {
        // Validate session and permission
        const auth = await verifySessionAndPermission(request, 'admin.transport.edit');
        if (!auth.authorized) {
            return NextResponse.json({
                error: auth.error || 'Unauthorized',
                requestId
            }, { status: 401, headers: { 'x-request-id': requestId } });
        }

        const rawBody = await request.json().catch(() => null);
        const parsed = OptimizeRequestSchema.safeParse(rawBody);

        if (!parsed.success) {
            return NextResponse.json({
                error: 'Payload de optimización inválido',
                details: parsed.error.issues.map(i => ({ field: i.path.join('.'), issue: i.message })),
                requestId
            }, { status: 400, headers: { 'x-request-id': requestId } });
        }

        const { orders, vehicles, parameters, priorityOrderIds = [] } = parsed.data;

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // 1. Fetch Logistic Parameters from DB if not provided
        let b2b_kg_min = parameters?.b2b_kg_min || 10;
        let b2c_kg_min = parameters?.b2c_kg_min || 5;
        let base_setup = parameters?.base_setup_time || 4;
        let time_unload = parameters?.time_per_10_crates_unload || 4;
        let time_delivery = parameters?.time_per_10_crates_delivery || 10;
        let fleet_start = parameters?.fleet_start_time || '04:30';
        let fleet_end = parameters?.fleet_end_time || '19:00';
        let optimization_strategy = parameters?.optimization_strategy || 'balanced';
        let avg_kg_per_crate = parameters?.avg_kg_per_crate || 12.5;
        let driver_break_mins = parameters?.driver_break_mins || 45;

        const { data: dbParams } = await supabase.from('logistic_parameters').select('*');
        if (dbParams) {
            b2b_kg_min = parseFloat(dbParams.find(p => p.id === 'b2b_kg_min')?.value || String(b2b_kg_min));
            b2c_kg_min = parseFloat(dbParams.find(p => p.id === 'b2c_kg_min')?.value || String(b2c_kg_min));
            base_setup = parseFloat(dbParams.find(p => p.id === 'base_setup_time')?.value || String(base_setup));
            time_unload = parseFloat(dbParams.find(p => p.id === 'time_per_10_crates_unload')?.value || String(time_unload));
            time_delivery = parseFloat(dbParams.find(p => p.id === 'time_per_10_crates_delivery')?.value || String(time_delivery));
            fleet_start = dbParams.find(p => p.id === 'fleet_start_time')?.value || fleet_start;
            fleet_end = dbParams.find(p => p.id === 'fleet_end_time')?.value || fleet_end;
            optimization_strategy = dbParams.find(p => p.id === 'optimization_strategy')?.value || optimization_strategy;
            avg_kg_per_crate = parseFloat(dbParams.find(p => p.id === 'avg_kg_per_crate')?.value || String(avg_kg_per_crate));
            driver_break_mins = parseFloat(dbParams.find(p => p.id === 'driver_break_mins')?.value || String(driver_break_mins));
        }

        let vehicleFixedCost = 500; // default balanced
        if (optimization_strategy === 'minimize_vehicles') {
            vehicleFixedCost = 100000;
        } else if (optimization_strategy === 'minimize_time') {
            vehicleFixedCost = 0;
        }

        // Helper to compare HH:MM times
        const parseTimeStr = (t: string) => {
            const [h, m] = t.split(':').map(Number);
            return h * 60 + m;
        };

        // 2. Map to Google OptimizeTours Request Schema
        // Ref: https://developers.google.com/maps/documentation/route-optimization/reference/rest/v1/projects.locations/optimizeTours
        
        const targetDate = orders[0]?.delivery_date ? orders[0].delivery_date.split('T')[0] : new Date().toISOString().split('T')[0];

        const getOrderTimeWindow = (o: any, datePart: string) => {
            const isB2B = !!o.is_b2b || (o.type?.toLowerCase().includes('b2b') ?? false) || o.profiles?.role === 'b2b_client' || o.profiles?.role === 'b2b';

            let startLocal = fleet_start;
            let endLocal = fleet_end;

            if (o.is_manual_delivery && o.manual_delivery_time) {
                const margin = Number(o.manual_delivery_margin) || 60;
                const [mh, mm] = String(o.manual_delivery_time).split(':').map(Number);
                if (!isNaN(mh) && !isNaN(mm)) {
                    const pad = (n: number) => n.toString().padStart(2, '0');
                    const sM = Math.max(0, mh * 60 + mm - margin);
                    const eM = Math.min(1439, mh * 60 + mm + margin);
                    startLocal = `${pad(Math.floor(sM / 60))}:${pad(sM % 60)}`;
                    endLocal = `${pad(Math.floor(eM / 60))}:${pad(eM % 60)}`;
                }
            } else if (isB2B) {
                // Scenario 1: Manual Override (takes precedence for B2B)
                if (o.is_manual_delivery && o.logistics_data?.windows?.[0]) {
                    startLocal = o.logistics_data.windows[0].startTime || o.logistics_data.windows[0].start || startLocal;
                    endLocal = o.logistics_data.windows[0].endTime || o.logistics_data.windows[0].end || endLocal;
                } 
                // Scenario 2: Client Profile Default
                else if (o.profiles?.logistics_data?.windows?.[0]) {
                    startLocal = o.profiles.logistics_data.windows[0].startTime || o.profiles.logistics_data.windows[0].start || startLocal;
                    endLocal = o.profiles.logistics_data.windows[0].endTime || o.profiles.logistics_data.windows[0].end || endLocal;
                }
            }

            const minFleetMins = parseTimeStr(fleet_start);
            const maxFleetMins = parseTimeStr(fleet_end);

            let sMins = parseTimeStr(startLocal);
            let eMins = parseTimeStr(endLocal);

            if (isNaN(sMins) || isNaN(eMins) || sMins >= eMins) {
                sMins = minFleetMins;
                eMins = maxFleetMins;
            } else {
                // Strictly clamp to fleet hours so time window is always served during driver shift
                sMins = Math.max(minFleetMins, Math.min(sMins, maxFleetMins - 30));
                eMins = Math.min(maxFleetMins, Math.max(eMins, sMins + 30));
            }

            const sH = Math.floor(sMins / 60).toString().padStart(2, '0');
            const sM = (sMins % 60).toString().padStart(2, '0');
            const eH = Math.floor(eMins / 60).toString().padStart(2, '0');
            const eM = (eMins % 60).toString().padStart(2, '0');

            try {
                const startTime = new Date(`${datePart}T${sH}:${sM}:00-05:00`).toISOString();
                const endTime = new Date(`${datePart}T${eH}:${eM}:00-05:00`).toISOString();
                return { startTime, endTime };
            } catch (err) {
                return {
                    startTime: new Date(`${datePart}T${fleet_start}:00-05:00`).toISOString(),
                    endTime: new Date(`${datePart}T${fleet_end}:00-05:00`).toISOString()
                };
            }
        };

        // Check refrigerated orders (for the cold chain ADN)
        const orderIds = orders.map((o: any) => o.id);
        const { data: orderItems } = await supabase
            .from('order_items')
            .select(`
                order_id,
                products (
                    buying_team
                )
            `)
            .in('order_id', orderIds);

        const refrigeratedOrderIds = new Set(
            (orderItems || [])
                .filter((item: any) => {
                    const product = Array.isArray(item.products) ? item.products[0] : item.products;
                    return product?.buying_team?.toUpperCase().includes('REFRIGERADOS');
                })
                .map((item: any) => item.order_id)
        );

        // Helper to compute vehicle break schedule (mid-shift window)
        const getVehicleBreakRule = (datePart: string, fleetStart: string, breakMins: number) => {
            if (breakMins <= 0) return undefined;
            const [h, m] = fleetStart.split(':').map(Number);
            
            // Earliest break window is 4 hours after start
            let eh = h + 4;
            let em = m;
            if (eh >= 24) { eh = 23; em = 59; }
            const earliestTimeStr = `${eh.toString().padStart(2, '0')}:${em.toString().padStart(2, '0')}`;
            
            // Latest break window is 6 hours after start
            let lh = h + 6;
            let lm = m;
            if (lh >= 24) { lh = 23; lm = 59; }
            const latestTimeStr = `${lh.toString().padStart(2, '0')}:${lm.toString().padStart(2, '0')}`;
            
            try {
                return {
                    breakRequests: [
                        {
                            earliestStartTime: new Date(`${datePart}T${earliestTimeStr}:00-05:00`).toISOString(),
                            latestStartTime: new Date(`${datePart}T${latestTimeStr}:00-05:00`).toISOString(),
                            minDuration: `${breakMins * 60}s`
                        }
                    ]
                };
            } catch (err) {
                console.error("Error creating break rule:", err);
                return undefined;
            }
        };

        // Check if fleet actually has certified refrigerated vehicles
        const hasRefrigeratedFleet = vehicles.some((v: any) => v.is_refrigerated === true || v.refrigerated === true);

        // --- CONSOLIDACIÓN EN 2 FASES (Goldfish Escenario 477 §1.8) ---
        // Fase 1: Co-asignación atómica de parejas 10A/10B (is_off_agreement_split) en RoutingUnits
        const splitChildrenByParent = new Map<string, any[]>();
        const splitChildIds = new Set<string>();
        const orderByIdMap = new Map<string, any>(orders.map((o: any) => [String(o.id), o]));
        orders.forEach((o: any) => {
            const pId = o?.logistics_data?.is_off_agreement_split ? o?.logistics_data?.parent_order_id : null;
            if (pId && orderByIdMap.has(String(pId))) {
                splitChildIds.add(String(o.id));
                const list = splitChildrenByParent.get(String(pId)) || [];
                list.push(o);
                splitChildrenByParent.set(String(pId), list);
            }
        });

        const rawPrioritySet = new Set<string>(priorityOrderIds.map((id: string) => String(id)));
        const geocodingWarnings: Array<{ orderId: string; customerName: string; reason: string }> = [];

        const normalizeTextKey = (val?: string | null) =>
            String(val || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase()
                .replace(/\s+/g, ' ')
                .trim();

        const computeOrderCrates = (o: any) => {
            const w = Math.max(1, Math.ceil(parseFloat(o.total_weight_kg) || 1));
            return Number(o.crates) || Math.max(1, Math.ceil(w / avg_kg_per_crate));
        };

        interface RoutingUnit {
            leaderId: string;
            memberOrders: any[];
            memberOrderIds: string[];
            weightKg: number;
            crates: number;
            isRefrigerated: boolean;
            isPriority: boolean;
            isB2B: boolean;
            isCashOnDelivery: boolean;
            startMs: number;
            endMs: number;
            timeWindow: { startTime: string; endTime: string };
            lat: number;
            lng: number;
            siteKey: string;
        }

        const routingUnits: RoutingUnit[] = orders
            .filter((o: any) => !splitChildIds.has(String(o.id)))
            .map((parent: any) => {
                const children = splitChildrenByParent.get(String(parent.id)) || [];
                const memberOrders = [parent, ...children];
                const memberOrderIds = memberOrders.map(m => String(m.id));

                const rawSumKg = memberOrders.reduce((acc, m) => {
                    const w = parseFloat(m.total_weight_kg);
                    return acc + (isNaN(w) || w <= 0 ? 1 : w);
                }, 0);
                const weightKg = Math.max(1, Math.ceil(rawSumKg));
                const crates = memberOrders.reduce((acc, m) => acc + computeOrderCrates(m), 0);

                const isRefrigerated = memberOrders.some(m => refrigeratedOrderIds.has(m.id));
                const isPriority = memberOrders.some(m => rawPrioritySet.has(String(m.id)));
                const isB2B = memberOrders.some(m =>
                    !!m.is_b2b || (m.type?.toLowerCase().includes('b2b') ?? false) || m.profiles?.role === 'b2b_client' || m.profiles?.role === 'b2b'
                );
                const isCashOnDelivery = memberOrders.some(m =>
                    m.payment_method === 'cash_on_delivery' || m.payment_type === 'cash_on_delivery' || m.payment_method === 'contraentrega'
                );

                // Intersect split member windows if valid, else fallback to parent window so 10A+10B never split
                const parentWin = getOrderTimeWindow(parent, targetDate);
                let interStartMs = new Date(parentWin.startTime).getTime();
                let interEndMs = new Date(parentWin.endTime).getTime();
                for (const child of children) {
                    const cw = getOrderTimeWindow(child, targetDate);
                    const cs = new Date(cw.startTime).getTime();
                    const ce = new Date(cw.endTime).getTime();
                    if (Math.max(interStartMs, cs) < Math.min(interEndMs, ce)) {
                        interStartMs = Math.max(interStartMs, cs);
                        interEndMs = Math.min(interEndMs, ce);
                    }
                }
                const unitWindow = {
                    startTime: new Date(interStartMs).toISOString(),
                    endTime: new Date(interEndMs).toISOString()
                };

                // Poka-Yoke coordinates (Bogotá, Sabana & Melgar/Girardot box) + warnings per real orderId
                let rawLat = parseFloat(parent.latitude || parent.profiles?.latitude);
                let rawLng = parseFloat(parent.longitude || parent.profiles?.longitude);
                const hasValidCoords = !(isNaN(rawLat) || isNaN(rawLng) || rawLat === 0 || rawLng === 0 || rawLat < 3.5 || rawLat > 6.0 || rawLng < -75.5 || rawLng > -73.0);

                if (!hasValidCoords) {
                    memberOrders.forEach(m => {
                        geocodingWarnings.push({
                            orderId: String(m.id),
                            customerName: m.customer_name || m.profiles?.full_name || 'Cliente',
                            reason: 'Coordenadas GPS ausentes o fuera de Bogotá/Sabana; asignado temporalmente a bodega central'
                        });
                    });
                    rawLat = 4.633653;
                    rawLng = -74.160647;
                }

                // Strict composite siteKey (never group unrelated invalid-coords orders at Bodega Central)
                const dateKey = String(parent.delivery_date || targetDate).split('T')[0];
                const rawAddrNorm = normalizeTextKey(parent.shipping_address || parent.address);
                const normAddr = rawAddrNorm === 'sin direccion' ? '' : rawAddrNorm;
                const normName = normalizeTextKey(parent.customer_name || parent.profiles?.company_name || parent.profiles?.contact_name);

                let siteKey = `order:${parent.id}`;
                if (hasValidCoords) {
                    const clientPart = parent.profile_id ? String(parent.profile_id) : (normName ? `name:${normName}` : `order:${parent.id}`);
                    siteKey = `${dateKey}|${clientPart}|${rawLat.toFixed(4)},${rawLng.toFixed(4)}|${normAddr}`;
                } else if (parent.profile_id && normAddr) {
                    siteKey = `${dateKey}|${parent.profile_id}|nogps|${normAddr}`;
                }

                return {
                    leaderId: String(parent.id),
                    memberOrders,
                    memberOrderIds,
                    weightKg,
                    crates,
                    isRefrigerated,
                    isPriority,
                    isB2B,
                    isCashOnDelivery,
                    startMs: interStartMs,
                    endMs: interEndMs,
                    timeWindow: unitWindow,
                    lat: rawLat,
                    lng: rawLng,
                    siteKey
                };
            });

        // Fase 2: Consolidación Same-Site Co-Routing con FFD, intersección horaria estricta y límites de cadena de frío
        const maxFleetWeight = vehicles.reduce((m: number, v: any) => Math.max(m, Number(v.capacity_kg) || 0), 0) || 1500;
        const maxFleetCrates = vehicles.reduce((m: number, v: any) => Math.max(m, Number(v.max_crates_capacity) || 483), 0) || 483;
        const refrigVehicles = vehicles.filter((v: any) => v.is_refrigerated === true || v.refrigerated === true);
        const maxRefrigWeight = refrigVehicles.reduce((m: number, v: any) => Math.max(m, Number(v.capacity_kg) || 0), 0);
        const maxRefrigCrates = refrigVehicles.reduce((m: number, v: any) => Math.max(m, Number(v.max_crates_capacity) || 483), 0);

        interface ConsolidatedCluster {
            clusterId: string;
            memberOrderIds: string[];
            weightKg: number;
            crates: number;
            isRefrigerated: boolean;
            isPriority: boolean;
            isB2B: boolean;
            isCashOnDelivery: boolean;
            startMs: number;
            endMs: number;
            timeWindow: { startTime: string; endTime: string };
            lat: number;
            lng: number;
        }

        const unitsBySite = new Map<string, RoutingUnit[]>();
        routingUnits.forEach(u => {
            const list = unitsBySite.get(u.siteKey) || [];
            list.push(u);
            unitsBySite.set(u.siteKey, list);
        });

        const consolidatedClusters: ConsolidatedCluster[] = [];
        const clusterById = new Map<string, ConsolidatedCluster>();

        unitsBySite.forEach(siteUnits => {
            // FFD: refrigerated units first, then heaviest weight first
            const sortedUnits = [...siteUnits].sort((a, b) => {
                if (a.isRefrigerated !== b.isRefrigerated) return a.isRefrigerated ? -1 : 1;
                return b.weightKg - a.weightKg;
            });

            const siteBatches: ConsolidatedCluster[] = [];
            for (const u of sortedUnits) {
                let placed = false;
                for (const batch of siteBatches) {
                    const interStart = Math.max(batch.startMs, u.startMs);
                    const interEnd = Math.min(batch.endMs, u.endMs);
                    if (!(interStart < interEnd)) continue;

                    const combinedRefrig = batch.isRefrigerated || u.isRefrigerated;
                    const capWeight = (hasRefrigeratedFleet && combinedRefrig) ? maxRefrigWeight : maxFleetWeight;
                    const capCrates = (hasRefrigeratedFleet && combinedRefrig) ? maxRefrigCrates : maxFleetCrates;

                    if (batch.weightKg + u.weightKg <= capWeight && batch.crates + u.crates <= capCrates) {
                        batch.memberOrderIds.push(...u.memberOrderIds);
                        batch.weightKg += u.weightKg;
                        batch.crates += u.crates;
                        batch.isRefrigerated = combinedRefrig;
                        batch.isPriority = batch.isPriority || u.isPriority;
                        batch.isB2B = batch.isB2B || u.isB2B;
                        batch.isCashOnDelivery = batch.isCashOnDelivery || u.isCashOnDelivery;
                        batch.startMs = interStart;
                        batch.endMs = interEnd;
                        batch.timeWindow = {
                            startTime: new Date(interStart).toISOString(),
                            endTime: new Date(interEnd).toISOString()
                        };
                        placed = true;
                        break;
                    }
                }
                if (!placed) {
                    const batchIdx = siteBatches.length;
                    const clusterId = (sortedUnits.length === 1 && u.memberOrderIds.length === 1)
                        ? u.leaderId
                        : `site::${u.leaderId}::${batchIdx}`;
                    siteBatches.push({
                        clusterId,
                        memberOrderIds: [...u.memberOrderIds],
                        weightKg: u.weightKg,
                        crates: u.crates,
                        isRefrigerated: u.isRefrigerated,
                        isPriority: u.isPriority,
                        isB2B: u.isB2B,
                        isCashOnDelivery: u.isCashOnDelivery,
                        startMs: u.startMs,
                        endMs: u.endMs,
                        timeWindow: { ...u.timeWindow },
                        lat: u.lat,
                        lng: u.lng
                    });
                }
            }
            for (const b of siteBatches) {
                consolidatedClusters.push(b);
                clusterById.set(b.clusterId, b);
            }
        });

        const hasPriorityOrders = consolidatedClusters.some(c => c.isPriority);

        // Expansión hermética: devuelve únicamente orderIds reales en routes y stop_etas
        const expandClusterAssignments = (rawAssign: Record<string, string[]>, rawEtas: Record<string, string>) => {
            const expandedAssignments: Record<string, string[]> = {};
            const expandedStopEtas: Record<string, string> = {};
            Object.entries(rawAssign).forEach(([vid, clusterIds]) => {
                const expanded: string[] = [];
                clusterIds.forEach(cid => {
                    const cluster = clusterById.get(String(cid));
                    const memberIds = cluster ? cluster.memberOrderIds : [String(cid)];
                    const etaVal = rawEtas[cid];
                    memberIds.forEach(realId => {
                        expanded.push(realId);
                        if (etaVal) expandedStopEtas[realId] = etaVal;
                    });
                });
                expandedAssignments[vid] = expanded;
            });
            return { expandedAssignments, expandedStopEtas };
        };

        const gcpRequest = {
            timeout: "15s",
            model: {
                globalStartTime: new Date(`${targetDate}T00:00:00-05:00`).toISOString(),
                globalEndTime: new Date(`${targetDate}T23:59:59-05:00`).toISOString(),
                shipments: consolidatedClusters.map((cluster) => {
                    const cashDwellDelta = cluster.isCashOnDelivery ? 5 : 0;
                    const rawUnloading = Math.ceil(base_setup + ((time_unload + time_delivery) / 10) * cluster.crates) + cashDwellDelta;
                    const unloadingTime = Math.max(5, Math.min(isNaN(rawUnloading) ? 15 : rawUnloading, 60));

                    let shipmentTimeWindow: Record<string, any> = cluster.timeWindow;
                    if (cluster.isPriority) {
                        const startMs = cluster.startMs;
                        const endMs = cluster.endMs;
                        const fleetStartMs = new Date(`${targetDate}T${fleet_start}:00-05:00`).getTime();
                        const targetSoftMs = Math.min(
                            endMs,
                            Math.max(
                                startMs,
                                Math.min(
                                    fleetStartMs + 180 * 60000,
                                    startMs + Math.round((endMs - startMs) * 0.35)
                                )
                            )
                        );
                        if (Number.isFinite(startMs) && Number.isFinite(endMs) && targetSoftMs >= startMs && targetSoftMs < endMs) {
                            shipmentTimeWindow = {
                                ...cluster.timeWindow,
                                softEndTime: new Date(targetSoftMs).toISOString(),
                                costPerHourAfterSoftEndTime: 250
                            };
                        }
                    }

                    const demands: Record<string, { amount: string }> = {
                        "weight": { "amount": String(cluster.weightKg) },
                        "crates": { "amount": String(cluster.crates) }
                    };
                    if (hasRefrigeratedFleet) {
                        demands["refrigerated"] = { "amount": cluster.isRefrigerated ? "1" : "0" };
                    }
                    if (cluster.isPriority) {
                        demands["priority_slots"] = { "amount": "1" };
                    }

                    return {
                        deliveries: [
                            { 
                                arrivalLocation: { 
                                    latitude: cluster.lat, 
                                    longitude: cluster.lng 
                                },
                                timeWindows: [shipmentTimeWindow],
                                duration: `${unloadingTime * 60}s`
                            }
                        ],
                        loadDemands: demands,
                        penaltyCost: cluster.isPriority ? 2000000 : (cluster.isB2B ? 500000 : 1000),
                        label: cluster.clusterId
                    };
                }),
                vehicles: vehicles.map((v: any) => {
                    // Suppress mandatory pause on morning sprint routes (< 4h) to avoid dropping restaurant breakfast windows
                    const shiftDurationMins = parseTimeStr(fleet_end) - parseTimeStr(fleet_start);
                    const effectiveBreakMins = shiftDurationMins < 240 ? 0 : driver_break_mins;
                    const breakRule = getVehicleBreakRule(targetDate, fleet_start, effectiveBreakMins);

                    const limits: Record<string, { maxLoad?: string; softMaxLoad?: string; costPerUnitAboveSoftMax?: number }> = {
                        "weight": { "maxLoad": String(v.capacity_kg) },
                        "crates": { "maxLoad": String(v.max_crates_capacity || 483) }
                    };
                    if (hasRefrigeratedFleet) {
                        limits["refrigerated"] = { "maxLoad": v.is_refrigerated ? String(v.max_crates_capacity || 483) : "0" };
                    }
                    if (hasPriorityOrders) {
                        const prioritySoftCost = vehicleFixedCost > 0
                            ? Math.min(50000, Math.max(800, Math.round(vehicleFixedCost * 0.4)))
                            : 1500;
                        limits["priority_slots"] = {
                            softMaxLoad: "1",
                            costPerUnitAboveSoftMax: prioritySoftCost
                        };
                    }

                    const vehicleObj: any = {
                        startLocation: { latitude: 4.633653, longitude: -74.160647 },
                        endLocation: { latitude: 4.633653, longitude: -74.160647 },
                        loadLimits: limits,
                        fixedCost: vehicleFixedCost,
                        startTimeWindows: [
                            {
                                startTime: new Date(`${targetDate}T${fleet_start}:00-05:00`).toISOString(),
                                endTime: new Date(`${targetDate}T${fleet_end}:00-05:00`).toISOString()
                            }
                        ],
                        endTimeWindows: [
                            {
                                startTime: new Date(`${targetDate}T${fleet_start}:00-05:00`).toISOString(),
                                endTime: new Date(`${targetDate}T${fleet_end}:00-05:00`).toISOString()
                            }
                        ],
                        displayName: v.plate,
                        label: v.id
                    };

                    if (breakRule) {
                        vehicleObj.breakRule = breakRule;
                    }

                    return vehicleObj;
                })
            },
            // Standard fast heuristic mode (<5s) to avoid Vercel serverless function timeouts
            considerRoadTraffic: true
        };

        // 3. Real Integration Check
        const allowExternalGcp = !isSandboxMode() || areSandboxExternalApisAllowed();
        const gcpProjectId = allowExternalGcp ? process.env.GCP_PROJECT_ID : undefined;
        const gcpApiKey = allowExternalGcp ? process.env.GCP_OPTIMIZATION_KEY : undefined;

        let serviceAccountData: any = null;
        if (allowExternalGcp && process.env.GCP_SERVICE_ACCOUNT_KEY) {
            try {
                const rawKey = process.env.GCP_SERVICE_ACCOUNT_KEY.trim();
                if (rawKey.startsWith('{')) {
                    serviceAccountData = JSON.parse(rawKey);
                } else {
                    const decoded = Buffer.from(rawKey, 'base64').toString('utf8');
                    serviceAccountData = JSON.parse(decoded);
                }
            } catch (envErr) {
                console.error("Error parsing GCP_SERVICE_ACCOUNT_KEY environment variable:", envErr);
            }
        }

        if (allowExternalGcp && !serviceAccountData) {
            const serviceAccountPath = path.join(process.cwd(), 'gcp-service-account.json');
            try {
                if (fs.existsSync(serviceAccountPath)) {
                    serviceAccountData = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
                }
            } catch (_) {}
        }

        const hasServiceAccount = allowExternalGcp && !!serviceAccountData;

        if (allowExternalGcp && (hasServiceAccount || (gcpProjectId && gcpApiKey))) {
            let accessToken: string | null = null;
            let projectId = gcpProjectId || serviceAccountData?.project_id || 'frufresco';

            // Check if we have a valid cached OAuth2 token
            if (cachedOAuthToken && cachedOAuthToken.expiresAt > Date.now() + 60000) {
                accessToken = cachedOAuthToken.token;
                projectId = cachedOAuthToken.projectId;
                console.log("[Optimizer] Reusing cached GCP OAuth2 token (expires in", Math.round((cachedOAuthToken.expiresAt - Date.now()) / 1000), "s)");
            } else if (hasServiceAccount && serviceAccountData) {
                try {
                    console.log("[Optimizer] Generating fresh GCP OAuth2 token via Service Account credentials...");
                    const keyData = serviceAccountData;
                    projectId = keyData.project_id || projectId;
                    
                    // Generate OAuth2 token using service account
                    const header = { alg: 'RS256', typ: 'JWT' };
                    const iat = Math.floor(Date.now() / 1000);
                    const exp = iat + 3600;
                    const claimSet = {
                        iss: keyData.client_email,
                        scope: 'https://www.googleapis.com/auth/cloud-platform',
                        aud: 'https://oauth2.googleapis.com/token',
                        exp: exp,
                        iat: iat
                    };

                    const encodeBase64Url = (obj: any) => {
                        return Buffer.from(JSON.stringify(obj))
                            .toString('base64')
                            .replace(/=/g, '')
                            .replace(/\+/g, '-')
                            .replace(/\//g, '_');
                    };

                    const signatureInput = `${encodeBase64Url(header)}.${encodeBase64Url(claimSet)}`;
                    const sign = crypto.createSign('RSA-SHA256');
                    sign.update(signatureInput);
                    const signature = sign.sign(keyData.private_key, 'base64')
                        .replace(/=/g, '')
                        .replace(/\+/g, '-')
                        .replace(/\//g, '_');

                    const jwtToken = `${signatureInput}.${signature}`;

                    const tokenController = new AbortController();
                    const tokenTimeout = setTimeout(() => tokenController.abort(), 5000);
                    let tokenResponse;
                    try {
                        tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                            body: new URLSearchParams({
                                grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                                assertion: jwtToken
                            }),
                            signal: tokenController.signal
                        });
                    } finally {
                        clearTimeout(tokenTimeout);
                    }

                    if (!tokenResponse.ok) {
                        const err = await tokenResponse.text();
                        console.error("GCP OAuth exchange error:", err);
                        throw new Error(`Google OAuth error: ${err}`);
                    }

                    const tokenData = await tokenResponse.json();
                    accessToken = tokenData.access_token;
                    
                    // Cache token for 55 minutes
                    cachedOAuthToken = {
                        token: tokenData.access_token,
                        expiresAt: Date.now() + 3300 * 1000,
                        projectId: projectId
                    };
                    console.log("[Optimizer] Fresh OAuth2 token generated and cached successfully!");
                } catch (oauthErr: any) {
                    console.error("OAuth token generation failed, falling back to API Key if configured:", oauthErr);
                }
            }

            console.log(`[Optimizer] Calling real Google Cloud Optimization API for Project: ${projectId}`);
            
            // Build target URL
            const url = `https://routeoptimization.googleapis.com/v1/projects/${projectId}:optimizeTours` + (accessToken ? '' : `?key=${gcpApiKey}`);
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (accessToken) {
                headers['Authorization'] = `Bearer ${accessToken}`;
            }

            const gcpController = new AbortController();
            const gcpTimeout = setTimeout(() => gcpController.abort(), 18000);
            let gcpResponse: Response | null = null;
            let gcpFetchError: any = null;

            try {
                gcpResponse = await fetch(url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(gcpRequest),
                    signal: gcpController.signal
                });
            } catch (fetchErr: any) {
                gcpFetchError = fetchErr;
                console.warn(`[Optimizer] GCP RouteOptimization fetch failed (${fetchErr.name === 'AbortError' ? 'Timeout 8s' : fetchErr.message}). Falling back to internal simulation heuristic. RequestId: ${requestId}`);
            } finally {
                clearTimeout(gcpTimeout);
            }

            if (gcpResponse && gcpResponse.ok) {
                const gcpData = await gcpResponse.json();
                
                // Transform Google's assigned routes back to assignments map { vehicleId: [orderIds] }
                const assignments: Record<string, string[]> = {};
                const routeStartTimes: Record<string, string> = {};
                const stopEtas: Record<string, string> = {};
                vehicles.forEach((v: any) => {
                    assignments[v.id] = [];
                    routeStartTimes[v.id] = fleet_start || '04:30';
                });

                if (gcpData.routes) {
                    gcpData.routes.forEach((route: any) => {
                        const vehicleId = route.vehicleLabel; // We set this as v.id in gcpRequest
                        if (vehicleId && assignments[vehicleId]) {
                            // Extract order IDs from shipments in the route (only delivery visits, excluding pickups)
                            const visitOrderIds = (route.visits || [])
                                .filter((vst: any) => !vst.isPickup)
                                .map((vst: any) => {
                                    // Google omits shipmentIndex if it is 0. Using shipmentLabel (clusterId) is safer and direct.
                                    const clusterId = vst.shipmentLabel || consolidatedClusters[vst.shipmentIndex ?? 0]?.clusterId;
                                    if (clusterId && vst.startTime) {
                                        try {
                                            const dateObj = new Date(vst.startTime);
                                            const bogotaDate = new Date(dateObj.toLocaleString('en-US', { timeZone: 'America/Bogota' }));
                                            const h = bogotaDate.getHours().toString().padStart(2, '0');
                                            const m = bogotaDate.getMinutes().toString().padStart(2, '0');
                                            stopEtas[clusterId] = `${h}:${m}`;
                                        } catch (_) {}
                                    }
                                    return clusterId;
                                })
                                .filter(Boolean);
                            
                            assignments[vehicleId] = visitOrderIds;

                            // Extract Google's calculated vehicle departure time
                            if (route.vehicleStartTime) {
                                try {
                                    const dateObj = new Date(route.vehicleStartTime);
                                    const bogotaDate = new Date(dateObj.toLocaleString('en-US', { timeZone: 'America/Bogota' }));
                                    const h = bogotaDate.getHours().toString().padStart(2, '0');
                                    const m = bogotaDate.getMinutes().toString().padStart(2, '0');
                                    routeStartTimes[vehicleId] = `${h}:${m}`;
                                } catch (_) {}
                            } else if (visitOrderIds.length > 0) {
                                // If vehicleStartTime is omitted, infer from first stop ETA minus 45 mins travel
                                const firstClusterId = visitOrderIds[0];
                                const firstEta = stopEtas[firstClusterId];
                                if (firstEta) {
                                    const [eh, em] = firstEta.split(':').map(Number);
                                    let depMins = eh * 60 + em - 45;
                                    const minFleetMins = parseTimeStr(fleet_start);
                                    depMins = Math.max(minFleetMins, depMins);
                                    const dh = Math.floor(depMins / 60).toString().padStart(2, '0');
                                    const dm = (depMins % 60).toString().padStart(2, '0');
                                    routeStartTimes[vehicleId] = `${dh}:${dm}`;
                                }
                            }
                        }
                    });
                }

                // Extract and expand skipped shipments from Google Cloud Route Optimization response to real orderIds
                const skippedOrders = (gcpData.skippedShipments || []).flatMap((s: any) => {
                    const cId = s.label || (s.index !== undefined ? consolidatedClusters[s.index]?.clusterId : undefined);
                    const cluster = cId ? clusterById.get(String(cId)) : undefined;
                    const realIds = cluster ? cluster.memberOrderIds : (cId ? [String(cId)] : []);
                    return realIds.map(realId => ({
                        orderId: realId,
                        reasons: s.reasons || []
                    }));
                });

                // Expand consolidated clusters hermetically to real orderIds only
                const { expandedAssignments: finalAssignments, expandedStopEtas: finalStopEtas } = expandClusterAssignments(assignments, stopEtas);
                const assignedOrderIds = new Set(Object.values(finalAssignments).flat());
                const unassignedOrders = orders.filter(o => !assignedOrderIds.has(String(o.id)));
                const explanation = await generateAiExplanation(orders, vehicles, finalAssignments, unassignedOrders);

                return NextResponse.json({
                    message: "Optimization generated by REAL Google Engine",
                    routes: finalAssignments,
                    route_start_times: routeStartTimes,
                    stop_etas: finalStopEtas,
                    theoretical_metrics: (() => {
                        const rawDur = gcpData.metrics?.totalDuration;
                        const durSeconds = typeof rawDur === 'string'
                            ? (parseInt(rawDur.replace(/s$/i, ''), 10) || 0)
                            : (Number(rawDur?.seconds) || 0);
                        return {
                            distance_km: Math.round((gcpData.metrics?.totalDistanceMeters || 0) / 1000),
                            duration_min: Math.round(durSeconds / 60)
                        };
                    })(),
                    skipped_orders: skippedOrders,
                    geocoding_warnings: geocodingWarnings,
                    gcp_raw: gcpData,
                    simulation: false,
                    explanation: explanation
                }, { status: 200, headers: { 'x-request-id': requestId } });
            } else {
                const errText = gcpResponse ? await gcpResponse.text() : String(gcpFetchError?.message || 'Network / Timeout Error');
                console.warn(`[Optimizer] GCP RouteOptimization API non-OK response: ${errText}. RequestId: ${requestId}. Cascading to simulation fallback heuristic.`);
            }
        }
        
        // --- SIMULATION MODE --- (Fallback)
        // Consumes pre-consolidated clusters directly (same-site + 10A/10B + cold-chain + timeWindows)
        const { simulatedAssignments, simStartTimes, simEtas } = calculateSimulationAssignments(
            consolidatedClusters,
            vehicles,
            fleet_start,
            fleet_end,
            { hasRefrigeratedFleet }
        );
        const { expandedAssignments: finalSimAssignments, expandedStopEtas: finalSimEtas } = expandClusterAssignments(simulatedAssignments, simEtas);
        const assignedSimIds = new Set(Object.values(finalSimAssignments).flat());
        const unassignedSimOrders = orders.filter(o => !assignedSimIds.has(String(o.id)));
        const explanation = await generateAiExplanation(orders, vehicles, finalSimAssignments, unassignedSimOrders);

        const simSkippedOrders = unassignedSimOrders.map(o => ({
            orderId: String(o.id),
            reasons: [{ code: 'DEMAND_EXCEEDS_VEHICLE_CAPACITY' }]
        }));
        
        return NextResponse.json({
            message: "OptimizeTours Request Structured Successfully (Simulation Mode)",
            debug_request: gcpRequest,
            status: "ready_for_key",
            simulation: true,
            routes: finalSimAssignments,
            route_start_times: simStartTimes,
            stop_etas: finalSimEtas,
            theoretical_metrics: {
                distance_km: vehicles.length * 4,
                duration_min: vehicles.length * 20
            },
            skipped_orders: simSkippedOrders,
            geocoding_warnings: geocodingWarnings,
            explanation: explanation
        }, { status: 200, headers: { 'x-request-id': requestId } });

    } catch (error: any) {
        console.error('Optimizer API Error:', error);
        return NextResponse.json({
            type: 'https://frufresco.com/errors/optimizer-failure',
            title: 'Internal Server Error',
            status: 500,
            detail: error.message || 'Error interno al optimizar rutas',
            requestId
        }, { status: 500, headers: { 'x-request-id': requestId } });
    }
}


function calculateSimulationAssignments(
    clusters: Array<{
        clusterId: string;
        weightKg: number;
        crates: number;
        isRefrigerated: boolean;
        isPriority: boolean;
        timeWindow: { startTime: string; endTime: string };
    }>,
    vehicles: any[],
    fleetStart = '04:30',
    fleetEnd = '19:00',
    options?: {
        hasRefrigeratedFleet?: boolean;
    }
) {
    const newAssignments: Record<string, string[]> = {};
    const simStartTimes: Record<string, string> = {};
    const simEtas: Record<string, string> = {};
    const hasRefrigeratedFleet = Boolean(options?.hasRefrigeratedFleet);

    const usedWeight: Record<string, number> = {};
    const usedCrates: Record<string, number> = {};
    const usedPriorityCount: Record<string, number> = {};
    const clusterById = new Map(clusters.map(c => [c.clusterId, c]));

    vehicles.forEach(v => {
        newAssignments[v.id] = [];
        simStartTimes[v.id] = fleetStart;
        usedWeight[v.id] = 0;
        usedCrates[v.id] = 0;
        usedPriorityCount[v.id] = 0;
    });

    // Sort pre-consolidated clusters: priority first (earliest stops/ETAs), then weight descending
    const sortedClusters = [...clusters].sort((a, b) => {
        if (a.isPriority !== b.isPriority) return a.isPriority ? -1 : 1;
        return b.weightKg - a.weightKg;
    });

    const pickEligibleVehicle = (groupWeight: number, groupCrates: number, needsRefrig: boolean, maxPriorityCap: number | null) => {
        let bestVehicle: any = null;
        let minWeight = Infinity;
        for (const v of vehicles) {
            const maxCapKg = Number(v.capacity_kg) || 0;
            const maxCapCrates = Number(v.max_crates_capacity) || 483;
            const vRefrig = v.is_refrigerated === true || v.refrigerated === true;
            if (hasRefrigeratedFleet && needsRefrig && !vRefrig) continue;
            if (usedWeight[v.id] + groupWeight > maxCapKg) continue;
            if (usedCrates[v.id] + groupCrates > maxCapCrates) continue;
            if (maxPriorityCap !== null && usedPriorityCount[v.id] >= maxPriorityCap) continue;
            if (usedWeight[v.id] < minWeight) {
                minWeight = usedWeight[v.id];
                bestVehicle = v;
            }
        }
        return bestVehicle;
    };

    // Assign pre-consolidated clusters using capacity-, cold-chain-, and priority-aware rules (1-2 priority per truck)
    sortedClusters.forEach(cluster => {
        let bestVehicle: any = null;
        if (cluster.isPriority) {
            bestVehicle =
                pickEligibleVehicle(cluster.weightKg, cluster.crates, cluster.isRefrigerated, 1) ||
                pickEligibleVehicle(cluster.weightKg, cluster.crates, cluster.isRefrigerated, 2) ||
                pickEligibleVehicle(cluster.weightKg, cluster.crates, cluster.isRefrigerated, null);
        } else {
            bestVehicle = pickEligibleVehicle(cluster.weightKg, cluster.crates, cluster.isRefrigerated, null);
        }

        if (bestVehicle) {
            newAssignments[bestVehicle.id].push(cluster.clusterId);
            usedWeight[bestVehicle.id] += cluster.weightKg;
            usedCrates[bestVehicle.id] += cluster.crates;
            if (cluster.isPriority) usedPriorityCount[bestVehicle.id] += 1;
        }
    });

    // Calculate dynamic departure times for each vehicle based on earliest cluster delivery window
    const [defH, defM] = fleetStart.split(':').map(Number);
    const minFleetMins = defH * 60 + defM;

    Object.keys(newAssignments).forEach(vId => {
        const clusterIds = newAssignments[vId];
        if (clusterIds.length === 0) return;

        let earliestMins = Infinity;
        clusterIds.forEach(cId => {
            const c = clusterById.get(cId);
            if (c?.timeWindow?.startTime) {
                try {
                    const dt = new Date(c.timeWindow.startTime);
                    const bogota = new Date(dt.toLocaleString('en-US', { timeZone: 'America/Bogota' }));
                    const totalM = bogota.getHours() * 60 + bogota.getMinutes();
                    if (!isNaN(totalM) && totalM > 0 && totalM < earliestMins) {
                        earliestMins = totalM;
                    }
                } catch (_) {}
            }
        });

        if (earliestMins !== Infinity) {
            let depMins = earliestMins - 45;
            depMins = Math.max(minFleetMins, depMins);
            const dh = Math.floor(depMins / 60).toString().padStart(2, '0');
            const dm = (depMins % 60).toString().padStart(2, '0');
            simStartTimes[vId] = `${dh}:${dm}`;
        } else {
            simStartTimes[vId] = fleetStart;
        }

        // Generate sequential ETAs for simulation (keyed by clusterId; expanded hermetically by caller)
        let currentMins = (simStartTimes[vId] ? parseInt(simStartTimes[vId].split(':')[0]) * 60 + parseInt(simStartTimes[vId].split(':')[1]) : minFleetMins) + 30;
        clusterIds.forEach(cId => {
            const eh = Math.floor(currentMins / 60).toString().padStart(2, '0');
            const em = (currentMins % 60).toString().padStart(2, '0');
            simEtas[cId] = `${eh}:${em}`;
            currentMins += 25;
        });
    });
    
    return { simulatedAssignments: newAssignments, simStartTimes, simEtas };
}


async function generateAiExplanation(orders: any[], vehicles: any[], assignments: Record<string, string[]>, unassignedOrders: any[]) {
    try {
        const apiKey = getGeminiApiKey();
        if (!apiKey) {
            return "No se pudo generar el informe de la IA porque no está configurada la API Key de Gemini en el servidor.";
        }

        // Build a concise description of the assignments for the prompt
        let summaryText = `Analiza la siguiente asignación de despacho de la flota de FruFresco y redacta un informe de máximo 3 a 4 párrafos/viñetas explicando brevemente y con emojis la lógica/estrategia de esta planeación.
        
VEHÍCULOS DISPONIBLES:
${vehicles.map(v => `- Camión ${v.plate} (Conductor: ${v.driver_name || 'No asignado'}, Capacidad de Peso: ${v.capacity_kg}kg, Capacidad de Canastillas: ${v.capacity_crates || 483})`).join('\n')}

PEDIDOS A DISTRIBUIR:
${orders.map(o => `- Pedido #${o.id} para ${o.customer_name} (Peso: ${o.total_weight_kg}kg, Canastillas: ${o.crates_count || 1}, Tipo Cliente: ${o.profiles?.role === 'b2b_client' ? 'B2B' : 'B2C'}, Ubicación: ${o.address || 'Bogotá'})`).join('\n')}

ASIGNACIÓN REALIZADA POR EL ALGORITMO:
${Object.entries(assignments).map(([vehicleId, orderIds]) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    if (!vehicle) return `- Vehículo desconocido (${vehicleId}): ${orderIds.length} pedidos`;
    if (orderIds.length === 0) return `- Camión ${vehicle.plate} quedó LIBRE (sin pedidos asignados)`;
    const assignedOrders = orderIds.map(id => {
        const o = orders.find(ord => ord.id === id);
        return o ? `${o.customer_name} (#${o.id}, ${o.total_weight_kg}kg)` : `Pedido #${id}`;
    });
    return `- Camión ${vehicle.plate} llevará ${orderIds.length} pedidos: ${assignedOrders.join(', ')}`;
}).join('\n')}

INSTRUCCIONES DE REDACCIÓN:
1. Sé extremadamente directo, concreto y ejecutivo. Evita introducciones largas o conclusiones obvias ("no eches carreta"). Actúa como el Analista de Operaciones Logísticas de FruFresco.
2. Redacta el informe usando estrictamente de 3 a 4 viñetas (bullet points) muy cortas, precisas y al grano.
3. Resalta en **negrita** los datos logísticos clave (como placas de vehículos, nombres de conductores, pesos en **kg**, cantidad de **canastillas**, clientes corporativos o zonas/centros comerciales).
4. Explica concretamente la estrategia:
   - Consolidación de flota: por qué se seleccionaron esos camiones específicos y el ahorro de costos fijos al dejar otros libres.
   - Agrupamiento geográfico: si hay entregas concentradas en un mismo sector o centro comercial.
   - Seguridad: cumplimiento de límites de peso y capacidad de canastillas.
5. Inicia cada viñeta con un emoji correspondiente (ej: , , , ).
6. El texto debe ser de lectura rápida y ejecutiva para el despachador.`;

        if (unassignedOrders && unassignedOrders.length > 0) {
            summaryText += `\n\n¡ATENCIÓN! PEDIDOS QUE NO SE PUDIERON PROGRAMAR (SKIPPED):
${unassignedOrders.map(o => `- Pedido #${o.id} para ${o.customer_name} (${o.total_weight_kg}kg, Canastillas: ${o.crates_count || 1}, Ventana: ${o.manual_delivery_time || 'flexible'})`).join('\n')}

INSTRUCCIÓN ADICIONAL CRÍTICA:
Menciona explícitamente y al inicio del informe que NO se pudieron programar todos los pedidos. Lista brevemente las razones (por ejemplo, porque la capacidad de carga está saturada o hay incompatibilidad en ventanas de tiempo con los vehículos activos) e indica los nombres de los clientes/pedidos que quedaron sin asignar.`;
        }

        try {
            const explanation = await executeWithObsolescenceGuard(
                async (modelName: string, keyToUse: string) => {
                    console.log(`[TransportOptimizer] Generando informe con modelo: ${modelName}`);
                    const genAI = new GoogleGenerativeAI(keyToUse);
                    const model = genAI.getGenerativeModel({ model: modelName });
                    const result = await model.generateContent(summaryText);
                    const text = result.response.text();
                    if (!text) {
                        throw new Error(`Modelo ${modelName} no devolvió texto.`);
                    }
                    return text;
                },
                {
                    apiKey,
                    moduleName: 'transport_logistics',
                    operationName: 'route_optimization_explanation',
                    timeoutMs: 12000,
                }
            );

            if (explanation) {
                return explanation;
            }
        } catch (aiCascadeErr: any) {
            console.warn('[TransportOptimizer] IA cascade falló o se agotó, recurriendo a resumen programático:', aiCascadeErr?.message || aiCascadeErr);
        }

        // Programmatic fallback explanation if all AI calls fail
        const totalAssignedOrders = Object.values(assignments).reduce((sum, ids) => sum + ids.length, 0);
        const activeVehicles = Object.entries(assignments)
            .filter(([_, ids]) => ids.length > 0)
            .map(([vid]) => {
                const v = vehicles.find(veh => veh.id === vid);
                return v ? v.plate : vid;
            });

        let programmaticExplanation = `### Resumen de Planeación de Ruta (Generado Automáticamente)

* Se han distribuido **${totalAssignedOrders} pedidos** de forma automática utilizando el algoritmo de optimización de capacidad y rutas.
* Se activaron **${activeVehicles.length} camiones** (${activeVehicles.join(', ')}) para esta operación, minimizando costos fijos al mantener el resto de la flota libre.
* Las asignaciones se realizaron asegurando el cumplimiento estricto de los límites de peso (**kg**) y capacidad de canastillas de cada vehículo.
* El agrupamiento de entregas se calculó minimizando las distancias geográficas y optimizando los tiempos estimados de llegada.

*(Nota: El modelo de Inteligencia Artificial ya no está vigente o requiere actualización. Debe ponerse en contacto con el servicio de soporte técnico de inmediato para actualizarlo. Sin embargo, la optimización física de rutas se completó con éxito).*`;

        if (unassignedOrders && unassignedOrders.length > 0) {
            programmaticExplanation = `### ATENCIÓN: Planificación Incompleta (Pedidos Sin Asignar)

* **No se pudieron programar todos los pedidos**. Quedaron **${unassignedOrders.length} pedidos sin asignar** debido a restricciones duras de ventanas de tiempo o límites de capacidad de los vehículos activos.
* **Pedidos sin asignar**: ${unassignedOrders.map(o => `**${o.customer_name}** (Pedido #${o.id}, ${o.total_weight_kg}kg, Ventana: ${o.manual_delivery_time || 'flexible'})`).join(', ')}.

---

` + programmaticExplanation;
        }

        return programmaticExplanation;
        
    } catch (e: any) {
        console.error('Error in generateAiExplanation wrapper:', e);
        let errorFallback = `### Resumen de Planeación de Ruta (Generado Automáticamente)
* Se completó la optimización de rutas de forma correcta.
* Los pedidos fueron asignados según capacidades y cercanía geográfica.
*(Nota: El servidor de IA no está respondiendo temporalmente).*`;

        if (unassignedOrders && unassignedOrders.length > 0) {
            errorFallback = `### ATENCIÓN: Planificación Incompleta
* **Hay ${unassignedOrders.length} pedidos sin asignar** debido a restricciones de capacidad/horario.
---
` + errorFallback;
        }
        return errorFallback;
    }
}
