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
import { addBogotaDays, getBogotaDateString } from '@/lib/dateUtils';
import {
    classifyOrderGps,
    resolveOrderDisplayWindow,
    BODEGA_CENTRAL,
} from '@/lib/transport/gpsHygiene';
import { isThirdPartyVehicle } from '@/lib/transport/fleetOwnership';

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
        let b2b_default_window_start = parameters?.b2b_default_window_start || '06:00';
        let b2b_default_window_end = parameters?.b2b_default_window_end || '10:00';
        let b2c_default_window_start = parameters?.b2c_default_window_start || '10:00';
        let b2c_default_window_end = parameters?.b2c_default_window_end || '14:00';

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
            b2b_default_window_start = dbParams.find(p => p.id === 'b2b_default_window_start')?.value || b2b_default_window_start;
            b2b_default_window_end = dbParams.find(p => p.id === 'b2b_default_window_end')?.value || b2b_default_window_end;
            b2c_default_window_start = dbParams.find(p => p.id === 'b2c_default_window_start')?.value || b2c_default_window_start;
            b2c_default_window_end = dbParams.find(p => p.id === 'b2c_default_window_end')?.value || b2c_default_window_end;
        }

        const windowParams = {
            b2b_default_window_start,
            b2b_default_window_end,
            b2c_default_window_start,
            b2c_default_window_end,
        };

        let ownVehicleFixedCost = 500; // default balanced
        let thirdPartyVehicleFixedCost = 20000;
        if (optimization_strategy === 'minimize_vehicles') {
            ownVehicleFixedCost = 10000;
            thirdPartyVehicleFixedCost = 30000;
        } else if (optimization_strategy === 'minimize_time') {
            ownVehicleFixedCost = 50;
            thirdPartyVehicleFixedCost = 20000;
        }

        // Helper to compare HH:MM times
        const parseTimeStr = (t: string) => {
            const [h, m] = t.split(':').map(Number);
            return h * 60 + m;
        };

        // 2. Map to Google OptimizeTours Request Schema
        // Ref: https://developers.google.com/maps/documentation/route-optimization/reference/rest/v1/projects.locations/optimizeTours
        
        const targetDate = orders[0]?.delivery_date ? orders[0].delivery_date.split('T')[0] : getBogotaDateString();

        // Proyección en múltiplos de 7 días si la ventana de salida ya pasó (mantiene día de semana en America/Bogota)
        const fleetStartMs = new Date(`${targetDate}T${fleet_start}:00-05:00`).getTime();
        const isFutureWindow = Number.isFinite(fleetStartMs) && fleetStartMs > Date.now() + 5 * 60_000;
        let shiftDays = 0;
        if (!isFutureWindow && Number.isFinite(fleetStartMs)) {
            const weeks = Math.ceil((Date.now() + 5 * 60_000 - fleetStartMs) / (7 * 86_400_000));
            shiftDays = Math.max(1, weeks) * 7;
        }
        const trafficMode: 'live_predictive' | 'weekday_projected' = isFutureWindow ? 'live_predictive' : 'weekday_projected';
        const gcpDate = shiftDays ? addBogotaDays(targetDate, shiftDays) : targetDate;

        const getOrderTimeWindow = (o: any, datePart: string): {
            startTime: string;
            endTime: string;
            allowB2CSoftStart: boolean;
            softStartMs: number | null;
        } => {
            const resolved = resolveOrderDisplayWindow(o, windowParams);
            const startLocal = resolved.startTime;
            const endLocal = resolved.endTime;

            const minFleetMins = parseTimeStr(fleet_start);
            const maxFleetMins = parseTimeStr(fleet_end);

            let sMins = parseTimeStr(startLocal);
            let eMins = parseTimeStr(endLocal);

            const orderIsB2B = Boolean(o?.is_b2b) ||
                (typeof o?.type === 'string' && o.type.toLowerCase().includes('b2b')) ||
                o?.profiles?.role === 'b2b_client' ||
                o?.profiles?.role === 'b2b';
            const isB2CDefault = !orderIsB2B && resolved.slotType === 'segment_default';

            let allowB2CSoftStart = false;
            let softStartMins: number | null = null;

            if (isNaN(sMins) || isNaN(eMins) || sMins >= eMins) {
                sMins = minFleetMins;
                eMins = maxFleetMins;
            } else {
                if (isB2CDefault) {
                    const b2bStartMins = parseTimeStr(b2b_default_window_start);
                    const hardStartMins = Math.max(Number.isFinite(b2bStartMins) ? b2bStartMins : 360, 8 * 60);
                    const candidateSoftMins = parseTimeStr(b2c_default_window_start);
                    if (
                        Number.isFinite(hardStartMins) &&
                        Number.isFinite(candidateSoftMins) &&
                        hardStartMins < candidateSoftMins &&
                        candidateSoftMins < eMins
                    ) {
                        sMins = hardStartMins;
                        softStartMins = candidateSoftMins;
                        allowB2CSoftStart = true;
                    }
                }
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
                const startMs = new Date(startTime).getTime();
                const endMs = new Date(endTime).getTime();

                let softStartMs: number | null = null;
                if (allowB2CSoftStart && softStartMins !== null) {
                    const softH = Math.floor(softStartMins / 60).toString().padStart(2, '0');
                    const softM = (softStartMins % 60).toString().padStart(2, '0');
                    const candidateMs = new Date(`${datePart}T${softH}:${softM}:00-05:00`).getTime();
                    if (Number.isFinite(candidateMs) && startMs < candidateMs && candidateMs < endMs) {
                        softStartMs = candidateMs;
                    } else {
                        allowB2CSoftStart = false;
                    }
                }

                return { startTime, endTime, allowB2CSoftStart, softStartMs };
            } catch {
                return {
                    startTime: new Date(`${datePart}T${fleet_start}:00-05:00`).toISOString(),
                    endTime: new Date(`${datePart}T${fleet_end}:00-05:00`).toISOString(),
                    allowB2CSoftStart: false,
                    softStartMs: null
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

        // Helper to compute vehicle break schedule (mid-shift window after B2B critical window)
        const getVehicleBreakRule = (datePart: string, fleetStart: string, breakMins: number, b2bWindowEnd: string) => {
            if (breakMins <= 0) return undefined;
            const fleetStartMins = parseTimeStr(fleetStart);
            const b2bEndMins = parseTimeStr(b2bWindowEnd);
            const baseEarliestMins = Number.isFinite(fleetStartMins) ? fleetStartMins + 240 : 8 * 60 + 30;
            const earliestMins = Math.min(
                23 * 60 + 59,
                Number.isFinite(b2bEndMins) ? Math.max(baseEarliestMins, b2bEndMins) : baseEarliestMins
            );
            const latestMins = Math.min(23 * 60 + 59, earliestMins + 120);

            const pad = (n: number) => n.toString().padStart(2, '0');
            const earliestTimeStr = `${pad(Math.floor(earliestMins / 60))}:${pad(earliestMins % 60)}`;
            const latestTimeStr = `${pad(Math.floor(latestMins / 60))}:${pad(latestMins % 60)}`;

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
        const excludedNoGpsOrderIds: string[] = [];
        const geocodingWarnings: Array<{ orderId: string; customerName: string; reason: string; status?: string }> = [];

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
            allowB2CSoftStart: boolean;
            softStartMs: number | null;
            startMs: number;
            endMs: number;
            timeWindow: { startTime: string; endTime: string };
            lat: number;
            lng: number;
            siteKey: string;
        }

        const routingUnits: RoutingUnit[] = orders
            .filter((o: any) => !splitChildIds.has(String(o.id)))
            .flatMap((parent: any): RoutingUnit[] => {
                const children = splitChildrenByParent.get(String(parent.id)) || [];
                const memberOrders = [parent, ...children];
                const memberOrderIds = memberOrders.map(m => String(m.id));

                // Higiene GPS (§5): excluir pedidos sin GPS válido en Bogotá/Sabana (prohibido enviarlos a Corabastos)
                const gpsCheck = classifyOrderGps(
                    parent.latitude ?? parent.profiles?.latitude,
                    parent.longitude ?? parent.profiles?.longitude
                );
                if (gpsCheck.status !== 'valid') {
                    memberOrders.forEach(m => {
                        const idStr = String(m.id);
                        excludedNoGpsOrderIds.push(idStr);
                        geocodingWarnings.push({
                            orderId: idStr,
                            customerName: m.customer_name || m.profiles?.full_name || 'Cliente',
                            reason: gpsCheck.reason || 'Coordenadas GPS ausentes o inválidas; excluido de ruteo automático',
                            status: gpsCheck.status,
                        });
                    });
                    return [];
                }

                const validLat = gpsCheck.lat as number;
                const validLng = gpsCheck.lng as number;

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
                const parentWin = getOrderTimeWindow(parent, gcpDate);
                let interStartMs = new Date(parentWin.startTime).getTime();
                let interEndMs = new Date(parentWin.endTime).getTime();
                let allowB2CSoftStart = parentWin.allowB2CSoftStart;
                let softStartMs = parentWin.softStartMs;
                for (const child of children) {
                    const cw = getOrderTimeWindow(child, gcpDate);
                    const cs = new Date(cw.startTime).getTime();
                    const ce = new Date(cw.endTime).getTime();
                    if (Math.max(interStartMs, cs) < Math.min(interEndMs, ce)) {
                        interStartMs = Math.max(interStartMs, cs);
                        interEndMs = Math.min(interEndMs, ce);
                        allowB2CSoftStart = allowB2CSoftStart && cw.allowB2CSoftStart;
                        if (allowB2CSoftStart && softStartMs !== null && cw.softStartMs !== null) {
                            softStartMs = Math.max(softStartMs, cw.softStartMs);
                        } else {
                            allowB2CSoftStart = false;
                            softStartMs = null;
                        }
                    }
                }
                if (isPriority || isB2B || !allowB2CSoftStart || softStartMs === null || !(interStartMs < softStartMs && softStartMs < interEndMs)) {
                    allowB2CSoftStart = false;
                    softStartMs = null;
                }
                const unitWindow = {
                    startTime: new Date(interStartMs).toISOString(),
                    endTime: new Date(interEndMs).toISOString()
                };

                const dateKey = String(parent.delivery_date || targetDate).split('T')[0];
                const rawAddrNorm = normalizeTextKey(parent.shipping_address || parent.address);
                const normAddr = rawAddrNorm === 'sin direccion' ? '' : rawAddrNorm;
                const normName = normalizeTextKey(parent.customer_name || parent.profiles?.company_name || parent.profiles?.contact_name);

                const clientPart = parent.profile_id ? String(parent.profile_id) : (normName ? `name:${normName}` : `order:${parent.id}`);
                const siteKey = `${dateKey}|${clientPart}|${validLat.toFixed(4)},${validLng.toFixed(4)}|${normAddr}`;

                return [{
                    leaderId: String(parent.id),
                    memberOrders,
                    memberOrderIds,
                    weightKg,
                    crates,
                    isRefrigerated,
                    isPriority,
                    isB2B,
                    isCashOnDelivery,
                    allowB2CSoftStart,
                    softStartMs,
                    startMs: interStartMs,
                    endMs: interEndMs,
                    timeWindow: unitWindow,
                    lat: validLat,
                    lng: validLng,
                    siteKey
                }];
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
            allowB2CSoftStart: boolean;
            softStartMs: number | null;
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
                        const combinedAllowSoft =
                            !batch.isPriority &&
                            !batch.isB2B &&
                            batch.allowB2CSoftStart &&
                            u.allowB2CSoftStart &&
                            batch.softStartMs !== null &&
                            u.softStartMs !== null;
                        const combinedSoftStartMs = combinedAllowSoft
                            ? Math.max(batch.softStartMs as number, u.softStartMs as number)
                            : null;
                        if (combinedAllowSoft && combinedSoftStartMs !== null && interStart < combinedSoftStartMs && combinedSoftStartMs < interEnd) {
                            batch.allowB2CSoftStart = true;
                            batch.softStartMs = combinedSoftStartMs;
                        } else {
                            batch.allowB2CSoftStart = false;
                            batch.softStartMs = null;
                        }
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
                        allowB2CSoftStart: u.allowB2CSoftStart,
                        softStartMs: u.softStartMs,
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

        // Cortocircuito antes de OAuth2/Google si no quedan clústeres con GPS válido
        if (consolidatedClusters.length === 0) {
            const emptyAssignments: Record<string, string[]> = {};
            const emptyStartTimes: Record<string, string> = {};
            vehicles.forEach((v: any) => {
                emptyAssignments[v.id] = [];
                emptyStartTimes[v.id] = fleet_start || '04:30';
            });
            const deterministicExplanation = [
                '### Sin Pedidos con GPS Válido para Ruteo Automático',
                `- **Excluidos por GPS:** **${excludedNoGpsOrderIds.length}** pedido(s) no tienen coordenadas válidas en Bogotá/Sabana y fueron excluidos del motor de Google.`,
                '- **Acción recomendada:** Corrige las coordenadas del cliente o asigna estos pedidos manualmente en las tarjetas de vehículos.'
            ].join('\n');

            return NextResponse.json({
                message: 'No hay pedidos con coordenadas GPS válidas para optimizar automáticamente',
                routes: emptyAssignments,
                route_start_times: emptyStartTimes,
                stop_etas: {},
                theoretical_metrics: { distance_km: 0, travel_min: 0, duration_min: 0 },
                route_polylines: {},
                route_metrics: {},
                stop_leg_metrics: {},
                skipped_orders: [],
                excluded_no_gps_order_ids: excludedNoGpsOrderIds,
                geocoding_warnings: geocodingWarnings,
                traffic_mode: trafficMode,
                simulation: false,
                explanation: deterministicExplanation
            }, { status: 200, headers: { 'x-request-id': requestId } });
        }

        const clusterServiceMinMap = new Map<string, number>();

        // Expansión hermética: devuelve únicamente orderIds reales en routes, stop_etas y stop_leg_metrics
        const expandClusterAssignments = (
            rawAssign: Record<string, string[]>,
            rawEtas: Record<string, string>,
            rawLegMetrics: Record<string, { distance_km: number; travel_min: number }>
        ) => {
            const expandedAssignments: Record<string, string[]> = {};
            const expandedStopEtas: Record<string, string> = {};
            const expandedStopLegMetrics: Record<string, { distance_km: number; travel_min: number; is_same_site_followup?: boolean; service_min?: number; cluster_size?: number }> = {};
            Object.entries(rawAssign).forEach(([vid, clusterIds]) => {
                const expanded: string[] = [];
                clusterIds.forEach(cid => {
                    const cluster = clusterById.get(String(cid));
                    const memberIds = cluster ? cluster.memberOrderIds : [String(cid)];
                    const etaVal = rawEtas[cid];
                    const legVal = rawLegMetrics[cid];
                    const svcMin = clusterServiceMinMap.get(String(cid));
                    memberIds.forEach((realId, idx) => {
                        expanded.push(realId);
                        if (etaVal) expandedStopEtas[realId] = etaVal;
                        if (legVal) {
                            if (idx === 0) {
                                expandedStopLegMetrics[realId] = {
                                    distance_km: legVal.distance_km,
                                    travel_min: legVal.travel_min,
                                    ...(typeof svcMin === 'number' ? { service_min: svcMin } : {}),
                                    ...(memberIds.length > 1 ? { cluster_size: memberIds.length } : {}),
                                };
                            } else {
                                expandedStopLegMetrics[realId] = {
                                    distance_km: 0,
                                    travel_min: 0,
                                    is_same_site_followup: true,
                                    service_min: 0,
                                };
                            }
                        }
                    });
                });
                expandedAssignments[vid] = expanded;
            });
            return { expandedAssignments, expandedStopEtas, expandedStopLegMetrics };
        };

        const gcpRequest = {
            timeout: "12s",
            searchMode: "CONSUME_ALL_AVAILABLE_TIME",
            populatePolylines: true,
            model: {
                globalStartTime: new Date(`${gcpDate}T00:00:00-05:00`).toISOString(),
                globalEndTime: new Date(`${gcpDate}T23:59:59-05:00`).toISOString(),
                shipments: consolidatedClusters.map((cluster) => {
                    const cashDwellDelta = cluster.isCashOnDelivery ? 5 : 0;
                    const rawUnloading = Math.ceil(base_setup + ((time_unload + time_delivery) / 10) * cluster.crates) + cashDwellDelta;
                    const unloadingTime = Math.max(5, Math.min(isNaN(rawUnloading) ? 15 : rawUnloading, 180));
                    clusterServiceMinMap.set(String(cluster.clusterId), unloadingTime);

                    let shipmentTimeWindow: Record<string, string | number> = cluster.timeWindow;
                    if (cluster.isPriority) {
                        const startMs = cluster.startMs;
                        const endMs = cluster.endMs;
                        const gcpFleetStartMs = new Date(`${gcpDate}T${fleet_start}:00-05:00`).getTime();
                        const targetSoftMs = Math.min(
                            endMs,
                            Math.max(
                                startMs,
                                Math.min(
                                    gcpFleetStartMs + 180 * 60000,
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
                    } else if (
                        cluster.allowB2CSoftStart &&
                        cluster.softStartMs !== null &&
                        Number.isFinite(cluster.softStartMs) &&
                        cluster.startMs < cluster.softStartMs &&
                        cluster.softStartMs < cluster.endMs
                    ) {
                        shipmentTimeWindow = {
                            ...cluster.timeWindow,
                            softStartTime: new Date(cluster.softStartMs).toISOString(),
                            costPerHourBeforeSoftStartTime: 48
                        };
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
                        penaltyCost: cluster.isPriority ? 2000000 : (cluster.isB2B ? 500000 : 250000),
                        label: cluster.clusterId
                    };
                }),
                vehicles: vehicles.map((v: any) => {
                    // Suppress mandatory pause on morning sprint routes (< 4h) to avoid dropping restaurant breakfast windows
                    const shiftDurationMins = parseTimeStr(fleet_end) - parseTimeStr(fleet_start);
                    const effectiveBreakMins = shiftDurationMins < 240 ? 0 : driver_break_mins;
                    const breakRule = getVehicleBreakRule(gcpDate, fleet_start, effectiveBreakMins, b2b_default_window_end);

                    const limits: Record<string, { maxLoad?: string; softMaxLoad?: string; costPerUnitAboveSoftMax?: number }> = {
                        "weight": { "maxLoad": String(v.capacity_kg) },
                        "crates": { "maxLoad": String(v.max_crates_capacity || 483) }
                    };
                    if (hasRefrigeratedFleet) {
                        limits["refrigerated"] = { "maxLoad": v.is_refrigerated ? String(v.max_crates_capacity || 483) : "0" };
                    }
                    if (hasPriorityOrders) {
                        const prioritySoftCost = ownVehicleFixedCost > 0
                            ? Math.min(50000, Math.max(800, Math.round(ownVehicleFixedCost * 0.4)))
                            : 1500;
                        limits["priority_slots"] = {
                            softMaxLoad: "1",
                            costPerUnitAboveSoftMax: prioritySoftCost
                        };
                    }

                    const thisVehicleFixedCost = isThirdPartyVehicle(v.vehicle_type)
                        ? thirdPartyVehicleFixedCost
                        : ownVehicleFixedCost;

                    const vehicleObj: any = {
                        startLocation: { latitude: BODEGA_CENTRAL.lat, longitude: BODEGA_CENTRAL.lng },
                        endLocation: { latitude: BODEGA_CENTRAL.lat, longitude: BODEGA_CENTRAL.lng },
                        loadLimits: limits,
                        fixedCost: thisVehicleFixedCost,
                        costPerKilometer: 2.0,
                        costPerHour: 40.0,
                        costPerTraveledHour: 20.0,
                        startTimeWindows: [
                            {
                                startTime: new Date(`${gcpDate}T${fleet_start}:00-05:00`).toISOString(),
                                endTime: new Date(`${gcpDate}T${fleet_end}:00-05:00`).toISOString()
                            }
                        ],
                        endTimeWindows: [
                            {
                                startTime: new Date(`${gcpDate}T${fleet_start}:00-05:00`).toISOString(),
                                endTime: new Date(`${gcpDate}T${fleet_end}:00-05:00`).toISOString()
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
            considerRoadTraffic: true
        };

        // 3. Real Integration Check — Fail-Fast Zero-Mock (no silent simulation fallback)
        const allowExternalGcp = !isSandboxMode() || areSandboxExternalApisAllowed();
        if (!allowExternalGcp) {
            return NextResponse.json({
                type: 'https://frufresco.com/errors/route-optimizer-unavailable',
                title: 'Motor de Ruteo Google deshabilitado en Sandbox',
                status: 503,
                code: 'SANDBOX_EXTERNAL_API_DISABLED',
                detail: 'El ruteo automático con Google está deshabilitado en este entorno Sandbox (ENABLE_SANDBOX_EXTERNAL_APIS != true). No se generaron rutas simuladas; asigna manualmente o habilita la API externa de Google.',
                requestId
            }, { status: 503, headers: { 'x-request-id': requestId } });
        }

        const gcpProjectId = process.env.GCP_PROJECT_ID;
        const gcpApiKey = process.env.GCP_OPTIMIZATION_KEY;

        let serviceAccountData: any = null;
        if (process.env.GCP_SERVICE_ACCOUNT_KEY) {
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

        if (!serviceAccountData) {
            const serviceAccountPath = path.join(process.cwd(), 'gcp-service-account.json');
            try {
                if (fs.existsSync(serviceAccountPath)) {
                    serviceAccountData = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
                }
            } catch (_) {}
        }

        const hasServiceAccount = !!serviceAccountData;
        if (!hasServiceAccount && !(gcpProjectId && gcpApiKey)) {
            return NextResponse.json({
                type: 'https://frufresco.com/errors/route-optimizer-unavailable',
                title: 'Credenciales de Google Route Optimization no configuradas',
                status: 503,
                code: 'MISSING_GCP_CREDENTIALS',
                detail: 'No se encontraron credenciales válidas de Google Cloud (GCP_SERVICE_ACCOUNT_KEY ni GCP_PROJECT_ID/GCP_OPTIMIZATION_KEY). No se generaron rutas simuladas; realiza la asignación manual o configura la cuenta de servicio.',
                requestId
            }, { status: 503, headers: { 'x-request-id': requestId } });
        }

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

                const encodeBase64Url = (obj: any) =>
                    Buffer.from(JSON.stringify(obj))
                        .toString('base64')
                        .replace(/=/g, '')
                        .replace(/\+/g, '-')
                        .replace(/\//g, '_');

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
                    throw new Error(`Google OAuth error (${tokenResponse.status})`);
                }

                const tokenData = await tokenResponse.json();
                accessToken = tokenData.access_token;

                cachedOAuthToken = {
                    token: tokenData.access_token,
                    expiresAt: Date.now() + 3300 * 1000,
                    projectId: projectId
                };
                console.log("[Optimizer] Fresh OAuth2 token generated and cached successfully!");
            } catch (oauthErr: any) {
                console.error("OAuth token generation failed:", oauthErr);
                if (!gcpApiKey) {
                    return NextResponse.json({
                        type: 'https://frufresco.com/errors/route-optimizer-unavailable',
                        title: 'Fallo de autenticación OAuth2 con Google Cloud',
                        status: 503,
                        code: 'GCP_OAUTH_FAILED',
                        detail: `No fue posible autenticar con Google Route Optimization API (${oauthErr?.message || 'OAuth2 error'}). No se generaron rutas simuladas; reintenta o asigna manualmente.`,
                        requestId
                    }, { status: 503, headers: { 'x-request-id': requestId } });
                }
            }
        }

        console.log(`[Optimizer] Calling real Google Cloud Optimization API for Project: ${projectId}`);

        const url = `https://routeoptimization.googleapis.com/v1/projects/${projectId}:optimizeTours` + (accessToken ? '' : `?key=${gcpApiKey}`);
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (accessToken) {
            headers['Authorization'] = `Bearer ${accessToken}`;
        }

        const gcpController = new AbortController();
        const gcpTimeout = setTimeout(() => gcpController.abort(), 20000);
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
            console.error(`[Optimizer] GCP RouteOptimization fetch failed (${fetchErr.name === 'AbortError' ? 'Timeout 20s' : fetchErr.message}). RequestId: ${requestId}`);
        } finally {
            clearTimeout(gcpTimeout);
        }

        if (gcpFetchError) {
            const isTimeout = gcpFetchError?.name === 'AbortError';
            return NextResponse.json({
                type: 'https://frufresco.com/errors/route-optimizer-unavailable',
                title: isTimeout ? 'Google Route Optimization excedió el tiempo de espera' : 'Error de red al conectar con Google Route Optimization',
                status: 503,
                code: isTimeout ? 'GCP_TIMEOUT' : 'GCP_UPSTREAM_ERROR',
                detail: isTimeout
                    ? 'Google Route Optimization tardó más de 20 segundos en responder. No se generaron rutas simuladas; reintenta o asigna manualmente.'
                    : `Error de conexión con Google Route Optimization (${gcpFetchError?.message || 'Network error'}). No se generaron rutas simuladas.`,
                requestId
            }, { status: 503, headers: { 'x-request-id': requestId } });
        }

        if (!gcpResponse || !gcpResponse.ok) {
            const errText = gcpResponse ? await gcpResponse.text() : 'Sin respuesta de Google';
            console.error(`[Optimizer] GCP RouteOptimization API non-OK (${gcpResponse?.status}): ${errText}. RequestId: ${requestId}`);
            return NextResponse.json({
                type: 'https://frufresco.com/errors/route-optimizer-unavailable',
                title: 'Google Route Optimization rechazó la solicitud',
                status: 503,
                code: 'GCP_UPSTREAM_ERROR',
                detail: `Google Route Optimization devolvió HTTP ${gcpResponse?.status || 503}. No se generaron rutas simuladas; revisa coordenadas/ventanas o asigna manualmente.`,
                requestId
            }, { status: 503, headers: { 'x-request-id': requestId } });
        }

        const gcpData = await gcpResponse.json();

        const parseGcpDurationSeconds = (rawDur: any): number => {
            if (typeof rawDur === 'string') {
                return parseInt(rawDur.replace(/s$/i, ''), 10) || 0;
            }
            if (rawDur && typeof rawDur === 'object' && rawDur.seconds !== undefined) {
                return Number(rawDur.seconds) || 0;
            }
            return 0;
        };

        // Transform Google's assigned routes back to assignments map { vehicleId: [orderIds] }
        const assignments: Record<string, string[]> = {};
        const routeStartTimes: Record<string, string> = {};
        const stopEtas: Record<string, string> = {};
        const clusterLegMetrics: Record<string, { distance_km: number; travel_min: number }> = {};
        const routePolylines: Record<string, string> = {};
        const routeMetrics: Record<string, {
            distance_km: number;
            travel_min: number;
            total_min: number;
            wait_min: number;
            break_min: number;
            service_min?: number;
            return_eta?: string;
        }> = {};

        vehicles.forEach((v: any) => {
            assignments[v.id] = [];
            routeStartTimes[v.id] = fleet_start || '04:30';
        });

        if (gcpData.routes) {
            gcpData.routes.forEach((route: any) => {
                const vehicleId = route.vehicleLabel; // We set this as v.id in gcpRequest
                if (vehicleId && assignments[vehicleId]) {
                    if (route.routePolyline?.points) {
                        routePolylines[vehicleId] = route.routePolyline.points;
                    }
                    if (route.metrics) {
                        let returnEta: string | undefined;
                        if (route.vehicleEndTime) {
                            const endMs = new Date(route.vehicleEndTime).getTime();
                            if (Number.isFinite(endMs)) {
                                returnEta = new Intl.DateTimeFormat('en-GB', {
                                    timeZone: 'America/Bogota',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    hour12: false,
                                }).format(new Date(endMs));
                            }
                        }
                        routeMetrics[vehicleId] = {
                            distance_km: Math.round(((Number(route.metrics.travelDistanceMeters) || 0) / 1000) * 10) / 10,
                            travel_min: Math.round(parseGcpDurationSeconds(route.metrics.travelDuration) / 60),
                            total_min: Math.round(parseGcpDurationSeconds(route.metrics.totalDuration) / 60),
                            wait_min: Math.round(parseGcpDurationSeconds(route.metrics.waitDuration) / 60),
                            break_min: Math.round(parseGcpDurationSeconds(route.metrics.breakDuration) / 60),
                            service_min: Math.round(parseGcpDurationSeconds(route.metrics.visitDuration) / 60),
                            ...(returnEta ? { return_eta: returnEta } : {}),
                        };
                    }

                    const visitOrderIds = (route.visits || [])
                        .map((vst: any, visitIdx: number) => {
                            if (vst.isPickup) return null;
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
                            const transition = route.transitions?.[visitIdx];
                            if (clusterId && transition) {
                                clusterLegMetrics[clusterId] = {
                                    distance_km: Math.round(((Number(transition.travelDistanceMeters) || 0) / 1000) * 10) / 10,
                                    travel_min: Math.round(parseGcpDurationSeconds(transition.travelDuration) / 60),
                                };
                            }
                            return clusterId;
                        })
                        .filter(Boolean) as string[];

                    assignments[vehicleId] = visitOrderIds;

                    if (route.vehicleStartTime) {
                        try {
                            const dateObj = new Date(route.vehicleStartTime);
                            const bogotaDate = new Date(dateObj.toLocaleString('en-US', { timeZone: 'America/Bogota' }));
                            const h = bogotaDate.getHours().toString().padStart(2, '0');
                            const m = bogotaDate.getMinutes().toString().padStart(2, '0');
                            routeStartTimes[vehicleId] = `${h}:${m}`;
                        } catch (_) {}
                    } else if (visitOrderIds.length > 0) {
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
        const {
            expandedAssignments: finalAssignments,
            expandedStopEtas: finalStopEtas,
            expandedStopLegMetrics: finalStopLegMetrics,
        } = expandClusterAssignments(assignments, stopEtas, clusterLegMetrics);
        const assignedOrderIds = new Set(Object.values(finalAssignments).flat());
        const unassignedOrders = orders.filter(o => !assignedOrderIds.has(String(o.id)));
        const explanation = await generateAiExplanation(orders, vehicles, finalAssignments, unassignedOrders, {
            consolidatedClusters: consolidatedClusters.map(c => ({
                clusterId: c.clusterId,
                customerName: orders.find(o => String(o.id) === String(c.memberOrderIds[0]))?.customer_name || c.clusterId,
                memberOrderIds: c.memberOrderIds,
                weightKg: c.weightKg,
                crates: c.crates,
                isPriority: c.isPriority,
                isRefrigerated: c.isRefrigerated
            })),
            priorityOrderIds: consolidatedClusters.filter(c => c.isPriority).flatMap(c => c.memberOrderIds),
            refrigeratedOrderIds: Array.from(refrigeratedOrderIds).map(String),
            geocodingWarnings,
            optimizationStrategy: optimization_strategy,
            routeMetrics
        });

        const aggMetrics = gcpData.metrics?.aggregatedRouteMetrics || {};
        const aggDistMeters = Number(aggMetrics.travelDistanceMeters ?? gcpData.metrics?.totalDistanceMeters ?? 0);
        const aggTravelSecs = parseGcpDurationSeconds(aggMetrics.travelDuration);
        const aggTotalSecs = parseGcpDurationSeconds(aggMetrics.totalDuration ?? gcpData.metrics?.totalDuration);

        return NextResponse.json({
            message: "Optimization generated by REAL Google Engine",
            routes: finalAssignments,
            route_start_times: routeStartTimes,
            stop_etas: finalStopEtas,
            theoretical_metrics: {
                distance_km: Math.round((aggDistMeters / 1000) * 10) / 10,
                travel_min: Math.round(aggTravelSecs / 60),
                duration_min: Math.round(aggTotalSecs / 60),
            },
            route_polylines: routePolylines,
            route_metrics: routeMetrics,
            stop_leg_metrics: finalStopLegMetrics,
            skipped_orders: skippedOrders,
            excluded_no_gps_order_ids: excludedNoGpsOrderIds,
            geocoding_warnings: geocodingWarnings,
            traffic_mode: trafficMode,
            simulation: false,
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

async function generateAiExplanation(
    orders: any[],
    vehicles: any[],
    assignments: Record<string, string[]>,
    unassignedOrders: any[],
    context?: {
        consolidatedClusters?: Array<{ clusterId: string; customerName: string; memberOrderIds: string[]; weightKg: number; crates: number; isPriority: boolean; isRefrigerated: boolean }>;
        priorityOrderIds?: string[];
        refrigeratedOrderIds?: string[];
        geocodingWarnings?: Array<{ orderId: string; customerName: string; reason: string }>;
        optimizationStrategy?: string;
        routeMetrics?: Record<string, { distance_km?: number; travel_min?: number; total_min?: number }>;
    }
) {
    const orderById = new Map(orders.map(o => [String(o.id), o]));
    const multiOrderClusters = (context?.consolidatedClusters || []).filter(c => c.memberOrderIds.length > 1);
    const prioritySet = new Set((context?.priorityOrderIds || []).map(String));
    const refrigeratedSet = new Set((context?.refrigeratedOrderIds || []).map(String));
    const geoWarnings = context?.geocodingWarnings || [];
    const routeMetrics = context?.routeMetrics || {};

    const idleOwnVehicles = vehicles.filter(
        v => !(assignments[v.id]?.length > 0) && !isThirdPartyVehicle(v.vehicle_type)
    );
    const overloadedActiveVehicles = Object.entries(assignments)
        .filter(([, ids]) => ids.length > 0)
        .map(([vid, ids]) => {
            const v = vehicles.find(veh => veh.id === vid);
            const kg = ids.reduce((s, id) => s + (Number(orderById.get(String(id))?.total_weight_kg) || 0), 0);
            const cr = ids.reduce((s, id) => s + (Number(orderById.get(String(id))?.crates) || 1), 0);
            const capKg = Number(v?.capacity_kg) || 0;
            const capCrates = Number(v?.max_crates_capacity) || 0;
            const totalMin = Number(routeMetrics[vid]?.total_min) || 0;
            const pctKg = capKg > 0 ? (kg / capKg) * 100 : 0;
            const pctCrates = capCrates > 0 ? (cr / capCrates) * 100 : 0;
            const isOverloaded = totalMin > 240 || pctKg > 85 || pctCrates > 85;
            return { plate: v?.plate || vid, totalMin, pctKg: Math.round(pctKg), pctCrates: Math.round(pctCrates), isOverloaded };
        })
        .filter(item => item.isOverloaded);

    const speedRecommendationText =
        context?.optimizationStrategy !== 'minimize_time' &&
        idleOwnVehicles.length >= 1 &&
        overloadedActiveVehicles.length > 0
            ? `Tienes ${idleOwnVehicles.length} camión(es) propio(s) libre(s) (${idleOwnVehicles.map(v => v.plate).join(', ')}) mientras ${overloadedActiveVehicles.map(o => o.plate).join(', ')} supera ${overloadedActiveVehicles[0].totalMin > 240 ? `${overloadedActiveVehicles[0].totalMin} min` : `${Math.max(overloadedActiveVehicles[0].pctKg, overloadedActiveVehicles[0].pctCrates)}% de carga`}; si quieres acabar más temprano, prueba la estrategia **Terminar más rápido (Velocidad)**.`
            : null;

    const buildDeterministicSummary = (fallbackReason?: string) => {
        const totalAssigned = Object.values(assignments).reduce((s, ids) => s + ids.length, 0);
        const activeRows = Object.entries(assignments)
            .filter(([, ids]) => ids.length > 0)
            .map(([vid, ids]) => {
                const v = vehicles.find(veh => veh.id === vid);
                const kg = ids.reduce((s, id) => s + (Number(orderById.get(String(id))?.total_weight_kg) || 0), 0);
                const cr = ids.reduce((s, id) => s + (Number(orderById.get(String(id))?.crates) || 1), 0);
                const capKg = Number(v?.capacity_kg) || 1;
                const pctKg = Math.round((kg / capKg) * 100);
                return `- **${v?.plate || vid}**: ${ids.length} pedidos · **${kg.toFixed(1)} kg** (${pctKg}%) · **${cr} canastillas**.`;
            });
        const idlePlates = vehicles.filter(v => !(assignments[v.id]?.length > 0)).map(v => v.plate);
        const lines: string[] = [
            `### Resumen Ejecutivo de Ruteo Google`,
            `- **Distribución:** **${totalAssigned} pedidos** asignados en **${activeRows.length} camiones**${idlePlates.length > 0 ? ` (${idlePlates.length} libres: ${idlePlates.join(', ')})` : ''}.`,
            ...activeRows
        ];
        if (multiOrderClusters.length > 0) {
            lines.push(`- **Consolidaciones misma sede:** ${multiOrderClusters.map(c => `**${c.customerName}** (${c.memberOrderIds.length} pedidos en 1 parada)`).join(', ')}.`);
        }
        if (prioritySet.size > 0) {
            lines.push(`- **Prioritarios:** **${prioritySet.size}** pedido(s) priorizados en las primeras paradas.`);
        }
        if (refrigeratedSet.size > 0) {
            lines.push(`- **Cadena de frío:** **${refrigeratedSet.size}** pedido(s) con productos refrigerados asignados respetando furgones con frío.`);
        }
        if (geoWarnings.length > 0) {
            lines.push(`- **Alertas GPS:** **${geoWarnings.length}** pedido(s) sin coordenadas exactas (${geoWarnings.slice(0, 3).map(w => w.customerName).join(', ')}).`);
        }
        if (speedRecommendationText) {
            lines.push(`- **Sugerencia de velocidad:** ${speedRecommendationText}`);
        }
        if (unassignedOrders.length > 0) {
            lines.unshift(
                `### Atención: ${unassignedOrders.length} Pedido(s) Sin Asignar`,
                ...unassignedOrders.slice(0, 6).map(o => `- **${o.customer_name}** (${Number(o.total_weight_kg || 0).toFixed(1)} kg) quedó fuera por capacidad o ventana horaria.`),
                `---`
            );
        }
        if (fallbackReason) {
            lines.push(`- *Resumen generado automáticamente desde métricas de Google (${fallbackReason}).*`);
        }
        return lines.join('\n');
    };

    try {
        const apiKey = getGeminiApiKey();
        if (!apiKey) {
            return buildDeterministicSummary('GEMINI_API_KEY no configurada en este entorno');
        }

        let summaryText = `Actúa como el Director de Operaciones Logísticas de FruFresco. Redacta un resumen ejecutivo concreto, directo y sin relleno sobre esta planeación real generada por Google Route Optimization.

FLOTA ACTIVA Y ASIGNACIÓN REAL:
${Object.entries(assignments).map(([vehicleId, orderIds]) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    if (!vehicle) return `- Vehículo (${vehicleId}): ${orderIds.length} pedidos`;
    if (orderIds.length === 0) return `- Camión ${vehicle.plate}: LIBRE (sin pedidos)`;
    const totalKg = orderIds.reduce((s, id) => s + (Number(orderById.get(String(id))?.total_weight_kg) || 0), 0);
    const totalCrates = orderIds.reduce((s, id) => s + (Number(orderById.get(String(id))?.crates) || 1), 0);
    const pct = vehicle.capacity_kg ? Math.round((totalKg / vehicle.capacity_kg) * 100) : 0;
    const sample = orderIds.slice(0, 8).map(id => {
        const o = orderById.get(String(id));
        return o ? `${o.customer_name} (${Number(o.total_weight_kg || 0).toFixed(1)}kg, ${o.address || 'sin dir'})` : `#${id}`;
    });
    return `- Camión ${vehicle.plate} (${vehicle.driver_name || 'Sin conductor'}, cap ${vehicle.capacity_kg}kg / ${vehicle.max_crates_capacity || 483} can.): ${orderIds.length} pedidos, ${totalKg.toFixed(1)}kg (${pct}%), ${totalCrates} can. Paradas: ${sample.join(' | ')}`;
}).join('\n')}

${multiOrderClusters.length > 0 ? `CONSOLIDACIONES MISMA SEDE (EN 1 PARADA):\n${multiOrderClusters.map(c => `- ${c.customerName}: ${c.memberOrderIds.length} pedidos (${c.weightKg.toFixed(1)}kg, ${c.crates} can.)`).join('\n')}\n` : ''}
${prioritySet.size > 0 ? `PEDIDOS PRIORITARIOS MARCADOS: ${prioritySet.size}\n` : ''}
${refrigeratedSet.size > 0 ? `PEDIDOS CON CADENA DE FRÍO (REFRIGERADOS): ${refrigeratedSet.size}\n` : ''}
${geoWarnings.length > 0 ? `ALERTAS GPS (${geoWarnings.length}): ${geoWarnings.slice(0, 5).map(w => `${w.customerName} (${w.reason})`).join('; ')}\n` : ''}
${speedRecommendationText ? `RECOMENDACIÓN PROACTIVA DE VELOCIDAD: ${speedRecommendationText}\n` : ''}

INSTRUCCIONES ESTRICTAS:
1. PROHIBIDO usar emojis unicode.
2. Usa exactamente 4 a 5 viñetas cortas con guion ("- ") y negritas (**dato**) en placas, pesos en **kg**, porcentajes de ocupación, zonas/municipios y alertas reales.
3. Menciona: (a) uso de flota y camiones libres, (b) zonas geográficas reales por camión o alertas de rutas largas, (c) consolidaciones de misma sede y prioritarios si existen, (d) cualquier cuello de botella de ocupación (>90%) o alerta GPS${speedRecommendationText ? ', y (e) incluye en una viñeta la recomendación proactiva de probar "Terminar más rápido (Velocidad)"' : ''}.`;

        if (unassignedOrders && unassignedOrders.length > 0) {
            summaryText += `\n\nATENCIÓN — PEDIDOS SIN ASIGNAR (${unassignedOrders.length}):
${unassignedOrders.map(o => `- ${o.customer_name} (${Number(o.total_weight_kg || 0).toFixed(1)}kg, ${o.crates || 1} can., ventana: ${o.display_slot || 'Flexible'})`).join('\n')}
Menciona esto en la PRIMERA viñeta explicando qué clientes quedaron por fuera.`;
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
            console.warn('[TransportOptimizer] Gemini falló, usando resumen determinista con métricas reales:', aiCascadeErr?.message || aiCascadeErr);
            return buildDeterministicSummary(aiCascadeErr?.message ? `Gemini no respondió: ${String(aiCascadeErr.message).slice(0, 80)}` : 'Gemini no respondió a tiempo');
        }

        return buildDeterministicSummary('sin texto devuelto por Gemini');
    } catch (e: any) {
        console.error('Error in generateAiExplanation wrapper:', e);
        return buildDeterministicSummary('error interno al redactar resumen IA');
    }
}
