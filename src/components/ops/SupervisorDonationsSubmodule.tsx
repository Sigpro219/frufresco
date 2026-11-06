'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/authContext';
import {
    HeartHandshake,
    Camera,
    FileCheck,
    Plus,
    Trash2,
    CheckCircle2,
    AlertTriangle,
    Search,
    Package
} from 'lucide-react';

interface CatalogProduct {
    id: string;
    name: string;
    sku: string;
    accounting_id: number | null;
    unit_of_measure: string;
    category: string;
}

interface DonationDraftLine {
    productId: string;
    productName: string;
    sku: string;
    uom: string;
    quantity: number;
    productPhotoUrl: string | null;
}

interface TodayDonationMovement {
    id: string;
    product_id: string;
    quantity: number | string | null;
    notes: string | null;
    evidence_url: string | null;
    created_at: string;
    products?: {
        name?: string | null;
        sku?: string | null;
        unit_of_measure?: string | null;
    } | null;
}

interface SupervisorDonationsSubmoduleProps {
    supervisorName?: string;
    onSuccess?: (msg: string) => void;
}

const AUTHORIZED_DONATION_ROLES = new Set([
    'supervisor',
    'plant_supervisor',
    'ops_supervisor',
    'inventory_manager',
    'admin',
    'sys_admin',
    'super_admin',
    'director'
]);

