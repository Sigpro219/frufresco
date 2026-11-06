'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import {
    RotateCcw,
    ArrowLeft,
    Truck,
    Scale,
    AlertTriangle,
    CheckCircle2,
    Trash2,
    Search,
    Calendar,
    PackageCheck,
    RefreshCw,
    Plus,
    FileCheck,
    Layers
} from 'lucide-react';
import { CATEGORY_MAP } from '@/lib/constants';

const INVENTORY_MOVEMENT_SUBTYPES = {
    ROUTE_RETURN: 'route_return',
    RETURN_SHORTAGE: 'return_shortage',
    WASTE_DAMAGE: 'waste_damage'
} as const;

interface CatalogProduct {
    id: string;
    name: string;
    accounting_id: number | null;
    unit_of_measure: string;
    category: string;
}

interface PendingRouteReturn {
    id: string;
    order_id: string | null;
    order_sequence_id: number | null;
    client_name: string;
    product_id: string;
    product_name: string;
    accounting_id: number | null;
    unit_of_measure: string;
    reported_qty: number;
    reason: string | null;
    created_at: string;
    status: string;
}

interface ReconciledReturnLog {
    id: string;
    product_id: string;
    product_name: string;
    accounting_id: number | null;
    unit_of_measure: string;
    reported_return_qty: number;
    received_in_warehouse_qty: number;
    missing_return_qty: number;
    approved_reentry_qty: number;
    waste_damage_qty: number;
    crates_returned: number;
    order_ref: string;
    created_at: string;
}

