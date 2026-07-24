'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
    Users, 
    Plus, 
    Search, 
    ChevronRight, 
    Building2, 
    Phone, 
    MapPin, 
    Edit2, 
    Archive, 
    LayoutGrid,
    List,
    Clock,
    RotateCcw,
    Package,
    FileText,
    Eye,
    EyeOff,
    CheckCircle2,
    AlertCircle,
    Building,
    ExternalLink,
    Wallet,
    Info,
    FileCheck,
    Smartphone,
    User,
    Calendar,
    Tag,
    Save,
    X,
    HelpCircle,
    Upload,
    Loader2,
    Mail,
    Coins,
    Globe,
    CreditCard,
    Banknote,
    Target,
    Zap,
    StickyNote,
    Store
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { THEME, formatNumber, formatMoney } from '@/lib/adminTheme';
import { useAuth, checkUserPermission } from '@/lib/authContext';
import { ShieldAlert } from 'lucide-react';

export default function ProvidersPage() {
    const { profile } = useAuth();
    const [roles, setRoles] = useState<any[]>([]);
    const [mounted, setMounted] = useState(false);
    const [providers, setProviders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const hasPermission = (permission: string) => {
        return checkUserPermission(profile, permission, roles);
    };

    const canView = hasPermission('admin.procurement.providers.view') || hasPermission('admin.procurement.providers') || hasPermission('admin.procurement');
    const canEdit = hasPermission('admin.procurement.providers.edit') || hasPermission('admin.procurement.providers') || hasPermission('admin.procurement');
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
    const [showArchived, setShowArchived] = useState(false);
    const [selectedProvider, setSelectedProvider] = useState<any | null>(null);
    const [showHelp, setShowHelp] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [uploading, setUploading] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [activeCategoryFilter, setActiveCategoryFilter] = useState<'all' | 'products' | 'general'>('all');
    
    // New Provider Form State
    const [newProvider, setNewProvider] = useState({
        name: '',
        tax_id: '',
        document_type: 'NIT',
        category: 'GENERAL',
        type: 'contado',
        product: '',
        contact_name: '',
        phone: '',
        email: '',
        city: '',
        world_office_id: '',
        payment_terms_days: 0,
        address: '',
        bank_name: '',
        bank_account_number: '',
        bank_account_type: 'Ahorros',
        billing_type: 'soporte',
        payment_condition: '',
        observations: '',
        rut_url: '',
        additional_docs_url: '',
        warehouse_location: '',
        puesto: '',
        is_active: true,
        is_archived: false
    });

    const [stats, setStats] = useState({
        total: 0,
        credit: 0,
        cash: 0,
        active: 0
    });

    const fetchProviders = useCallback(async () => {
        try {
            setLoading(true);
            const rolesRes = await supabase.from('app_settings').select('key, value').eq('key', 'system_roles').maybeSingle();

            if (!rolesRes.error && rolesRes.data?.value) {
                try {
                    setRoles(JSON.parse(rolesRes.data.value));
                } catch (e) {
                    console.error('Error parsing system_roles:', e);
                }
            }

            let allProviders: any[] = [];

            try {
                const apiRes = await fetch('/api/providers');
                if (apiRes.ok) {
                    const json = await apiRes.json();
                    allProviders = json.providers || [];
                }
            } catch (apiErr) {
                console.warn('API /api/providers failed, falling back to direct supabase:', apiErr);
            }

            if (allProviders.length === 0) {
                let from = 0;
                const limit = 1000;
                let hasMore = true;

                while (hasMore) {
                    const { data, error } = await supabase
                        .from('providers')
                        .select('*')
                        .order('name', { ascending: true })
                        .range(from, from + limit - 1);
                    
                    if (error) break;
                    if (data && data.length > 0) {
                        allProviders = [...allProviders, ...data];
                        from += limit;
                        if (data.length < limit) hasMore = false;
                    } else {
                        hasMore = false;
                    }
                }
            }

            setStats({
                total: allProviders.filter(p => !p.is_archived).length,
                credit: allProviders.filter(p => !p.is_archived && p.type === 'credito').length,
                cash: allProviders.filter(p => !p.is_archived && p.type !== 'credito').length,
                active: allProviders.filter(p => !p.is_archived && p.is_active).length
            });

            const mappedProviders = allProviders.map((p: any) => ({
                ...p,
                category: (p.product && p.product.trim() !== '') ? 'PRODUCTOS' : 'GENERAL'
            }));
            setProviders(mappedProviders);
        } catch (err) {
            console.error('Error fetching providers:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'rut_url' | 'additional_docs_url') => {
        if (!canEdit) {
            alert('No tienes permisos de edición en este módulo.');
            return;
        }
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setUploading(field);
            const fileExt = file.name.split('.').pop();
            const cleanName = (newProvider.tax_id || 'new').replace(/[^a-zA-Z0-9]/g, '');
            const fileName = `${cleanName}_${field}_${Date.now()}.${fileExt}`;
            const filePath = `${fileName}`;

            const { data, error: uploadError } = await supabase.storage
                .from('providers')
                .upload(filePath, file, {
                    cacheControl: '3600',
                    upsert: true
                });

            if (uploadError) {
                console.error('Full Upload Error:', uploadError);
                throw uploadError;
            }

            const { data: { publicUrl } } = supabase.storage
                .from('providers')
                .getPublicUrl(filePath);

            setNewProvider(prev => ({ ...prev, [field]: publicUrl }));
        } catch (err: any) {
            console.error('Detailed Upload error:', err);
            alert(`Error de subida: ${err.message || 'Verifica los permisos del bucket providers en Supabase'}`);
        } finally {
            setUploading(null);
        }
    };

    const handleSaveProvider = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canEdit) {
            alert('No tienes permisos de edición en este módulo.');
            return;
        }
        try {
            const providerData = {
                ...newProvider,
                category: (newProvider.product && newProvider.product.trim() !== '') ? 'PRODUCTOS' : 'GENERAL',
                warehouse_location: newProvider.warehouse_location ? parseInt(newProvider.warehouse_location, 10) : null,
                puesto: newProvider.puesto || null,
                contact_phone: newProvider.phone || null,
                city: newProvider.city || null,
                world_office_id: newProvider.world_office_id || null,
                location: [
                    newProvider.warehouse_location ? `Bodega: ${newProvider.warehouse_location}` : '',
                    newProvider.puesto ? `Puesto: ${newProvider.puesto}` : ''
                ].filter(Boolean).join(', ') || null
            };
            
            let saved = false;
            try {
                const apiRes = await fetch('/api/providers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: editingId ? 'update' : 'create',
                        providerId: editingId,
                        providerData
                    })
                });
                if (apiRes.ok) saved = true;
            } catch (e) {
                console.warn('API save provider failed, falling back to direct supabase:', e);
            }

            if (!saved) {
                let error;
                if (editingId) {
                    const { error: err } = await supabase
                        .from('providers')
                        .update(providerData)
                        .eq('id', editingId);
                    error = err;
                } else {
                    const { error: err } = await supabase
                        .from('providers')
                        .insert([providerData]);
                    error = err;
                }
                if (error) throw error;
            }
            
            setShowCreateModal(false);
            setEditingId(null);
            setNewProvider({
                name: '', tax_id: '', document_type: 'NIT', category: 'GENERAL',
                type: 'contado', product: '', contact_name: '', phone: '',
                email: '', city: '', world_office_id: '', payment_terms_days: 0,
                address: '', bank_name: '', bank_account_number: '',
                bank_account_type: 'Ahorros', billing_type: 'soporte',
                payment_condition: '', observations: '', rut_url: '',
                additional_docs_url: '', warehouse_location: '', puesto: '',
                is_active: true, is_archived: false
            });
            fetchProviders();
        } catch (err) {
            console.error('Error saving provider:', err);
            alert('Error al guardar el proveedor. Verifica el NIT/CC único.');
        }
    };

    const toggleArchiveStatus = async (e: React.MouseEvent, id: string, currentStatus: boolean) => {
        e.stopPropagation();
        if (!canEdit) {
            alert('No tienes permisos de edición en este módulo.');
            return;
        }
        const actionText = currentStatus ? 'restaurar' : 'archivar';
        if (!confirm(`¿Seguro que deseas ${actionText} este proveedor?`)) return;
        try {
            let saved = false;
            try {
                const apiRes = await fetch('/api/providers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'toggle-archive',
                        providerId: id,
                        is_archived: !currentStatus
                    })
                });
                if (apiRes.ok) saved = true;
            } catch (e) {
                console.warn('API toggle archive failed:', e);
            }

            if (!saved) {
                const { error } = await supabase
                    .from('providers')
                    .update({ is_archived: !currentStatus, is_active: currentStatus ? true : false })
                    .eq('id', id);
                if (error) throw error;
            }
            fetchProviders();
        } catch (err) {
            console.error('Error updating status:', err);
        }
    };

    useEffect(() => {
        setMounted(true);
        fetchProviders();
    }, [fetchProviders]);

    const filteredProviders = useMemo(() => {
        return providers.filter(p => {
            if (showArchived && !p.is_archived) return false;
            if (!showArchived && p.is_archived) return false;

            const hasProduct = p.product && p.product.trim() !== '';
            if (activeCategoryFilter === 'products' && !hasProduct) return false;
            if (activeCategoryFilter === 'general' && hasProduct) return false;

            if (!searchTerm) return true;
            const query = searchTerm.toLowerCase().trim();
            if (query.startsWith('@')) {
                const cmd = query.substring(1);
                if (!cmd) return true;
                let matches = false;
                const matchCred = 'credito'.startsWith(cmd) || 'credit'.startsWith(cmd);
                const matchCont = 'contado'.startsWith(cmd) || 'cash'.startsWith(cmd);
                if (matchCred && p.type === 'credito') matches = true;
                if (matchCont && p.type === 'contado') matches = true;
                const matchAct = 'activo'.startsWith(cmd) || 'active'.startsWith(cmd);
                const matchIna = 'inactivo'.startsWith(cmd) || 'inactive'.startsWith(cmd);
                if (matchAct && p.is_active === true) matches = true;
                if (matchIna && p.is_active === false) matches = true;
                const matchSop = 'soporte'.startsWith(cmd);
                const matchEle = 'electronica'.startsWith(cmd) || 'electronic'.startsWith(cmd);
                if (matchSop && p.billing_type === 'soporte') matches = true;
                if (matchEle && p.billing_type === 'electronica') matches = true;
                return matches;
            }
            return (
                p.name?.toLowerCase().includes(query) || 
                p.tax_id?.toLowerCase().includes(query) ||
                p.product?.toLowerCase().includes(query) ||
                p.category?.toLowerCase().includes(query) ||
                p.bank_name?.toLowerCase().includes(query) ||
                p.contact_name?.toLowerCase().includes(query) ||
                p.city?.toLowerCase().includes(query) ||
                p.world_office_id?.toLowerCase().includes(query)
            );
        });
    }, [providers, searchTerm, showArchived, activeCategoryFilter]);

    const incompleteCount = useMemo(() => {
        return providers.filter(p => !p.is_archived && (!p.rut_url || !p.phone)).length;
    }, [providers]);

    const baseProvidersCount = useMemo(() => {
        return providers.filter(p => {
            if (showArchived && !p.is_archived) return false;
            if (!showArchived && p.is_archived) return false;
            
            const hasProduct = p.product && p.product.trim() !== '';
            if (activeCategoryFilter === 'products' && !hasProduct) return false;
            if (activeCategoryFilter === 'general' && hasProduct) return false;
            
            return true;
        }).length;
    }, [providers, showArchived, activeCategoryFilter]);

    if (!mounted) return null;

    if (loading) {
        return (
            <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.colors.background }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                    <Loader2 size={36} className="animate-spin" style={{ color: THEME.colors.primary }} />
                    <span style={{ color: THEME.colors.textSecondary, fontSize: '0.85rem', fontWeight: '600' }}>Cargando maestro de proveedores...</span>
                </div>
            </main>
        );
    }

    if (!canView) {
        return (
            <main style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.colors.background }}>
                <div style={{
                    textAlign: 'center',
                    padding: '3rem',
                    backgroundColor: 'white',
                    borderRadius: THEME.radius.lg,
                    boxShadow: THEME.shadow.md,
                    maxWidth: '480px',
                    border: `1px solid ${THEME.colors.border}`,
                }}>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '64px',
                        height: '64px',
                        borderRadius: '50%',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        color: '#EF4444',
                        marginBottom: '1.5rem',
                    }}>
                        <ShieldAlert size={32} />
                    </div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: '800', color: THEME.colors.textMain, marginBottom: '0.75rem' }}>
                        Acceso Denegado
                    </h1>
                    <p style={{ color: THEME.colors.textSecondary, fontSize: '0.95rem', lineHeight: '1.5' }}>
                        No tienes los permisos necesarios para visualizar este módulo. Por favor, solicita acceso a un administrador.
                    </p>
                </div>
            </main>
        );
    }

    return (
        <main style={{ minHeight: '100vh', backgroundColor: THEME.colors.background, fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif' }}>
            
            <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '0.4rem 2rem' }}>
                {!canEdit && (
                    <div style={{
                        padding: '12px 16px',
                        borderRadius: THEME.radius.md,
                        backgroundColor: 'rgba(245, 158, 11, 0.08)',
                        border: '1px solid rgba(245, 158, 11, 0.2)',
                        color: '#D97706',
                        fontSize: '0.85rem',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '1rem',
                        marginTop: '0.5rem'
                    }}>
                        <ShieldAlert size={16} />
                        <span>Modo Vista: No tienes permisos para crear o editar la ficha de proveedores.</span>
                    </div>
                )}
                
                {/* Header */}
                <header style={{ marginBottom: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <h1 style={{ fontSize: '1.6rem', fontWeight: '900', color: THEME.colors.textMain, margin: 0, letterSpacing: '-0.03em' }}>
                            Maestro de <span style={{ color: THEME.colors.primary }}>Proveedores</span>{showArchived && ' (Archivo)'}
                        </h1>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.8 }}>
                             <span style={{ backgroundColor: THEME.colors.textMain, color: '#D4AF37', padding: '2px 6px', borderRadius: '4px', fontSize: '0.55rem', fontWeight: '900', letterSpacing: '0.05em' }}>COMPRAS 360</span>
                             <span style={{ color: THEME.colors.textSecondary, fontSize: '0.65rem', fontWeight: '700' }}>/ MAESTRO DE PROVEEDORES</span>
                        </div>
                    </div>
                </header>

                {/* DASHBOARD INDICATORS (FLAT DESIGN & LUCIDE ICONS) */}
                <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(5, 1fr)', 
                    gap: '1rem', 
                    marginBottom: '1rem'
                }}>
                    <KPICard title="Total Proveedores" value={formatNumber(stats.total)} icon={<Building2 size={18} strokeWidth={1.5} />} color={THEME.colors.primary} subtitle="Proveedores registrados" />
                    <KPICard title="Proveedores Crédito" value={formatNumber(stats.credit)} icon={<CreditCard size={18} strokeWidth={1.5} />} color="#10B981" subtitle="Facturación a plazo" />
                    <KPICard title="Proveedores Contado" value={formatNumber(stats.cash)} icon={<Coins size={18} strokeWidth={1.5} />} color="#F59E0B" subtitle="Pago inmediato" />
                    <KPICard title="Habilitados" value={formatNumber(stats.active)} icon={<CheckCircle2 size={18} strokeWidth={1.5} />} color="#0D7A57" subtitle="Activos para compra" />
                    <KPICard title="Alertas" value={formatNumber(incompleteCount)} icon={<AlertCircle size={18} strokeWidth={1.5} />} color="#EF4444" subtitle="Sin RUT o Teléfono" />
                </div>

                {/* UNIFIED CONTROL BAR */}
                <div style={{ 
                    display: 'flex', 
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem', 
                    marginBottom: '1rem', 
                    backgroundColor: 'white', 
                    padding: '0.4rem 0.6rem', 
                    borderRadius: '12px', 
                    boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                    border: `1px solid ${THEME.colors.border}`
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                        {/* Search Segment */}
                        <div style={{ position: 'relative', flex: 1 }}>
                            <span style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: THEME.colors.textSecondary, display: 'flex', alignItems: 'center' }}>
                                <Search size={16} strokeWidth={1.5} />
                            </span>
                            <input 
                                placeholder="Buscar por Nombre, NIT o usa @ para comandos (ej: @credito)..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{ 
                                    width: '100%', 
                                    padding: '0 2.5rem 0 2.5rem', 
                                    borderRadius: '10px', 
                                    border: '1px solid #F1F5F9', 
                                    fontSize: '0.85rem',
                                    fontWeight: '600',
                                    outline: 'none',
                                    height: '40px',
                                    backgroundColor: '#F8FAFC',
                                    transition: 'all 0.2s'
                                }}
                                onFocus={(e) => {
                                    e.target.style.backgroundColor = 'white';
                                    e.target.style.borderColor = THEME.colors.primary;
                                    e.target.style.boxShadow = `0 0 0 3px ${THEME.colors.primary}15`;
                                }}
                                onBlur={(e) => {
                                    e.target.style.backgroundColor = '#F8FAFC';
                                    e.target.style.borderColor = '#E2E8F0';
                                }}
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    style={{
                                        position: 'absolute',
                                        right: '0.8rem',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        background: '#E2E8F0',
                                        border: 'none',
                                        color: '#64748B',
                                        width: '20px',
                                        height: '20px',
                                        borderRadius: '50%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        fontSize: '0.7rem',
                                        fontWeight: 'bold'
                                    }}
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>

                        {/* Info Button for Commands */}
                        <div 
                            onMouseEnter={() => setShowHelp(true)}
                            onMouseLeave={() => setShowHelp(false)}
                            style={{ 
                                position: 'relative',
                                width: '40px', 
                                height: '40px', 
                                borderRadius: '10px', 
                                backgroundColor: THEME.colors.primaryLight, 
                                color: THEME.colors.primary, 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                cursor: 'help',
                                border: `1px solid ${THEME.colors.primary}20`,
                                fontSize: '1rem',
                                fontWeight: '900',
                                flexShrink: 0
                            }}
                        >
                            <HelpCircle size={18} strokeWidth={1.5} />
                            {showHelp && (
                                <div style={{
                                    position: 'absolute',
                                    top: '40px',
                                    right: '0',
                                    width: '280px',
                                    backgroundColor: '#1E293B',
                                    color: 'white',
                                    padding: '1rem',
                                    borderRadius: '12px',
                                    boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                                    zIndex: 1000,
                                    fontSize: '0.7rem',
                                    lineHeight: '1.4',
                                    pointerEvents: 'none',
                                    animation: 'fadeInUp 0.2s ease-out',
                                    textAlign: 'left'
                                }}>
                                    <div style={{ fontWeight: '900', color: '#38BDF8', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Zap size={14} /> COMANDOS RÁPIDOS (@)
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                        <div>
                                            <b style={{ color: '#FCD34D' }}>@contado</b>: Contado<br/>
                                            <b style={{ color: '#FCD34D' }}>@credito</b>: Crédito<br/>
                                            <b style={{ color: '#FCD34D' }}>@activo</b>: Habilitados
                                        </div>
                                        <div>
                                            <b style={{ color: '#FCD34D' }}>@soporte</b>: Soporte<br/>
                                            <b style={{ color: '#FCD34D' }}>@electronica</b>: Fact. Elect.
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Contador de Proveedores Filtrados */}
                        <div style={{
                            padding: '0 0.8rem',
                            borderRadius: '10px',
                            backgroundColor: searchTerm ? THEME.colors.primaryLight : '#F8FAFC',
                            color: searchTerm ? THEME.colors.primary : THEME.colors.textSecondary,
                            border: searchTerm ? `1.5px solid ${THEME.colors.primary}` : `1px solid ${THEME.colors.border}`,
                            fontSize: '0.75rem',
                            fontWeight: '700',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            whiteSpace: 'nowrap',
                            height: '40px',
                            flexShrink: 0,
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                        }}>
                            <span style={{ fontSize: '0.9rem', display: 'flex', alignItems: 'center' }}>
                                {searchTerm ? <Target size={16} style={{ color: THEME.colors.primary }} /> : <Building2 size={16} style={{ color: THEME.colors.textSecondary }} />}
                            </span>
                            <span>
                                {searchTerm ? (
                                    <>
                                        <strong style={{ color: THEME.colors.primary, fontSize: '0.8rem' }}>{formatNumber(filteredProviders.length)}</strong>
                                        <span style={{ fontWeight: '600', color: THEME.colors.textSecondary, marginLeft: '3px' }}>de {formatNumber(baseProvidersCount)}</span>
                                    </>
                                ) : (
                                    <>
                                        <strong style={{ color: THEME.colors.textMain }}>{formatNumber(baseProvidersCount)}</strong>
                                        <span style={{ fontWeight: '600', color: THEME.colors.textSecondary, marginLeft: '3px' }}>proveedores</span>
                                    </>
                                )}
                            </span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {/* View Switcher */}
                        <div style={{ display: 'flex', gap: '4px', backgroundColor: '#F3F4F6', padding: '2px', borderRadius: '8px' }}>
                            <button onClick={() => setViewMode('list')} style={{ padding: '0.4rem 0.6rem', border: 'none', borderRadius: '6px', background: viewMode === 'list' ? 'white' : 'transparent', fontSize: '0.7rem', fontWeight: '800', cursor: 'pointer', color: viewMode === 'list' ? THEME.colors.textMain : '#9CA3AF', display: 'flex', alignItems: 'center' }}><List size={14} strokeWidth={1.5} /></button>
                            <button onClick={() => setViewMode('grid')} style={{ padding: '0.4rem 0.6rem', border: 'none', borderRadius: '6px', background: viewMode === 'grid' ? 'white' : 'transparent', fontSize: '0.7rem', fontWeight: '800', cursor: 'pointer', color: viewMode === 'grid' ? THEME.colors.textMain : '#9CA3AF', display: 'flex', alignItems: 'center' }}><LayoutGrid size={14} strokeWidth={1.5} /></button>
                        </div>

                        {/* Nuevo Proveedor Button */}
                        <button 
                            onClick={() => {
                                setEditingId(null);
                                setNewProvider({
                                    name: '', tax_id: '', document_type: 'NIT', category: 'GENERAL',
                                    type: 'contado', product: '', contact_name: '', phone: '',
                                    email: '', city: '', world_office_id: '', payment_terms_days: 0,
                                    address: '', bank_name: '', bank_account_number: '',
                                    bank_account_type: 'Ahorros', billing_type: 'soporte',
                                    payment_condition: '', observations: '', rut_url: '',
                                    additional_docs_url: '', warehouse_location: '', puesto: '',
                                    is_active: true, is_archived: false
                                });
                                setShowCreateModal(true);
                            }}
                            disabled={!canEdit}
                            style={{ 
                                backgroundColor: canEdit ? THEME.colors.primary : THEME.colors.textSecondary, 
                                color: 'white', 
                                padding: '0.5rem 1rem', 
                                borderRadius: THEME.radius.sm, 
                                border: 'none',
                                fontWeight: '600', 
                                fontSize: '0.8rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                cursor: canEdit ? 'pointer' : 'not-allowed',
                                opacity: canEdit ? 1 : 0.6,
                                transition: 'background-color 0.2s'
                            }}
                            onMouseOver={e => {
                                if (canEdit) e.currentTarget.style.backgroundColor = THEME.colors.primaryHover;
                            }}
                            onMouseOut={e => {
                                if (canEdit) e.currentTarget.style.backgroundColor = THEME.colors.primary;
                            }}
                        >
                            <Plus size={14} strokeWidth={1.5} /> Nuevo Proveedor
                        </button>
                    </div>
                </div>

                {/* Category Filter Pills (Design Manual Segmented Control) */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '1.2rem' }}>
                    {[
                        { id: 'all', label: 'Todos' },
                        { id: 'products', label: 'Proveedores de Productos' },
                        { id: 'general', label: 'Proveedores Generales / Servicios' }
                    ].map((tab) => {
                        const isActive = activeCategoryFilter === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveCategoryFilter(tab.id as any)}
                                style={{
                                    padding: '0.45rem 1.1rem',
                                    borderRadius: '10px',
                                    border: '1px solid ' + (isActive ? 'transparent' : THEME.colors.border),
                                    backgroundColor: isActive ? THEME.colors.primary : 'white',
                                    color: isActive ? 'white' : THEME.colors.textSecondary,
                                    fontWeight: '600',
                                    fontSize: '0.8rem',
                                    cursor: 'pointer',
                                    boxShadow: isActive ? '0 2px 6px rgba(13, 122, 87, 0.2)' : 'none',
                                    transition: 'all 0.2s ease-in-out'
                                }}
                            >
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {/* Content Area */}
                {loading && providers.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '10rem 0', color: THEME.colors.textSecondary }}>Consultando base de datos...</div>
                ) : viewMode === 'list' ? (
                    /* Compact List View */
                    <div style={{ backgroundColor: 'white', borderRadius: THEME.radius.md, overflow: 'hidden', boxShadow: THEME.shadow.sm, border: `1px solid ${THEME.colors.border}` }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#F9FAFB', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                    <th style={{ ...THEME.typography?.tableHeader, padding: '0.65rem 1.25rem', textAlign: 'left' }}>Nombre del Proveedor</th>
                                    <th style={{ ...THEME.typography?.tableHeader, padding: '0.65rem 1.25rem', textAlign: 'left' }}>Identificación</th>
                                    <th style={{ ...THEME.typography?.tableHeader, padding: '0.65rem 1.25rem', textAlign: 'left' }}>Contacto</th>
                                    <th style={{ ...THEME.typography?.tableHeader, padding: '0.65rem 1.25rem', textAlign: 'left' }}>Categoría</th>
                                    <th style={{ ...THEME.typography?.tableHeader, padding: '0.65rem 1.25rem', textAlign: 'left' }}>Tipo Pago</th>
                                    <th style={{ ...THEME.typography?.tableHeader, padding: '0.65rem 1.25rem', textAlign: 'right', width: '100px' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredProviders.map((p) => (
                                    <tr 
                                        key={p.id} 
                                        onClick={() => setSelectedProvider(p)}
                                        style={{ borderBottom: '1px solid #F1F5F9', cursor: 'pointer', transition: 'all 0.1s' }}
                                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAF9')}
                                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                                    >
                                        <td style={{ padding: '0.65rem 1.25rem' }}>
                                            <div style={{ fontWeight: '700', color: THEME.colors.textMain, fontSize: '0.85rem' }}>{p.name}</div>
                                            <div style={{ fontSize: '0.75rem', color: THEME.colors.primary, fontWeight: '600', marginTop: '0.15rem' }}>{p.product || 'Sin producto'}</div>
                                        </td>
                                        <td style={{ padding: '0.65rem 1.25rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                <span style={{ fontSize: '0.65rem', fontWeight: '700', color: THEME.colors.textSecondary, backgroundColor: '#F1F5F9', padding: '0.15rem 0.35rem', borderRadius: '4px' }}>{p.document_type || 'NIT'}</span>
                                                <span style={{ fontWeight: '600', color: THEME.colors.textMain, fontSize: '0.85rem' }}>{p.tax_id}</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.65rem 1.25rem' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                                {(p.phone || p.contact_phone) ? (
                                                    <span style={{ fontSize: '0.75rem', fontWeight: '500', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Smartphone size={12} strokeWidth={1.5} /> {p.phone || p.contact_phone}</span>
                                                ) : <span style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary }}>—</span>}
                                                {p.email && (
                                                    <span style={{ fontSize: '0.7rem', fontWeight: '500', color: THEME.colors.textSecondary, display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Mail size={12} strokeWidth={1.5} /> {p.email}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.65rem 1.25rem' }}>
                                            <div style={{ 
                                                fontSize: '0.7rem', 
                                                fontWeight: '600', 
                                                color: (p.category || '').toUpperCase() === 'PRODUCTOS' ? THEME.colors.primary : THEME.colors.textSecondary, 
                                                backgroundColor: (p.category || '').toUpperCase() === 'PRODUCTOS' ? THEME.colors.primaryLight : '#F1F5F9', 
                                                padding: '0.2rem 0.5rem', 
                                                borderRadius: '6px', 
                                                display: 'inline-block' 
                                            }}>
                                                {p.category || 'GENERAL'}
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.65rem 1.25rem' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: p.type === 'credito' ? '#10B981' : THEME.colors.primary }}>{p.type?.toUpperCase()}</span>
                                        </td>
                                        <td style={{ padding: '0.65rem 1.25rem', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                                            <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                                                <button 
                                                    onClick={(e) => toggleArchiveStatus(e, p.id, p.is_archived)} 
                                                    disabled={!canEdit}
                                                    style={{ 
                                                        backgroundColor: '#F8FAFC', 
                                                        border: '1px solid #E2E8F0', 
                                                        borderRadius: '8px', 
                                                        padding: '0.4rem', 
                                                        color: p.is_archived ? '#10B981' : '#EF4444', 
                                                        cursor: canEdit ? 'pointer' : 'not-allowed',
                                                        opacity: canEdit ? 1 : 0.5
                                                    }}
                                                >
                                                    {p.is_archived ? <RotateCcw size={14} strokeWidth={1.5} /> : <Archive size={14} strokeWidth={1.5} />}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    /* Premium Grid/Gallery View */
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                        {filteredProviders.map((p) => {
                            let badgeColor = THEME.colors.textSecondary;
                            let badgeBg = '#F1F5F9';
                            const cat = (p.category || '').toUpperCase();
                            if (cat === 'PRODUCTOS') {
                                badgeColor = THEME.colors.primary;
                                badgeBg = THEME.colors.primaryLight;
                            }

                            const initials = p.name ? p.name.split(' ').slice(0, 2).map((n: string) => n[0]).join('') : 'P';

                            return (
                                <div 
                                    key={p.id}
                                    onClick={() => setSelectedProvider(p)}
                                    style={{ 
                                        backgroundColor: 'white', 
                                        borderRadius: THEME.radius.md, 
                                        border: `1px solid ${THEME.colors.border}`, 
                                        padding: '1rem', 
                                        cursor: 'pointer', 
                                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)', 
                                        display: 'flex', 
                                        flexDirection: 'column', 
                                        gap: '0.85rem',
                                        boxShadow: THEME.shadow.sm
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.transform = 'translateY(-1px)';
                                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)';
                                        e.currentTarget.style.borderColor = THEME.colors.primary;
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.transform = 'translateY(0px)';
                                        e.currentTarget.style.boxShadow = THEME.shadow.sm;
                                        e.currentTarget.style.borderColor = THEME.colors.border;
                                    }}
                                >
                                    {/* Card Top */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ 
                                            width: '38px', 
                                            height: '38px', 
                                            borderRadius: '10px', 
                                            background: THEME.colors.primary, 
                                            color: 'white', 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'center', 
                                            fontWeight: '700', 
                                            fontSize: '1rem' 
                                        }}>
                                            {initials}
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                                            <span style={{ 
                                                fontSize: '0.65rem', 
                                                fontWeight: '600', 
                                                color: p.type === 'credito' ? '#10B981' : THEME.colors.primary, 
                                                backgroundColor: p.type === 'credito' ? '#ECFDF5' : THEME.colors.primaryLight, 
                                                padding: '0.2rem 0.5rem', 
                                                borderRadius: '6px' 
                                            }}>
                                                {p.type?.toUpperCase()}
                                            </span>
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleArchiveStatus(e, p.id, p.is_archived);
                                                }} 
                                                disabled={!canEdit}
                                                style={{ 
                                                    backgroundColor: '#F8FAFC', 
                                                    border: '1px solid #E2E8F0', 
                                                    borderRadius: '6px', 
                                                    padding: '0.25rem', 
                                                    color: p.is_archived ? '#10B981' : '#EF4444',
                                                    cursor: canEdit ? 'pointer' : 'not-allowed',
                                                    opacity: canEdit ? 1 : 0.5,
                                                    display: 'flex',
                                                    alignItems: 'center'
                                                }}
                                            >
                                                {p.is_archived ? <RotateCcw size={12} strokeWidth={1.5} /> : <Archive size={12} strokeWidth={1.5} />}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Provider Info */}
                                    <div>
                                        <h3 style={{ fontSize: '0.95rem', fontWeight: '800', color: THEME.colors.textMain, margin: 0, lineHeight: 1.3 }}>{p.name}</h3>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.25rem' }}>
                                            <span style={{ fontSize: '0.6rem', fontWeight: '800', color: THEME.colors.textSecondary, backgroundColor: '#F1F5F9', padding: '0.15rem 0.35rem', borderRadius: '4px' }}>{p.document_type || 'NIT'}</span>
                                            <span style={{ fontWeight: '600', color: THEME.colors.textSecondary, fontSize: '0.75rem' }}>{p.tax_id}</span>
                                        </div>
                                    </div>

                                    {/* Category and Products Tag */}
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                            <span style={{ 
                                                fontSize: '0.65rem', 
                                                fontWeight: '700', 
                                                color: badgeColor, 
                                                backgroundColor: badgeBg, 
                                                padding: '0.15rem 0.4rem', 
                                                borderRadius: '4px' 
                                            }}>
                                                {p.category || 'GENERAL'}
                                            </span>
                                        </div>
                                        <p style={{ fontSize: '0.72rem', color: THEME.colors.primary, fontWeight: '600', margin: 0 }}>
                                            {p.product || 'Sin producto asignado'}
                                        </p>
                                    </div>

                                    {/* Warehouse & Stand/Booth Badges */}
                                    {(p.warehouse_location !== null || p.puesto) && (
                                        <div style={{ 
                                            display: 'flex', 
                                            gap: '0.4rem', 
                                            padding: '0.35rem 0.5rem', 
                                            backgroundColor: '#F8FAFC', 
                                            borderRadius: '6px', 
                                            border: '1px dashed #E2E8F0',
                                            flexWrap: 'wrap'
                                        }}>
                                            {p.warehouse_location !== null && p.warehouse_location !== undefined && (
                                                <div style={{ fontSize: '0.7rem', fontWeight: '600', color: THEME.colors.textSecondary, display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                                    <Package size={12} strokeWidth={1.5} /> <span style={{ color: THEME.colors.textSecondary }}>Bod:</span> <strong style={{ color: THEME.colors.textMain }}>#{p.warehouse_location}</strong>
                                                </div>
                                            )}
                                            {p.puesto && (
                                                <div style={{ fontSize: '0.7rem', fontWeight: '600', color: THEME.colors.textSecondary, display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                                    <Store size={12} strokeWidth={1.5} /> <span style={{ color: THEME.colors.textSecondary }}>Puesto:</span> <strong style={{ color: THEME.colors.textMain }}>{p.puesto}</strong>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div style={{ borderTop: `1px solid ${THEME.colors.border}`, paddingTop: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem' }}>
                                        <div style={{ color: THEME.colors.textSecondary, fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                            <User size={12} strokeWidth={1.5} /> {p.contact_name || 'Sin contacto'}
                                        </div>
                                        {(p.phone || p.contact_phone) && (
                                            <a 
                                                href={`tel:${p.phone || p.contact_phone}`} 
                                                onClick={(e) => e.stopPropagation()} 
                                                style={{ color: THEME.colors.primary, fontWeight: '600', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                                            >
                                                <Phone size={12} strokeWidth={1.5} /> {p.phone || p.contact_phone}
                                            </a>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* MODAL COMPACTO: Nuevo / Editar Proveedor */}
                {showCreateModal && (
                    <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '1rem' }} onClick={() => setShowCreateModal(false)}>
                        <div style={{ backgroundColor: 'white', borderRadius: '24px', width: '96vw', maxWidth: '980px', maxHeight: '92vh', overflowY: 'auto', overflowX: 'hidden', padding: '1.5rem 2rem', position: 'relative', boxShadow: THEME.shadow.lg, boxSizing: 'border-box' }} onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => setShowCreateModal(false)} style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', border: 'none', backgroundColor: '#F1F5F9', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B' }}><X size={18} /></button>
                            
                            <h2 style={{ fontSize: '1.3rem', fontWeight: '800', color: THEME.colors.textMain, marginBottom: '1.25rem', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Building2 size={20} style={{ color: THEME.colors.primary }} />
                                <span>{editingId ? 'Editar Ficha de' : 'Crear Nuevo'}</span>
                                <span style={{ color: THEME.colors.primary }}>Proveedor</span>
                            </h2>
                            
                            <form onSubmit={handleSaveProvider} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1.5rem', width: '100%', boxSizing: 'border-box' }}>
                                {/* Basic Info Column */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', minWidth: 0 }}>
                                    <div style={{ borderBottom: `1px solid ${THEME.colors.border}`, paddingBottom: '0.35rem', fontWeight: '700', color: THEME.colors.primary, fontSize: '0.75rem', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <Building size={14} /> Identidad Comercial
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: 0 }}>
                                        <label style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary }}>Nombre / Razón Social *</label>
                                        <input required style={{ padding: '0.6rem 0.8rem', borderRadius: '10px', border: '1px solid #E2E8F0', outline: 'none', fontWeight: '600', fontSize: '0.85rem', width: '100%', boxSizing: 'border-box' }} value={newProvider.name} onChange={(e) => setNewProvider({...newProvider, name: e.target.value.toUpperCase()})} />
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)', gap: '0.6rem', width: '100%' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: 0 }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary }}>Tipo Doc.</label>
                                            <select style={{ padding: '0.6rem 0.8rem', borderRadius: '10px', border: '1px solid #E2E8F0', outline: 'none', fontWeight: '600', fontSize: '0.85rem', width: '100%', boxSizing: 'border-box' }} value={newProvider.document_type} onChange={(e) => setNewProvider({...newProvider, document_type: e.target.value})}>
                                                <option value="NIT">NIT</option>
                                                <option value="CC">Cédula</option>
                                            </select>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: 0 }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary }}>Identificación (NIT/CC) *</label>
                                            <input required style={{ padding: '0.6rem 0.8rem', borderRadius: '10px', border: '1px solid #E2E8F0', outline: 'none', fontWeight: '600', fontSize: '0.85rem', width: '100%', boxSizing: 'border-box' }} value={newProvider.tax_id} onChange={(e) => setNewProvider({...newProvider, tax_id: e.target.value})} />
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '0.6rem', width: '100%' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: 0 }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary }}>Categoría</label>
                                            <select style={{ padding: '0.6rem 0.8rem', borderRadius: '10px', border: '1px solid #E2E8F0', outline: 'none', fontWeight: '600', fontSize: '0.85rem', width: '100%', boxSizing: 'border-box' }} value={newProvider.category} onChange={(e) => setNewProvider({...newProvider, category: e.target.value})}>
                                                <option value="GENERAL">GENERAL</option>
                                                <option value="PRODUCTOS">PRODUCTOS</option>
                                            </select>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: 0 }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary }}>Tipo Pago</label>
                                            <select style={{ padding: '0.6rem 0.8rem', borderRadius: '10px', border: '1px solid #E2E8F0', outline: 'none', fontWeight: '600', fontSize: '0.85rem', width: '100%', boxSizing: 'border-box' }} value={newProvider.type} onChange={(e) => setNewProvider({...newProvider, type: e.target.value})}>
                                                <option value="contado">Contado (Inmediato)</option>
                                                <option value="credito">Crédito (Facturación)</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '0.6rem', width: '100%' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: 0 }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary }}>N° Bodega (Plaza)</label>
                                            <input type="number" placeholder="Ej: 12" style={{ padding: '0.6rem 0.8rem', borderRadius: '10px', border: '1px solid #E2E8F0', outline: 'none', fontWeight: '600', fontSize: '0.85rem', width: '100%', boxSizing: 'border-box' }} value={newProvider.warehouse_location} onChange={(e) => setNewProvider({...newProvider, warehouse_location: e.target.value})} />
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: 0 }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary }}>Puesto (Plaza)</label>
                                            <input placeholder="Ej: P-34" style={{ padding: '0.6rem 0.8rem', borderRadius: '10px', border: '1px solid #E2E8F0', outline: 'none', fontWeight: '600', fontSize: '0.85rem', width: '100%', boxSizing: 'border-box' }} value={newProvider.puesto} onChange={(e) => setNewProvider({...newProvider, puesto: e.target.value.toUpperCase()})} />
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: 0 }}>
                                        <label style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary }}>Productos / Insumos Principales</label>
                                        <input placeholder="Ej: Cebolla Larga, Papa Pastusa" style={{ padding: '0.6rem 0.8rem', borderRadius: '10px', border: '1px solid #E2E8F0', outline: 'none', fontWeight: '600', fontSize: '0.85rem', width: '100%', boxSizing: 'border-box' }} value={newProvider.product} onChange={(e) => {
                                            const val = e.target.value;
                                            setNewProvider({
                                                ...newProvider,
                                                product: val.toUpperCase(),
                                                category: val.trim() !== '' ? 'PRODUCTOS' : 'GENERAL'
                                            });
                                        }} />
                                    </div>

                                    <div style={{ borderBottom: `1px solid ${THEME.colors.border}`, paddingBottom: '0.35rem', marginTop: '0.5rem', fontWeight: '700', color: THEME.colors.primary, fontSize: '0.75rem', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <User size={14} /> Contacto &amp; Ubicación
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: 0 }}>
                                        <label style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary }}>Nombre de Contacto</label>
                                        <input style={{ padding: '0.6rem 0.8rem', borderRadius: '10px', border: '1px solid #E2E8F0', outline: 'none', fontWeight: '600', fontSize: '0.85rem', width: '100%', boxSizing: 'border-box' }} value={newProvider.contact_name} onChange={(e) => setNewProvider({...newProvider, contact_name: e.target.value.toUpperCase()})} />
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr)', gap: '0.6rem', width: '100%' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: 0 }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary }}>Teléfono</label>
                                            <input style={{ padding: '0.6rem 0.8rem', borderRadius: '10px', border: '1px solid #E2E8F0', outline: 'none', fontWeight: '600', fontSize: '0.85rem', width: '100%', boxSizing: 'border-box' }} value={newProvider.phone} onChange={(e) => setNewProvider({...newProvider, phone: e.target.value})} />
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: 0 }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary }}>Correo Electrónico</label>
                                            <input type="email" placeholder="ejemplo@correo.com" style={{ padding: '0.6rem 0.8rem', borderRadius: '10px', border: '1px solid #E2E8F0', outline: 'none', fontWeight: '600', fontSize: '0.85rem', width: '100%', boxSizing: 'border-box' }} value={newProvider.email} onChange={(e) => setNewProvider({...newProvider, email: e.target.value})} />
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: '0.6rem', width: '100%' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: 0 }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary }}>Dirección / Oficina Fiscal</label>
                                            <input style={{ padding: '0.6rem 0.8rem', borderRadius: '10px', border: '1px solid #E2E8F0', outline: 'none', fontWeight: '600', fontSize: '0.85rem', width: '100%', boxSizing: 'border-box' }} value={newProvider.address} onChange={(e) => setNewProvider({...newProvider, address: e.target.value.toUpperCase()})} />
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: 0 }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary }}>Ciudad / Origen</label>
                                            <input placeholder="Ej: Bogotá D.C." style={{ padding: '0.6rem 0.8rem', borderRadius: '10px', border: '1px solid #E2E8F0', outline: 'none', fontWeight: '600', fontSize: '0.85rem', width: '100%', boxSizing: 'border-box' }} value={newProvider.city} onChange={(e) => setNewProvider({...newProvider, city: e.target.value})} />
                                        </div>
                                    </div>
                                </div>

                                {/* Financial Info Column */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', minWidth: 0 }}>
                                    <div style={{ borderBottom: `1px solid ${THEME.colors.border}`, paddingBottom: '0.35rem', fontWeight: '700', color: THEME.colors.primary, fontSize: '0.75rem', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <Wallet size={14} /> Información Financiera &amp; ERP
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: '0.6rem', width: '100%' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: 0 }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary }}>Banco</label>
                                            <input style={{ padding: '0.6rem 0.8rem', borderRadius: '10px', border: '1px solid #E2E8F0', outline: 'none', fontWeight: '600', fontSize: '0.85rem', width: '100%', boxSizing: 'border-box' }} value={newProvider.bank_name} onChange={(e) => setNewProvider({...newProvider, bank_name: e.target.value.toUpperCase()})} />
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: 0 }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary }}>Tipo Cuenta</label>
                                            <select style={{ padding: '0.6rem 0.8rem', borderRadius: '10px', border: '1px solid #E2E8F0', outline: 'none', fontWeight: '600', fontSize: '0.85rem', width: '100%', boxSizing: 'border-box' }} value={newProvider.bank_account_type} onChange={(e) => setNewProvider({...newProvider, bank_account_type: e.target.value})}>
                                                <option value="Ahorros">Ahorros</option>
                                                <option value="Corriente">Corriente</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)', gap: '0.6rem', width: '100%' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: 0 }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary }}>Número de Cuenta</label>
                                            <input style={{ padding: '0.6rem 0.8rem', borderRadius: '10px', border: '1px solid #E2E8F0', outline: 'none', fontWeight: '600', fontSize: '0.85rem', width: '100%', boxSizing: 'border-box' }} value={newProvider.bank_account_number} onChange={(e) => setNewProvider({...newProvider, bank_account_number: e.target.value})} />
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: 0 }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary }}>Código ERP (World Office)</label>
                                            <input placeholder="Ej: PRV-0492" style={{ padding: '0.6rem 0.8rem', borderRadius: '10px', border: '1px solid #E2E8F0', outline: 'none', fontWeight: '600', fontSize: '0.85rem', width: '100%', boxSizing: 'border-box' }} value={newProvider.world_office_id} onChange={(e) => setNewProvider({...newProvider, world_office_id: e.target.value.toUpperCase()})} />
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)', gap: '0.6rem', width: '100%' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: 0 }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary }}>Régimen Facturación</label>
                                            <select style={{ padding: '0.6rem 0.8rem', borderRadius: '10px', border: '1px solid #E2E8F0', outline: 'none', fontWeight: '600', fontSize: '0.85rem', width: '100%', boxSizing: 'border-box' }} value={newProvider.billing_type} onChange={(e) => setNewProvider({...newProvider, billing_type: e.target.value})}>
                                                <option value="soporte">Documento Soporte</option>
                                                <option value="electronica">Factura Electrónica</option>
                                            </select>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: 0 }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary }}>Plazo de Pago (Días)</label>
                                            <input type="number" min="0" placeholder="Ej: 15" style={{ padding: '0.6rem 0.8rem', borderRadius: '10px', border: '1px solid #E2E8F0', outline: 'none', fontWeight: '600', fontSize: '0.85rem', width: '100%', boxSizing: 'border-box' }} value={newProvider.payment_terms_days} onChange={(e) => setNewProvider({...newProvider, payment_terms_days: parseInt(e.target.value, 10) || 0})} />
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: 0 }}>
                                        <label style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary }}>Condición de Pago (Texto)</label>
                                        <input placeholder="Ej: Crédito 15 días tras entrega" style={{ padding: '0.6rem 0.8rem', borderRadius: '10px', border: '1px solid #E2E8F0', outline: 'none', fontWeight: '600', fontSize: '0.85rem', width: '100%', boxSizing: 'border-box' }} value={newProvider.payment_condition} onChange={(e) => setNewProvider({...newProvider, payment_condition: e.target.value})} />
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: 0 }}>
                                        <label style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary }}>Observaciones Técnicas / Notas</label>
                                        <textarea rows={2} style={{ padding: '0.6rem 0.8rem', borderRadius: '10px', border: '1px solid #E2E8F0', outline: 'none', fontWeight: '500', fontSize: '0.85rem', resize: 'none', width: '100%', boxSizing: 'border-box' }} value={newProvider.observations} onChange={(e) => setNewProvider({...newProvider, observations: e.target.value})} />
                                    </div>

                                    {/* FILES SECTION */}
                                    <div style={{ borderBottom: `1px solid ${THEME.colors.border}`, paddingBottom: '0.35rem', marginTop: '0.2rem', fontWeight: '700', color: THEME.colors.primary, fontSize: '0.75rem', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <FileText size={14} /> Bóveda de Documentos (PDF)
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '0.6rem', width: '100%' }}>
                                        {/* RUT UPLOAD */}
                                        <div style={{ position: 'relative', minWidth: 0 }}>
                                            <label style={{ fontSize: '0.7rem', fontWeight: '700', color: THEME.colors.textSecondary, display: 'block', marginBottom: '0.2rem' }}>Registro RUT</label>
                                            <input type="file" accept=".pdf" id="rut-upload" hidden onChange={(e) => handleFileUpload(e, 'rut_url')} />
                                            <label htmlFor="rut-upload" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.6rem', borderRadius: '10px', border: '1px dashed #E2E8F0', cursor: 'pointer', backgroundColor: newProvider.rut_url ? '#ECFDF5' : '#F8FAFC', color: newProvider.rut_url ? '#10B981' : THEME.colors.textSecondary, fontWeight: '700', fontSize: '0.75rem', width: '100%', boxSizing: 'border-box' }}>
                                                {uploading === 'rut_url' ? <Loader2 size={14} className="animate-spin" /> : newProvider.rut_url ? <CheckCircle2 size={14} /> : <Upload size={14} />}
                                                {newProvider.rut_url ? 'RUT Cargado' : 'Subir RUT'}
                                            </label>
                                        </div>
                                        {/* OTHER DOCS UPLOAD */}
                                        <div style={{ position: 'relative', minWidth: 0 }}>
                                            <label style={{ fontSize: '0.7rem', fontWeight: '700', color: THEME.colors.textSecondary, display: 'block', marginBottom: '0.2rem' }}>Cert. Bancaria / Anexos</label>
                                            <input type="file" accept=".pdf" id="docs-upload" hidden onChange={(e) => handleFileUpload(e, 'additional_docs_url')} />
                                            <label htmlFor="docs-upload" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.6rem', borderRadius: '10px', border: '1px dashed #E2E8F0', cursor: 'pointer', backgroundColor: newProvider.additional_docs_url ? '#ECFDF5' : '#F8FAFC', color: newProvider.additional_docs_url ? '#10B981' : THEME.colors.textSecondary, fontWeight: '700', fontSize: '0.75rem', width: '100%', boxSizing: 'border-box' }}>
                                                {uploading === 'additional_docs_url' ? <Loader2 size={14} className="animate-spin" /> : newProvider.additional_docs_url ? <CheckCircle2 size={14} /> : <Upload size={14} />}
                                                {newProvider.additional_docs_url ? 'Doc Cargado' : 'Subir Anexos'}
                                            </label>
                                        </div>
                                    </div>
                                    
                                    <button type="submit" style={{ marginTop: '0.5rem', padding: '0.75rem', borderRadius: THEME.radius.sm, backgroundColor: THEME.colors.primary, color: 'white', fontWeight: '700', fontSize: '0.9rem', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', transition: 'background-color 0.2s', width: '100%', boxSizing: 'border-box' }}
                                    onMouseOver={e => e.currentTarget.style.backgroundColor = THEME.colors.primaryHover}
                                    onMouseOut={e => e.currentTarget.style.backgroundColor = THEME.colors.primary}
                                    >
                                        <Save size={16} strokeWidth={1.5} /> Guardar Proveedor Maestro
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* MODAL COMPACTO: Expediente Detallado */}
                {selectedProvider && (
                    <div 
                        style={{ 
                            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', 
                            backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(6px)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
                            padding: '1rem'
                        }}
                        onClick={() => setSelectedProvider(null)}
                    >
                        <div 
                            style={{ 
                                backgroundColor: 'white', borderRadius: '24px', width: '100%', maxWidth: '780px',
                                maxHeight: '88vh', overflowY: 'auto', position: 'relative',
                                boxShadow: THEME.shadow.lg
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* ── HEADER ── */}
                            <div style={{
                                backgroundColor: 'white',
                                borderRadius: '24px 24px 0 0',
                                padding: '1.25rem 1.5rem 1rem',
                                position: 'relative',
                                borderBottom: '1px solid #F1F5F9'
                            }}>
                                <button 
                                    onClick={() => setSelectedProvider(null)}
                                    style={{ position: 'absolute', top: '1rem', right: '1rem', border: 'none', backgroundColor: '#F8FAFC', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                    <X size={18} />
                                </button>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', paddingRight: '2rem' }}>
                                    {/* Avatar */}
                                    <div style={{
                                        width: '48px', height: '48px', borderRadius: '14px',
                                        backgroundColor: THEME.colors.primaryLight,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '1.3rem', fontWeight: '800', color: THEME.colors.primary, flexShrink: 0,
                                        border: `1px solid ${THEME.colors.primary}20`,
                                    }}>
                                        {selectedProvider.name?.split(' ').slice(0,2).map((n: string) => n[0]).join('') || '?'}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <h2 style={{ fontSize: '1.3rem', fontWeight: '900', color: THEME.colors.textMain, margin: '0 0 0.2rem', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                                            {selectedProvider.name}
                                        </h2>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '0.7rem', fontWeight: '800', color: THEME.colors.textSecondary, backgroundColor: '#F1F5F9', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                                                {selectedProvider.document_type || 'NIT'}
                                            </span>
                                            <span style={{ fontSize: '0.9rem', fontWeight: '800', color: THEME.colors.textMain }}>
                                                {selectedProvider.tax_id}
                                            </span>
                                            {selectedProvider.world_office_id && (
                                                <span style={{ fontSize: '0.7rem', fontWeight: '700', color: THEME.colors.primary, backgroundColor: THEME.colors.primaryLight, padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                                                    ERP: #{selectedProvider.world_office_id}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {/* Tipo badge & Edit */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'flex-end', flexShrink: 0 }}>
                                        <div style={{ backgroundColor: selectedProvider.type === 'credito' ? '#ECFDF5' : THEME.colors.primaryLight, color: selectedProvider.type === 'credito' ? '#059669' : THEME.colors.primary, padding: '0.3rem 0.6rem', borderRadius: '8px', fontSize: '0.7rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                            {selectedProvider.type === 'credito' ? <CreditCard size={12} /> : <Coins size={12} />}
                                            <span>{selectedProvider.type === 'credito' ? 'CRÉDITO' : 'CONTADO'}</span>
                                        </div>
                                        {canEdit && (
                                            <button 
                                                onClick={() => {
                                                    setEditingId(selectedProvider.id);
                                                    setNewProvider({
                                                        name: selectedProvider.name || '',
                                                        tax_id: selectedProvider.tax_id || '',
                                                        document_type: selectedProvider.document_type || 'NIT',
                                                        category: selectedProvider.category || 'GENERAL',
                                                        type: selectedProvider.type || 'contado',
                                                        product: selectedProvider.product || '',
                                                        contact_name: selectedProvider.contact_name || '',
                                                        phone: selectedProvider.phone || selectedProvider.contact_phone || '',
                                                        email: selectedProvider.email || '',
                                                        city: selectedProvider.city || '',
                                                        world_office_id: selectedProvider.world_office_id || '',
                                                        payment_terms_days: selectedProvider.payment_terms_days || 0,
                                                        address: selectedProvider.address || '',
                                                        bank_name: selectedProvider.bank_name || '',
                                                        bank_account_number: selectedProvider.bank_account_number || '',
                                                        bank_account_type: selectedProvider.bank_account_type || 'Ahorros',
                                                        billing_type: selectedProvider.billing_type || 'soporte',
                                                        payment_condition: selectedProvider.payment_condition || '',
                                                        observations: selectedProvider.observations || selectedProvider.notes || '',
                                                        rut_url: selectedProvider.rut_url || '',
                                                        additional_docs_url: selectedProvider.additional_docs_url || '',
                                                        warehouse_location: selectedProvider.warehouse_location !== null && selectedProvider.warehouse_location !== undefined ? selectedProvider.warehouse_location.toString() : '',
                                                        puesto: selectedProvider.puesto || '',
                                                        is_active: selectedProvider.is_active ?? true,
                                                        is_archived: selectedProvider.is_archived ?? false
                                                    });
                                                    setSelectedProvider(null);
                                                    setShowCreateModal(true);
                                                }}
                                                style={{ padding: '0.3rem 0.6rem', borderRadius: '8px', backgroundColor: 'white', color: THEME.colors.primary, border: '1px solid #E2E8F0', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem' }}
                                            >
                                                <Edit2 size={12} /> Editar
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* ── BODY ── */}
                            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                                {/* SECCIÓN 1: CONTACTO */}
                                <section>
                                    <div style={{ fontSize: '0.65rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <User size={12} style={{ color: THEME.colors.primary }} /> Contacto
                                        <div style={{ height: '1px', flex: 1, backgroundColor: '#E2E8F0' }} />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem' }}>
                                        {/* Nombre Contacto */}
                                        <div style={{ backgroundColor: '#F8FAFC', borderRadius: '10px', padding: '0.65rem 0.85rem', border: '1px solid #E2E8F0' }}>
                                            <div style={{ fontSize: '0.6rem', fontWeight: '700', color: THEME.colors.textSecondary, textTransform: 'uppercase', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                <User size={10} /> Persona de Contacto
                                            </div>
                                            <div style={{ fontSize: '0.85rem', fontWeight: '700', color: selectedProvider.contact_name ? THEME.colors.textMain : '#CBD5E1' }}>
                                                {selectedProvider.contact_name || '—'}
                                            </div>
                                        </div>
                                        {/* Teléfono */}
                                        <div style={{ backgroundColor: '#F8FAFC', borderRadius: '10px', padding: '0.65rem 0.85rem', border: '1px solid #E2E8F0' }}>
                                            <div style={{ fontSize: '0.6rem', fontWeight: '700', color: THEME.colors.textSecondary, textTransform: 'uppercase', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                <Smartphone size={10} /> Teléfono
                                            </div>
                                            {(selectedProvider.phone || selectedProvider.contact_phone) ? (
                                                <a href={`tel:${selectedProvider.phone || selectedProvider.contact_phone}`} style={{ fontSize: '0.85rem', fontWeight: '700', color: THEME.colors.primary, textDecoration: 'none' }}>
                                                    {selectedProvider.phone || selectedProvider.contact_phone}
                                                </a>
                                            ) : (
                                                <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#CBD5E1' }}>—</div>
                                            )}
                                        </div>
                                        {/* Email */}
                                        <div style={{ backgroundColor: '#F8FAFC', borderRadius: '10px', padding: '0.65rem 0.85rem', border: '1px solid #E2E8F0' }}>
                                            <div style={{ fontSize: '0.6rem', fontWeight: '700', color: THEME.colors.textSecondary, textTransform: 'uppercase', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                <Mail size={10} /> Correo
                                            </div>
                                            {selectedProvider.email ? (
                                                <a href={`mailto:${selectedProvider.email}`} style={{ fontSize: '0.8rem', fontWeight: '700', color: THEME.colors.primary, textDecoration: 'none', wordBreak: 'break-all' }}>
                                                    {selectedProvider.email}
                                                </a>
                                            ) : (
                                                <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#CBD5E1' }}>—</div>
                                            )}
                                        </div>
                                    </div>
                                </section>

                                {/* SECCIÓN 2: UBICACIONES */}
                                <section>
                                    <div style={{ fontSize: '0.65rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <MapPin size={12} style={{ color: THEME.colors.primary }} /> Ubicaciones
                                        <div style={{ height: '1px', flex: 1, backgroundColor: '#E2E8F0' }} />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                                        {/* Dirección Comercial */}
                                        <div style={{ backgroundColor: '#FFFBEB', borderRadius: '10px', padding: '0.65rem 0.85rem', border: '1px solid #FDE68A' }}>
                                            <div style={{ fontSize: '0.6rem', fontWeight: '800', color: '#92400E', textTransform: 'uppercase', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                <Building size={10} /> Dirección Comercial
                                                <span style={{ fontSize: '0.55rem', fontWeight: '700', color: '#B45309', backgroundColor: '#FEF3C7', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>EMPRESA</span>
                                            </div>
                                            <div style={{ fontSize: '0.85rem', fontWeight: '700', color: selectedProvider.address ? '#1C1917' : '#CBD5E1' }}>
                                                {selectedProvider.address || 'No registrada'}
                                            </div>
                                            {selectedProvider.city && (
                                                <div style={{ fontSize: '0.7rem', color: '#92400E', fontWeight: '600', marginTop: '0.15rem' }}>
                                                    📍 {selectedProvider.city}
                                                </div>
                                            )}
                                        </div>
                                        {/* Punto de Recogida (plaza/mercado) */}
                                        <div style={{ backgroundColor: '#EFF6FF', borderRadius: '10px', padding: '0.65rem 0.85rem', border: '1px solid #BFDBFE' }}>
                                            <div style={{ fontSize: '0.6rem', fontWeight: '800', color: '#1E40AF', textTransform: 'uppercase', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                <MapPin size={10} /> Punto de Recogida
                                                <span style={{ fontSize: '0.55rem', fontWeight: '700', color: '#1D4ED8', backgroundColor: '#DBEAFE', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>PLAZA / MERCADO</span>
                                            </div>
                                            {(selectedProvider.warehouse_location !== null && selectedProvider.warehouse_location !== undefined) || selectedProvider.puesto ? (
                                                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.15rem' }}>
                                                    {selectedProvider.warehouse_location !== null && selectedProvider.warehouse_location !== undefined && (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                            <Package size={12} style={{ color: '#3B82F6' }} />
                                                            <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#1E40AF' }}>Bodega:</span>
                                                            <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#0F172A' }}>#{selectedProvider.warehouse_location}</span>
                                                        </div>
                                                    )}
                                                    {selectedProvider.puesto && (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                            <Store size={12} style={{ color: '#3B82F6' }} />
                                                            <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#1E40AF' }}>Puesto:</span>
                                                            <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#0F172A' }}>{selectedProvider.puesto}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#CBD5E1' }}>No registrado</div>
                                            )}
                                        </div>
                                    </div>
                                </section>

                                {/* SECCIÓN 3: COMERCIALL & BANCARIO */}
                                <section>
                                    <div style={{ fontSize: '0.65rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <Wallet size={12} style={{ color: THEME.colors.primary }} /> Comercial &amp; Bancario
                                        <div style={{ height: '1px', flex: 1, backgroundColor: '#E2E8F0' }} />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem' }}>
                                        {/* Banco */}
                                        <div style={{ backgroundColor: '#F8FAFC', borderRadius: '10px', padding: '0.65rem 0.85rem', border: '1px solid #E2E8F0' }}>
                                            <div style={{ fontSize: '0.6rem', fontWeight: '700', color: THEME.colors.textSecondary, textTransform: 'uppercase', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                <Wallet size={10} /> Banco
                                            </div>
                                            <div style={{ fontSize: '0.85rem', fontWeight: '700', color: selectedProvider.bank_name ? THEME.colors.textMain : '#CBD5E1' }}>
                                                {selectedProvider.bank_name || '—'}
                                            </div>
                                            {selectedProvider.bank_account_number && (
                                                <div style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary, fontWeight: '600', marginTop: '0.15rem' }}>
                                                    #{selectedProvider.bank_account_number} · {selectedProvider.bank_account_type || 'Ahorros'}
                                                </div>
                                            )}
                                        </div>
                                        {/* Facturación */}
                                        <div style={{ backgroundColor: '#F8FAFC', borderRadius: '10px', padding: '0.65rem 0.85rem', border: '1px solid #E2E8F0' }}>
                                            <div style={{ fontSize: '0.6rem', fontWeight: '700', color: THEME.colors.textSecondary, textTransform: 'uppercase', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                <FileCheck size={10} /> Facturación
                                            </div>
                                            <div style={{ fontSize: '0.85rem', fontWeight: '700', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                {selectedProvider.billing_type === 'electronica' ? (
                                                    <><Zap size={12} style={{ color: '#0D7A57' }} /> Fact. Electrónica</>
                                                ) : selectedProvider.billing_type === 'soporte' ? (
                                                    <><FileText size={12} style={{ color: '#0284C7' }} /> Doc. Soporte</>
                                                ) : '—'}
                                            </div>
                                        </div>
                                        {/* Condiciones de Pago */}
                                        <div style={{ backgroundColor: '#F8FAFC', borderRadius: '10px', padding: '0.65rem 0.85rem', border: '1px solid #E2E8F0' }}>
                                            <div style={{ fontSize: '0.6rem', fontWeight: '700', color: THEME.colors.textSecondary, textTransform: 'uppercase', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                <Clock size={10} /> Cond. de Pago
                                            </div>
                                            <div style={{ fontSize: '0.85rem', fontWeight: '700', color: selectedProvider.payment_condition ? THEME.colors.textMain : '#CBD5E1' }}>
                                                {selectedProvider.payment_condition || '—'}
                                            </div>
                                            {selectedProvider.payment_terms_days !== undefined && selectedProvider.payment_terms_days !== null && (
                                                <div style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary, fontWeight: '600', marginTop: '0.15rem' }}>
                                                    {selectedProvider.payment_terms_days} días plazo
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </section>

                                {/* SECCIÓN 4: CLASIFICACIÓN OPERATIVA */}
                                <section>
                                    <div style={{ fontSize: '0.65rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <Tag size={12} style={{ color: THEME.colors.primary }} /> Clasificación Operativa
                                        <div style={{ height: '1px', flex: 1, backgroundColor: '#E2E8F0' }} />
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                        <span style={{ backgroundColor: THEME.colors.primary, padding: '0.35rem 0.8rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: '700', color: 'white', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <Tag size={12} strokeWidth={1.5} /> {selectedProvider.category?.toUpperCase() || 'GENERAL'}
                                        </span>
                                        {selectedProvider.product && selectedProvider.product.split(/[,\/]/).filter((s: string) => s.trim()).map((prod: string, idx: number) => (
                                            <span key={idx} style={{ backgroundColor: '#F1F5F9', padding: '0.35rem 0.8rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textMain, border: '1px solid #E2E8F0' }}>
                                                {prod.trim()}
                                            </span>
                                        ))}
                                    </div>
                                </section>

                                {/* SECCIÓN 5: DOCUMENTOS Y NOTAS */}
                                <section>
                                    <div style={{ fontSize: '0.65rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <FileText size={12} style={{ color: THEME.colors.primary }} /> Documentos &amp; Notas
                                        <div style={{ height: '1px', flex: 1, backgroundColor: '#E2E8F0' }} />
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.8rem' }}>
                                        <button 
                                            onClick={() => selectedProvider.rut_url && window.open(selectedProvider.rut_url, '_blank')} 
                                            style={{ flex: 1, backgroundColor: selectedProvider.rut_url ? '#EFF6FF' : '#F8FAFC', border: `1px solid ${selectedProvider.rut_url ? '#BFDBFE' : '#E2E8F0'}`, padding: '0.65rem', borderRadius: '10px', fontSize: '0.75rem', fontWeight: '800', color: selectedProvider.rut_url ? '#1D4ED8' : THEME.colors.textSecondary, cursor: selectedProvider.rut_url ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                                        >
                                            <FileText size={14} /> RUT
                                            {selectedProvider.rut_url ? ' (Ver PDF)' : ' (Sin archivo)'}
                                        </button>
                                        <button 
                                            onClick={() => selectedProvider.additional_docs_url && window.open(selectedProvider.additional_docs_url, '_blank')} 
                                            style={{ flex: 1, backgroundColor: selectedProvider.additional_docs_url ? '#F0FDF4' : '#F8FAFC', border: `1px solid ${selectedProvider.additional_docs_url ? '#BBF7D0' : '#E2E8F0'}`, padding: '0.65rem', borderRadius: '10px', fontSize: '0.75rem', fontWeight: '800', color: selectedProvider.additional_docs_url ? '#166534' : THEME.colors.textSecondary, cursor: selectedProvider.additional_docs_url ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                                        >
                                            <ExternalLink size={14} /> Anexos / Cert. Bancaria
                                            {selectedProvider.additional_docs_url ? ' (Ver PDF)' : ' (Sin archivo)'}
                                        </button>
                                    </div>
                                    {(selectedProvider.observations || selectedProvider.notes) ? (
                                        <div style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '10px', padding: '0.75rem 0.9rem' }}>
                                            <div style={{ fontSize: '0.6rem', fontWeight: '800', color: '#92400E', textTransform: 'uppercase', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                <StickyNote size={12} /> Notas del Expediente
                                            </div>
                                            <p style={{ fontSize: '0.85rem', color: '#1C1917', margin: 0, lineHeight: 1.5, fontWeight: '500' }}>
                                                {selectedProvider.observations || selectedProvider.notes}
                                            </p>
                                        </div>
                                    ) : (
                                        <div style={{ backgroundColor: '#F8FAFC', border: '1px dashed #E2E8F0', borderRadius: '10px', padding: '0.75rem 0.9rem', textAlign: 'center', color: THEME.colors.textSecondary, fontSize: '0.8rem', fontStyle: 'italic' }}>
                                            Sin anotaciones registradas en el expediente.
                                        </div>
                                    )}
                                </section>

                            </div>
                        </div>
                    </div>
                )}

            </div>
            <style jsx global>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .animate-spin {
                    animation: spin 1s linear infinite;
                }
            `}</style>
        </main>
    );
}

function KPICard({ title, value, icon, color, subtitle }: { title: string, value: number | string, icon: React.ReactNode, color: string, subtitle: string }) {
    return (
        <div 
            style={{
                backgroundColor: 'white',
                padding: '0.9rem 1rem',
                borderRadius: THEME.radius.md,
                boxShadow: THEME.shadow.sm,
                display: 'flex',
                alignItems: 'center',
                gap: '0.85rem',
                border: `1px solid ${THEME.colors.border}`,
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                cursor: 'pointer'
            }} 
            onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)';
            }} 
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = THEME.shadow.sm;
            }}
        >
            <div style={{ 
                backgroundColor: color === THEME.colors.primary ? THEME.colors.primaryLight : `${color}15`, 
                width: '38px', 
                height: '38px', 
                borderRadius: '50%', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                color: color === THEME.colors.primary ? THEME.colors.primary : color, 
                flexShrink: 0 
            }}>
                {icon}
            </div>
            <div>
                <div style={{ fontSize: '0.65rem', color: THEME.colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>
                <div style={{ fontSize: '1.3rem', fontWeight: '700', color: THEME.colors.textMain, margin: '2px 0', lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: '0.65rem', color: THEME.colors.textSecondary, fontWeight: '500' }}>{subtitle}</div>
            </div>
        </div>
    );
}
