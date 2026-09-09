'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { 
    X, 
    Camera, 
    Upload, 
    AlertTriangle, 
    Check, 
    Search, 
    Trash2, 
    User, 
    Scale,
    Sparkles,
    Brush,
    HeartHandshake,
    UserCheck,
    Undo2,
    ShoppingCart,
    Edit3,
    Lock,
    Package
} from 'lucide-react';
import { INVENTORY_MOVEMENT_SUBTYPES, INVENTORY_SUBTYPE_LABELS } from '@/lib/constants';

interface ProductOption {
    id: string;
    name: string;
    sku?: string;
    accounting_id?: number | null;
    unit_of_measure: string;
    category?: string;
    inventory_group?: string | null;
    base_price?: number;
    inventory_stocks?: {
        id?: string;
        warehouse_id?: string;
        quantity: number;
    }[];
}

interface InventoryWasteModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
    preselectedProductId?: string;
    warehouseId?: string;
    products?: ProductOption[];
}

const getSubtypeLucideIcon = (iconName: string, size = 20) => {
    switch (iconName) {
        case 'Trash2': return <Trash2 size={size} />;
        case 'Brush': return <Brush size={size} />;
        case 'Scale': return <Scale size={size} />;
        case 'HeartHandshake': return <HeartHandshake size={size} />;
        case 'UserCheck': return <UserCheck size={size} />;
        case 'AlertTriangle': return <AlertTriangle size={size} />;
        case 'Undo2': return <Undo2 size={size} />;
        case 'ShoppingCart': return <ShoppingCart size={size} />;
        case 'Edit3': return <Edit3 size={size} />;
        case 'Lock': return <Lock size={size} />;
        default: return <Package size={size} />;
    }
};

