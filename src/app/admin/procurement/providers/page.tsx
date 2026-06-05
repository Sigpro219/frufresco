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
    Coins
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { THEME, formatNumber, formatMoney } from '@/lib/adminTheme';

const STATUS_COLORS = {
    credit: '#10B981',      // Verde éxito / crédito
    creditBg: '#ECFDF5',
    cash: '#F59E0B',        // Ámbar contado
    cashBg: '#FEF3C7',
    alert: '#EF4444',       // Rojo alerta
    alertBg: '#FEF2F2',
    info: '#2563EB',        // Azul info
    infoBg: '#EFF6FF',
    indigo: '#6366F1',      // Para KPIs o similares
    indigoBg: '#EEF2FF',
    neutral: '#64748B',     // Slate
    neutralBg: '#F1F5F9',
};

export default function ProvidersPage() {
    const [mounted, setMounted] = useState(false);
    const [providers, setProviders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
    const [showArchived, setShowArchived] = useState(false);
    const [selectedProvider, setSelectedProvider] = useState<any | null>(null);
    const [showHelp, setShowHelp] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [uploading, setUploading] = useState<string | null>(null); // To track which field is uploading
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
            const [totalRes, creditRes, activeRes] = await Promise.all([
                supabase.from('providers').select('*', { count: 'exact', head: true }).eq('is_archived', false),
                supabase.from('providers').select('*', { count: 'exact', head: true }).eq('type', 'credito').eq('is_archived', false),
                supabase.from('providers').select('*', { count: 'exact', head: true }).eq('is_active', true).eq('is_archived', false)
            ]);

            setStats({
                total: totalRes.count || 0,
                credit: creditRes.count || 0,
                cash: (totalRes.count || 0) - (creditRes.count || 0),
                active: activeRes.count || 0
            });

            let allProviders: any[] = [];
            let from = 0;
            const limit = 1000;
            let hasMore = true;

            while (hasMore) {
                const { data, error } = await supabase
                    .from('providers')
                    .select('*')
                    .order('name', { ascending: true })
                    .range(from, from + limit - 1);
                
                if (error) throw error;
                if (data && data.length > 0) {
                    allProviders = [...allProviders, ...data];
                    from += limit;
                    if (data.length < limit) hasMore = false;
                } else {
                    hasMore = false;
                }
            }
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
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setUploading(field);
            const fileExt = file.name.split('.').pop();
            // Sanitize file name: remove spaces and special characters
            const cleanName = (newProvider.tax_id || 'new').replace(/[^a-zA-Z0-9]/g, '');
            const fileName = `${cleanName}_${field}_${Date.now()}.${fileExt}`;
            const filePath = `${fileName}`; // Root of the bucket

            console.log('Uploading to path:', filePath);

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

            console.log('Public URL generated:', publicUrl);
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
        try {
            const providerData = {
                ...newProvider,
                category: (newProvider.product && newProvider.product.trim() !== '') ? 'PRODUCTOS' : 'GENERAL',
                warehouse_location: newProvider.warehouse_location ? parseInt(newProvider.warehouse_location, 10) : null,
                puesto: newProvider.puesto || null,
                contact_phone: newProvider.phone || null,
                location: [
                    newProvider.warehouse_location ? `Bodega: ${newProvider.warehouse_location}` : '',
                    newProvider.puesto ? `Puesto: ${newProvider.puesto}` : ''
                ].filter(Boolean).join(', ') || null
            };
            
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
            
            setShowCreateModal(false);
            setEditingId(null);
            setNewProvider({
                name: '', tax_id: '', document_type: 'NIT', category: 'GENERAL',
                type: 'contado', product: '', contact_name: '', phone: '',
                email: '', payment_terms_days: 0,
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
        const action = currentStatus ? 'restaurar' : 'archivar';
        if (!confirm(`¿Seguro que deseas ${action} este proveedor?`)) return;
        try {
            const { error } = await supabase
                .from('providers')
                .update({ is_archived: !currentStatus, is_active: currentStatus ? true : false })
                .eq('id', id);
            if (error) throw error;
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
        const query = searchTerm.toLowerCase().trim();
        return providers.filter(p => {
            if (showArchived && !p.is_archived) return false;
            if (!showArchived && p.is_archived) return false;
            
            // Category Filter logic based on product lines field being empty or not
            const hasProduct = p.product && p.product.trim() !== '';
            if (activeCategoryFilter === 'products' && !hasProduct) return false;
            if (activeCategoryFilter === 'general' && hasProduct) return false;

            if (!query) return true;
            if (query.startsWith('@')) {
                const cmd = query.slice(1);
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
                p.contact_name?.toLowerCase().includes(query)
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

    return (
        <main style={{ minHeight: '100vh', backgroundColor: THEME.colors.background, fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif' }}>
            
            <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '0.4rem 2rem' }}>
                
                {/* Header */}
                <header style={{ marginBottom: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <h1 style={{ fontSize: '1.6rem', fontWeight: '900', color: THEME.colors.textMain, margin: 0, letterSpacing: '-0.03em' }}>
                            {showArchived ? 'Archivo de' : 'Directorio de'} <span style={{ color: THEME.colors.primary }}>Proveedores</span>
                        </h1>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.8 }}>
                             <span style={{ backgroundColor: THEME.colors.textMain, color: '#D4AF37', padding: '2px 6px', borderRadius: '4px', fontSize: '0.55rem', fontWeight: '900', letterSpacing: '0.05em' }}>COMPRAS 360</span>
                             <span style={{ color: THEME.colors.textSecondary, fontSize: '0.65rem', fontWeight: '700' }}>/ MAESTRO DE PROVEEDORES</span>
                        </div>
                    </div>
                </header>

                {/* DASHBOARD INDICATORS (SLIM & PREMIUM) */}
                <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(5, 1fr)', 
                    gap: '1.2rem', 
                    marginBottom: '1rem'
                }}>
                    <KPICard title="Total Proveedores" value={formatNumber(stats.total)} icon={<Building2 size={18} strokeWidth={1.5} />} subtitle="Proveedores registrados" />
                    <KPICard title="Proveedores Crédito" value={formatNumber(stats.credit)} icon={<Wallet size={18} strokeWidth={1.5} />} subtitle="Facturación a plazo" />
                    <KPICard title="Proveedores Contado" value={formatNumber(stats.cash)} icon={<Coins size={18} strokeWidth={1.5} />} subtitle="Pago inmediato" />
                    <KPICard title="Habilitados" value={formatNumber(stats.active)} icon={<CheckCircle2 size={18} strokeWidth={1.5} />} subtitle="Activos para compra" />
                    <KPICard title="Alertas" value={formatNumber(incompleteCount)} icon={<AlertCircle size={18} strokeWidth={1.5} />} subtitle="Sin RUT o Teléfono" />
                </div>

                {/* UNIFIED SLENDER CONTROL BAR */}
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
                    border: '1px solid #E5E7EB'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                        {/* Search Segment */}
                        <div style={{ position: 'relative', flex: 1 }}>
                            <span style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.9rem', color: '#A0AEC0' }}>🔍</span>
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
                                >✕</button>
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
                                backgroundColor: '#EFF6FF', 
                                color: '#2563EB', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                cursor: 'help',
                                border: '1px solid #DBEAFE',
                                fontSize: '1rem',
                                fontWeight: '900',
                                flexShrink: 0
                            }}
                        >
                            ?
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
                                        🚀 COMANDOS RÁPIDOS (@)
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
                                    <style>{`
                                        @keyframes fadeInUp {
                                            from { opacity: 0; transform: translateY(10px); }
                                            to { opacity: 1; transform: translateY(0); }
                                        }
                                    `}</style>
                                </div>
                            )}
                        </div>

                        {/* Contador de Proveedores Filtrados */}
                        <div style={{
                            padding: '0 0.8rem',
                            borderRadius: '10px',
                            backgroundColor: searchTerm ? 'rgba(16, 185, 129, 0.1)' : '#F8FAFC',
                            color: searchTerm ? '#065F46' : '#64748B',
                            border: searchTerm ? '1.5px solid #10B981' : '1px solid #E2E8F0',
                            fontSize: '0.75rem',
                            fontWeight: '700',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            whiteSpace: 'nowrap',
                            height: '40px',
                            flexShrink: 0,
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            boxShadow: searchTerm ? '0 2px 8px rgba(16, 185, 129, 0.08)' : 'none',
                        }}>
                            <span style={{ fontSize: '0.9rem', display: 'flex', alignItems: 'center' }}>
                                {searchTerm ? '🎯' : '🏬'}
                            </span>
                            <span>
                                {searchTerm ? (
                                    <>
                                        <strong style={{ color: '#10B981', fontSize: '0.8rem' }}>{formatNumber(filteredProviders.length)}</strong>
                                        <span style={{ fontWeight: '600', color: '#475569', marginLeft: '3px' }}>de {formatNumber(baseProvidersCount)}</span>
                                    </>
                                ) : (
                                    <>
                                        <strong style={{ color: '#1F2937' }}>{formatNumber(baseProvidersCount)}</strong>
                                        <span style={{ fontWeight: '600', color: '#64748B', marginLeft: '3px' }}>proveedores</span>
                                    </>
                                )}
                            </span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {/* View Switcher */}
                        <div style={{ display: 'flex', gap: '4px', backgroundColor: '#F3F4F6', padding: '2px', borderRadius: '8px' }}>
                            <button onClick={() => setViewMode('list')} style={{ padding: '0.4rem 0.6rem', border: 'none', borderRadius: '6px', background: viewMode === 'list' ? 'white' : 'transparent', fontSize: '0.7rem', fontWeight: '800', cursor: 'pointer', color: viewMode === 'list' ? '#111827' : '#9CA3AF', display: 'flex', alignItems: 'center' }}><List size={14} strokeWidth={1.5} /></button>
                            <button onClick={() => setViewMode('grid')} style={{ padding: '0.4rem 0.6rem', border: 'none', borderRadius: '6px', background: viewMode === 'grid' ? 'white' : 'transparent', fontSize: '0.7rem', fontWeight: '800', cursor: 'pointer', color: viewMode === 'grid' ? '#111827' : '#9CA3AF', display: 'flex', alignItems: 'center' }}><LayoutGrid size={14} strokeWidth={1.5} /></button>
                        </div>

                        {/* Nuevo Proveedor Button */}
                        <button 
                            onClick={() => {
                                setEditingId(null);
                                setNewProvider({
                                    name: '', tax_id: '', document_type: 'NIT', category: 'GENERAL',
                                    type: 'contado', product: '', contact_name: '', phone: '',
                                    email: '', payment_terms_days: 0,
                                    address: '', bank_name: '', bank_account_number: '',
                                    bank_account_type: 'Ahorros', billing_type: 'soporte',
                                    payment_condition: '', observations: '', rut_url: '',
                                    additional_docs_url: '', warehouse_location: '', puesto: '',
                                    is_active: true, is_archived: false
                                });
                                setShowCreateModal(true);
                            }}
                            style={{ 
                                backgroundColor: THEME.colors.primary, 
                                color: 'white', 
                                padding: '0.5rem 1rem', 
                                borderRadius: THEME.radius.sm, 
                                border: 'none',
                                fontWeight: '600', 
                                fontSize: '0.8rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                cursor: 'pointer',
                                transition: 'background-color 0.2s'
                            }}
                            onMouseOver={e => e.currentTarget.style.backgroundColor = THEME.colors.primaryHover}
                            onMouseOut={e => e.currentTarget.style.backgroundColor = THEME.colors.primary}
                        >
                            <Plus size={14} strokeWidth={1.5} /> Nuevo Proveedor
                        </button>
                    </div>
                </div>

                {/* Category Filter Pills */}
                <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    background: THEME.colors.background,
                    border: `1px solid ${THEME.colors.border}`,
                    borderRadius: THEME.radius.lg,
                    padding: '4px',
                    gap: '2px',
                    marginBottom: '1.2rem'
                }}>
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
                                    padding: '0.5rem 1.2rem',
                                    borderRadius: THEME.radius.md,
                                    border: 'none',
                                    backgroundColor: isActive ? THEME.colors.primary : 'transparent',
                                    color: isActive ? 'white' : THEME.colors.textSecondary,
                                    fontWeight: isActive ? '600' : '500',
                                    fontSize: '0.8rem',
                                    cursor: 'pointer',
                                    boxShadow: isActive ? '0 1px 4px rgba(13, 122, 87, 0.25)' : 'none',
                                    transition: 'all 0.2s ease-in-out'
                                }}
                                onMouseEnter={(e) => {
                                    if (!isActive) e.currentTarget.style.backgroundColor = THEME.colors.primaryLight;
                                }}
                                onMouseLeave={(e) => {
                                    if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
                                }}
                            >
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {/* Content Area */}
                {loading && providers.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '10rem 0' }}>Consultando base de datos...</div>
                ) : viewMode === 'list' ? (
                    /* Compact List View */
                    <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.lg, overflow: 'hidden', boxShadow: THEME.shadow.sm, border: `1px solid ${THEME.colors.border}` }}>
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
                                        style={{ borderBottom: `1px solid ${THEME.colors.border}`, cursor: 'pointer', transition: 'all 0.1s' }}
                                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAF9')}
                                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                                    >
                                                                        <td style={{ padding: '0.65rem 1.25rem' }}>
                                            <div style={{ fontWeight: '600', color: THEME.colors.textMain, fontSize: '0.85rem' }}>{p.name}</div>
                                            <div style={{ fontSize: '0.75rem', color: THEME.colors.primary, fontWeight: '600', marginTop: '0.2rem' }}>{p.product || 'Sin producto'}</div>
                                        </td>
                                        <td style={{ padding: '0.65rem 1.25rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span style={{ fontSize: '0.65rem', fontWeight: '600', color: THEME.colors.textSecondary, backgroundColor: THEME.colors.background, padding: '0.2rem 0.4rem', borderRadius: THEME.radius.sm }}>{p.document_type || 'NIT'}</span>
                                                <span style={{ fontWeight: '600', color: THEME.colors.textMain, fontSize: '0.85rem' }}>{p.tax_id}</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.65rem 1.25rem' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
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
                                                backgroundColor: (p.category || '').toUpperCase() === 'PRODUCTOS' ? THEME.colors.primaryLight : THEME.colors.background, 
                                                padding: '0.25rem 0.5rem', 
                                                borderRadius: THEME.radius.sm, 
                                                border: '1px solid ' + ((p.category || '').toUpperCase() === 'PRODUCTOS' ? THEME.colors.primaryLight : THEME.colors.border), 
                                                display: 'inline-block' 
                                            }}>
                                                {p.category || 'GENERAL'}
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.65rem 1.25rem' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: '600', color: p.type === 'credito' ? STATUS_COLORS.credit : THEME.colors.primary }}>{p.type?.toUpperCase()}</span>
                                        </td>
                                        <td style={{ padding: '0.65rem 1.25rem', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                                            <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                                                <button 
                                                    onClick={(e) => toggleArchiveStatus(e, p.id, p.is_archived)} 
                                                    style={{ 
                                                        backgroundColor: 'transparent', 
                                                        border: `1px solid ${THEME.colors.borderActive}`, 
                                                        borderRadius: THEME.radius.md, 
                                                        padding: '0.4rem', 
                                                        color: p.is_archived ? STATUS_COLORS.credit : STATUS_COLORS.alert, 
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        transition: 'all 0.2s'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.borderColor = THEME.colors.textMain;
                                                        e.currentTarget.style.color = p.is_archived ? THEME.colors.primaryHover : STATUS_COLORS.alert;
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.borderColor = THEME.colors.borderActive;
                                                        e.currentTarget.style.color = p.is_archived ? STATUS_COLORS.credit : STATUS_COLORS.alert;
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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.2rem', marginBottom: '2rem' }}>
                        {filteredProviders.map((p) => {
                            // Determine category colors
                            let badgeColor = THEME.colors.textSecondary; // General
                            let badgeBg = THEME.colors.background;
                            const cat = (p.category || '').toUpperCase();
                            if (cat === 'PRODUCTOS') {
                                badgeColor = THEME.colors.primary;
                                badgeBg = THEME.colors.primaryLight;
                            }

                            // Initial letters
                            const initials = p.name ? p.name.split(' ').slice(0, 2).map((n: string) => n[0]).join('') : 'P';

                            return (
                                <div 
                                    key={p.id}
                                    onClick={() => setSelectedProvider(p)}
                                    style={{ 
                                        backgroundColor: THEME.colors.surface, 
                                        borderRadius: THEME.radius.lg, 
                                        border: `1px solid ${THEME.colors.border}`, 
                                        padding: '1.2rem', 
                                        cursor: 'pointer', 
                                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)', 
                                        display: 'flex', 
                                        flexDirection: 'column', 
                                        gap: '1rem',
                                        position: 'relative',
                                        boxShadow: THEME.shadow.sm
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.transform = 'translateY(-1px)';
                                        e.currentTarget.style.boxShadow = THEME.shadow.lg;
                                        e.currentTarget.style.borderColor = THEME.colors.borderActive;
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.transform = 'translateY(0px)';
                                        e.currentTarget.style.boxShadow = THEME.shadow.sm;
                                        e.currentTarget.style.borderColor = THEME.colors.border;
                                    }}
                                >
                                    {/* Card Top: Initials Avatar + Quick Badges */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ 
                                            width: '40px', 
                                            height: '40px', 
                                            borderRadius: THEME.radius.md, 
                                            background: THEME.colors.primary, 
                                            color: 'white', 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'center', 
                                            fontWeight: '700', 
                                            fontSize: '1.1rem' 
                                        }}>
                                            {initials}
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                                            <span style={{ 
                                                fontSize: '0.65rem', 
                                                fontWeight: '600', 
                                                color: p.type === 'credito' ? STATUS_COLORS.credit : THEME.colors.primary, 
                                                backgroundColor: p.type === 'credito' ? STATUS_COLORS.creditBg : THEME.colors.primaryLight, 
                                                padding: '0.2rem 0.5rem', 
                                                borderRadius: THEME.radius.sm 
                                            }}>
                                                {p.type?.toUpperCase()}
                                            </span>
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleArchiveStatus(e, p.id, p.is_archived);
                                                }} 
                                                style={{ 
                                                    backgroundColor: 'transparent', 
                                                    border: `1px solid ${THEME.colors.borderActive}`, 
                                                    borderRadius: THEME.radius.sm, 
                                                    padding: '0.25rem', 
                                                    color: p.is_archived ? STATUS_COLORS.credit : STATUS_COLORS.alert,
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.borderColor = THEME.colors.textMain;
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.borderColor = THEME.colors.borderActive;
                                                }}
                                            >
                                                {p.is_archived ? <RotateCcw size={12} strokeWidth={1.5} /> : <Archive size={12} strokeWidth={1.5} />}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Provider Info */}
                                    <div>
                                        <h3 style={{ fontSize: '1rem', fontWeight: '600', color: THEME.colors.textMain, margin: 0, lineHeight: 1.3, fontFamily: THEME.typography.fontFamilyMain }}>{p.name}</h3>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.3rem' }}>
                                            <span style={{ fontSize: '0.6rem', fontWeight: '700', color: THEME.colors.textSecondary, backgroundColor: THEME.colors.background, padding: '0.15rem 0.35rem', borderRadius: THEME.radius.sm }}>{p.document_type || 'NIT'}</span>
                                            <span style={{ fontWeight: '600', color: THEME.colors.textSecondary, fontSize: '0.75rem' }}>{p.tax_id}</span>
                                        </div>
                                    </div>

                                    {/* Category and Products Tag */}
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                            <span style={{ 
                                                fontSize: '0.65rem', 
                                                fontWeight: '600', 
                                                color: badgeColor, 
                                                backgroundColor: badgeBg, 
                                                padding: '0.15rem 0.4rem', 
                                                borderRadius: THEME.radius.sm, 
                                                border: `1px solid ${THEME.colors.border}` 
                                            }}>
                                                {p.category || 'GENERAL'}
                                            </span>
                                        </div>
                                        <p style={{ fontSize: '0.7rem', color: THEME.colors.primary, fontWeight: '600', margin: 0 }}>
                                            {p.product || 'Sin producto asignado'}
                                        </p>
                                    </div>

                                    {/* Warehouse & Stand/Booth Badges */}
                                    {(p.warehouse_location !== null || p.puesto) && (
                                        <div style={{ 
                                            display: 'flex', 
                                            gap: '0.4rem', 
                                            padding: '0.4rem 0.6rem', 
                                            backgroundColor: THEME.colors.background, 
                                            borderRadius: THEME.radius.md, 
                                            border: `1px dashed ${THEME.colors.borderActive}`,
                                            flexWrap: 'wrap'
                                        }}>
                                            {p.warehouse_location !== null && p.warehouse_location !== undefined && (
                                                <div style={{ fontSize: '0.7rem', fontWeight: '600', color: THEME.colors.textSecondary, display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                                    <Package size={12} strokeWidth={1.5} /> <span style={{ color: THEME.colors.textSecondary }}>Bod:</span> <strong style={{ color: THEME.colors.textMain }}>#{p.warehouse_location}</strong>
                                                </div>
                                            )}
                                            {p.puesto && (
                                                <div style={{ fontSize: '0.7rem', fontWeight: '600', color: THEME.colors.textSecondary, display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                                    <Building size={12} strokeWidth={1.5} /> <span style={{ color: THEME.colors.textSecondary }}>Puesto:</span> <strong style={{ color: THEME.colors.textMain }}>{p.puesto}</strong>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div style={{ borderTop: `1px solid ${THEME.colors.border}`, paddingTop: '0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem' }}>
                                        <div style={{ color: THEME.colors.textSecondary, fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                            <User size={12} strokeWidth={1.5} /> {p.contact_name || 'Sin contacto'}
                                        </div>
                                        {p.phone && (
                                            <a 
                                                href={`tel:${p.phone}`} 
                                                onClick={(e) => e.stopPropagation()} 
                                                style={{ color: THEME.colors.primary, fontWeight: '600', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                                            >
                                                <Phone size={12} strokeWidth={1.5} /> {p.phone}
                                            </a>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* MODAL: Nuevo Proveedor */}
                {showCreateModal && (
                    <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '1.5rem' }} onClick={() => setShowCreateModal(false)}>
                        <div style={{ backgroundColor: 'white', borderRadius: THEME.radius.lg, width: '100%', maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto', padding: '2rem', position: 'relative', boxShadow: THEME.shadow.lg }} onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => setShowCreateModal(false)} style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', border: 'none', backgroundColor: THEME.colors.background, padding: '0.6rem', borderRadius: THEME.radius.md, cursor: 'pointer', color: THEME.colors.textSecondary, display: 'flex', alignItems: 'center' }}><X size={18} /></button>
                            
                            <h2 style={{ fontSize: '1.4rem', fontWeight: '700', color: THEME.colors.textMain, marginBottom: '1.5rem', letterSpacing: '-0.02em', fontFamily: THEME.typography.fontFamilyMain }}>
                                {editingId ? 'Editar' : 'Crear Nuevo'} <span style={{ color: THEME.colors.primary }}>Proveedor</span>
                            </h2>
                            
                            <form onSubmit={handleSaveProvider} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                {/* Basic Info */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                                    <div style={{ borderBottom: `1px solid ${THEME.colors.border}`, paddingBottom: '0.4rem', marginBottom: '0.4rem', fontWeight: '600', color: THEME.colors.primary, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Identidad de Empresa</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                        <label style={{ fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilySecondary }}>Nombre / Razón Social *</label>
                                        <input required style={{ padding: '0.65rem 1rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, outline: 'none', fontWeight: '600', fontSize: '0.85rem' }} value={newProvider.name} onChange={(e) => setNewProvider({...newProvider, name: e.target.value.toUpperCase()})} />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.8rem' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilySecondary }}>Tipo Doc.</label>
                                            <select style={{ padding: '0.65rem 1rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, outline: 'none', fontWeight: '600', fontSize: '0.85rem', height: '38px' }} value={newProvider.document_type} onChange={(e) => setNewProvider({...newProvider, document_type: e.target.value})}>
                                                <option value="NIT">NIT</option>
                                                <option value="CC">Cédula</option>
                                            </select>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilySecondary }}>Identificación (NIT/CC) *</label>
                                            <input required style={{ padding: '0.65rem 1rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, outline: 'none', fontWeight: '600', fontSize: '0.85rem' }} value={newProvider.tax_id} onChange={(e) => setNewProvider({...newProvider, tax_id: e.target.value})} />
                                        </div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilySecondary }}>Categoría</label>
                                            <select style={{ padding: '0.65rem 1rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, outline: 'none', fontWeight: '600', fontSize: '0.85rem', height: '38px' }} value={newProvider.category} onChange={(e) => setNewProvider({...newProvider, category: e.target.value})}>
                                                <option value="GENERAL">GENERAL</option>
                                                <option value="PRODUCTOS">PRODUCTOS</option>
                                            </select>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilySecondary }}>Tipo Pago</label>
                                            <select style={{ padding: '0.65rem 1rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, outline: 'none', fontWeight: '600', fontSize: '0.85rem', height: '38px' }} value={newProvider.type} onChange={(e) => setNewProvider({...newProvider, type: e.target.value})}>
                                                <option value="contado">Contado (Inmediato)</option>
                                                <option value="credito">Crédito (Facturación)</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilySecondary }}>Ubicación de Bodega (N°)</label>
                                            <input type="number" placeholder="Ej: 12" style={{ padding: '0.65rem 1rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, outline: 'none', fontWeight: '600', fontSize: '0.85rem' }} value={newProvider.warehouse_location} onChange={(e) => setNewProvider({...newProvider, warehouse_location: e.target.value})} />
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilySecondary }}>Puesto (Alfanumérico)</label>
                                            <input placeholder="Ej: P-34" style={{ padding: '0.65rem 1rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, outline: 'none', fontWeight: '600', fontSize: '0.85rem' }} value={newProvider.puesto} onChange={(e) => setNewProvider({...newProvider, puesto: e.target.value.toUpperCase()})} />
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                        <label style={{ fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilySecondary }}>Productos / Líneas (Separados por coma)</label>
                                        <input style={{ padding: '0.65rem 1rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, outline: 'none', fontWeight: '600', fontSize: '0.85rem' }} value={newProvider.product} onChange={(e) => {
                                            const val = e.target.value;
                                            setNewProvider({
                                                ...newProvider,
                                                product: val.toUpperCase(),
                                                category: val.trim() !== '' ? 'PRODUCTOS' : 'GENERAL'
                                            });
                                        }} />
                                    </div>
                                    <div style={{ borderBottom: `1px solid ${THEME.colors.border}`, paddingBottom: '0.4rem', marginTop: '0.8rem', fontWeight: '600', color: THEME.colors.primary, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Contacto Directo</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                        <label style={{ fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilySecondary }}>Nombre de Contacto</label>
                                        <input style={{ padding: '0.65rem 1rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, outline: 'none', fontWeight: '600', fontSize: '0.85rem' }} value={newProvider.contact_name} onChange={(e) => setNewProvider({...newProvider, contact_name: e.target.value.toUpperCase()})} />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '0.8rem' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilySecondary }}>Teléfono</label>
                                            <input style={{ padding: '0.65rem 1rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, outline: 'none', fontWeight: '600', fontSize: '0.85rem' }} value={newProvider.phone} onChange={(e) => setNewProvider({...newProvider, phone: e.target.value})} />
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilySecondary }}>Correo Electrónico</label>
                                            <input type="email" placeholder="ejemplo@correo.com" style={{ padding: '0.65rem 1rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, outline: 'none', fontWeight: '600', fontSize: '0.85rem' }} value={newProvider.email} onChange={(e) => setNewProvider({...newProvider, email: e.target.value})} />
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                        <label style={{ fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilySecondary }}>Dirección / Oficina</label>
                                        <input style={{ padding: '0.65rem 1rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, outline: 'none', fontWeight: '600', fontSize: '0.85rem' }} value={newProvider.address} onChange={(e) => setNewProvider({...newProvider, address: e.target.value.toUpperCase()})} />
                                    </div>
                                </div>

                                {/* Financial Info */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                                    <div style={{ borderBottom: `1px solid ${THEME.colors.border}`, paddingBottom: '0.4rem', marginBottom: '0.4rem', fontWeight: '600', color: THEME.colors.primary, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Información Financiera</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '0.8rem' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilySecondary }}>Banco</label>
                                            <input style={{ padding: '0.65rem 1rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, outline: 'none', fontWeight: '600', fontSize: '0.85rem' }} value={newProvider.bank_name} onChange={(e) => setNewProvider({...newProvider, bank_name: e.target.value.toUpperCase()})} />
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilySecondary }}>Tipo Cuenta</label>
                                            <select style={{ padding: '0.65rem 1rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, outline: 'none', fontWeight: '600', fontSize: '0.85rem', height: '38px' }} value={newProvider.bank_account_type} onChange={(e) => setNewProvider({...newProvider, bank_account_type: e.target.value})}>
                                                <option value="Ahorros">Ahorros</option>
                                                <option value="Corriente">Corriente</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                        <label style={{ fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilySecondary }}>Número de Cuenta</label>
                                        <input style={{ padding: '0.65rem 1rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, outline: 'none', fontWeight: '600', fontSize: '0.85rem' }} value={newProvider.bank_account_number} onChange={(e) => setNewProvider({...newProvider, bank_account_number: e.target.value})} />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilySecondary }}>Régimen Facturación</label>
                                            <select style={{ padding: '0.65rem 1rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, outline: 'none', fontWeight: '600', fontSize: '0.85rem', height: '38px' }} value={newProvider.billing_type} onChange={(e) => setNewProvider({...newProvider, billing_type: e.target.value})}>
                                                <option value="soporte">Documento Soporte</option>
                                                <option value="electronica">Factura Electrónica</option>
                                            </select>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilySecondary }}>Condición de Pago (Texto)</label>
                                            <input placeholder="Ej: Crédito 30 Días" style={{ padding: '0.65rem 1rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, outline: 'none', fontWeight: '600', fontSize: '0.85rem' }} value={newProvider.payment_condition} onChange={(e) => setNewProvider({...newProvider, payment_condition: e.target.value})} />
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                        <label style={{ fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilySecondary }}>Plazo de Pago (Días)</label>
                                        <input type="number" min="0" placeholder="Ej: 30" style={{ padding: '0.65rem 1rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, outline: 'none', fontWeight: '600', fontSize: '0.85rem' }} value={newProvider.payment_terms_days} onChange={(e) => setNewProvider({...newProvider, payment_terms_days: parseInt(e.target.value, 10) || 0})} />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                        <label style={{ fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilySecondary }}>Observaciones Técnicas</label>
                                        <textarea rows={2} style={{ padding: '0.65rem 1rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, outline: 'none', fontWeight: '600', fontSize: '0.85rem', resize: 'none' }} value={newProvider.observations} onChange={(e) => setNewProvider({...newProvider, observations: e.target.value})} />
                                    </div>

                                    {/* FILES SECTION */}
                                    <div style={{ borderBottom: `1px solid ${THEME.colors.border}`, paddingBottom: '0.4rem', marginTop: '0.8rem', fontWeight: '600', color: THEME.colors.primary, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bóveda de Documentos (PDF)</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                                        {/* RUT UPLOAD */}
                                        <div style={{ position: 'relative' }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, display: 'block', marginBottom: '0.3rem' }}>Registro RUT</label>
                                            <input type="file" accept=".pdf" id="rut-upload" hidden onChange={(e) => handleFileUpload(e, 'rut_url')} />
                                            <label htmlFor="rut-upload" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', padding: '0.65rem', borderRadius: THEME.radius.md, border: `1.5px dashed ${THEME.colors.borderActive}`, cursor: 'pointer', backgroundColor: newProvider.rut_url ? STATUS_COLORS.creditBg : THEME.colors.background, color: newProvider.rut_url ? STATUS_COLORS.credit : THEME.colors.textSecondary, fontWeight: '700', fontSize: '0.8rem' }}>
                                                {uploading === 'rut_url' ? <Loader2 size={16} className="animate-spin" /> : newProvider.rut_url ? <CheckCircle2 size={16} /> : <Upload size={16} />}
                                                {newProvider.rut_url ? 'RUT Cargado' : 'Subir RUT'}
                                            </label>
                                        </div>
                                        {/* OTHER DOCS UPLOAD */}
                                        <div style={{ position: 'relative' }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, display: 'block', marginBottom: '0.3rem' }}>Otros Anexos</label>
                                            <input type="file" accept=".pdf" id="docs-upload" hidden onChange={(e) => handleFileUpload(e, 'additional_docs_url')} />
                                            <label htmlFor="docs-upload" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', padding: '0.65rem', borderRadius: THEME.radius.md, border: `1.5px dashed ${THEME.colors.borderActive}`, cursor: 'pointer', backgroundColor: newProvider.additional_docs_url ? STATUS_COLORS.creditBg : THEME.colors.background, color: newProvider.additional_docs_url ? STATUS_COLORS.credit : THEME.colors.textSecondary, fontWeight: '700', fontSize: '0.8rem' }}>
                                                {uploading === 'additional_docs_url' ? <Loader2 size={16} className="animate-spin" /> : newProvider.additional_docs_url ? <CheckCircle2 size={16} /> : <Upload size={16} />}
                                                {newProvider.additional_docs_url ? 'Doc Cargado' : 'Subir Anexos'}
                                            </label>
                                        </div>
                                    </div>
                                    
                                    <button type="submit" style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: THEME.radius.md, backgroundColor: THEME.colors.primary, color: 'white', fontWeight: '600', fontSize: '0.85rem', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', transition: 'background-color 0.2s' }}
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

                {/* MODAL: Expediente Detallado */}
                {selectedProvider && (
                    <div 
                        style={{ 
                            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', 
                            backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
                            padding: '1.5rem'
                        }}
                        onClick={() => setSelectedProvider(null)}
                    >
                        <div 
                            style={{ 
                                backgroundColor: 'white', borderRadius: THEME.radius.lg, width: '100%', maxWidth: '820px',
                                maxHeight: '85vh', overflowY: 'auto', position: 'relative',
                                boxShadow: THEME.shadow.lg
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* ── HEADER ── */}
                            <div style={{
                                backgroundColor: 'white',
                                borderRadius: `${THEME.radius.lg} ${THEME.radius.lg} 0 0`,
                                padding: '2rem 2rem 1.2rem',
                                position: 'relative',
                                borderBottom: `1px solid ${THEME.colors.border}`
                            }}>
                                <button 
                                    onClick={() => setSelectedProvider(null)}
                                    style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', border: 'none', backgroundColor: THEME.colors.background, padding: '0.6rem', borderRadius: THEME.radius.md, cursor: 'pointer', color: THEME.colors.textSecondary, display: 'flex', alignItems: 'center', transition: 'background-color 0.2s' }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = THEME.colors.borderActive}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = THEME.colors.background}
                                >
                                    <X size={18} />
                                </button>

                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.2rem', paddingRight: '2.5rem' }}>
                                    {/* Avatar */}
                                    <div style={{
                                        width: '64px', height: '64px', borderRadius: THEME.radius.md,
                                        backgroundColor: THEME.colors.background,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '1.6rem', fontWeight: '900', color: THEME.colors.primary, flexShrink: 0,
                                        border: `1px solid ${THEME.colors.border}`,
                                    }}>
                                        {selectedProvider.name?.split(' ').slice(0,2).map((n: string) => n[0]).join('') || '?'}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0, marginTop: '0.2rem' }}>
                                        <h2 style={{ fontSize: '1.4rem', fontWeight: '700', color: THEME.colors.textMain, margin: '0 0 0.3rem', letterSpacing: '-0.02em', lineHeight: 1.2, fontFamily: THEME.typography.fontFamilyMain }}>
                                            {selectedProvider.name}
                                        </h2>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, backgroundColor: THEME.colors.background, padding: '0.2rem 0.5rem', borderRadius: THEME.radius.sm }}>
                                                {selectedProvider.document_type || 'NIT'}
                                            </span>
                                            <span style={{ fontSize: '1rem', fontWeight: '700', color: THEME.colors.textMain, letterSpacing: '0.02em', fontFamily: THEME.typography.fontFamilySecondary }}>
                                                {selectedProvider.tax_id}
                                            </span>
                                        </div>
                                    </div>
                                    {/* Tipo badge & Edit */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-end', flexShrink: 0 }}>
                                        <div style={{ backgroundColor: selectedProvider.type === 'credito' ? STATUS_COLORS.creditBg : STATUS_COLORS.cashBg, color: selectedProvider.type === 'credito' ? STATUS_COLORS.credit : STATUS_COLORS.cash, padding: '0.4rem 0.8rem', borderRadius: THEME.radius.sm, fontSize: '0.75rem', fontWeight: '600', display: 'flex', alignItems: 'center' }}>
                                            {selectedProvider.type === 'credito' ? (
                                                <><Wallet size={12} strokeWidth={1.5} style={{ marginRight: '4px' }} /> CRÉDITO</>
                                            ) : (
                                                <><Coins size={12} strokeWidth={1.5} style={{ marginRight: '4px' }} /> CONTADO</>
                                            )}
                                        </div>
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
                                            style={{ padding: '0.4rem 0.8rem', borderRadius: THEME.radius.sm, backgroundColor: 'white', color: THEME.colors.primary, border: `1.5px solid ${THEME.colors.border}`, fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', transition: 'all 0.2s' }}
                                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = THEME.colors.background; e.currentTarget.style.borderColor = THEME.colors.primary; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'white'; e.currentTarget.style.borderColor = THEME.colors.border; }}
                                        >
                                            <Edit2 size={14} strokeWidth={1.5} /> Editar
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* ── BODY ── */}
                            <div style={{ padding: '1.5rem 2rem', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>

                                {/* SECCIÓN 1: CONTACTO */}
                                <section>
                                    <div style={{ fontSize: '0.65rem', fontWeight: '600', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: THEME.typography.fontFamilySecondary }}>
                                        <div style={{ height: '1px', flex: 1, backgroundColor: THEME.colors.border }} />
                                        Contacto
                                        <div style={{ height: '1px', flex: 1, backgroundColor: THEME.colors.border }} />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.8rem' }}>
                                        {/* Nombre Contacto */}
                                        <div style={{ backgroundColor: THEME.colors.background, borderRadius: THEME.radius.md, padding: '0.8rem 1rem', border: `1px solid ${THEME.colors.border}` }}>
                                            <div style={{ fontSize: '0.62rem', fontWeight: '600', color: THEME.colors.textSecondary, textTransform: 'uppercase', marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                <User size={10} strokeWidth={1.5} /> Contacto
                                            </div>
                                            <div style={{ fontSize: '0.9rem', fontWeight: '600', color: selectedProvider.contact_name ? THEME.colors.textMain : THEME.colors.textSecondary }}>
                                                {selectedProvider.contact_name || '—'}
                                            </div>
                                        </div>
                                        {/* Teléfono */}
                                        <div style={{ backgroundColor: THEME.colors.background, borderRadius: THEME.radius.md, padding: '0.8rem 1rem', border: `1px solid ${THEME.colors.border}` }}>
                                            <div style={{ fontSize: '0.62rem', fontWeight: '600', color: THEME.colors.textSecondary, textTransform: 'uppercase', marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                <Smartphone size={10} strokeWidth={1.5} /> Teléfono
                                            </div>
                                            {(selectedProvider.phone || selectedProvider.contact_phone) ? (
                                                <a href={`tel:${selectedProvider.phone || selectedProvider.contact_phone}`} style={{ fontSize: '0.9rem', fontWeight: '600', color: THEME.colors.primary, textDecoration: 'none' }}>
                                                    {selectedProvider.phone || selectedProvider.contact_phone}
                                                </a>
                                            ) : (
                                                <div style={{ fontSize: '0.9rem', fontWeight: '600', color: THEME.colors.textSecondary }}>—</div>
                                            )}
                                        </div>
                                        {/* Email */}
                                        <div style={{ backgroundColor: THEME.colors.background, borderRadius: THEME.radius.md, padding: '0.8rem 1rem', border: `1px solid ${THEME.colors.border}` }}>
                                            <div style={{ fontSize: '0.62rem', fontWeight: '600', color: THEME.colors.textSecondary, textTransform: 'uppercase', marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                <Mail size={10} strokeWidth={1.5} /> Correo
                                            </div>
                                            {selectedProvider.email ? (
                                                <a href={`mailto:${selectedProvider.email}`} style={{ fontSize: '0.85rem', fontWeight: '600', color: THEME.colors.primary, textDecoration: 'none', wordBreak: 'break-all' }}>
                                                    {selectedProvider.email}
                                                </a>
                                            ) : (
                                                <div style={{ fontSize: '0.9rem', fontWeight: '600', color: THEME.colors.textSecondary }}>—</div>
                                            )}
                                        </div>
                                    </div>
                                </section>

                                {/* SECCIÓN 2: UBICACIONES — dos conceptos distintos */}
                                <section>
                                    <div style={{ fontSize: '0.65rem', fontWeight: '600', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: THEME.typography.fontFamilySecondary }}>
                                        <div style={{ height: '1px', flex: 1, backgroundColor: THEME.colors.border }} />
                                        Ubicaciones
                                        <div style={{ height: '1px', flex: 1, backgroundColor: THEME.colors.border }} />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                                        {/* Dirección Comercial (empresa) */}
                                        <div style={{ backgroundColor: STATUS_COLORS.cashBg, borderRadius: THEME.radius.md, padding: '1rem', border: `1px solid ${THEME.colors.border}` }}>
                                            <div style={{ fontSize: '0.62rem', fontWeight: '600', color: STATUS_COLORS.cash, textTransform: 'uppercase', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                <Building size={10} strokeWidth={1.5} /> Dirección Comercial
                                                <span style={{ fontSize: '0.55rem', fontWeight: '600', color: STATUS_COLORS.cash, backgroundColor: '#FFFBEB', padding: '0.1rem 0.3rem', borderRadius: THEME.radius.sm }}>EMPRESA</span>
                                            </div>
                                            <div style={{ fontSize: '0.9rem', fontWeight: '600', color: selectedProvider.address ? THEME.colors.textMain : THEME.colors.textSecondary }}>
                                                {selectedProvider.address || 'No registrada'}
                                            </div>
                                        </div>
                                        {/* Ubicación de Entrega (bodega/puesto) */}
                                        <div style={{ backgroundColor: STATUS_COLORS.infoBg, borderRadius: THEME.radius.md, padding: '1rem', border: `1px solid ${THEME.colors.border}` }}>
                                            <div style={{ fontSize: '0.62rem', fontWeight: '600', color: STATUS_COLORS.info, textTransform: 'uppercase', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                <MapPin size={10} strokeWidth={1.5} /> Punto de Recogida
                                                <span style={{ fontSize: '0.55rem', fontWeight: '600', color: STATUS_COLORS.info, backgroundColor: '#E0F2FE', padding: '0.1rem 0.3rem', borderRadius: THEME.radius.sm }}>PLAZA / MERCADO</span>
                                            </div>
                                            {(selectedProvider.warehouse_location !== null && selectedProvider.warehouse_location !== undefined) || selectedProvider.puesto ? (
                                                <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                                                    {selectedProvider.warehouse_location !== null && selectedProvider.warehouse_location !== undefined && (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                            <Package size={12} strokeWidth={1.5} style={{ color: STATUS_COLORS.info }} />
                                                            <span style={{ fontSize: '0.72rem', fontWeight: '600', color: STATUS_COLORS.info }}>Bodega:</span>
                                                            <span style={{ fontSize: '0.9rem', fontWeight: '700', color: THEME.colors.textMain }}>#{selectedProvider.warehouse_location}</span>
                                                        </div>
                                                    )}
                                                    {selectedProvider.puesto && (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                            <Building size={12} strokeWidth={1.5} style={{ color: STATUS_COLORS.info }} />
                                                            <span style={{ fontSize: '0.72rem', fontWeight: '600', color: STATUS_COLORS.info }}>Puesto:</span>
                                                            <span style={{ fontSize: '0.9rem', fontWeight: '700', color: THEME.colors.textMain }}>{selectedProvider.puesto}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div style={{ fontSize: '0.9rem', fontWeight: '600', color: THEME.colors.textSecondary }}>No registrado</div>
                                            )}
                                        </div>
                                    </div>
                                </section>

                                {/* SECCIÓN 3: INFORMACIÓN COMERCIAL Y BANCARIA */}
                                <section>
                                    <div style={{ fontSize: '0.65rem', fontWeight: '600', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: THEME.typography.fontFamilySecondary }}>
                                        <div style={{ height: '1px', flex: 1, backgroundColor: THEME.colors.border }} />
                                        Comercial &amp; Bancario
                                        <div style={{ height: '1px', flex: 1, backgroundColor: THEME.colors.border }} />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.8rem' }}>
                                        {/* Banco */}
                                        <div style={{ backgroundColor: THEME.colors.background, borderRadius: THEME.radius.md, padding: '0.8rem 1rem', border: `1px solid ${THEME.colors.border}` }}>
                                            <div style={{ fontSize: '0.62rem', fontWeight: '600', color: THEME.colors.textSecondary, textTransform: 'uppercase', marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                <Wallet size={10} strokeWidth={1.5} /> Banco
                                            </div>
                                            <div style={{ fontSize: '0.9rem', fontWeight: '600', color: selectedProvider.bank_name ? THEME.colors.textMain : THEME.colors.textSecondary }}>
                                                {selectedProvider.bank_name || '—'}
                                            </div>
                                            {selectedProvider.bank_account_number && (
                                                <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, fontWeight: '600', marginTop: '0.2rem' }}>
                                                    #{selectedProvider.bank_account_number} · {selectedProvider.bank_account_type || 'Ahorro'}
                                                </div>
                                            )}
                                        </div>
                                        {/* Facturación */}
                                        <div style={{ backgroundColor: THEME.colors.background, borderRadius: THEME.radius.md, padding: '0.8rem 1rem', border: `1px solid ${THEME.colors.border}` }}>
                                            <div style={{ fontSize: '0.62rem', fontWeight: '600', color: THEME.colors.textSecondary, textTransform: 'uppercase', marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                <FileCheck size={10} strokeWidth={1.5} /> Facturación
                                            </div>
                                            <div style={{ fontSize: '0.9rem', fontWeight: '600', color: THEME.colors.textMain, display: 'flex', alignItems: 'center' }}>
                                                {selectedProvider.billing_type === 'electronica' ? (
                                                    <><FileCheck size={12} strokeWidth={1.5} style={{ marginRight: '4px', color: STATUS_COLORS.credit }} /> Electrónica</>
                                                ) : selectedProvider.billing_type === 'soporte' ? (
                                                    <><FileText size={12} strokeWidth={1.5} style={{ marginRight: '4px', color: THEME.colors.textSecondary }} /> Doc. Soporte</>
                                                ) : '—'}
                                            </div>
                                        </div>
                                        {/* Condiciones de Pago */}
                                        <div style={{ backgroundColor: THEME.colors.background, borderRadius: THEME.radius.md, padding: '0.8rem 1rem', border: `1px solid ${THEME.colors.border}` }}>
                                            <div style={{ fontSize: '0.62rem', fontWeight: '600', color: THEME.colors.textSecondary, textTransform: 'uppercase', marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                <Clock size={10} strokeWidth={1.5} /> Cond. de Pago
                                            </div>
                                            <div style={{ fontSize: '0.9rem', fontWeight: '600', color: selectedProvider.payment_condition ? THEME.colors.textMain : THEME.colors.textSecondary }}>
                                                {selectedProvider.payment_condition || '—'}
                                            </div>
                                            {selectedProvider.payment_terms_days !== undefined && selectedProvider.payment_terms_days !== null && (
                                                <div style={{ fontSize: '0.72rem', color: THEME.colors.textSecondary, fontWeight: '600', marginTop: '0.2rem' }}>
                                                    {selectedProvider.payment_terms_days} días de crédito
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </section>

                                {/* SECCIÓN 4: CLASIFICACIÓN OPERATIVA */}
                                <section>
                                    <div style={{ fontSize: '0.65rem', fontWeight: '600', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: THEME.typography.fontFamilySecondary }}>
                                        <div style={{ height: '1px', flex: 1, backgroundColor: THEME.colors.border }} />
                                        Clasificación Operativa
                                        <div style={{ height: '1px', flex: 1, backgroundColor: THEME.colors.border }} />
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                                        <span style={{ backgroundColor: THEME.colors.primary, padding: '0.4rem 0.8rem', borderRadius: THEME.radius.sm, fontSize: '0.8rem', fontWeight: '600', color: 'white', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <Tag size={14} strokeWidth={1.5} /> {selectedProvider.category?.toUpperCase() || 'GENERAL'}
                                        </span>
                                        {/* Líneas de producto */}
                                        {selectedProvider.product && selectedProvider.product.split(/[,\/]/).filter((s: string) => s.trim()).map((prod: string, idx: number) => (
                                            <span key={idx} style={{ backgroundColor: THEME.colors.background, padding: '0.4rem 0.8rem', borderRadius: THEME.radius.sm, fontSize: '0.8rem', fontWeight: '600', color: THEME.colors.textMain, border: `1px solid ${THEME.colors.border}` }}>
                                                {prod.trim()}
                                            </span>
                                        ))}
                                    </div>
                                </section>

                                {/* SECCIÓN 5: DOCUMENTOS Y NOTAS */}
                                <section>
                                    <div style={{ fontSize: '0.65rem', fontWeight: '600', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: THEME.typography.fontFamilySecondary }}>
                                        <div style={{ height: '1px', flex: 1, backgroundColor: THEME.colors.border }} />
                                        Documentos &amp; Notas
                                        <div style={{ height: '1px', flex: 1, backgroundColor: THEME.colors.border }} />
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.8rem', marginBottom: '1rem' }}>
                                        <button 
                                            onClick={() => selectedProvider.rut_url && window.open(selectedProvider.rut_url, '_blank')} 
                                            style={{ flex: 1, backgroundColor: selectedProvider.rut_url ? STATUS_COLORS.infoBg : THEME.colors.background, border: `1px solid ${selectedProvider.rut_url ? STATUS_COLORS.info : THEME.colors.border}`, padding: '0.75rem', borderRadius: THEME.radius.md, fontSize: '0.8rem', fontWeight: '600', color: selectedProvider.rut_url ? STATUS_COLORS.info : THEME.colors.textSecondary, cursor: selectedProvider.rut_url ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem' }}
                                        >
                                            <FileText size={16} strokeWidth={1.5} /> RUT
                                            {selectedProvider.rut_url ? <CheckCircle2 size={12} strokeWidth={1.5} style={{ display: 'inline-block', marginLeft: '4px' }} /> : ' (sin archivo)'}
                                        </button>
                                        <button 
                                            onClick={() => selectedProvider.additional_docs_url && window.open(selectedProvider.additional_docs_url, '_blank')} 
                                            style={{ flex: 1, backgroundColor: selectedProvider.additional_docs_url ? STATUS_COLORS.creditBg : THEME.colors.background, border: `1px solid ${selectedProvider.additional_docs_url ? STATUS_COLORS.credit : THEME.colors.border}`, padding: '0.75rem', borderRadius: THEME.radius.md, fontSize: '0.8rem', fontWeight: '600', color: selectedProvider.additional_docs_url ? STATUS_COLORS.credit : THEME.colors.textSecondary, cursor: selectedProvider.additional_docs_url ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem' }}
                                        >
                                            <ExternalLink size={16} strokeWidth={1.5} /> Otros Anexos
                                            {selectedProvider.additional_docs_url ? <CheckCircle2 size={12} strokeWidth={1.5} style={{ display: 'inline-block', marginLeft: '4px' }} /> : ' (sin archivo)'}
                                        </button>
                                    </div>
                                    {(selectedProvider.observations || selectedProvider.notes) ? (
                                        <div style={{ backgroundColor: STATUS_COLORS.cashBg, border: `1px solid ${THEME.colors.border}`, borderRadius: THEME.radius.md, padding: '1rem' }}>
                                            <div style={{ fontSize: '0.62rem', fontWeight: '600', color: STATUS_COLORS.cash, textTransform: 'uppercase', marginBottom: '0.4rem', display: 'flex', alignItems: 'center' }}>
                                                <FileText size={12} strokeWidth={1.5} style={{ marginRight: '4px' }} /> Notas del Expediente
                                            </div>
                                            <p style={{ fontSize: '0.9rem', color: THEME.colors.textMain, margin: 0, lineHeight: 1.6 }}>
                                                {selectedProvider.observations || selectedProvider.notes}
                                            </p>
                                        </div>
                                    ) : (
                                        <div style={{ backgroundColor: THEME.colors.background, border: `1px dashed ${THEME.colors.border}`, borderRadius: THEME.radius.md, padding: '1rem', textAlign: 'center', color: THEME.colors.textSecondary, fontSize: '0.85rem', fontStyle: 'italic' }}>
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

function KPICard({ title, value, icon, subtitle }: { title: string, value: number | string, icon: React.ReactNode, subtitle: string }) {
    return (
        <div style={{
            backgroundColor: THEME.colors.surface,
            padding: '1.25rem 1.5rem',
            borderRadius: THEME.radius.md,
            boxShadow: THEME.shadow.sm,
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            border: `1px solid ${THEME.colors.border}`,
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            cursor: 'pointer'
        }} onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = THEME.shadow.lg;
        }} onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = THEME.shadow.sm;
        }}>
            <div style={{
                backgroundColor: THEME.colors.primaryLight,
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: THEME.colors.primary,
                flexShrink: 0
            }}>
                {icon}
            </div>
            <div>
                <div style={{ fontSize: '0.65rem', color: THEME.colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: THEME.typography.fontFamilySecondary }}>{title}</div>
                <div style={{ fontSize: '1.3rem', fontWeight: '700', color: THEME.colors.textMain, margin: '2px 0', lineHeight: 1, fontFamily: THEME.typography.fontFamilyMain }}>{value}</div>
                <div style={{ fontSize: '0.65rem', color: THEME.colors.textSecondary, fontWeight: '500', fontFamily: THEME.typography.fontFamilySecondary }}>{subtitle}</div>
            </div>
        </div>
    );
}
