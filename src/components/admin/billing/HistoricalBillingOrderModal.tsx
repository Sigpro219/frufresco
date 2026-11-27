'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { addBogotaDays, getBogotaDateString } from '@/lib/dateUtils';
import { parseSpreadsheetWorkbook } from '@/lib/spreadsheets';
import {
    X,
    Search,
    Calendar,
    FileSpreadsheet,
    Plus,
    Trash2,
    CheckCircle2,
    AlertCircle,
    User,
    Package,
    Receipt,
    Loader2,
    Upload,
} from 'lucide-react';

export interface HistoricalBillingOrderModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreated: () => void;
}

interface HistoricalClient {
    id: string;
    company_name: string | null;
    razon_social: string | null;
    contact_name: string | null;
    email: string | null;
    nit: string | null;
    document_type: string | null;
    role: string | null;
    pricing_model_id: string | null;
    parent_id: string | null;
    address: string | null;
    is_active: boolean | null;
}

type PriceSource = 'agreement' | 'pricing_model' | 'cost_matrix' | 'none';

interface HistoricalCatalogProduct {
    id: string;
    name: string;
    accounting_id: string | number | null;
    unit_of_measure: string;
    iva_rate: number;
    resolved_price: number;
    price_source: PriceSource;
}

interface DraftLineItem {
    product_id: string;
    name: string;
    accounting_id: string;
    unit: string;
    iva_rate: number;
    quantityInput: string;
    unitPriceInput: string;
    price_source: PriceSource;
    priceEditedManually: boolean;
}

interface ImportFeedback {
    matchedCount: number;
    unmatchedLabels: string[];
}

