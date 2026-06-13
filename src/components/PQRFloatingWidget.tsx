'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/authContext';
import { MessageSquare, UploadCloud, X, Check, Loader2, Building2, User, HelpCircle, AlertTriangle, Image as ImageIcon } from 'lucide-react';
import { THEME } from '@/lib/adminTheme';

export default function PQRFloatingWidget() {
    const { user, profile } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [step, setStep] = useState<'form' | 'success'>('form');
    const [submitting, setSubmitting] = useState(false);

    // Form states
    const [pqrType, setPqrType] = useState<'queja' | 'reclamo' | 'peticion' | 'sugerencia' | 'felicitacion'>('queja');
    const [category, setCategory] = useState<'producto' | 'entrega' | 'facturacion' | 'otro'>('producto');
    const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
    const [subject, setSubject] = useState('');
    const [description, setDescription] = useState('');
    
    // Client selection
    const [clients, setClients] = useState<any[]>([]);
    const [selectedClientId, setSelectedClientId] = useState('');
    const [clientSearch, setClientSearch] = useState('');
    const [showClientDropdown, setShowClientDropdown] = useState(false);

    // Order selection
    const [orders, setOrders] = useState<any[]>([]);
    const [selectedOrderId, setSelectedOrderId] = useState('');

    // Photo uploads
    const [primaryPhoto, setPrimaryPhoto] = useState<File | null>(null);
    const [primaryPhotoPreview, setPrimaryPhotoPreview] = useState<string | null>(null);
    const [showAdvancedPhotos, setShowAdvancedPhotos] = useState(false);
    const [additionalPhotos, setAdditionalPhotos] = useState<(File | null)[]>(Array(7).fill(null));
    const [additionalPreviews, setAdditionalPreviews] = useState<(string | null)[]>(Array(7).fill(null));

    const panelRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    // Only render for admins, operators, or salespeople
    const isAuthorized = profile?.role && profile.role !== 'b2b_client' && profile.role !== 'b2c_client';

    useEffect(() => {
        if (!isAuthorized || !isOpen) return;

        // Fetch clients
        const fetchClients = async () => {
            const { data } = await supabase
                .from('profiles')
                .select('id, company_name, contact_name, role, nit')
                .in('role', ['b2b_client', 'b2c_client'])
                .order('company_name', { ascending: true });
            setClients(data || []);
        };

        fetchClients();
    }, [isOpen, isAuthorized]);

    // Fetch orders when client changes
    useEffect(() => {
        if (!selectedClientId) {
            setOrders([]);
            setSelectedOrderId('');
            return;
        }

        const fetchRecentOrders = async () => {
            const { data } = await supabase
                .from('orders')
                .select('id, sequence_id, total, created_at')
                .eq('profile_id', selectedClientId)
                .order('created_at', { ascending: false })
                .limit(10);
            setOrders(data || []);
        };

        fetchRecentOrders();
    }, [selectedClientId]);

    // Close on outside click
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: MouseEvent) => {
            const target = e.target as Node;
            if (
                panelRef.current && !panelRef.current.contains(target) &&
                buttonRef.current && !buttonRef.current.contains(target)
            ) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isOpen]);

    // Reset when closed
    useEffect(() => {
        if (!isOpen) {
            setTimeout(() => {
                setStep('form');
                setPqrType('queja');
                setCategory('producto');
                setPriority('normal');
                setSubject('');
                setDescription('');
                setSelectedClientId('');
                setClientSearch('');
                setSelectedOrderId('');
                setPrimaryPhoto(null);
                setPrimaryPhotoPreview(null);
                setShowAdvancedPhotos(false);
                setAdditionalPhotos(Array(7).fill(null));
                setAdditionalPreviews(Array(7).fill(null));
            }, 300);
        }
    }, [isOpen]);

    // Upload photo to Supabase Storage
    const uploadImage = async (file: File): Promise<string | null> => {
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
            const filePath = `evidence/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('evidence-photos')
                .upload(filePath, file);

            if (uploadError) {
                // If bucket does not exist, upload to public folder or fallback
                console.warn('Evidence bucket upload failed, trying fallback:', uploadError);
                return null;
            }

            const { data } = supabase.storage
                .from('evidence-photos')
                .getPublicUrl(filePath);

            return data?.publicUrl || null;
        } catch (e) {
            console.error('Image upload error:', e);
            return null;
        }
    };

    const handlePrimaryPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setPrimaryPhoto(file);
            setPrimaryPhotoPreview(URL.createObjectURL(file));
        }
    };

    const handleAdditionalPhotoChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const newPhotos = [...additionalPhotos];
            newPhotos[index] = file;
            setAdditionalPhotos(newPhotos);

            const newPreviews = [...additionalPreviews];
            newPreviews[index] = URL.createObjectURL(file);
            setAdditionalPreviews(newPreviews);
        }
    };

    const removeAdditionalPhoto = (index: number) => {
        const newPhotos = [...additionalPhotos];
        newPhotos[index] = null;
        setAdditionalPhotos(newPhotos);

        const newPreviews = [...additionalPreviews];
        newPreviews[index] = null;
        setAdditionalPreviews(newPreviews);
    };

    const handleSubmit = async () => {
        if (!selectedClientId || !subject.trim() || !description.trim()) return;
        setSubmitting(true);

        try {
            // 1. Upload photos
            let primaryUrl = null;
            if (primaryPhoto) {
                primaryUrl = await uploadImage(primaryPhoto);
            }

            const additionalUrls: string[] = [];
            for (const file of additionalPhotos) {
                if (file) {
                    const url = await uploadImage(file);
                    if (url) additionalUrls.push(url);
                }
            }

            // 2. Insert PQR record
            const { error } = await supabase.from('customer_service_pqrs').insert({
                client_id: selectedClientId,
                order_id: selectedOrderId || null,
                type: pqrType,
                category: category,
                priority: priority,
                subject: subject.trim(),
                description: description.trim(),
                primary_photo_url: primaryUrl,
                additional_photos: additionalUrls,
                status: 'pending'
            });

            if (!error) {
                setStep('success');
            } else {
                console.error('PQR insertion error:', error);
                alert('Error al registrar PQR: ' + error.message);
            }
        } catch (e) {
            console.error('PQR submission exception:', e);
        } finally {
            setSubmitting(false);
        }
    };

    if (!isAuthorized) return null;

    const filteredClients = clients.filter(c => 
        (c.company_name || '').toLowerCase().includes(clientSearch.toLowerCase()) ||
        (c.contact_name || '').toLowerCase().includes(clientSearch.toLowerCase()) ||
        (c.nit || '').toLowerCase().includes(clientSearch.toLowerCase())
    );

    const selectedClientObj = clients.find(c => c.id === selectedClientId);

    return (
        <>
            {/* FLOATING ACTION BUTTON */}
            <button
                ref={buttonRef}
                onClick={() => setIsOpen(prev => !prev)}
                title="Registrar PQR / Novedad interna"
                style={{
                    position: 'fixed',
                    bottom: '20px',
                    right: '20px', // Positioned in the corner since HelpDeskWidget is hidden
                    width: '42px',
                    height: '42px',
                    borderRadius: '50%',
                    background: '#0D7A57',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                    zIndex: 8888,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 14px rgba(13, 122, 87, 0.35)',
                    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
                {isOpen ? <X size={20} /> : <MessageSquare size={20} />}
            </button>

            {/* MODAL PANEL */}
            <div
                ref={panelRef}
                style={{
                    position: 'fixed',
                    bottom: '75px',
                    right: '20px',
                    width: '380px',
                    maxHeight: 'calc(100vh - 120px)',
                    backgroundColor: 'white',
                    borderRadius: '16px',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
                    zIndex: 8889,
                    overflowY: 'auto',
                    opacity: isOpen ? 1 : 0,
                    transform: isOpen ? 'translateY(0) scale(1)' : 'translateY(16px) scale(0.97)',
                    pointerEvents: isOpen ? 'all' : 'none',
                    transition: 'all 0.25s cubic-bezier(0.34,1.2,0.64,1)',
                    border: '1px solid #E2E8F0',
                }}
            >
                {/* Header */}
                <div style={{
                    background: 'linear-gradient(135deg, #0D7A57 0%, #0A5F43 100%)',
                    padding: '1.25rem',
                    color: 'white',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <MessageSquare size={20} />
                        <h3 style={{ margin: 0, fontWeight: '800', fontSize: '1.05rem', letterSpacing: '-0.02em' }}>
                            Registrar PQR / Novedad
                        </h3>
                    </div>
                    <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.75rem', color: '#EAEFEA', fontWeight: '500' }}>
                        Servicio al cliente FruFresco (Interno)
                    </p>
                </div>

                {/* Body */}
                <div style={{ padding: '1.25rem' }}>
                    {step === 'success' ? (
                        <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                            <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: '#EAEFEA', display: 'inline-flex', alignItems: 'center', justifyItems: 'center', color: '#0D7A57', fontSize: '1.8rem', justifyContent: 'center', marginBottom: '1rem' }}>
                                <Check size={28} />
                            </div>
                            <h4 style={{ fontWeight: '800', color: '#1E293B', margin: '0 0 0.5rem 0', fontSize: '1.1rem' }}>
                                PQR Registrada
                            </h4>
                            <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '0 0 1.5rem 0', lineHeight: '1.4' }}>
                                El caso ha sido guardado exitosamente. Podrás gestionarlo y aplicar deducciones en el panel de Atención al Cliente.
                            </p>
                            <button
                                onClick={() => setIsOpen(false)}
                                style={{
                                    width: '100%', backgroundColor: '#0D7A57', color: 'white',
                                    border: 'none', borderRadius: '8px', padding: '0.6rem',
                                    fontWeight: '700', cursor: 'pointer', fontSize: '0.85rem'
                                }}
                            >
                                Entendido
                            </button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {/* Client Lookup */}
                            <div style={{ position: 'relative' }}>
                                <label style={{ fontSize: '0.7rem', fontWeight: '700', color: '#64748B', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                                    Cliente afectado *
                                </label>
                                {selectedClientId ? (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: '8px', backgroundColor: '#F8FAFC' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: '600', color: '#1E293B' }}>
                                            {selectedClientObj?.role === 'b2b_client' ? <Building2 size={14} style={{ color: '#0D7A57' }} /> : <User size={14} style={{ color: '#0D7A57' }} />}
                                            {selectedClientObj?.company_name || selectedClientObj?.contact_name}
                                        </div>
                                        <button onClick={() => setSelectedClientId('')} style={{ border: 'none', background: 'none', color: '#EF4444', cursor: 'pointer', fontSize: '0.9rem' }}>✕</button>
                                    </div>
                                ) : (
                                    <>
                                        <input
                                            value={clientSearch}
                                            onChange={e => { setClientSearch(e.target.value); setShowClientDropdown(true); }}
                                            onFocus={() => setShowClientDropdown(true)}
                                            placeholder="Buscar cliente por nombre o NIT..."
                                            style={{
                                                width: '100%', padding: '8px 12px', borderRadius: '8px',
                                                border: '1px solid #E2E8F0', fontSize: '0.85rem',
                                                outline: 'none', boxSizing: 'border-box'
                                            }}
                                        />
                                        {showClientDropdown && clientSearch.length > 0 && (
                                            <div style={{
                                                position: 'absolute', top: '100%', left: 0, right: 0,
                                                backgroundColor: 'white', border: '1px solid #E2E8F0',
                                                borderRadius: '8px', zIndex: 9999, maxHeight: '150px',
                                                overflowY: 'auto', marginTop: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
                                            }}>
                                                {filteredClients.map(c => (
                                                    <div 
                                                        key={c.id}
                                                        onClick={() => {
                                                            setSelectedClientId(c.id);
                                                            setClientSearch('');
                                                            setShowClientDropdown(false);
                                                        }}
                                                        style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '0.8rem', borderBottom: '1px solid #F1F5F9', transition: 'background 0.2s' }}
                                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                                    >
                                                        <strong>{c.company_name || c.contact_name}</strong> {c.nit ? `• NIT ${c.nit}` : ''}
                                                    </div>
                                                ))}
                                                {filteredClients.length === 0 && (
                                                    <div style={{ padding: '8px 12px', fontSize: '0.8rem', color: '#64748B', textAlign: 'center' }}>No se encontraron clientes</div>
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* Order Selection */}
                            {selectedClientId && orders.length > 0 && (
                                <div>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '700', color: '#64748B', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                                        Pedido asociado (Opcional)
                                    </label>
                                    <select
                                        value={selectedOrderId}
                                        onChange={e => setSelectedOrderId(e.target.value)}
                                        style={{
                                            width: '100%', padding: '8px', borderRadius: '8px',
                                            border: '1px solid #E2E8F0', fontSize: '0.8rem',
                                            outline: 'none', backgroundColor: 'white', fontWeight: '600'
                                        }}
                                    >
                                        <option value="">No asociar a un pedido específico</option>
                                        {orders.map(o => (
                                            <option key={o.id} value={o.id}>
                                                Pedido #{o.sequence_id || o.id.substring(0,6).toUpperCase()} (${(o.total || 0).toLocaleString()} • {new Date(o.created_at).toLocaleDateString()})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Type and Category */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                <div>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '700', color: '#64748B', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                                        Tipo PQR
                                    </label>
                                    <select
                                        value={pqrType}
                                        onChange={e => setPqrType(e.target.value as any)}
                                        style={{
                                            width: '100%', padding: '8px', borderRadius: '8px',
                                            border: '1px solid #E2E8F0', fontSize: '0.8rem',
                                            outline: 'none', backgroundColor: 'white', fontWeight: '600'
                                        }}
                                    >
                                        <option value="queja">Queja</option>
                                        <option value="reclamo">Reclamo</option>
                                        <option value="peticion">Petición</option>
                                        <option value="sugerencia">Sugerencia</option>
                                        <option value="felicitacion">Felicitación</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '700', color: '#64748B', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                                        Categoría
                                    </label>
                                    <select
                                        value={category}
                                        onChange={e => setCategory(e.target.value as any)}
                                        style={{
                                            width: '100%', padding: '8px', borderRadius: '8px',
                                            border: '1px solid #E2E8F0', fontSize: '0.8rem',
                                            outline: 'none', backgroundColor: 'white', fontWeight: '600'
                                        }}
                                    >
                                        <option value="producto">Producto</option>
                                        <option value="entrega">Entrega / Logística</option>
                                        <option value="facturacion">Facturación</option>
                                        <option value="otro">Otro</option>
                                    </select>
                                </div>
                            </div>

                            {/* Priority */}
                            <div>
                                <label style={{ fontSize: '0.7rem', fontWeight: '700', color: '#64748B', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                                    Prioridad del caso
                                </label>
                                <select
                                    value={priority}
                                    onChange={e => setPriority(e.target.value as any)}
                                    style={{
                                        width: '100%', padding: '8px', borderRadius: '8px',
                                        border: '1px solid #E2E8F0', fontSize: '0.8rem',
                                        outline: 'none', backgroundColor: 'white', fontWeight: '600'
                                    }}
                                >
                                    <option value="low">Baja</option>
                                    <option value="normal">Normal</option>
                                    <option value="high">Alta</option>
                                    <option value="urgent">Urgente</option>
                                </select>
                            </div>

                            {/* Subject */}
                            <div>
                                <label style={{ fontSize: '0.7rem', fontWeight: '700', color: '#64748B', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                                    Asunto / Título *
                                </label>
                                <input
                                    value={subject}
                                    onChange={e => setSubject(e.target.value)}
                                    placeholder="Ej: Faltaron 3 kg de aguacate o factura incorrecta"
                                    style={{
                                        width: '100%', padding: '8px 12px', borderRadius: '8px',
                                        border: '1px solid #E2E8F0', fontSize: '0.85rem',
                                        outline: 'none', boxSizing: 'border-box'
                                    }}
                                />
                            </div>

                            {/* Detail */}
                            <div>
                                <label style={{ fontSize: '0.7rem', fontWeight: '700', color: '#64748B', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                                    Descripción Detallada *
                                </label>
                                <textarea
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    placeholder="Detalles sobre lo ocurrido para la gestión de novedades..."
                                    rows={3}
                                    style={{
                                        width: '100%', padding: '8px 12px', borderRadius: '8px',
                                        border: '1px solid #E2E8F0', fontSize: '0.85rem',
                                        outline: 'none', boxSizing: 'border-box', resize: 'none', fontFamily: 'inherit'
                                    }}
                                />
                            </div>

                            {/* Main Easy Upload */}
                            <div>
                                <label style={{ fontSize: '0.7rem', fontWeight: '700', color: '#64748B', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                                    Foto de Evidencia (Fácil)
                                </label>
                                {primaryPhotoPreview ? (
                                    <div style={{ position: 'relative', width: '80px', height: '80px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #E2E8F0' }}>
                                        <img src={primaryPhotoPreview} alt="Evidencia principal" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        <button 
                                            onClick={() => { setPrimaryPhoto(null); setPrimaryPhotoPreview(null); }}
                                            style={{ position: 'absolute', top: '2px', right: '2px', backgroundColor: 'rgba(239, 68, 68, 0.9)', color: 'white', border: 'none', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '0.65rem' }}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ) : (
                                    <div 
                                        onClick={() => document.getElementById('pqr-primary-file')?.click()}
                                        style={{ border: '2px dashed #E2E8F0', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', backgroundColor: '#F8FAFC' }}
                                    >
                                        <UploadCloud size={24} style={{ color: '#94A3B8' }} />
                                        <span style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '4px', fontWeight: '600' }}>Subir foto principal</span>
                                        <input 
                                            id="pqr-primary-file"
                                            type="file"
                                            accept="image/*"
                                            onChange={handlePrimaryPhotoChange}
                                            style={{ display: 'none' }}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Advanced Upload trigger button */}
                            {primaryPhotoPreview && (
                                <button 
                                    onClick={() => setShowAdvancedPhotos(prev => !prev)}
                                    style={{ border: 'none', background: 'none', color: '#0D7A57', fontWeight: '700', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', alignSelf: 'flex-start' }}
                                >
                                    {showAdvancedPhotos ? '✕ Ocultar soporte adicional' : '➕ Agregar más fotos de soporte (hasta 7 más)'}
                                </button>
                            )}

                            {/* Advanced grid uploads */}
                            {showAdvancedPhotos && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', borderTop: '1px solid #F1F5F9', paddingTop: '8px' }}>
                                    {additionalPreviews.map((preview, index) => (
                                        <div key={index} style={{ position: 'relative', aspectRatio: '1/1', border: '1px dashed #D1D5DB', borderRadius: '6px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9FAFB' }}>
                                            {preview ? (
                                                <>
                                                    <img src={preview} alt={`Adicional ${index}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    <button 
                                                        onClick={() => removeAdditionalPhoto(index)}
                                                        style={{ position: 'absolute', top: '1px', right: '1px', backgroundColor: 'rgba(239, 68, 68, 0.9)', color: 'white', border: 'none', borderRadius: '50%', width: '14px', height: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '0.55rem' }}
                                                    >
                                                        ✕
                                                    </button>
                                                </>
                                            ) : (
                                                <div 
                                                    onClick={() => document.getElementById(`pqr-advanced-file-${index}`)?.click()}
                                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', cursor: 'pointer' }}
                                                >
                                                    <ImageIcon size={14} style={{ color: '#94A3B8' }} />
                                                    <input 
                                                        id={`pqr-advanced-file-${index}`}
                                                        type="file"
                                                        accept="image/*"
                                                        onChange={(e) => handleAdditionalPhotoChange(index, e)}
                                                        style={{ display: 'none' }}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Submit Button */}
                            <button
                                onClick={handleSubmit}
                                disabled={submitting || !selectedClientId || !subject.trim() || !description.trim()}
                                style={{
                                    width: '100%',
                                    backgroundColor: (selectedClientId && subject.trim() && description.trim()) ? '#0D7A57' : '#94A3B8',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    padding: '0.65rem',
                                    fontWeight: '700',
                                    cursor: (selectedClientId && subject.trim() && description.trim() && !submitting) ? 'pointer' : 'not-allowed',
                                    fontSize: '0.85rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    boxShadow: (selectedClientId && subject.trim() && description.trim()) ? '0 4px 12px rgba(13, 122, 87, 0.15)' : 'none',
                                    transition: 'all 0.15s'
                                }}
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin" /> Registrando...
                                    </>
                                ) : (
                                    'Registrar Caso / PQR'
                                )}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