export default function InventoryWasteModal({
    isOpen,
    onClose,
    onSuccess,
    preselectedProductId,
    warehouseId,
    products: initialProducts
}: InventoryWasteModalProps) {
    const [products, setProducts] = useState<ProductOption[]>(initialProducts || []);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedProduct, setSelectedProduct] = useState<ProductOption | null>(null);
    const [subtype, setSubtype] = useState<string>(INVENTORY_MOVEMENT_SUBTYPES.WASTE_DAMAGE);
    const [quantity, setQuantity] = useState<string>('');
    const [correctionSign, setCorrectionSign] = useState<'+' | '-'>('+');
    const [employeeName, setEmployeeName] = useState('');
    const [selectedProfileId, setSelectedProfileId] = useState('');
    const [staffProfiles, setStaffProfiles] = useState<{ id: string; contact_name: string; email?: string }[]>([]);
    const [notes, setNotes] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Cargar productos si no vienen en props
    useEffect(() => {
        if (!isOpen) return;

        if (!initialProducts || initialProducts.length === 0) {
            const fetchProducts = async () => {
                const { data, error } = await supabase
                    .from('products')
                    .select(`
                        id, name, sku, accounting_id, unit_of_measure, category, inventory_group, base_price,
                        inventory_stocks (id, warehouse_id, quantity)
                    `)
                    .order('name');
                if (!error && data) {
                    setProducts(data as ProductOption[]);
                }
            };
            fetchProducts();
        } else {
            setProducts(initialProducts);
        }

        // Cargar perfiles de colaboradores para ventas a empleado
        const fetchStaff = async () => {
            const { data } = await supabase
                .from('profiles')
                .select('id, contact_name, email')
                .not('contact_name', 'is', null)
                .order('contact_name');
            if (data) setStaffProfiles(data);
        };
        fetchStaff();
    }, [isOpen, initialProducts]);

    // Preseleccionar producto si se especificó
    useEffect(() => {
        if (isOpen && preselectedProductId && products.length > 0) {
            const found = products.find(p => p.id === preselectedProductId);
            if (found) setSelectedProduct(found);
        }
    }, [isOpen, preselectedProductId, products]);

    // Resetear formulario al abrir/cerrar
    useEffect(() => {
        if (!isOpen) {
            setSelectedProduct(null);
            setSubtype(INVENTORY_MOVEMENT_SUBTYPES.WASTE_DAMAGE);
            setQuantity('');
            setEmployeeName('');
            setSelectedProfileId('');
            setNotes('');
            setImageFile(null);
            setImagePreview(null);
            setErrorMessage(null);
            setCorrectionSign('+');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const filteredProducts = products.filter(p => {
        if (!searchTerm.trim()) return true;
        const q = searchTerm.toLowerCase();
        return (
            p.name.toLowerCase().includes(q) ||
            (p.accounting_id && p.accounting_id.toString().includes(q)) ||
            (p.sku && p.sku.toLowerCase().includes(q))
        );
    }).slice(0, 15);

    const activeSubtypeInfo = INVENTORY_SUBTYPE_LABELS[subtype] || {
        label: subtype,
        icon: 'Package',
        requiresPhoto: false,
        operation: 'subtract'
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImageFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleClearImage = () => {
        setImageFile(null);
        setImagePreview(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage(null);

        if (!selectedProduct) {
            setErrorMessage('Por favor, selecciona un producto.');
            return;
        }

        const qtyNum = parseFloat(quantity.replace(',', '.'));
        if (isNaN(qtyNum) || qtyNum <= 0) {
            setErrorMessage('Por favor ingresa una cantidad numérica válida mayor a 0.');
            return;
        }

        if (activeSubtypeInfo.requiresPhoto && !imageFile) {
            setErrorMessage(`La novedad "${activeSubtypeInfo.label}" requiere fotografía de la báscula o del producto como evidencia obligatoria.`);
            return;
        }

        if (subtype === INVENTORY_MOVEMENT_SUBTYPES.EMPLOYEE_SALE && !employeeName.trim() && !selectedProfileId) {
            setErrorMessage('Por favor indica el nombre o selecciona el colaborador que realiza la compra.');
            return;
        }

        setSaving(true);
        try {
            // 1. Subir imagen a Supabase Storage si existe
            let evidenceUrl: string | null = null;
            if (imageFile) {
                setUploading(true);
                const fileExt = imageFile.name.split('.').pop() || 'jpg';
                const fileName = `merma_${selectedProduct.id}_${Date.now()}.${fileExt}`;
                const filePath = `${subtype}/${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('inventory-evidence')
                    .upload(filePath, imageFile, {
                        contentType: imageFile.type || 'image/jpeg',
                        upsert: true
                    });

                if (uploadError) {
                    console.error('Error subiendo imagen a inventory-evidence:', uploadError);
                    // Fallback al bucket task-attachments si falla
                    const { error: fallbackError } = await supabase.storage
                        .from('task-attachments')
                        .upload(`inventory/${fileName}`, imageFile, {
                            contentType: imageFile.type || 'image/jpeg'
                        });
                    if (fallbackError) {
                        throw new Error('No se pudo subir la fotografía de evidencia: ' + uploadError.message);
                    }
                    const { data: fallbackData } = supabase.storage.from('task-attachments').getPublicUrl(`inventory/${fileName}`);
                    evidenceUrl = fallbackData?.publicUrl || null;
                } else {
                    const { data: publicData } = supabase.storage.from('inventory-evidence').getPublicUrl(filePath);
                    evidenceUrl = publicData?.publicUrl || null;
                }
                setUploading(false);
            }

            // 2. Determinar signo y tipo contable
            let finalDelta = 0;
            let movementType: 'entry' | 'exit' | 'adjustment' = 'exit';

            if (subtype === INVENTORY_MOVEMENT_SUBTYPES.ORDER_UNSHIPPED) {
                movementType = 'entry';
                finalDelta = qtyNum; // Reingreso a stock
            } else if (subtype === INVENTORY_MOVEMENT_SUBTYPES.CORRECTION) {
                movementType = 'adjustment';
                finalDelta = correctionSign === '+' ? qtyNum : -qtyNum;
            } else {
                movementType = 'exit';
                finalDelta = -qtyNum; // Salida / Merma / Venta
            }

            // Metadatos y notas
            let finalNote = `[${activeSubtypeInfo.label}]`;
            if (subtype === INVENTORY_MOVEMENT_SUBTYPES.EMPLOYEE_SALE) {
                const emp = staffProfiles.find(p => p.id === selectedProfileId);
                const empText = emp ? `${emp.contact_name} (${emp.email || 'Colaborador'})` : employeeName.trim();
                finalNote += ` Empleado: ${empText}`;
                if (selectedProduct.base_price) {
                    const totalVal = Math.round(qtyNum * selectedProduct.base_price);
                    finalNote += ` | Valor Nómina: $${totalVal.toLocaleString('es-CO')}`;
                }
            }
            if (notes.trim()) {
                finalNote += ` | Detalle: ${notes.trim()}`;
            }

            // Obtener warehouse_id si no vino
            let effectiveWarehouseId = warehouseId;
            if (!effectiveWarehouseId) {
                const stockRecord = selectedProduct.inventory_stocks?.[0];
                if (stockRecord?.warehouse_id) {
                    effectiveWarehouseId = stockRecord.warehouse_id;
                } else {
                    // Consultar primer almacén disponible
                    const { data: wh } = await supabase.from('warehouses').select('id').limit(1).maybeSingle();
                    if (wh) effectiveWarehouseId = wh.id;
                }
            }

            // 3. Registrar en inventory_movements
            const { error: movError } = await supabase.from('inventory_movements').insert([{
                product_id: selectedProduct.id,
                warehouse_id: effectiveWarehouseId || null,
                quantity: finalDelta,
                type: movementType,
                reference_type: subtype,
                evidence_url: evidenceUrl,
                notes: finalNote,
                status_to: 'available'
            }]);

            if (movError) throw movError;

            // 4. Actualizar stock en inventory_stocks
            if (effectiveWarehouseId) {
                const currentStock = selectedProduct.inventory_stocks?.find(s => s.warehouse_id === effectiveWarehouseId)?.quantity ?? 0;
                const newQty = Math.max(0, currentStock + finalDelta);

                const existingStockRecord = selectedProduct.inventory_stocks?.find(s => s.warehouse_id === effectiveWarehouseId);
                if (existingStockRecord?.id) {
                    await supabase
                        .from('inventory_stocks')
                        .update({ quantity: newQty, updated_at: new Date().toISOString() })
                        .eq('id', existingStockRecord.id);
                } else {
                    await supabase
                        .from('inventory_stocks')
                        .insert([{
                            product_id: selectedProduct.id,
                            warehouse_id: effectiveWarehouseId,
                            quantity: newQty,
                            status: 'available'
                        }]);
                }
            }

            if (typeof window !== 'undefined' && (window as any).showToast) {
                (window as any).showToast(`${activeSubtypeInfo.label} registrado exitosamente (${qtyNum} ${selectedProduct.unit_of_measure})`, 'success');
            }

            onSuccess?.();
            onClose();
        } catch (err: any) {
            console.error('Error guardando merma/novedad:', err);
            setErrorMessage(err.message || 'Error al registrar el movimiento.');
        } finally {
            setSaving(false);
            setUploading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            fontFamily: 'var(--font-outfit), sans-serif'
        }}>
            <div style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '16px',
                width: '100%',
                maxWidth: '620px',
                maxHeight: '92vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                border: '1px solid #E2E8F0',
                overflow: 'hidden'
            }}>
                {/* Modal Header */}
                <div style={{
                    padding: '1.25rem 1.5rem',
                    borderBottom: '1px solid #E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: '#F8FAFC'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '10px',
                            backgroundColor: '#FEF3C7',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#0D7A57'
                        }}>
                            {getSubtypeLucideIcon(activeSubtypeInfo.icon, 22)}
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: '#0F172A' }}>
                                Registrar Merma o Novedad
                            </h3>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748B' }}>
                                Auditoría Lean de Bodega (Balance Diario 24 Columnas)
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        type="button"
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#64748B',
                            padding: '6px',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Modal Body */}
                <form onSubmit={handleSubmit} style={{ overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {errorMessage && (
                        <div style={{
                            backgroundColor: '#FEF2F2',
                            border: '1px solid #FCA5A5',
                            borderRadius: '8px',
                            padding: '0.75rem 1rem',
                            color: '#991B1B',
                            fontSize: '0.85rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}>
                            <AlertTriangle size={18} />
                            <span>{errorMessage}</span>
                        </div>
                    )}

                    {/* Selector de Tipo de Novedad / Merma */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', color: '#475569', marginBottom: '0.5rem', letterSpacing: '0.04em' }}>
                            1. Tipo de Merma / Salida Especial *
                        </label>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, 1fr)',
                            gap: '0.5rem'
                        }}>
                            {Object.entries(INVENTORY_SUBTYPE_LABELS).map(([key, info]) => {
                                const isSelected = subtype === key;
                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => setSubtype(key)}
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            padding: '0.65rem 0.5rem',
                                            borderRadius: '10px',
                                            border: isSelected ? '2px solid #0D7A57' : '1px solid #E2E8F0',
                                            backgroundColor: isSelected ? '#ECFDF5' : '#FFFFFF',
                                            cursor: 'pointer',
                                            textAlign: 'center',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        <span style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: isSelected ? '#0D7A57' : '#64748B',
                                            marginBottom: '0.35rem'
                                        }}>
                                            {getSubtypeLucideIcon(info.icon, 20)}
                                        </span>
                                        <span style={{
                                            fontSize: '0.72rem',
                                            fontWeight: isSelected ? '800' : '600',
                                            color: isSelected ? '#065F46' : '#334155',
                                            lineHeight: '1.2'
                                        }}>
                                            {info.label.split('(')[0]}
                                        </span>
                                        {info.requiresPhoto && (
                                            <span style={{
                                                fontSize: '0.6rem',
                                                backgroundColor: '#FEE2E2',
                                                color: '#B91C1C',
                                                padding: '1px 5px',
                                                borderRadius: '4px',
                                                marginTop: '3px',
                                                fontWeight: '700',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '3px'
                                            }}>
                                                <Camera size={10} /> Foto Req.
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Selector de Producto */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', color: '#475569', marginBottom: '0.5rem', letterSpacing: '0.04em' }}>
                            2. Producto Maestro *
                        </label>
                        {selectedProduct ? (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '0.75rem 1rem',
                                backgroundColor: '#F1F5F9',
                                border: '1px solid #CBD5E1',
                                borderRadius: '10px'
                            }}>
                                <div>
                                    <div style={{ fontWeight: '800', color: '#0F172A', fontSize: '0.95rem' }}>
                                        {selectedProduct.name}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '2px' }}>
                                        ID Contable: <b>#{selectedProduct.accounting_id || 'S/N'}</b> • Unidad: <b>{selectedProduct.unit_of_measure}</b> • Grupo: <i>{selectedProduct.inventory_group || 'General'}</i>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSelectedProduct(null)}
                                    style={{
                                        backgroundColor: '#FFFFFF',
                                        border: '1px solid #E2E8F0',
                                        borderRadius: '6px',
                                        padding: '4px 8px',
                                        fontSize: '0.75rem',
                                        fontWeight: '700',
                                        color: '#64748B',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Cambiar
                                </button>
                            </div>
                        ) : (
                            <div>
                                <div style={{ position: 'relative', marginBottom: '0.5rem' }}>
                                    <Search size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94A3B8' }} />
                                    <input
                                        type="text"
                                        placeholder="Buscar por nombre, ID contable o SKU..."
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '0.55rem 0.75rem 0.55rem 2.2rem',
                                            borderRadius: '8px',
                                            border: '1px solid #CBD5E1',
                                            fontSize: '0.85rem',
                                            boxSizing: 'border-box',
                                            outline: 'none'
                                        }}
                                    />
                                </div>
                                <div style={{
                                    maxHeight: '140px',
                                    overflowY: 'auto',
                                    border: '1px solid #E2E8F0',
                                    borderRadius: '8px',
                                    backgroundColor: '#FFFFFF'
                                }}>
                                    {filteredProducts.length === 0 ? (
                                        <div style={{ padding: '0.75rem', fontSize: '0.8rem', color: '#94A3B8', textAlign: 'center' }}>
                                            No se encontraron productos coincidentes
                                        </div>
                                    ) : (
                                        filteredProducts.map(p => (
                                            <div
                                                key={p.id}
                                                onClick={() => setSelectedProduct(p)}
                                                style={{
                                                    padding: '0.5rem 0.75rem',
                                                    fontSize: '0.82rem',
                                                    borderBottom: '1px solid #F1F5F9',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center'
                                                }}
                                                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                                                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#FFFFFF')}
                                            >
                                                <div>
                                                    <span style={{ fontWeight: '700', color: '#1E293B' }}>{p.name}</span>
                                                    {p.accounting_id && (
                                                        <span style={{ marginLeft: '6px', fontSize: '0.7rem', color: '#64748B' }}>
                                                            #{p.accounting_id}
                                                        </span>
                                                    )}
                                                </div>
                                                <span style={{ fontSize: '0.7rem', backgroundColor: '#E2E8F0', color: '#475569', padding: '2px 6px', borderRadius: '4px', fontWeight: '600' }}>
                                                    {p.unit_of_measure}
                                                </span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Cantidad & Corrección */}
                    <div style={{ display: 'grid', gridTemplateColumns: subtype === INVENTORY_MOVEMENT_SUBTYPES.CORRECTION ? '1fr 2fr' : '1fr', gap: '0.75rem' }}>
                        {subtype === INVENTORY_MOVEMENT_SUBTYPES.CORRECTION && (
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', color: '#475569', marginBottom: '0.4rem', letterSpacing: '0.04em' }}>
                                    Sentido Ajuste
                                </label>
                                <div style={{ display: 'flex', gap: '0.25rem' }}>
                                    <button
                                        type="button"
                                        onClick={() => setCorrectionSign('+')}
                                        style={{
                                            flex: 1,
                                            padding: '0.55rem',
                                            borderRadius: '6px',
                                            fontWeight: '800',
                                            border: correctionSign === '+' ? '2px solid #0D7A57' : '1px solid #CBD5E1',
                                            backgroundColor: correctionSign === '+' ? '#ECFDF5' : '#FFFFFF',
                                            color: correctionSign === '+' ? '#065F46' : '#64748B',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        + Entrada
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setCorrectionSign('-')}
                                        style={{
                                            flex: 1,
                                            padding: '0.55rem',
                                            borderRadius: '6px',
                                            fontWeight: '800',
                                            border: correctionSign === '-' ? '2px solid #B91C1C' : '1px solid #CBD5E1',
                                            backgroundColor: correctionSign === '-' ? '#FEF2F2' : '#FFFFFF',
                                            color: correctionSign === '-' ? '#991B1B' : '#64748B',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        - Salida
                                    </button>
                                </div>
                            </div>
                        )}

                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', color: '#475569', marginBottom: '0.4rem', letterSpacing: '0.04em' }}>
                                3. Cantidad ({selectedProduct?.unit_of_measure || 'KG'}) *
                            </label>
                            <div style={{ position: 'relative' }}>
                                <Scale size={16} style={{ position: 'absolute', left: '10px', top: '12px', color: '#94A3B8' }} />
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    placeholder="Ej: 12.50"
                                    value={quantity}
                                    onChange={e => setQuantity(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.65rem 0.75rem 0.65rem 2.2rem',
                                        borderRadius: '8px',
                                        border: '1.5px solid #0D7A57',
                                        fontSize: '1.05rem',
                                        fontWeight: '800',
                                        boxSizing: 'border-box',
                                        color: '#0F172A',
                                        outline: 'none'
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Venta a Empleado - Colaborador */}
                    {subtype === INVENTORY_MOVEMENT_SUBTYPES.EMPLOYEE_SALE && (
                        <div style={{ backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '10px', padding: '0.85rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', color: '#1D4ED8', marginBottom: '0.4rem', letterSpacing: '0.04em' }}>
                                <User size={14} /> Colaborador para Deducción de Nómina *
                            </label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                <select
                                    value={selectedProfileId}
                                    onChange={e => {
                                        setSelectedProfileId(e.target.value);
                                        const p = staffProfiles.find(x => x.id === e.target.value);
                                        if (p) setEmployeeName(p.contact_name);
                                    }}
                                    style={{
                                        padding: '0.55rem',
                                        borderRadius: '6px',
                                        border: '1px solid #CBD5E1',
                                        fontSize: '0.8rem',
                                        backgroundColor: '#FFFFFF',
                                        color: '#1E293B',
                                        outline: 'none'
                                    }}
                                >
                                    <option value="">-- Seleccionar de la lista --</option>
                                    {staffProfiles.map(p => (
                                        <option key={p.id} value={p.id}>
                                            {p.contact_name} {p.email ? `(${p.email})` : ''}
                                        </option>
                                    ))}
                                </select>
                                <input
                                    type="text"
                                    placeholder="O escribe nombre del operario..."
                                    value={employeeName}
                                    onChange={e => setEmployeeName(e.target.value)}
                                    style={{
                                        padding: '0.55rem',
                                        borderRadius: '6px',
                                        border: '1px solid #CBD5E1',
                                        fontSize: '0.8rem',
                                        backgroundColor: '#FFFFFF',
                                        color: '#1E293B',
                                        outline: 'none'
                                    }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Captura de Evidencia Fotográfica (Báscula / Producto) */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', color: '#475569', letterSpacing: '0.04em' }}>
                                4. Evidencia Fotográfica en Báscula {activeSubtypeInfo.requiresPhoto ? '(Obligatoria *)' : '(Opcional)'}
                            </label>
                            {activeSubtypeInfo.requiresPhoto && (
                                <span style={{ fontSize: '0.7rem', color: '#B91C1C', fontWeight: '700' }}>
                                    Requerido para auditoría
                                </span>
                            )}
                        </div>

                        {imagePreview ? (
                            <div style={{
                                position: 'relative',
                                borderRadius: '10px',
                                overflow: 'hidden',
                                border: '2px solid #0D7A57',
                                maxHeight: '200px',
                                display: 'flex',
                                justifyContent: 'center',
                                backgroundColor: '#000000'
                            }}>
                                <img
                                    src={imagePreview}
                                    alt="Evidencia báscula"
                                    style={{ maxHeight: '200px', width: 'auto', objectFit: 'contain' }}
                                />
                                <button
                                    type="button"
                                    onClick={handleClearImage}
                                    style={{
                                        position: 'absolute',
                                        top: '8px',
                                        right: '8px',
                                        backgroundColor: 'rgba(239, 68, 68, 0.9)',
                                        color: '#FFFFFF',
                                        border: 'none',
                                        borderRadius: '50%',
                                        width: '28px',
                                        height: '28px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        ) : (
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                style={{
                                    border: activeSubtypeInfo.requiresPhoto ? '2px dashed #EF4444' : '2px dashed #CBD5E1',
                                    backgroundColor: activeSubtypeInfo.requiresPhoto ? '#FEF2F2' : '#F8FAFC',
                                    borderRadius: '10px',
                                    padding: '1.25rem',
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <Camera size={28} style={{ color: activeSubtypeInfo.requiresPhoto ? '#DC2626' : '#64748B', margin: '0 auto 6px' }} />
                                <div style={{ fontSize: '0.85rem', fontWeight: '700', color: activeSubtypeInfo.requiresPhoto ? '#991B1B' : '#334155' }}>
                                    Tomar foto con la cámara o seleccionar archivo
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
                                    Captura clara del producto sobre la báscula mostrando el peso
                                </div>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    style={{ display: 'none' }}
                                    onChange={handleImageChange}
                                />
                            </div>
                        )}
                    </div>

                    {/* Observaciones adicionales */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', color: '#475569', marginBottom: '0.4rem', letterSpacing: '0.04em' }}>
                            5. Observaciones / Motivo
                        </label>
                        <textarea
                            rows={2}
                            placeholder="Detalla la causa del daño, limpieza de hojas, ajuste de calibración..."
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '0.6rem 0.75rem',
                                borderRadius: '8px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.85rem',
                                boxSizing: 'border-box',
                                color: '#1E293B',
                                outline: 'none',
                                resize: 'none'
                            }}
                        />
                    </div>

                    {/* Footer Buttons */}
                    <div style={{
                        marginTop: '0.5rem',
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: '0.75rem',
                        borderTop: '1px solid #E2E8F0',
                        paddingTop: '1rem'
                    }}>
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={saving}
                            style={{
                                padding: '0.65rem 1.25rem',
                                borderRadius: '8px',
                                border: '1px solid #CBD5E1',
                                backgroundColor: '#FFFFFF',
                                color: '#475569',
                                fontSize: '0.85rem',
                                fontWeight: '700',
                                cursor: 'pointer'
                            }}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving || uploading}
                            style={{
                                padding: '0.65rem 1.5rem',
                                borderRadius: '8px',
                                border: 'none',
                                backgroundColor: '#0D7A57',
                                color: '#FFFFFF',
                                fontSize: '0.85rem',
                                fontWeight: '700',
                                cursor: (saving || uploading) ? 'not-allowed' : 'pointer',
                                opacity: (saving || uploading) ? 0.7 : 1,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                boxShadow: '0 4px 6px -1px rgba(13, 122, 87, 0.3)'
                            }}
                        >
                            {saving ? (
                                <span>Guardando e Indexando...</span>
                            ) : uploading ? (
                                <span>Subiendo Evidencia...</span>
                            ) : (
                                <>
                                    <Check size={16} />
                                    <span>Registrar Novedad</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
