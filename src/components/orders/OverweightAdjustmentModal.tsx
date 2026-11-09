'use client';

import React, { useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Scale, X, CheckCircle2, AlertTriangle, Loader2, Info } from 'lucide-react';
import { formatMoney } from '@/lib/adminTheme';

interface OrderItemOption {
    id: string;
    product_id: string;
    quantity: number;
    picked_quantity?: number | null;
    unit_price: number;
    selected_options?: Record<string, unknown> | null;
    product?: {
        id: string;
        name: string;
        unit_of_measure: string;
        accounting_id?: number | string | null;
        iva_rate?: number | null;
        weight_kg?: number | null;
    };
}

interface OverweightAdjustmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    orderId: string;
    sequenceId?: number | null;
    items: OrderItemOption[];
    clientProfile?: {
        company_name?: string;
        contact_name?: string;
        iva_responsible?: boolean;
    } | null;
    onSuccess?: () => void;
}

export default function OverweightAdjustmentModal({
    isOpen,
    onClose,
    orderId,
    sequenceId,
    items,
    clientProfile,
    onSuccess
}: OverweightAdjustmentModalProps) {
    const [selectedItemId, setSelectedItemId] = useState<string>('');
    const [inputMode, setInputMode] = useState<'delta' | 'target'>('delta');
    const [inputValue, setInputValue] = useState<string>('');
    const [operatorNotes, setOperatorNotes] = useState<string>('');
    const [saving, setSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const selectedItem = useMemo(() => {
        return items.find(i => i.id === selectedItemId) || null;
    }, [items, selectedItemId]);

    // Current base weight/quantity
    const currentBaseQty = useMemo(() => {
        if (!selectedItem) return 0;
        const picked = Number(selectedItem.picked_quantity);
        if (!isNaN(picked) && picked > 0) return picked;
        return Number(selectedItem.quantity) || 0;
    }, [selectedItem]);

    const unitOfMeasure = selectedItem?.product?.unit_of_measure || 'Kg';
    const isLb = unitOfMeasure.toLowerCase() === 'lb' || unitOfMeasure.toLowerCase() === 'libra';
    const isKg = unitOfMeasure.toLowerCase() === 'kg' || unitOfMeasure.toLowerCase() === 'kilo' || unitOfMeasure.toLowerCase() === 'kilogramo';

    // Parse input number
    const parsedInput = useMemo(() => {
        if (!inputValue.trim()) return 0;
        const normalized = inputValue.replace(',', '.');
        const num = parseFloat(normalized);
        return isNaN(num) ? 0 : num;
    }, [inputValue]);

    // Computed delta and target quantities
    const computedValues = useMemo(() => {
        let delta = 0;
        let newTotal = currentBaseQty;

        if (inputMode === 'delta') {
            delta = parsedInput > 0 ? Number(parsedInput.toFixed(2)) : 0;
            newTotal = Number((currentBaseQty + delta).toFixed(2));
        } else {
            newTotal = parsedInput > currentBaseQty ? Number(parsedInput.toFixed(2)) : currentBaseQty;
            delta = Number((newTotal - currentBaseQty).toFixed(2));
        }

        const price = Number(selectedItem?.unit_price) || 0;
        const additionalGross = delta * price;
        const ivaRate = clientProfile?.iva_responsible ? (Number(selectedItem?.product?.iva_rate) || 0) : 0;
        const additionalBase = ivaRate > 0 ? (additionalGross / (1 + ivaRate / 100)) : additionalGross;
        const additionalTax = additionalGross - additionalBase;

        return {
            delta,
            newTotal,
            additionalGross,
            additionalBase,
            additionalTax
        };
    }, [inputMode, parsedInput, currentBaseQty, selectedItem, clientProfile]);

    if (!isOpen) return null;

    const handleSave = async () => {
        if (!selectedItem) {
            setErrorMessage('Por favor selecciona un producto de la lista.');
            return;
        }

        if (computedValues.delta <= 0) {
            setErrorMessage('El peso o cantidad adicional debe ser superior a 0.');
            return;
        }

        setSaving(true);
        setErrorMessage(null);

        try {
            // 1. Verify that order is not already closed / invoiced
            const { data: orderMeta, error: orderFetchErr } = await supabase
                .from('orders')
                .select('id, status, total, subtotal, tax, total_weight_kg, logistics_data')
                .eq('id', orderId)
                .single();

            if (orderFetchErr || !orderMeta) {
                throw new Error('No se pudo verificar el estado actual del pedido.');
            }

            const currentStatus = (orderMeta.status || '').toLowerCase();
            if (currentStatus === 'invoiced' || currentStatus === 'cancelled') {
                throw new Error(`El pedido se encuentra en estado "${currentStatus.toUpperCase()}" y no permite ajustes directos.`);
            }

            // 2. Prepare updated selected_options with _charge_overweight: true
            const currentOptions = (selectedItem.selected_options && typeof selectedItem.selected_options === 'object')
                ? { ...selectedItem.selected_options }
                : {};

            const updatedOptions = {
                ...currentOptions,
                _charge_overweight: true,
                _overweight_delta: computedValues.delta,
                _overweight_adjusted_at: new Date().toISOString(),
                _overweight_adjusted_by: 'Operador Mesa / Expediente',
                _overweight_note: operatorNotes.trim() || undefined
            };

            // 3. Update order_items with new picked_quantity and options
            const { error: itemUpdateErr } = await supabase
                .from('order_items')
                .update({
                    picked_quantity: computedValues.newTotal,
                    selected_options: updatedOptions
                })
                .eq('id', selectedItem.id);

            if (itemUpdateErr) throw itemUpdateErr;

            // 4. Resolve warehouse and handle inventory movement idempotently
            const { data: warehouseData } = await supabase
                .from('warehouses')
                .select('id')
                .limit(1)
                .maybeSingle();

            const warehouseId = warehouseData?.id;

            // Delete any previous movement for this item
            await supabase
                .from('inventory_movements')
                .delete()
                .eq('reference_id', selectedItem.id)
                .in('reference_type', ['waste_weighing', 'additional_sale']);

            const accountingIdTag = selectedItem.product?.accounting_id ? `#${selectedItem.product.accounting_id}` : '';
            const productDisplayLabel = `${accountingIdTag ? `${accountingIdTag} ` : ''}${selectedItem.product?.name || 'Producto'}`;
            const noteTag = `[VENTA ADICIONAL POR SOBREPESO BÁSCULA] ${productDisplayLabel} (+${computedValues.delta} ${unitOfMeasure}) | Pedido #${sequenceId || orderId}${operatorNotes ? ` · Nota: ${operatorNotes.trim()}` : ''}`;

            if (warehouseId) {
                await supabase.from('inventory_movements').insert([{
                    product_id: selectedItem.product_id,
                    warehouse_id: warehouseId,
                    quantity: -computedValues.delta,
                    type: 'exit',
                    status_to: 'available',
                    notes: noteTag,
                    reference_type: 'additional_sale',
                    reference_id: selectedItem.id
                }]);
            }

            // 5. Recalculate complete order totals (subtotal, tax, total, total_weight_kg)
            const { data: allOrderItems } = await supabase
                .from('order_items')
                .select('id, quantity, picked_quantity, unit_price, selected_options, products:product_id ( iva_rate, weight_kg, unit_of_measure )')
                .eq('order_id', orderId);

            if (allOrderItems && allOrderItems.length > 0) {
                const isIvaResponsible = Boolean(clientProfile?.iva_responsible);
                let recBase = 0;
                let recTax = 0;
                let recTotal = 0;
                let recWeightKg = 0;

                allOrderItems.forEach((oi: any) => {
                    const opts = (oi.id === selectedItem.id)
                        ? updatedOptions
                        : ((oi.selected_options && typeof oi.selected_options === 'object') ? oi.selected_options : {});
                    
                    const orderedQ = Number(oi.quantity) || 0;
                    const pickedQ = Number(oi.picked_quantity) || 0;
                    const billableQ = (opts._charge_overweight === true && pickedQ > orderedQ) ? pickedQ : (pickedQ > 0 ? pickedQ : orderedQ);
                    const price = Number(oi.unit_price) || 0;
                    const lineGross = billableQ * price;

                    const prodRaw = Array.isArray(oi.products) ? oi.products[0] : oi.products;
                    const ivaRate = isIvaResponsible ? (Number(prodRaw?.iva_rate) || 0) : 0;
                    const lineBase = ivaRate > 0 ? (lineGross / (1 + ivaRate / 100)) : lineGross;
                    const lineTax = lineGross - lineBase;

                    recBase += lineBase;
                    recTax += lineTax;
                    recTotal += lineGross;

                    // Weight calculation
                    const uom = (prodRaw?.unit_of_measure || 'Kg').toLowerCase();
                    let itemKg = billableQ;
                    if (uom.includes('lb') || uom.includes('libra')) {
                        itemKg = billableQ * 0.5;
                    } else if (!uom.includes('kg') && prodRaw?.weight_kg && Number(prodRaw.weight_kg) > 0) {
                        itemKg = billableQ * Number(prodRaw.weight_kg);
                    }
                    recWeightKg += itemKg;
                });

                const roundedBase = Math.round(recBase * 100) / 100;
                const roundedTax = Math.round(recTax * 100) / 100;
                const roundedTotal = Math.round(recTotal * 100) / 100;
                const roundedWeight = Math.round(recWeightKg * 100) / 100;

                const existingLogistics = (orderMeta.logistics_data && typeof orderMeta.logistics_data === 'object')
                    ? orderMeta.logistics_data
                    : {};

                await supabase
                    .from('orders')
                    .update({
                        subtotal: roundedBase,
                        tax: roundedTax,
                        total: roundedTotal,
                        total_weight_kg: roundedWeight,
                        logistics_data: {
                            ...existingLogistics,
                            sync_world_office_status: 'pending_update',
                            last_overweight_adjustment_at: new Date().toISOString()
                        }
                    })
                    .eq('id', orderId);
            }

            if (onSuccess) onSuccess();
            onClose();
        } catch (err: any) {
            console.error('Error guardando ajuste de peso de más:', err);
            setErrorMessage(err.message || 'Error al persistir el ajuste de peso de más.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '1rem',
            animation: 'fadeIn 0.2s ease-out'
        }} onClick={onClose}>
            <div
                style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '20px',
                    width: '100%',
                    maxWidth: '560px',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                    position: 'relative',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: '90vh'
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{
                    padding: '1.25rem 1.5rem',
                    borderBottom: '1px solid #E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: '#F8FAFC'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '10px',
                            backgroundColor: '#D1FAE5',
                            color: '#065F46',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <Scale size={20} strokeWidth={2.2} />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: '#0F172A' }}>
                                Registrar Peso de Más en Factura
                            </h3>
                            <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748B', fontWeight: 600 }}>
                                Pedido #{sequenceId || orderId} · Venta Adicional por Báscula
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#64748B',
                            cursor: 'pointer',
                            padding: '4px',
                            borderRadius: '8px',
                            display: 'flex'
                        }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                    {errorMessage && (
                        <div style={{
                            padding: '0.75rem 1rem',
                            backgroundColor: '#FEF2F2',
                            border: '1px solid #FECACA',
                            borderRadius: '10px',
                            color: '#991B1B',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                            <span>{errorMessage}</span>
                        </div>
                    )}

                    {/* Step 1: Select Item */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '0.4rem', letterSpacing: '0.04em' }}>
                            1. Selecciona el Producto con Sobrepeso *
                        </label>
                        <select
                            value={selectedItemId}
                            onChange={(e) => {
                                setSelectedItemId(e.target.value);
                                setInputValue('');
                            }}
                            style={{
                                width: '100%',
                                padding: '0.65rem 0.85rem',
                                borderRadius: '10px',
                                border: '1.5px solid #CBD5E1',
                                fontSize: '0.88rem',
                                fontWeight: 700,
                                color: '#0F172A',
                                backgroundColor: '#FFFFFF',
                                outline: 'none'
                            }}
                        >
                            <option value="">-- Seleccionar producto del pedido --</option>
                            {items.map(it => {
                                const accId = it.product?.accounting_id ? `#${it.product.accounting_id}` : '';
                                const currentP = it.picked_quantity && it.picked_quantity > 0 ? ` (Báscula: ${it.picked_quantity} ${it.product?.unit_of_measure})` : ` (Pactado: ${it.quantity} ${it.product?.unit_of_measure})`;
                                return (
                                    <option key={it.id} value={it.id}>
                                        {accId ? `${accId} · ` : ''}{it.product?.name || 'Producto'} — {currentP}
                                    </option>
                                );
                            })}
                        </select>
                    </div>

                    {selectedItem && (
                        <>
                            {/* Current vs New Weight Info Box */}
                            <div style={{
                                backgroundColor: '#F8FAFC',
                                border: '1px solid #E2E8F0',
                                borderRadius: '12px',
                                padding: '0.85rem 1rem',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}>
                                <div>
                                    <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                                        Cantidad / Peso Actual
                                    </div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#0F172A', marginTop: '2px' }}>
                                        {currentBaseQty} {unitOfMeasure}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                                        Precio Pactado
                                    </div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#0D7A57', marginTop: '2px' }}>
                                        {formatMoney(selectedItem.unit_price)} / {unitOfMeasure}
                                    </div>
                                </div>
                            </div>

                            {/* Mode Toggle */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '0.4rem', letterSpacing: '0.04em' }}>
                                    2. ¿Cómo deseas registrar el peso de más? *
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setInputMode('delta');
                                            setInputValue('');
                                        }}
                                        style={{
                                            padding: '0.55rem 0.8rem',
                                            borderRadius: '9px',
                                            fontSize: '0.78rem',
                                            fontWeight: 800,
                                            border: inputMode === 'delta' ? '2px solid #0D7A57' : '1px solid #CBD5E1',
                                            backgroundColor: inputMode === 'delta' ? '#ECFDF5' : '#FFFFFF',
                                            color: inputMode === 'delta' ? '#065F46' : '#64748B',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        + Kilos / Unidades de Más
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setInputMode('target');
                                            setInputValue('');
                                        }}
                                        style={{
                                            padding: '0.55rem 0.8rem',
                                            borderRadius: '9px',
                                            fontSize: '0.78rem',
                                            fontWeight: 800,
                                            border: inputMode === 'target' ? '2px solid #0D7A57' : '1px solid #CBD5E1',
                                            backgroundColor: inputMode === 'target' ? '#ECFDF5' : '#FFFFFF',
                                            color: inputMode === 'target' ? '#065F46' : '#64748B',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Nuevo Peso Total Real
                                    </button>
                                </div>
                            </div>

                            {/* Input Field */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                        {inputMode === 'delta' ? `Cantidad Excedente (+ ${unitOfMeasure})` : `Peso Total Despachado (${unitOfMeasure})`} *
                                    </label>
                                    {isLb && (
                                        <span style={{ fontSize: '0.7rem', color: '#047857', fontWeight: 700 }}>
                                            Regla FruFresco: 1 Lb = 0.5 kg
                                        </span>
                                    )}
                                </div>
                                <input
                                    type="text"
                                    placeholder={inputMode === 'delta' ? 'Ej: 2.5 o 1' : `Mayor a ${currentBaseQty}`}
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.7rem 0.9rem',
                                        borderRadius: '10px',
                                        border: '2px solid #0D7A57',
                                        fontSize: '1.15rem',
                                        fontWeight: 800,
                                        color: '#0F172A',
                                        outline: 'none',
                                        textAlign: 'center'
                                    }}
                                    autoFocus
                                />
                            </div>

                            {/* Computed Impact Card */}
                            {computedValues.delta > 0 && (
                                <div style={{
                                    backgroundColor: '#F0FDF4',
                                    border: '1.5px solid #86EFAC',
                                    borderRadius: '12px',
                                    padding: '0.85rem 1.1rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '6px'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.78rem', color: '#065F46', fontWeight: 700 }}>
                                            Sobrepeso a Facturar:
                                        </span>
                                        <span style={{ fontSize: '0.85rem', color: '#064E3B', fontWeight: 900 }}>
                                            +{computedValues.delta} {unitOfMeasure} (Total: {computedValues.newTotal} {unitOfMeasure})
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed #A7F3D0', paddingTop: '4px' }}>
                                        <span style={{ fontSize: '0.78rem', color: '#065F46', fontWeight: 700 }}>
                                            Ajuste a Factura Final:
                                        </span>
                                        <span style={{ fontSize: '1rem', color: '#0D7A57', fontWeight: 900 }}>
                                            +{formatMoney(computedValues.additionalGross)} COP
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Notes */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '0.4rem', letterSpacing: '0.04em' }}>
                                    Nota de Trazabilidad / Báscula (Opcional)
                                </label>
                                <input
                                    type="text"
                                    placeholder="Ej: Báscula 2 alistamiento, autorización cliente"
                                    value={operatorNotes}
                                    onChange={(e) => setOperatorNotes(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.6rem 0.85rem',
                                        borderRadius: '9px',
                                        border: '1px solid #CBD5E1',
                                        fontSize: '0.82rem',
                                        outline: 'none'
                                    }}
                                />
                            </div>
                        </>
                    )}
                </div>

                {/* Footer Buttons */}
                <div style={{
                    padding: '1rem 1.5rem',
                    borderTop: '1px solid #E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: '10px',
                    backgroundColor: '#F8FAFC'
                }}>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        style={{
                            padding: '0.65rem 1.25rem',
                            borderRadius: '10px',
                            border: '1px solid #CBD5E1',
                            backgroundColor: '#FFFFFF',
                            color: '#475569',
                            fontWeight: 700,
                            fontSize: '0.82rem',
                            cursor: 'pointer'
                        }}
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving || !selectedItem || computedValues.delta <= 0}
                        style={{
                            padding: '0.65rem 1.4rem',
                            borderRadius: '10px',
                            border: 'none',
                            backgroundColor: (saving || !selectedItem || computedValues.delta <= 0) ? '#94A3B8' : '#0D7A57',
                            color: '#FFFFFF',
                            fontWeight: 800,
                            fontSize: '0.85rem',
                            cursor: (saving || !selectedItem || computedValues.delta <= 0) ? 'not-allowed' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: (saving || !selectedItem || computedValues.delta <= 0) ? 'none' : '0 2px 6px rgba(13, 122, 87, 0.3)'
                        }}
                    >
                        {saving ? (
                            <>
                                <Loader2 size={16} className="animate-spin" /> Guardando...
                            </>
                        ) : (
                            <>
                                <CheckCircle2 size={16} /> Ajustar Factura (+{formatMoney(computedValues.additionalGross)})
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