export default function SupervisorDonationsSubmodule({
    supervisorName = 'Supervisor de Planta',
    onSuccess
}: SupervisorDonationsSubmoduleProps) {
    const { user, profile } = useAuth();
    const effectiveRole = String(profile?.role || '').toLowerCase().trim();
    const isAuthorizedSupervisor = Boolean(user && AUTHORIZED_DONATION_ROLES.has(effectiveRole));
    const resolvedSupervisorName = profile?.contact_name || user?.email || supervisorName;

    const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
    const [productSearch, setProductSearch] = useState('');
    const [selectedProductId, setSelectedProductId] = useState('');
    const [qtyInput, setQtyInput] = useState('');
    const [recipientEntity, setRecipientEntity] = useState('Banco de Alimentos');
    const [notes, setNotes] = useState('');

    // Lines in current donation act
    const [lines, setLines] = useState<DonationDraftLine[]>([]);

    // Photos
    const [linePhotoUploading, setLinePhotoUploading] = useState(false);
    const [currentLinePhotoUrl, setCurrentLinePhotoUrl] = useState<string | null>(null);

    const [supportDocUploading, setSupportDocUploading] = useState(false);
    const [supportDocUrl, setSupportDocUrl] = useState<string | null>(null);

    const [submitting, setSubmitting] = useState(false);
    const [todayDonations, setTodayDonations] = useState<TodayDonationMovement[]>([]);

    const loadData = useCallback(async () => {
        const todayStr = new Date().toISOString().split('T')[0];
        const [prodRes, movRes] = await Promise.all([
            supabase
                .from('products')
                .select('id, name, sku, accounting_id, unit_of_measure, category')
                .eq('is_active', true)
                .order('name', { ascending: true })
                .limit(2000),
            supabase
                .from('inventory_movements')
                .select('id, product_id, quantity, notes, evidence_url, created_at, products(name, sku, unit_of_measure)')
                .eq('reference_type', 'food_bank')
                .gte('created_at', `${todayStr}T00:00:00.000Z`)
                .lte('created_at', `${todayStr}T23:59:59.999Z`)
                .order('created_at', { ascending: false })
        ]);

        if (prodRes.data) setCatalog(prodRes.data as CatalogProduct[]);
        if (movRes.data) setTodayDonations(movRes.data as unknown as TodayDonationMovement[]);
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const uploadPhotoFile = async (file: File, prefix: string): Promise<string> => {
        const ext = file.name.split('.').pop() || 'jpg';
        const fileName = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
        const { error: upErr } = await supabase.storage
            .from('vouchers')
            .upload(fileName, file);

        if (!upErr) {
            const { data } = supabase.storage.from('vouchers').getPublicUrl(fileName);
            if (data?.publicUrl) return data.publicUrl;
        }

        // Fallback to DataURL if bucket policy blocks direct upload
        return await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    };

    const handleProductPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setLinePhotoUploading(true);
        try {
            const url = await uploadPhotoFile(file, 'donacion_prod');
            setCurrentLinePhotoUrl(url);
        } catch (err) {
            alert('Error cargando foto del producto');
        } finally {
            setLinePhotoUploading(false);
        }
    };

    const handleSupportDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setSupportDocUploading(true);
        try {
            const url = await uploadPhotoFile(file, 'donacion_soporte_banco_alimentos');
            setSupportDocUrl(url);
        } catch (err) {
            alert('Error cargando foto del documento soporte');
        } finally {
            setSupportDocUploading(false);
        }
    };

    const filteredCatalog = catalog.filter(p => {
        if (!productSearch.trim()) return true;
        const q = productSearch.toLowerCase().trim();
        return (
            p.name.toLowerCase().includes(q) ||
            String(p.accounting_id || '').includes(q) ||
            (p.sku || '').toLowerCase().includes(q)
        );
    });

    const handleAddLine = () => {
        const prod = catalog.find(p => p.id === selectedProductId);
        const qty = parseFloat(qtyInput);
        if (!prod) {
            alert('Selecciona un producto para donación.');
            return;
        }
        if (!Number.isFinite(qty) || qty <= 0) {
            alert('Ingresa una cantidad válida mayor a 0.');
            return;
        }
        if (!currentLinePhotoUrl) {
            alert('Debes adjuntar la foto de evidencia del producto a donar.');
            return;
        }

        setLines(prev => [
            ...prev,
            {
                productId: prod.id,
                productName: prod.name,
                sku: prod.sku,
                uom: prod.unit_of_measure || 'Kg',
                quantity: Number(qty.toFixed(2)),
                productPhotoUrl: currentLinePhotoUrl
            }
        ]);
        setSelectedProductId('');
        setQtyInput('');
        setCurrentLinePhotoUrl(null);
    };

    const handleRemoveLine = (idx: number) => {
        setLines(prev => prev.filter((_, i) => i !== idx));
    };

    const handleAuthorizeDonation = async () => {
        if (!isAuthorizedSupervisor) {
            alert('Restricción de Gobernanza (DT-19): Solo el Supervisor de Planta autenticado tiene autorización para aprobar y registrar donaciones en la Columna X.');
            return;
        }
        if (lines.length === 0) {
            alert('Agrega al menos un producto a la donación.');
            return;
        }
        if (!supportDocUrl) {
            alert('Es OBLIGATORIO adjuntar la foto del Documento Soporte de Donación al Banco de Alimentos.');
            return;
        }

        setSubmitting(true);
        try {
            const { data: whData } = await supabase.from('warehouses').select('id').limit(1).maybeSingle();
            const warehouseId = whData?.id;

            const payload = lines.map(line => ({
                product_id: line.productId,
                warehouse_id: warehouseId,
                quantity: -Math.abs(line.quantity),
                type: 'exit',
                status_to: 'available',
                reference_type: 'food_bank',
                evidence_url: supportDocUrl,
                notes: `[DONACIÓN AUTORIZADA POR SUPERVISOR DE PLANTA: ${resolvedSupervisorName} (${effectiveRole})] Entidad: ${recipientEntity} | Cant: ${line.quantity} ${line.uom} | Foto Producto: ${line.productPhotoUrl || 'Adjunta'} | Doc Soporte: ${supportDocUrl}` + (notes ? ` | Obs: ${notes}` : '')
            }));

            const { error } = await supabase.from('inventory_movements').insert(payload);
            if (error) throw error;

            setLines([]);
            setSupportDocUrl(null);
            setNotes('');
            await loadData();
            if (onSuccess) {
                onSuccess(`Donación autorizada y registrada en Columna X (${payload.length} productos).`);
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error desconocido';
            alert('Error al registrar donación: ' + msg);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Banner de Autoridad Exclusiva */}
            <div style={{
                backgroundColor: 'rgba(236, 72, 153, 0.12)',
                border: '1.5px solid rgba(236, 72, 153, 0.45)',
                borderRadius: '16px',
                padding: '1rem 1.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.75rem'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '12px',
                        backgroundColor: 'rgba(236, 72, 153, 0.2)',
                        color: '#F472B6',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        <HeartHandshake size={22} />
                    </div>
                    <div>
                        <div style={{ fontSize: '0.98rem', fontWeight: 900, color: '#F8FAFC' }}>
                            Autorización Digital de Donaciones — Banco de Alimentos (Columna X)
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#CBD5E1' }}>
                            Autoridad exclusiva: <strong>Supervisor de Planta</strong>. Requiere foto de los productos y foto obligatoria del <strong>Documento Soporte de Donación</strong>.
                        </div>
                    </div>
                </div>
                <span style={{
                    padding: '4px 10px',
                    borderRadius: '999px',
                    backgroundColor: '#EC4899',
                    color: '#FFFFFF',
                    fontSize: '0.72rem',
                    fontWeight: 900
                }}>
                    DESTINO: COLUMNA X (DONACIONES -)
                </span>
            </div>

            {/* Formulario de Registro de Productos y Evidencias */}
            <div style={{
                backgroundColor: 'var(--ops-surface)',
                border: '1px solid var(--ops-border)',
                borderRadius: '16px',
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem'
            }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: 'var(--ops-text)' }}>
                    1. Agregar Productos a Donar (con Foto de Evidencia)
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.75rem' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--ops-text-muted)', marginBottom: '4px' }}>
                            Filtrar Producto (#ID o Nombre)
                        </label>
                        <input
                            type="text"
                            value={productSearch}
                            onChange={e => setProductSearch(e.target.value)}
                            placeholder="Ej: Banano, Tomate, #105..."
                            style={{
                                width: '100%',
                                padding: '0.65rem 0.75rem',
                                borderRadius: '10px',
                                border: '1px solid var(--ops-border)',
                                backgroundColor: 'rgba(255,255,255,0.03)',
                                color: 'var(--ops-text)',
                                fontSize: '0.85rem',
                                boxSizing: 'border-box'
                            }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--ops-text-muted)', marginBottom: '4px' }}>
                            Seleccionar Producto ({filteredCatalog.length})
                        </label>
                        <select
                            value={selectedProductId}
                            onChange={e => setSelectedProductId(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '0.65rem 0.75rem',
                                borderRadius: '10px',
                                border: '1px solid var(--ops-border)',
                                backgroundColor: '#0F172A',
                                color: '#F8FAFC',
                                fontSize: '0.85rem',
                                boxSizing: 'border-box'
                            }}
                        >
                            <option value="">-- Seleccionar producto --</option>
                            {filteredCatalog.slice(0, 250).map(p => (
                                <option key={p.id} value={p.id}>
                                    #{p.accounting_id ?? 'S/N'} - {p.name} ({p.unit_of_measure})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--ops-text-muted)', marginBottom: '4px' }}>
                            Cantidad a Donar
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            value={qtyInput}
                            onChange={e => setQtyInput(e.target.value)}
                            placeholder="0.00"
                            style={{
                                width: '100%',
                                padding: '0.65rem 0.75rem',
                                borderRadius: '10px',
                                border: '1px solid var(--ops-border)',
                                backgroundColor: 'rgba(255,255,255,0.03)',
                                color: 'var(--ops-text)',
                                fontSize: '0.85rem',
                                boxSizing: 'border-box'
                            }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--ops-text-muted)', marginBottom: '4px' }}>
                            Foto del Producto *
                        </label>
                        <label style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            padding: '0.62rem 0.75rem',
                            borderRadius: '10px',
                            border: currentLinePhotoUrl ? '1.5px solid #10B981' : '1px dashed #64748B',
                            backgroundColor: currentLinePhotoUrl ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255,255,255,0.03)',
                            color: currentLinePhotoUrl ? '#34D399' : '#CBD5E1',
                            fontSize: '0.8rem',
                            fontWeight: 800,
                            cursor: 'pointer'
                        }}>
                            <Camera size={15} />
                            <span>{linePhotoUploading ? 'Subiendo...' : currentLinePhotoUrl ? 'Foto Producto OK' : 'Tomar / Subir Foto'}</span>
                            <input type="file" accept="image/*" onChange={handleProductPhotoUpload} style={{ display: 'none' }} />
                        </label>
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        type="button"
                        onClick={handleAddLine}
                        style={{
                            padding: '0.6rem 1.15rem',
                            borderRadius: '10px',
                            border: 'none',
                            backgroundColor: '#10B981',
                            color: '#FFFFFF',
                            fontSize: '0.82rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <Plus size={15} /> Agregar Producto al Acta de Donación
                    </button>
                </div>

                {/* Lista de productos agregados */}
                {lines.length > 0 && (
                    <div style={{
                        marginTop: '0.5rem',
                        border: '1px solid var(--ops-border)',
                        borderRadius: '12px',
                        overflow: 'hidden'
                    }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                            <thead>
                                <tr style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: 'var(--ops-text-muted)', textAlign: 'left' }}>
                                    <th style={{ padding: '0.6rem 0.75rem' }}>Producto</th>
                                    <th style={{ padding: '0.6rem 0.75rem', textAlign: 'right' }}>Cantidad Donada</th>
                                    <th style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>Evidencia Producto</th>
                                    <th style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>Quitar</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lines.map((l, idx) => (
                                    <tr key={idx} style={{ borderTop: '1px solid var(--ops-border)' }}>
                                        <td style={{ padding: '0.6rem 0.75rem', fontWeight: 800 }}>{l.productName}</td>
                                        <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontWeight: 900, color: '#F472B6' }}>
                                            -{l.quantity.toFixed(2)} {l.uom}
                                        </td>
                                        <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center', color: '#34D399', fontWeight: 700 }}>
                                            ✓ Foto Adjunta
                                        </td>
                                        <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveLine(idx)}
                                                style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer' }}
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Paso 2: Documento Soporte Banco de Alimentos y Autorización Final */}
            <div style={{
                backgroundColor: 'var(--ops-surface)',
                border: '1px solid var(--ops-border)',
                borderRadius: '16px',
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem'
            }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: 'var(--ops-text)' }}>
                    2. Documento Soporte Banco de Alimentos y Firma del Supervisor
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.85rem' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--ops-text-muted)', marginBottom: '4px' }}>
                            Entidad Beneficiaria
                        </label>
                        <input
                            type="text"
                            value={recipientEntity}
                            onChange={e => setRecipientEntity(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '0.65rem 0.75rem',
                                borderRadius: '10px',
                                border: '1px solid var(--ops-border)',
                                backgroundColor: 'rgba(255,255,255,0.03)',
                                color: 'var(--ops-text)',
                                fontSize: '0.85rem',
                                boxSizing: 'border-box'
                            }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--ops-text-muted)', marginBottom: '4px' }}>
                            Foto Documento Soporte Banco de Alimentos (OBLIGATORIO) *
                        </label>
                        <label style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            padding: '0.65rem 0.9rem',
                            borderRadius: '10px',
                            border: supportDocUrl ? '1.5px solid #10B981' : '1.5px dashed #F472B6',
                            backgroundColor: supportDocUrl ? 'rgba(16, 185, 129, 0.14)' : 'rgba(236, 72, 153, 0.1)',
                            color: supportDocUrl ? '#34D399' : '#F472B6',
                            fontSize: '0.82rem',
                            fontWeight: 800,
                            cursor: 'pointer'
                        }}>
                            <FileCheck size={16} />
                            <span>
                                {supportDocUploading
                                    ? 'Subiendo soporte...'
                                    : supportDocUrl
                                        ? '✓ Documento Soporte Cargado'
                                        : 'Adjuntar Foto Acta / Soporte Banco de Alimentos'}
                            </span>
                            <input type="file" accept="image/*" onChange={handleSupportDocUpload} style={{ display: 'none' }} />
                        </label>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--ops-text-muted)', marginBottom: '4px' }}>
                            Observaciones del Supervisor
                        </label>
                        <input
                            type="text"
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Ej: Acta firmada por conductor del Banco de Alimentos..."
                            style={{
                                width: '100%',
                                padding: '0.65rem 0.75rem',
                                borderRadius: '10px',
                                border: '1px solid var(--ops-border)',
                                backgroundColor: 'rgba(255,255,255,0.03)',
                                color: 'var(--ops-text)',
                                fontSize: '0.85rem',
                                boxSizing: 'border-box'
                            }}
                        />
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                    <button
                        type="button"
                        disabled={submitting || lines.length === 0 || !supportDocUrl}
                        onClick={handleAuthorizeDonation}
                        style={{
                            padding: '0.75rem 1.5rem',
                            borderRadius: '12px',
                            border: 'none',
                            backgroundColor: (lines.length > 0 && supportDocUrl) ? '#EC4899' : '#334155',
                            color: '#FFFFFF',
                            fontSize: '0.88rem',
                            fontWeight: 900,
                            cursor: (lines.length > 0 && supportDocUrl && !submitting) ? 'pointer' : 'not-allowed',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            boxShadow: (lines.length > 0 && supportDocUrl) ? '0 4px 14px rgba(236, 72, 153, 0.35)' : 'none'
                        }}
                    >
                        <HeartHandshake size={18} />
                        <span>{submitting ? 'Autorizando Donación...' : 'Autorizar y Descontar en Columna X (Donaciones)'}</span>
                    </button>
                </div>
            </div>

            {/* Historial de Donaciones del Día */}
            {todayDonations.length > 0 && (
                <div style={{
                    backgroundColor: 'var(--ops-surface)',
                    border: '1px solid var(--ops-border)',
                    borderRadius: '16px',
                    padding: '1.25rem'
                }}>
                    <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', fontWeight: 800, color: 'var(--ops-text)' }}>
                        Donaciones Autorizadas Hoy ({todayDonations.length})
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {todayDonations.map((d) => (
                            <div
                                key={d.id}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '0.6rem 0.85rem',
                                    borderRadius: '10px',
                                    backgroundColor: 'rgba(255,255,255,0.02)',
                                    border: '1px solid var(--ops-border)',
                                    fontSize: '0.8rem'
                                }}
                            >
                                <div>
                                    <strong style={{ color: '#F8FAFC' }}>{d.products?.name || 'Producto'}</strong>
                                    <span style={{ color: 'var(--ops-text-muted)', marginLeft: '8px' }}>{d.notes}</span>
                                </div>
                                <strong style={{ color: '#F472B6' }}>
                                    {Math.abs(Number(d.quantity) || 0).toFixed(2)} {d.products?.unit_of_measure || 'Kg'}
                                </strong>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