function normalizeText(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeAccountingCode(value: string | number | null | undefined): string {
    if (value === null || value === undefined) return '';
    return String(value).replace(/^#+/, '').replace(/\s+/g, '').trim().toLowerCase();
}

function sanitizeDecimalInput(raw: string): string {
    const cleaned = raw.replace(/[^0-9.,]/g, '');
    const parts = cleaned.split(/[.,]/);
    if (parts.length <= 1) return cleaned;
    return `${parts[0]}.${parts.slice(1).join('')}`;
}

function parseDecimalValue(raw: string): number {
    if (!raw) return NaN;
    const normalized = raw.replace(/,/g, '.').trim();
    if (!normalized) return NaN;
    const num = Number(normalized);
    return Number.isFinite(num) ? num : NaN;
}

function subtractOneDay(yyyyMmDd: string): string {
    return addBogotaDays(yyyyMmDd, -1) || yyyyMmDd;
}

function getClientLabel(client: HistoricalClient): string {
    return (
        client.company_name?.trim() ||
        client.razon_social?.trim() ||
        client.contact_name?.trim() ||
        client.email?.trim() ||
        'Cliente sin nombre'
    );
}

function getClientDocLabel(client: HistoricalClient): 'NIT' | 'CC' {
    return client.role === 'b2c_client' ? 'CC' : 'NIT';
}

function formatCop(amount: number): string {
    return `$${Math.round(amount).toLocaleString('es-CO')} COP`;
}

function getPriceSourceLabel(source: PriceSource): string {
    switch (source) {
        case 'agreement':
            return 'Acuerdo';
        case 'pricing_model':
            return 'Modelo';
        case 'cost_matrix':
            return 'Matriz';
        default:
            return 'Manual';
    }
}

export function HistoricalBillingOrderModal({
    isOpen,
    onClose,
    onCreated,
}: HistoricalBillingOrderModalProps) {
    const fallbackToday = useMemo(() => getBogotaDateString(new Date()), []);

    const [todayBogota, setTodayBogota] = useState<string>(fallbackToday);
    const [clients, setClients] = useState<HistoricalClient[]>([]);
    const [catalog, setCatalog] = useState<HistoricalCatalogProduct[]>([]);
    const [selectedClientId, setSelectedClientId] = useState<string>('');
    const [clientSearch, setClientSearch] = useState<string>('');
    const [clientDropdownOpen, setClientDropdownOpen] = useState<boolean>(false);

    const [deliveryDate, setDeliveryDate] = useState<string>(() => subtractOneDay(fallbackToday));
    const [purchaseOrderNumber, setPurchaseOrderNumber] = useState<string>('');
    const [notes, setNotes] = useState<string>('');

    const [productSearch, setProductSearch] = useState<string>('');
    const [items, setItems] = useState<DraftLineItem[]>([]);

    const [loadingInitial, setLoadingInitial] = useState<boolean>(false);
    const [loadingCatalog, setLoadingCatalog] = useState<boolean>(false);
    const [importingFile, setImportingFile] = useState<boolean>(false);
    const [submitting, setSubmitting] = useState<boolean>(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [importFeedback, setImportFeedback] = useState<ImportFeedback | null>(null);

    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const getBearerToken = useCallback(async (): Promise<string> => {
        const {
            data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) {
            throw new Error('Sesión expirada. Recarga la página e inicia sesión nuevamente.');
        }
        return session.access_token;
    }, []);

    const fetchHistoricalData = useCallback(
        async (profileId?: string) => {
            const isProfileSwitch = Boolean(profileId);
            if (isProfileSwitch) {
                setLoadingCatalog(true);
            } else {
                setLoadingInitial(true);
            }
            setErrorMsg(null);

            try {
                const token = await getBearerToken();
                const query = profileId
                    ? `?profile_id=${encodeURIComponent(profileId)}`
                    : '';
                const res = await fetch(`/api/commercial/billing/historical-order${query}`, {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });
                const payload = await res.json();
                if (!res.ok) {
                    throw new Error(payload?.error || 'Error cargando datos históricos');
                }

                const serverToday = String(payload?.today_bogota || fallbackToday);
                setTodayBogota(serverToday);
                if (!isProfileSwitch) {
                    setDeliveryDate(subtractOneDay(serverToday));
                    setClients(Array.isArray(payload?.clients) ? payload.clients : []);
                }

                const nextCatalog: HistoricalCatalogProduct[] = Array.isArray(payload?.catalog)
                    ? payload.catalog
                    : [];
                setCatalog(nextCatalog);

                // Re-sync prices for non-manually-edited items when client changes
                if (isProfileSwitch) {
                    const catalogMap = new Map(nextCatalog.map((p) => [p.id, p]));
                    setItems((prev) =>
                        prev.map((row) => {
                            if (row.priceEditedManually) return row;
                            const match = catalogMap.get(row.product_id);
                            if (!match) return row;
                            return {
                                ...row,
                                unitPriceInput: String(match.resolved_price ?? 0),
                                price_source: match.price_source,
                            };
                        })
                    );
                }
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : 'Error consultando el servidor';
                setErrorMsg(message);
            } finally {
                setLoadingInitial(false);
                setLoadingCatalog(false);
            }
        },
        [fallbackToday, getBearerToken]
    );

    useEffect(() => {
        if (!isOpen) return;
        setSelectedClientId('');
        setClientSearch('');
        setClientDropdownOpen(false);
        setPurchaseOrderNumber('');
        setNotes('');
        setProductSearch('');
        setItems([]);
        setImportFeedback(null);
        setErrorMsg(null);
        fetchHistoricalData();
    }, [isOpen, fetchHistoricalData]);

    const selectedClient = useMemo(
        () => clients.find((c) => c.id === selectedClientId) || null,
        [clients, selectedClientId]
    );

    const filteredClients = useMemo(() => {
        const term = normalizeText(clientSearch);
        if (!term) return clients.slice(0, 40);
        return clients
            .filter((c) => {
                const haystack = normalizeText(
                    [
                        c.company_name || '',
                        c.razon_social || '',
                        c.contact_name || '',
                        c.nit || '',
                        c.email || '',
                    ].join(' ')
                );
                return haystack.includes(term);
            })
            .slice(0, 40);
    }, [clients, clientSearch]);

    const filteredCatalog = useMemo(() => {
        const term = normalizeText(productSearch);
        if (!term) return [];
        const cleanCodeTerm = normalizeAccountingCode(productSearch);
        return catalog
            .filter((p) => {
                const code = normalizeAccountingCode(p.accounting_id);
                const name = normalizeText(p.name || '');
                return (
                    (cleanCodeTerm && code.includes(cleanCodeTerm)) ||
                    name.includes(term)
                );
            })
            .slice(0, 20);
    }, [catalog, productSearch]);

    const handleSelectClient = (client: HistoricalClient) => {
        setSelectedClientId(client.id);
        setClientSearch(getClientLabel(client));
        setClientDropdownOpen(false);
        fetchHistoricalData(client.id);
    };

    const handleAddProduct = (prod: HistoricalCatalogProduct) => {
        setItems((prev) => {
            const existingIdx = prev.findIndex((item) => item.product_id === prod.id);
            if (existingIdx !== -1) {
                return prev.map((item, idx) => {
                    if (idx !== existingIdx) return item;
                    const currentQty = parseDecimalValue(item.quantityInput);
                    const nextQty = Number.isFinite(currentQty) && currentQty > 0 ? currentQty + 1 : 1;
                    return { ...item, quantityInput: String(nextQty) };
                });
            }
            return [
                ...prev,
                {
                    product_id: prod.id,
                    name: prod.name,
                    accounting_id: prod.accounting_id !== null && prod.accounting_id !== undefined ? String(prod.accounting_id) : '',
                    unit: prod.unit_of_measure || 'Kg',
                    iva_rate: Number(prod.iva_rate || 0),
                    quantityInput: '1',
                    unitPriceInput: String(prod.resolved_price ?? 0),
                    price_source: prod.price_source,
                    priceEditedManually: false,
                },
            ];
        });
        setProductSearch('');
    };

    const handleUpdateItemQuantity = (productId: string, raw: string) => {
        const sanitized = sanitizeDecimalInput(raw);
        setItems((prev) =>
            prev.map((item) =>
                item.product_id === productId ? { ...item, quantityInput: sanitized } : item
            )
        );
    };

    const handleUpdateItemPrice = (productId: string, raw: string) => {
        const sanitized = sanitizeDecimalInput(raw);
        setItems((prev) =>
            prev.map((item) =>
                item.product_id === productId
                    ? { ...item, unitPriceInput: sanitized, priceEditedManually: true }
                    : item
            )
        );
    };

    const handleRemoveItem = (productId: string) => {
        setItems((prev) => prev.filter((item) => item.product_id !== productId));
    };

    const matchCatalogProduct = useCallback(
        (pluOrCode?: string, originalName?: string): HistoricalCatalogProduct | null => {
            const targetCode = normalizeAccountingCode(pluOrCode);
            if (targetCode) {
                const byCode = catalog.find(
                    (p) => normalizeAccountingCode(p.accounting_id) === targetCode
                );
                if (byCode) return byCode;
            }

            const targetName = normalizeText(originalName || '');
            if (!targetName) return null;

            const exactByName = catalog.find((p) => normalizeText(p.name) === targetName);
            if (exactByName) return exactByName;

            const containsMatch = catalog.find((p) => {
                const prodName = normalizeText(p.name);
                return prodName.includes(targetName) || targetName.includes(prodName);
            });
            return containsMatch || null;
        },
        [catalog]
    );

    const handleSpreadsheetImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;

        setImportingFile(true);
        setErrorMsg(null);
        setImportFeedback(null);

        try {
            const buffer = await file.arrayBuffer();
            const XLSX = await import('xlsx');
            const workbook = XLSX.read(buffer, { type: 'array' });
            const { extractedItems } = parseSpreadsheetWorkbook(workbook, XLSX);

            if (extractedItems.length === 0) {
                throw new Error('No se encontraron filas con producto y cantidad en el archivo.');
            }

            let matchedCount = 0;
            const unmatchedLabels: string[] = [];
            const aggregated = new Map<string, { prod: HistoricalCatalogProduct; qty: number }>();

            for (const row of extractedItems) {
                const match = matchCatalogProduct(row.plu, row.originalName);
                if (!match) {
                    const label = row.plu ? `#${row.plu} - ${row.originalName}` : row.originalName;
                    unmatchedLabels.push(label);
                    continue;
                }
                matchedCount += 1;
                const prev = aggregated.get(match.id);
                if (prev) {
                    prev.qty += row.quantity;
                } else {
                    aggregated.set(match.id, { prod: match, qty: row.quantity });
                }
            }

            setItems((prev) => {
                const nextMap = new Map(prev.map((item) => [item.product_id, { ...item }]));
                aggregated.forEach(({ prod, qty }) => {
                    const existing = nextMap.get(prod.id);
                    if (existing) {
                        const prevQty = parseDecimalValue(existing.quantityInput);
                        const merged = (Number.isFinite(prevQty) && prevQty > 0 ? prevQty : 0) + qty;
                        existing.quantityInput = String(Number(merged.toFixed(3)));
                    } else {
                        nextMap.set(prod.id, {
                            product_id: prod.id,
                            name: prod.name,
                            accounting_id:
                                prod.accounting_id !== null && prod.accounting_id !== undefined
                                    ? String(prod.accounting_id)
                                    : '',
                            unit: prod.unit_of_measure || 'Kg',
                            iva_rate: Number(prod.iva_rate || 0),
                            quantityInput: String(Number(qty.toFixed(3))),
                            unitPriceInput: String(prod.resolved_price ?? 0),
                            price_source: prod.price_source,
                            priceEditedManually: false,
                        });
                    }
                });
                return Array.from(nextMap.values());
            });

            setImportFeedback({ matchedCount, unmatchedLabels });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Error procesando la planilla';
            setErrorMsg(message);
        } finally {
            setImportingFile(false);
        }
    };

    const totals = useMemo(() => {
        let subtotal = 0;
        let iva = 0;
        let invalidCount = 0;

        for (const item of items) {
            const qty = parseDecimalValue(item.quantityInput);
            const price = parseDecimalValue(item.unitPriceInput);
            if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price < 0) {
                invalidCount += 1;
                continue;
            }
            const lineSubtotal = qty * price;
            const lineIva = lineSubtotal * (Math.max(0, item.iva_rate) / 100);
            subtotal += lineSubtotal;
            iva += lineIva;
        }

        return {
            subtotal,
            iva,
            total: subtotal + iva,
            invalidCount,
        };
    }, [items]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg(null);

        if (!selectedClientId) {
            setErrorMsg('Selecciona un cliente para continuar.');
            return;
        }
        if (!deliveryDate || deliveryDate > todayBogota) {
            setErrorMsg(`La fecha de entrega histórica debe ser menor o igual a ${todayBogota}.`);
            return;
        }
        if (items.length === 0) {
            setErrorMsg('Agrega al menos un producto al pedido histórico.');
            return;
        }
        if (totals.invalidCount > 0) {
            setErrorMsg('Revisa que todas las cantidades sean mayores a 0 y los precios válidos (>= 0).');
            return;
        }

        setSubmitting(true);
        try {
            const token = await getBearerToken();
            const payloadItems = items.map((item) => ({
                product_id: item.product_id,
                quantity: parseDecimalValue(item.quantityInput),
                unit_price: parseDecimalValue(item.unitPriceInput),
                unit: item.unit || null,
            }));

            const res = await fetch('/api/commercial/billing/historical-order', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    profile_id: selectedClientId,
                    delivery_date: deliveryDate,
                    purchase_order_number: purchaseOrderNumber.trim() || null,
                    notes: notes.trim() || null,
                    items: payloadItems,
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data?.error || 'No se pudo crear el pedido histórico.');
            }

            onCreated();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Error guardando pedido histórico';
            setErrorMsg(message);
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1200,
                backgroundColor: 'rgba(15, 23, 42, 0.6)',
                backdropFilter: 'blur(4px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1rem',
            }}
            onClick={onClose}
        >
            <div
                style={{
                    width: '100%',
                    maxWidth: '980px',
                    maxHeight: '92vh',
                    backgroundColor: '#FFFFFF',
                    borderRadius: '16px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div
                    style={{
                        padding: '1.1rem 1.5rem',
                        borderBottom: '1px solid #E2E8F0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: '#F8FAFC',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div
                            style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: '10px',
                                backgroundColor: '#EFF6FF',
                                border: '1px solid #BFDBFE',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#1D4ED8',
                            }}
                        >
                            <Receipt size={20} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900, color: '#0F172A' }}>
                                Nuevo Pedido Histórico (Solo Facturación)
                            </h2>
                            <p style={{ margin: 0, fontSize: '0.76rem', color: '#475569' }}>
                                Carril aislado <code style={{ fontWeight: 700 }}>billing_only</code> — no afecta bodega, inventario ni rutas.
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        aria-label="Cerrar modal"
                        style={{
                            width: '34px',
                            height: '34px',
                            borderRadius: '8px',
                            border: '1px solid #CBD5E1',
                            backgroundColor: '#FFFFFF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#475569',
                            cursor: 'pointer',
                        }}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Form Body */}
                <form
                    onSubmit={handleSubmit}
                    style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
                >
                    <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                        {errorMsg && (
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '0.75rem 1rem',
                                    borderRadius: '10px',
                                    backgroundColor: '#FEF2F2',
                                    border: '1px solid #FECACA',
                                    color: '#991B1B',
                                    fontSize: '0.82rem',
                                    fontWeight: 700,
                                }}
                            >
                                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                                <span>{errorMsg}</span>
                            </div>
                        )}

                        {loadingInitial ? (
                            <div style={{ padding: '2.5rem', textAlign: 'center', color: '#64748B', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                <Loader2 size={18} className="animate-spin" />
                                <span>Cargando clientes y catálogo comercial...</span>
                            </div>
                        ) : (
                            <>
                                {/* Step 1 & 2: Client, Date, OC, Notes */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: '0.85rem' }}>
                                    {/* Searchable Client Selector */}
                                    <div style={{ gridColumn: 'span 6 / span 6', position: 'relative' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', fontWeight: 800, color: '#334155', marginBottom: '0.35rem' }}>
                                            <User size={14} />
                                            <span>Cliente (B2B / Hogar) *</span>
                                        </label>
                                        <div style={{ position: 'relative' }}>
                                            <Search
                                                size={15}
                                                color="#64748B"
                                                style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                                            />
                                            <input
                                                type="text"
                                                value={clientSearch}
                                                onFocus={() => setClientDropdownOpen(true)}
                                                onChange={(e) => {
                                                    setClientSearch(e.target.value);
                                                    setClientDropdownOpen(true);
                                                    if (selectedClientId) setSelectedClientId('');
                                                }}
                                                placeholder="Buscar por razón social, contacto o NIT/CC..."
                                                style={{
                                                    width: '100%',
                                                    padding: '0.55rem 0.75rem 0.55rem 2rem',
                                                    borderRadius: '8px',
                                                    border: selectedClient ? '1.5px solid #2563EB' : '1px solid #CBD5E1',
                                                    fontSize: '0.84rem',
                                                    color: '#0F172A',
                                                    backgroundColor: '#FFFFFF',
                                                }}
                                            />
                                        </div>

                                        {selectedClient && (
                                            <div style={{ marginTop: '4px', fontSize: '0.72rem', color: '#1E40AF', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <CheckCircle2 size={13} />
                                                <span>
                                                    {getClientDocLabel(selectedClient)}: {selectedClient.nit || 'Sin documento'}
                                                    {loadingCatalog ? ' • Actualizando tarifas...' : ''}
                                                </span>
                                            </div>
                                        )}

                                        {clientDropdownOpen && filteredClients.length > 0 && (
                                            <div
                                                style={{
                                                    position: 'absolute',
                                                    top: 'calc(100% + 4px)',
                                                    left: 0,
                                                    right: 0,
                                                    maxHeight: '220px',
                                                    overflowY: 'auto',
                                                    backgroundColor: '#FFFFFF',
                                                    border: '1px solid #CBD5E1',
                                                    borderRadius: '10px',
                                                    boxShadow: '0 10px 25px rgba(15, 23, 42, 0.14)',
                                                    zIndex: 30,
                                                }}
                                            >
                                                {filteredClients.map((c) => (
                                                    <button
                                                        key={c.id}
                                                        type="button"
                                                        onClick={() => handleSelectClient(c)}
                                                        style={{
                                                            width: '100%',
                                                            textAlign: 'left',
                                                            padding: '0.55rem 0.8rem',
                                                            border: 'none',
                                                            borderBottom: '1px solid #F1F5F9',
                                                            backgroundColor: c.id === selectedClientId ? '#EFF6FF' : '#FFFFFF',
                                                            cursor: 'pointer',
                                                        }}
                                                    >
                                                        <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A' }}>
                                                            {getClientLabel(c)}
                                                        </div>
                                                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                                            {getClientDocLabel(c)}: {c.nit || 'N/A'} {c.address ? `• ${c.address}` : ''}
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Delivery Date */}
                                    <div style={{ gridColumn: 'span 3 / span 3' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', fontWeight: 800, color: '#334155', marginBottom: '0.35rem' }}>
                                            <Calendar size={14} />
                                            <span>Fecha Entrega Histórica *</span>
                                        </label>
                                        <input
                                            type="date"
                                            value={deliveryDate}
                                            max={todayBogota}
                                            onChange={(e) => setDeliveryDate(e.target.value)}
                                            required
                                            style={{
                                                width: '100%',
                                                padding: '0.52rem 0.7rem',
                                                borderRadius: '8px',
                                                border: '1px solid #CBD5E1',
                                                fontSize: '0.84rem',
                                                color: '#0F172A',
                                            }}
                                        />
                                    </div>

                                    {/* Purchase Order Number */}
                                    <div style={{ gridColumn: 'span 3 / span 3' }}>
                                        <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 800, color: '#334155', marginBottom: '0.35rem' }}>
                                            Orden de Compra (OC)
                                        </label>
                                        <input
                                            type="text"
                                            value={purchaseOrderNumber}
                                            onChange={(e) => setPurchaseOrderNumber(e.target.value)}
                                            placeholder="Ej: OC-4512"
                                            style={{
                                                width: '100%',
                                                padding: '0.55rem 0.75rem',
                                                borderRadius: '8px',
                                                border: '1px solid #CBD5E1',
                                                fontSize: '0.84rem',
                                                color: '#0F172A',
                                            }}
                                        />
                                    </div>

                                    {/* Optional Notes */}
                                    <div style={{ gridColumn: 'span 12 / span 12' }}>
                                        <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 800, color: '#334155', marginBottom: '0.35rem' }}>
                                            Nota / Justificación (Opcional)
                                        </label>
                                        <input
                                            type="text"
                                            value={notes}
                                            onChange={(e) => setNotes(e.target.value)}
                                            placeholder="Ej: Despacho realizado con remisión física pendiente de facturación..."
                                            style={{
                                                width: '100%',
                                                padding: '0.52rem 0.75rem',
                                                borderRadius: '8px',
                                                border: '1px solid #CBD5E1',
                                                fontSize: '0.83rem',
                                                color: '#0F172A',
                                            }}
                                        />
                                    </div>
                                </div>

                                {/* Step 3: Manual Search + Spreadsheet Import */}
                                <div
                                    style={{
                                        padding: '0.9rem',
                                        borderRadius: '12px',
                                        backgroundColor: '#F8FAFC',
                                        border: '1px solid #E2E8F0',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '0.75rem',
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                                        <div style={{ position: 'relative', flex: '1 1 320px' }}>
                                            <Search
                                                size={15}
                                                color="#64748B"
                                                style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                                            />
                                            <input
                                                type="text"
                                                value={productSearch}
                                                onChange={(e) => setProductSearch(e.target.value)}
                                                placeholder="Agregar producto por #ID contable o nombre..."
                                                style={{
                                                    width: '100%',
                                                    padding: '0.55rem 0.75rem 0.55rem 2rem',
                                                    borderRadius: '8px',
                                                    border: '1px solid #CBD5E1',
                                                    fontSize: '0.84rem',
                                                    backgroundColor: '#FFFFFF',
                                                }}
                                            />

                                            {filteredCatalog.length > 0 && (
                                                <div
                                                    style={{
                                                        position: 'absolute',
                                                        top: 'calc(100% + 4px)',
                                                        left: 0,
                                                        right: 0,
                                                        maxHeight: '220px',
                                                        overflowY: 'auto',
                                                        backgroundColor: '#FFFFFF',
                                                        border: '1px solid #CBD5E1',
                                                        borderRadius: '10px',
                                                        boxShadow: '0 10px 25px rgba(15, 23, 42, 0.14)',
                                                        zIndex: 25,
                                                    }}
                                                >
                                                    {filteredCatalog.map((prod) => (
                                                        <button
                                                            key={prod.id}
                                                            type="button"
                                                            onClick={() => handleAddProduct(prod)}
                                                            style={{
                                                                width: '100%',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'space-between',
                                                                padding: '0.55rem 0.8rem',
                                                                border: 'none',
                                                                borderBottom: '1px solid #F1F5F9',
                                                                backgroundColor: '#FFFFFF',
                                                                cursor: 'pointer',
                                                                textAlign: 'left',
                                                            }}
                                                        >
                                                            <div>
                                                                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A' }}>
                                                                    {prod.accounting_id ? `#${prod.accounting_id} · ` : ''}
                                                                    {prod.name}
                                                                </div>
                                                                <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                                                    {prod.unit_of_measure} • IVA {prod.iva_rate}% • {getPriceSourceLabel(prod.price_source)}
                                                                </div>
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 800, color: '#1D4ED8' }}>
                                                                <span>{formatCop(prod.resolved_price || 0)}</span>
                                                                <Plus size={15} />
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            <input
                                                ref={fileInputRef}
                                                type="file"
                                                accept=".xlsx,.xls,.ods,.csv,.tsv,.xlsm"
                                                onChange={handleSpreadsheetImport}
                                                style={{ display: 'none' }}
                                            />
                                            <button
                                                type="button"
                                                disabled={importingFile || catalog.length === 0}
                                                onClick={() => fileInputRef.current?.click()}
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '7px',
                                                    padding: '0.55rem 0.9rem',
                                                    borderRadius: '8px',
                                                    border: '1px solid #0F766E',
                                                    backgroundColor: '#F0FDFA',
                                                    color: '#0F766E',
                                                    fontSize: '0.8rem',
                                                    fontWeight: 800,
                                                    cursor: importingFile ? 'wait' : 'pointer',
                                                }}
                                            >
                                                {importingFile ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                                                <span>Importar Excel / CSV</span>
                                            </button>
                                        </div>
                                    </div>

                                    {importFeedback && (
                                        <div
                                            style={{
                                                padding: '0.6rem 0.85rem',
                                                borderRadius: '8px',
                                                backgroundColor: importFeedback.unmatchedLabels.length > 0 ? '#FFFBEB' : '#ECFDF5',
                                                border: importFeedback.unmatchedLabels.length > 0 ? '1px solid #FDE68A' : '1px solid #A7F3D0',
                                                fontSize: '0.76rem',
                                                color: importFeedback.unmatchedLabels.length > 0 ? '#92400E' : '#065F46',
                                            }}
                                        >
                                            <div style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <FileSpreadsheet size={14} />
                                                <span>
                                                    Importación completada: {importFeedback.matchedCount} ítem(s) emparejados.
                                                    {importFeedback.unmatchedLabels.length > 0
                                                        ? ` ${importFeedback.unmatchedLabels.length} sin coincidencia:`
                                                        : ''}
                                                </span>
                                            </div>
                                            {importFeedback.unmatchedLabels.length > 0 && (
                                                <div style={{ marginTop: '4px', color: '#78350F' }}>
                                                    {importFeedback.unmatchedLabels.slice(0, 8).join(', ')}
                                                    {importFeedback.unmatchedLabels.length > 8
                                                        ? ` (+${importFeedback.unmatchedLabels.length - 8} más)`
                                                        : ''}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Items Table */}
                                    {items.length === 0 ? (
                                        <div
                                            style={{
                                                textAlign: 'center',
                                                padding: '1.8rem 1rem',
                                                backgroundColor: '#FFFFFF',
                                                borderRadius: '10px',
                                                border: '1px dashed #CBD5E1',
                                                color: '#64748B',
                                            }}
                                        >
                                            <Package size={26} color="#94A3B8" style={{ margin: '0 auto 0.4rem' }} />
                                            <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#334155' }}>
                                                Sin productos agregados todavía
                                            </div>
                                            <div style={{ fontSize: '0.74rem' }}>
                                                Usa el buscador por #ID contable o nombre, o importa una planilla Excel / CSV.
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ overflowX: 'auto', backgroundColor: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                                <thead>
                                                    <tr style={{ backgroundColor: '#F1F5F9', color: '#475569', textAlign: 'left', fontWeight: 800 }}>
                                                        <th style={{ padding: '0.55rem 0.75rem' }}>Producto</th>
                                                        <th style={{ padding: '0.55rem 0.6rem', width: '115px' }}>Cantidad</th>
                                                        <th style={{ padding: '0.55rem 0.6rem', width: '150px' }}>Precio Unit. (COP)</th>
                                                        <th style={{ padding: '0.55rem 0.6rem', textAlign: 'right' }}>IVA</th>
                                                        <th style={{ padding: '0.55rem 0.75rem', textAlign: 'right' }}>Total Línea</th>
                                                        <th style={{ padding: '0.55rem 0.5rem', width: '44px' }} />
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {items.map((item) => {
                                                        const qty = parseDecimalValue(item.quantityInput);
                                                        const price = parseDecimalValue(item.unitPriceInput);
                                                        const validLine =
                                                            Number.isFinite(qty) &&
                                                            qty > 0 &&
                                                            Number.isFinite(price) &&
                                                            price >= 0;
                                                        const lineSub = validLine ? qty * price : 0;
                                                        const lineIva = lineSub * (Math.max(0, item.iva_rate) / 100);
                                                        const lineTot = lineSub + lineIva;

                                                        return (
                                                            <tr key={item.product_id} style={{ borderTop: '1px solid #E2E8F0' }}>
                                                                <td style={{ padding: '0.55rem 0.75rem' }}>
                                                                    <div style={{ fontWeight: 800, color: '#0F172A' }}>
                                                                        {item.accounting_id ? `#${item.accounting_id} · ` : ''}
                                                                        {item.name}
                                                                    </div>
                                                                    <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                                                                        {item.unit} • Tarifa: {getPriceSourceLabel(item.price_source)}
                                                                    </div>
                                                                </td>
                                                                <td style={{ padding: '0.55rem 0.6rem' }}>
                                                                    <input
                                                                        type="text"
                                                                        inputMode="decimal"
                                                                        value={item.quantityInput}
                                                                        onChange={(e) => handleUpdateItemQuantity(item.product_id, e.target.value)}
                                                                        aria-label={`Cantidad para ${item.name}`}
                                                                        style={{
                                                                            width: '100%',
                                                                            padding: '0.38rem 0.5rem',
                                                                            borderRadius: '6px',
                                                                            border:
                                                                                Number.isFinite(qty) && qty > 0
                                                                                    ? '1px solid #CBD5E1'
                                                                                    : '1.5px solid #DC2626',
                                                                            textAlign: 'right',
                                                                            fontWeight: 700,
                                                                        }}
                                                                    />
                                                                </td>
                                                                <td style={{ padding: '0.55rem 0.6rem' }}>
                                                                    <input
                                                                        type="text"
                                                                        inputMode="decimal"
                                                                        value={item.unitPriceInput}
                                                                        onChange={(e) => handleUpdateItemPrice(item.product_id, e.target.value)}
                                                                        aria-label={`Precio unitario para ${item.name}`}
                                                                        style={{
                                                                            width: '100%',
                                                                            padding: '0.38rem 0.5rem',
                                                                            borderRadius: '6px',
                                                                            border:
                                                                                Number.isFinite(price) && price >= 0
                                                                                    ? '1px solid #CBD5E1'
                                                                                    : '1.5px solid #DC2626',
                                                                            textAlign: 'right',
                                                                            fontWeight: 700,
                                                                        }}
                                                                    />
                                                                </td>
                                                                <td style={{ padding: '0.55rem 0.6rem', textAlign: 'right', color: '#475569' }}>
                                                                    {item.iva_rate > 0 ? `${item.iva_rate}%` : '0%'}
                                                                </td>
                                                                <td style={{ padding: '0.55rem 0.75rem', textAlign: 'right', fontWeight: 800, color: '#0F172A' }}>
                                                                    {formatCop(lineTot)}
                                                                </td>
                                                                <td style={{ padding: '0.55rem 0.5rem', textAlign: 'center' }}>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleRemoveItem(item.product_id)}
                                                                        aria-label={`Eliminar ${item.name}`}
                                                                        style={{
                                                                            padding: '0.3rem',
                                                                            borderRadius: '6px',
                                                                            border: 'none',
                                                                            backgroundColor: 'transparent',
                                                                            color: '#DC2626',
                                                                            cursor: 'pointer',
                                                                        }}
                                                                    >
                                                                        <Trash2 size={15} />
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Footer: Totals + Submit */}
                    <div
                        style={{
                            padding: '1rem 1.5rem',
                            borderTop: '1px solid #E2E8F0',
                            backgroundColor: '#F8FAFC',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '1rem',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                            <div>
                                <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 700 }}>Subtotal</div>
                                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0F172A' }}>
                                    {formatCop(totals.subtotal)}
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 700 }}>IVA</div>
                                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0F172A' }}>
                                    {formatCop(totals.iva)}
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.7rem', color: '#1E40AF', fontWeight: 800 }}>Total Pedido</div>
                                <div style={{ fontSize: '1.08rem', fontWeight: 900, color: '#1D4ED8' }}>
                                    {formatCop(totals.total)}
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={submitting}
                                style={{
                                    padding: '0.6rem 1rem',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1',
                                    backgroundColor: '#FFFFFF',
                                    color: '#334155',
                                    fontSize: '0.84rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={submitting || loadingInitial || items.length === 0 || !selectedClientId || totals.invalidCount > 0}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '0.62rem 1.2rem',
                                    borderRadius: '8px',
                                    border: 'none',
                                    backgroundColor:
                                        submitting || loadingInitial || items.length === 0 || !selectedClientId || totals.invalidCount > 0
                                            ? '#94A3B8'
                                            : '#1D4ED8',
                                    color: '#FFFFFF',
                                    fontSize: '0.85rem',
                                    fontWeight: 800,
                                    cursor: submitting ? 'wait' : 'pointer',
                                }}
                            >
                                {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                                <span>{submitting ? 'Creando...' : 'Crear Pedido Solo Facturación'}</span>
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default HistoricalBillingOrderModal;