export default function OpsDevolucionesPage() {
    const supabase = createClient();

    const getBogotaDate = () => {
        return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
    };

    const [balanceDate, setBalanceDate] = useState<string>(getBogotaDate());
    const [loading, setLoading] = useState<boolean>(true);
    const [saving, setSaving] = useState<boolean>(false);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [products, setProducts] = useState<CatalogProduct[]>([]);
    const [pendingReturns, setPendingReturns] = useState<PendingRouteReturn[]>([]);
    const [reconciledLogs, setReconciledLogs] = useState<ReconciledReturnLog[]>([]);
    const [warehouseId, setWarehouseId] = useState<string | null>(null);
    const [feedbackBanner, setFeedbackBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    // Form state for D+1 Return Reconciliation (SDD Escenario 388 / DT-13)
    const [selectedReturnId, setSelectedReturnId] = useState<string | null>(null);
    const [selectedOrderId, setSelectedOrderId] = useState<string>('');
    const [orderReferenceText, setOrderReferenceText] = useState<string>('');
    const [selectedProductId, setSelectedProductId] = useState<string>('');
    const [productFilterText, setProductFilterText] = useState<string>('');
    const [reportedReturnQty, setReportedReturnQty] = useState<string>('');
    const [receivedInWarehouseQty, setReceivedInWarehouseQty] = useState<string>('');
    const [wasteDamageQty, setWasteDamageQty] = useState<string>('0');
    const [cratesReturned, setCratesReturned] = useState<string>('0');
    const [inspectorNotes, setInspectorNotes] = useState<string>('');

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [{ data: whData }, { data: prodData }] = await Promise.all([
                supabase.from('warehouses').select('id').limit(1).maybeSingle(),
                supabase
                    .from('products')
                    .select('id, name, accounting_id, unit_of_measure, category')
                    .eq('is_active', true)
                    .order('name', { ascending: true })
            ]);

            if (whData?.id) setWarehouseId(whData.id);
            setProducts((prodData as CatalogProduct[]) || []);

            const prodMap = new Map<string, CatalogProduct>();
            ((prodData as CatalogProduct[]) || []).forEach(p => prodMap.set(p.id, p));

            // 1. Fetch pending billing_returns from recent routes
            const { data: returnsData } = await supabase
                .from('billing_returns')
                .select(`
                    id, order_id, product_id, quantity_returned, reason, status, notes, created_at,
                    orders:order_id ( id, sequence_id, profiles:profile_id ( company_name, razon_social, contact_name ) )
                `)
                .in('status', ['pending_review', 'approved'])
                .order('created_at', { ascending: false })
                .limit(60);

            const formattedPending: PendingRouteReturn[] = [];
            (returnsData || []).forEach((r: Record<string, unknown>) => {
                const notesStr = String(r.notes || '');
                if (notesStr.includes('[CONCILIADO_D1_MUELLE]')) return;
                const prod = prodMap.get(String(r.product_id || ''));
                if (!prod) return;
                const ordRaw = r.orders as { sequence_id?: number; profiles?: { company_name?: string; razon_social?: string; contact_name?: string } } | null;
                const prof = ordRaw?.profiles;
                const clientName = prof?.company_name || prof?.razon_social || prof?.contact_name || 'Ruta General';
                formattedPending.push({
                    id: String(r.id),
                    order_id: r.order_id ? String(r.order_id) : null,
                    order_sequence_id: ordRaw?.sequence_id || null,
                    client_name: clientName,
                    product_id: prod.id,
                    product_name: prod.name,
                    accounting_id: prod.accounting_id,
                    unit_of_measure: prod.unit_of_measure || 'Kg',
                    reported_qty: Number(r.quantity_returned) || 0,
                    reason: r.reason ? String(r.reason) : null,
                    created_at: String(r.created_at || ''),
                    status: String(r.status || 'pending_review')
                });
            });
            setPendingReturns(formattedPending);

            // 2. Fetch reconciled return movements for the selected balanceDate
            const startIso = `${balanceDate}T00:00:00.000Z`;
            const endIso = `${balanceDate}T23:59:59.999Z`;
            const { data: movsData } = await supabase
                .from('inventory_movements')
                .select('id, product_id, quantity, reference_type, notes, created_at')
                .in('reference_type', [
                    INVENTORY_MOVEMENT_SUBTYPES.ROUTE_RETURN,
                    INVENTORY_MOVEMENT_SUBTYPES.RETURN_SHORTAGE
                ])
                .gte('created_at', startIso)
                .lte('created_at', endIso)
                .order('created_at', { ascending: false });

            const logs: ReconciledReturnLog[] = [];
            (movsData || []).forEach((m: Record<string, unknown>) => {
                if (m.reference_type !== INVENTORY_MOVEMENT_SUBTYPES.ROUTE_RETURN) return;
                const prod = prodMap.get(String(m.product_id || ''));
                const noteStr = String(m.notes || '');
                const metaMatch = noteStr.match(/\[DT13_META:\s*(\{[^\]]+\})\]/);
                let parsedMeta: Partial<ReconciledReturnLog> = {};
                if (metaMatch) {
                    try {
                        parsedMeta = JSON.parse(metaMatch[1]);
                    } catch {
                        parsedMeta = {};
                    }
                }
                const repQ = Number(parsedMeta.reported_return_qty ?? m.quantity) || 0;
                const recQ = Number(parsedMeta.received_in_warehouse_qty ?? repQ) || 0;
                const missQ = Number(parsedMeta.missing_return_qty ?? Math.max(0, repQ - recQ)) || 0;
                const wasteQ = Number(parsedMeta.waste_damage_qty ?? 0) || 0;
                const netQ = Number(parsedMeta.approved_reentry_qty ?? Math.max(0, recQ - wasteQ)) || 0;

                logs.push({
                    id: String(m.id),
                    product_id: String(m.product_id || ''),
                    product_name: prod?.name || 'Producto',
                    accounting_id: prod?.accounting_id ?? null,
                    unit_of_measure: prod?.unit_of_measure || 'Kg',
                    reported_return_qty: repQ,
                    received_in_warehouse_qty: recQ,
                    missing_return_qty: missQ,
                    approved_reentry_qty: netQ,
                    waste_damage_qty: wasteQ,
                    crates_returned: Number(parsedMeta.crates_returned || 0),
                    order_ref: String(parsedMeta.order_ref || 'Retorno de Ruta'),
                    created_at: String(m.created_at || '')
                });
            });
            setReconciledLogs(logs);
        } catch (err) {
            console.error('Error loading devoluciones data:', err);
        } finally {
            setLoading(false);
        }
    }, [balanceDate, supabase]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Calculated mass balance preview (SDD Escenario 388)
    const numReported = Math.max(0, parseFloat(reportedReturnQty) || 0);
    const numReceived = Math.max(0, parseFloat(receivedInWarehouseQty) || 0);
    const numWaste = Math.max(0, parseFloat(wasteDamageQty) || 0);
    const numShortageColO2 = Math.max(0, Math.round((numReported - numReceived) * 100) / 100);
    const numApprovedNetReentry = Math.max(0, Math.round((numReceived - numWaste) * 100) / 100);
    const isWasteExceedingReceived = numWaste > numReceived + 0.001;
    const isReceivedExceedingReported = numReceived > numReported + 0.001;

    const handleSelectPendingReturn = (item: PendingRouteReturn) => {
        setSelectedReturnId(item.id);
        setSelectedOrderId(item.order_id || '');
        setOrderReferenceText(item.order_sequence_id ? `Pedido #${item.order_sequence_id} - ${item.client_name}` : item.client_name);
        setSelectedProductId(item.product_id);
        setProductFilterText(`#${item.accounting_id ?? 'S/N'} - ${item.product_name}`);
        setReportedReturnQty(String(item.reported_qty));
        setReceivedInWarehouseQty(String(item.reported_qty));
        setWasteDamageQty('0');
        setInspectorNotes(item.reason || '');
    };

    const handleSaveReconciliation = async (e: React.FormEvent) => {
        e.preventDefault();
        setFeedbackBanner(null);

        if (!selectedProductId) {
            setFeedbackBanner({ type: 'error', message: 'Selecciona un producto del catálogo para conciliar la devolución.' });
            return;
        }
        if (numReported <= 0) {
            setFeedbackBanner({ type: 'error', message: 'La cantidad reportada como devuelta en ruta (Col O) debe ser mayor a 0.' });
            return;
        }
        if (isReceivedExceedingReported) {
            setFeedbackBanner({ type: 'error', message: 'La cantidad recibida en camión no puede superar la cantidad reportada devuelta.' });
            return;
        }
        if (isWasteExceedingReceived) {
            setFeedbackBanner({ type: 'error', message: 'La cantidad dañada (Col Q) no puede superar la masa física recibida del camión.' });
            return;
        }

        setSaving(true);
        try {
            const timestampIso = `${balanceDate}T12:00:00.000Z`;
            const selectedProd = products.find(p => p.id === selectedProductId);
            const metaPayload = {
                reported_return_qty: numReported,
                received_in_warehouse_qty: numReceived,
                missing_return_qty: numShortageColO2,
                approved_reentry_qty: numApprovedNetReentry,
                waste_damage_qty: numWaste,
                crates_returned: parseInt(cratesReturned, 10) || 0,
                order_ref: orderReferenceText || 'Retorno de Ruta'
            };

            const movementsToInsert: Array<Record<string, unknown>> = [
                // 1. Columna O: DEVOLUCIONES (+) -> Total reportado en ruta
                {
                    product_id: selectedProductId,
                    warehouse_id: warehouseId,
                    quantity: numReported,
                    type: 'entry',
                    status_to: 'available',
                    reference_type: INVENTORY_MOVEMENT_SUBTYPES.ROUTE_RETURN,
                    reference_id: selectedOrderId || null,
                    notes: `[DEVOLUCIÓN RUTA D+1 -> COL O (+${numReported})] ${orderReferenceText || 'Camión'} | Recibido físico: ${numReceived} | Apto neto: +${numApprovedNetReentry} ${inspectorNotes ? `| Nota: ${inspectorNotes}` : ''} [DT13_META: ${JSON.stringify(metaPayload)}]`,
                    created_at: timestampIso
                }
            ];

            // 2. Columna O2: FALTANTE DE DEVOLUCIONES (-) -> Diferencia que no llegó en el camión
            if (numShortageColO2 > 0) {
                movementsToInsert.push({
                    product_id: selectedProductId,
                    warehouse_id: warehouseId,
                    quantity: -numShortageColO2,
                    type: 'exit',
                    status_to: 'available',
                    reference_type: INVENTORY_MOVEMENT_SUBTYPES.RETURN_SHORTAGE,
                    reference_id: selectedOrderId || null,
                    notes: `[FALTANTE DEVOLUCIÓN CAMIÓN -> COL O2 (-${numShortageColO2})] Reportado: ${numReported} vs Recibido: ${numReceived} (${orderReferenceText || 'Ruta'})`,
                    created_at: timestampIso
                });
            }

            // 3. Columna Q: DESPERDICIO / AVERÍA (-) -> Parte recibida del camión no apta para reingreso
            if (numWaste > 0) {
                movementsToInsert.push({
                    product_id: selectedProductId,
                    warehouse_id: warehouseId,
                    quantity: -numWaste,
                    type: 'exit',
                    status_to: 'available',
                    reference_type: INVENTORY_MOVEMENT_SUBTYPES.WASTE_DAMAGE,
                    reference_id: selectedOrderId || null,
                    notes: `[AVERÍA EN DEVOLUCIÓN POST-CIERRE -> COL Q (-${numWaste})] Producto no apto al revisar retorno (${orderReferenceText || 'Ruta'})`,
                    created_at: timestampIso
                });
            }

            const { error: movErr } = await supabase.from('inventory_movements').insert(movementsToInsert);
            if (movErr) throw movErr;

            // 4. Actualizar stock físico disponible con el neto apto (+numApprovedNetReentry)
            if (numApprovedNetReentry > 0 && warehouseId) {
                const { data: currentStock } = await supabase
                    .from('inventory_stocks')
                    .select('id, quantity')
                    .eq('product_id', selectedProductId)
                    .eq('warehouse_id', warehouseId)
                    .eq('status', 'available')
                    .maybeSingle();

                if (currentStock?.id) {
                    await supabase
                        .from('inventory_stocks')
                        .update({ quantity: Number(currentStock.quantity || 0) + numApprovedNetReentry })
                        .eq('id', currentStock.id);
                }
            }

            // 5. Si venía de un billing_returns pendiente, marcar su nota como conciliada en muelle
            if (selectedReturnId) {
                const targetRet = pendingReturns.find(r => r.id === selectedReturnId);
                await supabase
                    .from('billing_returns')
                    .update({
                        notes: `${targetRet?.reason || ''} [CONCILIADO_D1_MUELLE: ${balanceDate} | Col O: +${numReported}, Col O2: -${numShortageColO2}, Col Q: -${numWaste}, Neto: +${numApprovedNetReentry}]`
                    })
                    .eq('id', selectedReturnId);
            }

            setFeedbackBanner({
                type: 'success',
                message: `Devolución conciliada en Balance D+1 (${selectedProd?.name || 'SKU'}): Col O +${numReported} | Col O2 -${numShortageColO2} | Col Q -${numWaste} => Neto Disponible +${numApprovedNetReentry}`
            });

            // Reset form
            setSelectedReturnId(null);
            setSelectedOrderId('');
            setOrderReferenceText('');
            setSelectedProductId('');
            setProductFilterText('');
            setReportedReturnQty('');
            setReceivedInWarehouseQty('');
            setWasteDamageQty('0');
            setCratesReturned('0');
            setInspectorNotes('');

            await loadData();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error al registrar conciliación de devolución';
            setFeedbackBanner({ type: 'error', message: msg });
        } finally {
            setSaving(false);
        }
    };

    const filteredProducts = useMemo(() => {
        const q = productFilterText.trim().toLowerCase();
        if (!q) return products.slice(0, 40);
        return products
            .filter(
                p =>
                    p.name.toLowerCase().includes(q) ||
                    String(p.accounting_id ?? '').includes(q)
            )
            .slice(0, 40);
    }, [products, productFilterText]);

    const filteredLogs = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return reconciledLogs;
        return reconciledLogs.filter(
            l =>
                l.product_name.toLowerCase().includes(q) ||
                String(l.accounting_id ?? '').includes(q) ||
                l.order_ref.toLowerCase().includes(q)
        );
    }, [reconciledLogs, searchQuery]);

    const summaryTotals = useMemo(() => {
        return reconciledLogs.reduce(
            (acc, r) => ({
                reportedColO: Math.round((acc.reportedColO + r.reported_return_qty) * 100) / 100,
                shortageColO2: Math.round((acc.shortageColO2 + r.missing_return_qty) * 100) / 100,
                wasteColQ: Math.round((acc.wasteColQ + r.waste_damage_qty) * 100) / 100,
                netAvailable: Math.round((acc.netAvailable + r.approved_reentry_qty) * 100) / 100
            }),
            { reportedColO: 0, shortageColO2: 0, wasteColQ: 0, netAvailable: 0 }
        );
    }, [reconciledLogs]);

    return (
        <div
            style={{
                minHeight: '100vh',
                backgroundColor: 'var(--ops-bg)',
                color: 'var(--ops-text)',
                padding: '1.25rem',
                paddingBottom: '100px',
                fontFamily: "'Inter', sans-serif"
            }}
        >
            <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
                {/* Cabecera Estándar onFRU OPS */}
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '1rem',
                        marginBottom: '1.25rem',
                        backgroundColor: 'var(--ops-surface)',
                        border: '1px solid var(--ops-border)',
                        borderRadius: '18px',
                        padding: '1rem 1.25rem'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                        <Link
                            href="/ops"
                            style={{
                                width: '42px',
                                height: '42px',
                                borderRadius: '12px',
                                backgroundColor: 'var(--ops-bg)',
                                border: '1px solid var(--ops-border)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'var(--ops-text)',
                                textDecoration: 'none'
                            }}
                            title="Volver al Centro de Mando OPS"
                        >
                            <ArrowLeft size={20} />
                        </Link>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span
                                    style={{
                                        backgroundColor: 'rgba(16, 185, 129, 0.12)',
                                        color: 'var(--ops-primary)',
                                        border: '1px solid rgba(16, 185, 129, 0.3)',
                                        padding: '2px 8px',
                                        borderRadius: '6px',
                                        fontSize: '0.7rem',
                                        fontWeight: 800,
                                        letterSpacing: '0.06em',
                                        textTransform: 'uppercase'
                                    }}
                                >
                                    ESTACIÓN 09 • POST-CIERRE D+1
                                </span>
                            </div>
                            <h1
                                style={{
                                    margin: '4px 0 0 0',
                                    fontFamily: "'Outfit', sans-serif",
                                    fontSize: '1.45rem',
                                    fontWeight: 900,
                                    letterSpacing: '-0.02em',
                                    color: 'var(--ops-text)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}
                            >
                                <RotateCcw size={22} color="#10B981" />
                                Conciliación de Devoluciones de Ruta (Col O / O2 / Q)
                            </h1>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                backgroundColor: 'var(--ops-bg)',
                                border: '1px solid var(--ops-border)',
                                borderRadius: '12px',
                                padding: '0.45rem 0.85rem'
                            }}
                        >
                            <Calendar size={16} color="#10B981" />
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--ops-text-muted)' }}>
                                Balance D+1:
                            </span>
                            <input
                                type="date"
                                value={balanceDate}
                                onChange={e => setBalanceDate(e.target.value)}
                                style={{
                                    backgroundColor: 'transparent',
                                    border: 'none',
                                    color: 'var(--ops-text)',
                                    fontWeight: 800,
                                    fontSize: '0.85rem',
                                    outline: 'none'
                                }}
                            />
                        </div>

                        <button
                            type="button"
                            onClick={loadData}
                            style={{
                                height: '42px',
                                padding: '0 1rem',
                                borderRadius: '12px',
                                backgroundColor: 'var(--ops-bg)',
                                border: '1px solid var(--ops-border)',
                                color: 'var(--ops-text)',
                                fontWeight: 800,
                                fontSize: '0.8rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                cursor: 'pointer'
                            }}
                        >
                            <RefreshCw size={15} /> Actualizar
                        </button>
                    </div>
                </div>

                {/* KPIs de Ecuación de Conservación de Masa en D+1 */}
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                        gap: '0.85rem',
                        marginBottom: '1.25rem'
                    }}
                >
                    <div
                        style={{
                            backgroundColor: 'var(--ops-surface)',
                            border: '1px solid var(--ops-border)',
                            borderRadius: '16px',
                            padding: '1rem 1.15rem'
                        }}
                    >
                        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--ops-text-muted)', textTransform: 'uppercase' }}>
                            1. Reportado en Ruta (Col O +)
                        </div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#3B82F6', fontFamily: "'Outfit', sans-serif", marginTop: '4px' }}>
                            +{summaryTotals.reportedColO.toFixed(2)} Kg
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--ops-text-muted)', marginTop: '2px' }}>
                            Total devuelto según remisión/ruta
                        </div>
                    </div>

                    <div
                        style={{
                            backgroundColor: 'var(--ops-surface)',
                            border: '1px solid var(--ops-border)',
                            borderRadius: '16px',
                            padding: '1rem 1.15rem'
                        }}
                    >
                        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--ops-text-muted)', textTransform: 'uppercase' }}>
                            2. Faltante de Camión (Col O2 -)
                        </div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#EF4444', fontFamily: "'Outfit', sans-serif", marginTop: '4px' }}>
                            -{summaryTotals.shortageColO2.toFixed(2)} Kg
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--ops-text-muted)', marginTop: '2px' }}>
                            Reportado en ruta pero no llegó a bodega
                        </div>
                    </div>

                    <div
                        style={{
                            backgroundColor: 'var(--ops-surface)',
                            border: '1px solid var(--ops-border)',
                            borderRadius: '16px',
                            padding: '1rem 1.15rem'
                        }}
                    >
                        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--ops-text-muted)', textTransform: 'uppercase' }}>
                            3. Avería / Dañado (Col Q -)
                        </div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#F59E0B', fontFamily: "'Outfit', sans-serif", marginTop: '4px' }}>
                            -{summaryTotals.wasteColQ.toFixed(2)} Kg
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--ops-text-muted)', marginTop: '2px' }}>
                            Llegó en camión pero no apto para venta
                        </div>
                    </div>

                    <div
                        style={{
                            backgroundColor: 'var(--ops-surface)',
                            border: '1px solid rgba(16, 185, 129, 0.4)',
                            borderRadius: '16px',
                            padding: '1rem 1.15rem'
                        }}
                    >
                        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#10B981', textTransform: 'uppercase' }}>
                            = Neto Reintegrado Disponible
                        </div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#10B981', fontFamily: "'Outfit', sans-serif", marginTop: '4px' }}>
                            +{summaryTotals.netAvailable.toFixed(2)} Kg
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--ops-text-muted)', marginTop: '2px' }}>
                            Equilibrio: +Col O - Col O2 - Col Q
                        </div>
                    </div>
                </div>

                {feedbackBanner && (
                    <div
                        style={{
                            marginBottom: '1.25rem',
                            padding: '0.9rem 1.15rem',
                            borderRadius: '14px',
                            backgroundColor: feedbackBanner.type === 'success' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                            border: `1px solid ${feedbackBanner.type === 'success' ? '#10B981' : '#EF4444'}`,
                            color: feedbackBanner.type === 'success' ? '#10B981' : '#EF4444',
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}
                    >
                        {feedbackBanner.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                        <span>{feedbackBanner.message}</span>
                    </div>
                )}

                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
                        gap: '1.25rem',
                        alignItems: 'start'
                    }}
                >
                    {/* Panel Izquierdo: Formulario de Recepción y Clasificación de Devolución */}
                    <div
                        style={{
                            backgroundColor: 'var(--ops-surface)',
                            border: '1px solid var(--ops-border)',
                            borderRadius: '18px',
                            padding: '1.25rem'
                        }}
                    >
                        <h2
                            style={{
                                margin: '0 0 0.35rem 0',
                                fontFamily: "'Outfit', sans-serif",
                                fontSize: '1.1rem',
                                fontWeight: 800,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}
                        >
                            <Scale size={18} color="#10B981" />
                            Registrar Recepción Física de Retorno en Muelle
                        </h2>
                        <p style={{ margin: '0 0 1rem 0', fontSize: '0.78rem', color: 'var(--ops-text-muted)' }}>
                            Selecciona una devolución pendiente de ruta o registra directamente el pesaje de llegada del camión para el balance del día siguiente (D+1).
                        </p>

                        <form onSubmit={handleSaveReconciliation} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--ops-text-muted)', marginBottom: '4px' }}>
                                    PRODUCTO (#ID CONTABLE Y NOMBRE)
                                </label>
                                <input
                                    type="text"
                                    placeholder="Buscar por #ID Contable o nombre (ej. Tomate)..."
                                    value={productFilterText}
                                    onChange={e => setProductFilterText(e.target.value)}
                                    style={{
                                        width: '100%',
                                        height: '42px',
                                        padding: '0 0.85rem',
                                        borderRadius: '10px',
                                        backgroundColor: 'var(--ops-bg)',
                                        border: '1px solid var(--ops-border)',
                                        color: 'var(--ops-text)',
                                        fontSize: '0.85rem',
                                        marginBottom: '6px'
                                    }}
                                />
                                <select
                                    value={selectedProductId}
                                    onChange={e => setSelectedProductId(e.target.value)}
                                    style={{
                                        width: '100%',
                                        height: '44px',
                                        padding: '0 0.85rem',
                                        borderRadius: '10px',
                                        backgroundColor: 'var(--ops-bg)',
                                        border: '1px solid var(--ops-border)',
                                        color: 'var(--ops-text)',
                                        fontWeight: 700,
                                        fontSize: '0.85rem'
                                    }}
                                >
                                    <option value="">-- Seleccionar producto devuelto --</option>
                                    {filteredProducts.map(p => (
                                        <option key={p.id} value={p.id}>
                                            #{p.accounting_id ?? 'S/N'} • {p.name} ({p.unit_of_measure || 'Kg'} - {CATEGORY_MAP[p.category] || p.category})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: 'var(--ops-text-muted)', marginBottom: '4px' }}>
                                        1. REPORTADO EN RUTA (COL O +)
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        placeholder="Ej. 30"
                                        value={reportedReturnQty}
                                        onChange={e => setReportedReturnQty(e.target.value)}
                                        style={{
                                            width: '100%',
                                            height: '44px',
                                            padding: '0 0.85rem',
                                            borderRadius: '10px',
                                            backgroundColor: 'var(--ops-bg)',
                                            border: '1px solid var(--ops-border)',
                                            color: 'var(--ops-text)',
                                            fontWeight: 800,
                                            fontSize: '0.95rem'
                                        }}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: 'var(--ops-text-muted)', marginBottom: '4px' }}>
                                        2. LLEGÓ FÍSICO EN CAMIÓN (KG)
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        placeholder="Ej. 20"
                                        value={receivedInWarehouseQty}
                                        onChange={e => setReceivedInWarehouseQty(e.target.value)}
                                        style={{
                                            width: '100%',
                                            height: '44px',
                                            padding: '0 0.85rem',
                                            borderRadius: '10px',
                                            backgroundColor: 'var(--ops-bg)',
                                            border: '1px solid var(--ops-border)',
                                            color: 'var(--ops-text)',
                                            fontWeight: 800,
                                            fontSize: '0.95rem'
                                        }}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: 'var(--ops-text-muted)', marginBottom: '4px' }}>
                                        3. DAÑADO / AVERÍA (COL Q -)
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        placeholder="Ej. 10"
                                        value={wasteDamageQty}
                                        onChange={e => setWasteDamageQty(e.target.value)}
                                        style={{
                                            width: '100%',
                                            height: '44px',
                                            padding: '0 0.85rem',
                                            borderRadius: '10px',
                                            backgroundColor: 'var(--ops-bg)',
                                            border: '1px solid var(--ops-border)',
                                            color: 'var(--ops-text)',
                                            fontWeight: 800,
                                            fontSize: '0.95rem'
                                        }}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: 'var(--ops-text-muted)', marginBottom: '4px' }}>
                                        CANASTILLAS RETORNADAS
                                    </label>
                                    <input
                                        type="number"
                                        step="1"
                                        min="0"
                                        value={cratesReturned}
                                        onChange={e => setCratesReturned(e.target.value)}
                                        style={{
                                            width: '100%',
                                            height: '44px',
                                            padding: '0 0.85rem',
                                            borderRadius: '10px',
                                            backgroundColor: 'var(--ops-bg)',
                                            border: '1px solid var(--ops-border)',
                                            color: 'var(--ops-text)',
                                            fontWeight: 800,
                                            fontSize: '0.95rem'
                                        }}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: 'var(--ops-text-muted)', marginBottom: '4px' }}>
                                        PEDIDO / RUTA ORIGEN
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Ej. Pedido #1390 - Aldimark"
                                        value={orderReferenceText}
                                        onChange={e => setOrderReferenceText(e.target.value)}
                                        style={{
                                            width: '100%',
                                            height: '42px',
                                            padding: '0 0.85rem',
                                            borderRadius: '10px',
                                            backgroundColor: 'var(--ops-bg)',
                                            border: '1px solid var(--ops-border)',
                                            color: 'var(--ops-text)',
                                            fontSize: '0.82rem'
                                        }}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: 'var(--ops-text-muted)', marginBottom: '4px' }}>
                                        OBSERVACIÓN DE CALIDAD
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Nota de revisión post-cierre..."
                                        value={inspectorNotes}
                                        onChange={e => setInspectorNotes(e.target.value)}
                                        style={{
                                            width: '100%',
                                            height: '42px',
                                            padding: '0 0.85rem',
                                            borderRadius: '10px',
                                            backgroundColor: 'var(--ops-bg)',
                                            border: '1px solid var(--ops-border)',
                                            color: 'var(--ops-text)',
                                            fontSize: '0.82rem'
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Previsualización en Vivo de la Ecuación SDD Escenario 388 */}
                            <div
                                style={{
                                    backgroundColor: 'var(--ops-bg)',
                                    border: '1px solid var(--ops-border)',
                                    borderRadius: '12px',
                                    padding: '0.85rem 1rem',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    gap: '8px',
                                    fontSize: '0.8rem',
                                    fontWeight: 700
                                }}
                            >
                                <span>Col O: +{numReported.toFixed(2)}</span>
                                <span style={{ color: '#EF4444' }}>Col O2 (Faltante): -{numShortageColO2.toFixed(2)}</span>
                                <span style={{ color: '#F59E0B' }}>Col Q (Desperdicio): -{numWaste.toFixed(2)}</span>
                                <span style={{ color: '#10B981', fontWeight: 900 }}>
                                    = Neto Apto: +{numApprovedNetReentry.toFixed(2)}
                                </span>
                            </div>

                            <button
                                type="submit"
                                disabled={saving}
                                style={{
                                    height: '48px',
                                    borderRadius: '12px',
                                    backgroundColor: '#10B981',
                                    color: '#052E16',
                                    border: 'none',
                                    fontWeight: 900,
                                    fontSize: '0.9rem',
                                    cursor: saving ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px'
                                }}
                            >
                                <PackageCheck size={18} />
                                {saving ? 'Guardando Conciliación...' : 'Confirmar e Inyectar a Sábana D+1 (Cols O, O2 y Q)'}
                            </button>
                        </form>
                    </div>

                    {/* Panel Derecho: Retornos Reportados en Ruta y Bitácora Conciliada */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        {/* Devoluciones Pendientes de Ruta */}
                        <div
                            style={{
                                backgroundColor: 'var(--ops-surface)',
                                border: '1px solid var(--ops-border)',
                                borderRadius: '18px',
                                padding: '1.25rem'
                            }}
                        >
                            <h3
                                style={{
                                    margin: '0 0 0.75rem 0',
                                    fontFamily: "'Outfit', sans-serif",
                                    fontSize: '1rem',
                                    fontWeight: 800,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}
                            >
                                <Truck size={18} color="#3B82F6" />
                                Retornos Reportados desde Ruta Pendientes de Muelle ({pendingReturns.length})
                            </h3>

                            {pendingReturns.length === 0 ? (
                                <div style={{ padding: '1rem', fontSize: '0.82rem', color: 'var(--ops-text-muted)', textAlign: 'center' }}>
                                    No hay devoluciones de ruta pendientes por conciliar. Puedes registrar un ingreso directo en el formulario.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '240px', overflowY: 'auto' }}>
                                    {pendingReturns.map(item => (
                                        <div
                                            key={item.id}
                                            onClick={() => handleSelectPendingReturn(item)}
                                            style={{
                                                padding: '0.75rem 0.9rem',
                                                borderRadius: '12px',
                                                backgroundColor: selectedReturnId === item.id ? 'rgba(16, 185, 129, 0.12)' : 'var(--ops-bg)',
                                                border: `1px solid ${selectedReturnId === item.id ? '#10B981' : 'var(--ops-border)'}`,
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <div>
                                                <div style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--ops-text)' }}>
                                                    #{item.accounting_id ?? 'S/N'} • {item.product_name}
                                                </div>
                                                <div style={{ fontSize: '0.74rem', color: 'var(--ops-text-muted)' }}>
                                                    {item.order_sequence_id ? `Pedido #${item.order_sequence_id} • ` : ''}{item.client_name}
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontWeight: 900, fontSize: '0.9rem', color: '#3B82F6' }}>
                                                    {item.reported_qty} {item.unit_of_measure}
                                                </div>
                                                <span style={{ fontSize: '0.68rem', color: '#10B981', fontWeight: 700 }}>
                                                    Cargar en formulario →
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Bitácora Conciliada del Día */}
                        <div
                            style={{
                                backgroundColor: 'var(--ops-surface)',
                                border: '1px solid var(--ops-border)',
                                borderRadius: '18px',
                                padding: '1.25rem'
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.85rem', flexWrap: 'wrap' }}>
                                <h3
                                    style={{
                                        margin: 0,
                                        fontFamily: "'Outfit', sans-serif",
                                        fontSize: '1rem',
                                        fontWeight: 800,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px'
                                    }}
                                >
                                    <FileCheck size={18} color="#10B981" />
                                    Devoluciones Conciliadas en {balanceDate} ({filteredLogs.length})
                                </h3>
                                <div style={{ position: 'relative', minWidth: '200px' }}>
                                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--ops-text-muted)' }} />
                                    <input
                                        type="text"
                                        placeholder="Filtrar bitácora..."
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        style={{
                                            width: '100%',
                                            height: '36px',
                                            paddingLeft: '30px',
                                            paddingRight: '10px',
                                            borderRadius: '8px',
                                            backgroundColor: 'var(--ops-bg)',
                                            border: '1px solid var(--ops-border)',
                                            color: 'var(--ops-text)',
                                            fontSize: '0.78rem'
                                        }}
                                    />
                                </div>
                            </div>

                            {loading ? (
                                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--ops-text-muted)', fontSize: '0.85rem' }}>
                                    Cargando conciliaciones...
                                </div>
                            ) : filteredLogs.length === 0 ? (
                                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--ops-text-muted)', fontSize: '0.82rem' }}>
                                    Aún no se han conciliado devoluciones para la jornada {balanceDate}.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', maxHeight: '340px', overflowY: 'auto' }}>
                                    {filteredLogs.map(log => (
                                        <div
                                            key={log.id}
                                            style={{
                                                padding: '0.8rem 0.95rem',
                                                borderRadius: '12px',
                                                backgroundColor: 'var(--ops-bg)',
                                                border: '1px solid var(--ops-border)',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                flexWrap: 'wrap',
                                                gap: '8px'
                                            }}
                                        >
                                            <div>
                                                <div style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--ops-text)' }}>
                                                    #{log.accounting_id ?? 'S/N'} • {log.product_name}
                                                </div>
                                                <div style={{ fontSize: '0.73rem', color: 'var(--ops-text-muted)' }}>
                                                    {log.order_ref} {log.crates_returned > 0 ? `• ${log.crates_returned} canastillas` : ''}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.75rem', fontWeight: 800 }}>
                                                <span style={{ color: '#3B82F6' }}>Col O: +{log.reported_return_qty}</span>
                                                <span style={{ color: '#EF4444' }}>Col O2: -{log.missing_return_qty}</span>
                                                <span style={{ color: '#F59E0B' }}>Col Q: -{log.waste_damage_qty}</span>
                                                <span style={{ color: '#10B981' }}>Neto: +{log.approved_reentry_qty}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
