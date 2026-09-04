'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
    X, AlertTriangle, Camera, CheckCircle2, Loader2, 
    Package, FileText, UploadCloud
} from 'lucide-react';

interface B2BReportNoveltyModalProps {
    isOpen: boolean;
    onClose: () => void;
    order: any;
    clientProfile: any;
    onSuccess?: () => void;
}

export default function B2BReportNoveltyModal({
    isOpen,
    onClose,
    order,
    clientProfile,
    onSuccess
}: B2BReportNoveltyModalProps) {
    const [orderItems, setOrderItems] = useState<any[]>([]);
    const [loadingItems, setLoadingItems] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [submittedSuccess, setSubmittedSuccess] = useState(false);

    // Form states
    const [reportType, setReportType] = useState<'product' | 'general'>('product');
    const [selectedItemId, setSelectedItemId] = useState('');
    const [category, setCategory] = useState<'producto' | 'entrega' | 'facturacion'>('producto');
    const [reason, setReason] = useState('Avería / Producto en mal estado');
    const [affectedQty, setAffectedQty] = useState<number | ''>('');
    const [description, setDescription] = useState('');
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);

    const NOVELTY_REASONS = [
        "Avería / Producto en mal estado",
        "Calidad / Maduración inadecuada",
        "Faltante de kilos en pesaje",
        "Calibre o especificación incorrecta",
        "Empaque / Canastilla rota",
        "Error en precio o cobro",
        "Otro motivo"
    ];

    useEffect(() => {
        if (!isOpen || !order?.id) {
            setSubmittedSuccess(false);
            return;
        }

        const fetchItems = async () => {
            setLoadingItems(true);
            try {
                const { data, error } = await supabase
                    .from('order_items')
                    .select('id, product_id, quantity, unit_price, nickname, variant_label, products(id, name, sku, unit_of_measure)')
                    .eq('order_id', order.id);
                if (error) throw error;
                setOrderItems(data || []);
            } catch (err) {
                console.error('Error loading order items for novelty report:', err);
            } finally {
                setLoadingItems(false);
            }
        };

        fetchItems();
    }, [isOpen, order?.id]);

    const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setPhotoFile(file);
            setPhotoPreview(URL.createObjectURL(file));
        }
    };

    const selectedItem = orderItems.find(i => i.id === selectedItemId);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!order?.id || !description.trim()) {
            alert('Por favor ingresa una breve descripción del problema.');
            return;
        }

        if (reportType === 'product') {
            if (!selectedItemId) {
                alert('Por favor selecciona el producto afectado.');
                return;
            }
            if (!affectedQty || Number(affectedQty) <= 0) {
                alert('Por favor especifica la cantidad afectada.');
                return;
            }
            if (selectedItem && Number(affectedQty) > Number(selectedItem.quantity)) {
                alert(`La cantidad afectada no puede ser mayor a la cantidad despachada (${selectedItem.quantity} ${selectedItem.products?.unit_of_measure}).`);
                return;
            }
        }

        setSubmitting(true);
        try {
            let uploadedPhotoUrl: string | null = null;

            // 1. Upload photo if selected
            if (photoFile) {
                const fileExt = photoFile.name.split('.').pop();
                const fileName = `b2b_pqr_${order.id}_${Date.now()}.${fileExt}`;
                const { error: uploadErr } = await supabase.storage
                    .from('delivery-evidence')
                    .upload(fileName, photoFile);

                if (!uploadErr) {
                    const { data: { publicUrl } } = supabase.storage
                        .from('delivery-evidence')
                        .getPublicUrl(fileName);
                    uploadedPhotoUrl = publicUrl;
                } else {
                    console.warn('Could not upload to delivery-evidence, trying evidence-photos:', uploadErr);
                    const { error: fallbackErr } = await supabase.storage
                        .from('evidence-photos')
                        .upload(fileName, photoFile);
                    if (!fallbackErr) {
                        const { data: { publicUrl } } = supabase.storage
                            .from('evidence-photos')
                            .getPublicUrl(fileName);
                        uploadedPhotoUrl = publicUrl;
                    }
                }
            }

            // 2. Insert into billing_returns if product-specific
            if (reportType === 'product' && selectedItem) {
                await supabase.from('billing_returns').insert({
                    order_id: order.id,
                    product_id: selectedItem.product_id || selectedItem.products?.id,
                    quantity_returned: Number(affectedQty),
                    reason: `[Autoservicio B2B] ${reason}: ${description.trim()}`,
                    photo_url: uploadedPhotoUrl,
                    status: 'pending_review'
                });
            }

            // 3. Insert into customer_service_pqrs
            const prodName = selectedItem?.products?.name || (selectedItem?.nickname || '');
            const subject = reportType === 'product'
                ? `[Portal B2B] Novedad en ${prodName} - Pedido #${order.sequence_id || order.id.substring(0, 8)}`
                : `[Portal B2B] Reclamo General - Pedido #${order.sequence_id || order.id.substring(0, 8)}`;

            const fullDescription = reportType === 'product'
                ? `Reporte de autoservicio B2B registrado por ${clientProfile?.company_name || clientProfile?.contact_name || 'Cliente B2B'}.\n\n• Producto Afectado: ${prodName}\n• Motivo: ${reason}\n• Cantidad Reportada: ${affectedQty} ${selectedItem?.products?.unit_of_measure || 'und'}\n• Detalle: ${description.trim()}`
                : `Reporte de autoservicio B2B registrado por ${clientProfile?.company_name || clientProfile?.contact_name || 'Cliente B2B'}.\n\n• Categoría: ${category}\n• Motivo: ${reason}\n• Detalle: ${description.trim()}`;

            const { error: pqrErr } = await supabase.from('customer_service_pqrs').insert({
                client_id: clientProfile?.id || order.profile_id,
                order_id: order.id,
                type: 'reclamo',
                category: reportType === 'product' ? 'producto' : category,
                priority: 'normal',
                subject: subject,
                description: fullDescription,
                primary_photo_url: uploadedPhotoUrl,
                status: 'pending'
            });

            if (pqrErr) throw pqrErr;

            setSubmittedSuccess(true);
            if (onSuccess) onSuccess();
        } catch (err: any) {
            console.error('Error submitting B2B novelty:', err);
            alert('Error al registrar la novedad: ' + (err.message || 'Intente nuevamente.'));
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem'
        }}>
            <div style={{
                backgroundColor: 'white',
                borderRadius: '16px',
                width: '100%',
                maxWidth: '560px',
                maxHeight: '90vh',
                overflowY: 'auto',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                border: '1px solid #E2E8F0',
                display: 'flex',
                flexDirection: 'column'
            }}>
                {/* Header */}
                <div style={{
                    padding: '1.25rem 1.5rem',
                    borderBottom: '1px solid #F1F5F9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: '#F8FAFC'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '8px',
                            backgroundColor: '#FEF3C7',
                            color: '#D97706',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <AlertTriangle size={20} />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '900', color: '#0F172A' }}>
                                Reportar Novedad de Entrega
                            </h3>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748B', fontWeight: '600' }}>
                                Pedido #{order?.sequence_id ? `PED-${order.sequence_id}` : order?.id?.substring(0, 8)} • {clientProfile?.company_name || clientProfile?.contact_name}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#94A3B8',
                            padding: '4px',
                            borderRadius: '6px'
                        }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {submittedSuccess ? (
                    <div style={{ padding: '2.5rem 1.5rem', textAlign: 'center' }}>
                        <div style={{
                            width: '56px',
                            height: '56px',
                            borderRadius: '50%',
                            backgroundColor: '#DCFCE7',
                            color: '#166534',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 1rem'
                        }}>
                            <CheckCircle2 size={32} />
                        </div>
                        <h4 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '900', color: '#166534' }}>
                            ¡Novedad Registrada con Éxito!
                        </h4>
                        <p style={{ color: '#475569', fontSize: '0.85rem', margin: '0.5rem 0 1.5rem', lineHeight: '1.5' }}>
                            Tu reporte ha sido asignado al equipo de <strong>Servicio al Cliente y Calidad FruFresco</strong>. Se evaluará el ajuste contable o reposición correspondiente para tu cuenta.
                        </p>
                        <button
                            onClick={onClose}
                            style={{
                                backgroundColor: '#0D7A57',
                                color: 'white',
                                border: 'none',
                                padding: '0.65rem 1.5rem',
                                borderRadius: '8px',
                                fontWeight: '800',
                                fontSize: '0.85rem',
                                cursor: 'pointer'
                            }}
                        >
                            Entendido y Volver
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {/* Scope selector */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <button
                                type="button"
                                onClick={() => setReportType('product')}
                                style={{
                                    padding: '8px',
                                    borderRadius: '8px',
                                    border: `1.5px solid ${reportType === 'product' ? '#0D7A57' : '#E2E8F0'}`,
                                    backgroundColor: reportType === 'product' ? '#ECFDF5' : 'white',
                                    color: reportType === 'product' ? '#065F46' : '#64748B',
                                    fontWeight: '800',
                                    fontSize: '0.8rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px'
                                }}
                            >
                                <Package size={16} /> Producto Específico
                            </button>
                            <button
                                type="button"
                                onClick={() => setReportType('general')}
                                style={{
                                    padding: '8px',
                                    borderRadius: '8px',
                                    border: `1.5px solid ${reportType === 'general' ? '#0D7A57' : '#E2E8F0'}`,
                                    backgroundColor: reportType === 'general' ? '#ECFDF5' : 'white',
                                    color: reportType === 'general' ? '#065F46' : '#64748B',
                                    fontWeight: '800',
                                    fontSize: '0.8rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px'
                                }}
                            >
                                <FileText size={16} /> Reclamo General
                            </button>
                        </div>

                        {/* Product selection if product scope */}
                        {reportType === 'product' && (
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#475569', marginBottom: '4px', textTransform: 'uppercase' }}>
                                    Selecciona el producto afectado *
                                </label>
                                {loadingItems ? (
                                    <div style={{ padding: '8px', textAlign: 'center', color: '#94A3B8', fontSize: '0.8rem' }}>
                                        <Loader2 className="animate-spin" size={16} style={{ display: 'inline', marginRight: '6px' }} />
                                        Cargando productos del pedido...
                                    </div>
                                ) : (
                                    <select
                                        value={selectedItemId}
                                        onChange={e => {
                                            setSelectedItemId(e.target.value);
                                            const it = orderItems.find(i => i.id === e.target.value);
                                            if (it) setAffectedQty(it.quantity);
                                        }}
                                        required
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem', backgroundColor: 'white', outline: 'none' }}
                                    >
                                        <option value="">Selecciona un producto...</option>
                                        {orderItems.map(item => (
                                            <option key={item.id} value={item.id}>
                                                {item.products?.name || item.nickname || 'Producto'} — {item.quantity} {item.products?.unit_of_measure} despachados
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        )}

                        {/* Quantity and Reason */}
                        <div style={{ display: 'grid', gridTemplateColumns: reportType === 'product' ? '1fr 1.5fr' : '1fr', gap: '10px' }}>
                            {reportType === 'product' && (
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#475569', marginBottom: '4px', textTransform: 'uppercase' }}>
                                        Cantidad afectada *
                                    </label>
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            type="number"
                                            step="0.1"
                                            min="0.1"
                                            value={affectedQty}
                                            onChange={e => setAffectedQty(e.target.value === '' ? '' : Number(e.target.value))}
                                            placeholder="Ej: 5"
                                            required
                                            style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem', boxSizing: 'border-box' }}
                                        />
                                    </div>
                                    {selectedItem && (
                                        <span style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '2px', display: 'block' }}>
                                            Despachado: {selectedItem.quantity} {selectedItem.products?.unit_of_measure}
                                        </span>
                                    )}
                                </div>
                            )}

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#475569', marginBottom: '4px', textTransform: 'uppercase' }}>
                                    Motivo del reporte *
                                </label>
                                <select
                                    value={reason}
                                    onChange={e => setReason(e.target.value)}
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem', backgroundColor: 'white', outline: 'none' }}
                                >
                                    {NOVELTY_REASONS.map(r => (
                                        <option key={r} value={r}>{r}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Description */}
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#475569', marginBottom: '4px', textTransform: 'uppercase' }}>
                                Detalle de lo ocurrido *
                            </label>
                            <textarea
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder="Indica con precisión lo que ocurrió (ej. 3 aguacates sobremadurados, caja húmeda, calibre inferior al acordado)..."
                                rows={3}
                                required
                                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                            />
                        </div>

                        {/* Photo upload */}
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#475569', marginBottom: '4px', textTransform: 'uppercase' }}>
                                Foto de evidencia (Recomendado)
                            </label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <label style={{
                                    flex: 1,
                                    padding: '10px 14px',
                                    border: '1.5px dashed #CBD5E1',
                                    borderRadius: '8px',
                                    backgroundColor: '#F8FAFC',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    color: '#475569',
                                    fontSize: '0.8rem',
                                    fontWeight: '700'
                                }}>
                                    <Camera size={16} />
                                    <span>{photoFile ? photoFile.name : 'Subir o tomar foto de evidencia'}</span>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handlePhotoSelect}
                                        style={{ display: 'none' }}
                                    />
                                </label>
                                {photoPreview && (
                                    <div style={{ width: '48px', height: '48px', borderRadius: '6px', overflow: 'hidden', border: '1px solid #CBD5E1', flexShrink: 0 }}>
                                        <img src={photoPreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Submit Button */}
                        <div style={{ display: 'flex', gap: '10px', marginTop: '0.5rem', paddingTop: '1rem', borderTop: '1px solid #F1F5F9' }}>
                            <button
                                type="button"
                                onClick={onClose}
                                style={{
                                    flex: 1,
                                    padding: '10px',
                                    borderRadius: '8px',
                                    border: '1px solid #E2E8F0',
                                    backgroundColor: '#F8FAFC',
                                    color: '#64748B',
                                    fontWeight: '800',
                                    fontSize: '0.85rem',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={submitting}
                                style={{
                                    flex: 2,
                                    padding: '10px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    backgroundColor: '#0D7A57',
                                    color: 'white',
                                    fontWeight: '800',
                                    fontSize: '0.85rem',
                                    cursor: submitting ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    boxShadow: '0 4px 12px rgba(13, 122, 87, 0.2)'
                                }}
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 className="animate-spin" size={16} /> Enviando reporte...
                                    </>
                                ) : (
                                    <>
                                        <UploadCloud size={16} /> Enviar Novedad a Calidad
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
