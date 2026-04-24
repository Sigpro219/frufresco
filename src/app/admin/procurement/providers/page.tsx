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
    X,
    HelpCircle,
    Save,
    Upload,
    Loader2
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

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
        address: '',
        bank_name: '',
        bank_account_number: '',
        bank_account_type: 'Ahorros',
        billing_type: 'soporte',
        payment_condition: '',
        observations: '',
        rut_url: '',
        additional_docs_url: '',
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
            setProviders(allProviders);
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

    const handleCreateProvider = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const { error } = await supabase
                .from('providers')
                .insert([newProvider]);
            
            if (error) throw error;
            
            setShowCreateModal(false);
            setNewProvider({
                name: '', tax_id: '', document_type: 'NIT', category: 'GENERAL',
                type: 'contado', product: '', contact_name: '', phone: '',
                address: '', bank_name: '', bank_account_number: '',
                bank_account_type: 'Ahorros', billing_type: 'soporte',
                payment_condition: '', observations: '', rut_url: '',
                additional_docs_url: '', is_active: true, is_archived: false
            });
            fetchProviders();
        } catch (err) {
            console.error('Error creating provider:', err);
            alert('Error al crear el proveedor. Verifica el NIT/CC único.');
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
    }, [providers, searchTerm, showArchived]);

    if (!mounted) return null;

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', fontFamily: 'Outfit, sans-serif' }}>
            
            <div style={{ padding: '2rem', maxWidth: '1750px', margin: '0 auto' }}>
                
                {/* Header */}
                <header style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748B', fontSize: '0.9rem', fontWeight: '700', marginBottom: '0.5rem' }}>
                            <Link href="/admin/procurement" style={{ color: '#64748B', textDecoration: 'none' }}>Compras 360</Link>
                            <ChevronRight size={14} />
                            <span style={{ color: '#0891B2' }}>Maestro de Proveedores</span>
                        </div>
                        <h1 style={{ fontSize: '3rem', fontWeight: '900', color: '#0F172A', letterSpacing: '-0.025em', margin: 0 }}>
                            {showArchived ? 'Archivo de' : 'Directorio de'} <span style={{ color: showArchived ? '#64748B' : '#0891B2' }}>{showArchived ? 'Proveedores' : 'Proveedores'}</span>
                        </h1>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <button 
                            onClick={() => setShowArchived(!showArchived)}
                            style={{ 
                                padding: '0.8rem 1.5rem', borderRadius: '18px', 
                                backgroundColor: showArchived ? '#0F172A' : 'white', 
                                color: showArchived ? 'white' : '#64748B', 
                                border: '1px solid #E2E8F0', fontWeight: '800', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '0.6rem'
                            }}
                        >
                            {showArchived ? <Eye size={18} /> : <EyeOff size={18} />}
                            {showArchived ? 'Ver Activos' : 'Ver Archivados'}
                        </button>

                        <div style={{ backgroundColor: 'white', padding: '0.3rem', borderRadius: '14px', border: '1px solid #E2E8F0', display: 'flex', gap: '0.2rem' }}>
                            <button onClick={() => setViewMode('list')} style={{ padding: '0.6rem 1rem', borderRadius: '10px', border: 'none', backgroundColor: viewMode === 'list' ? '#0891B2' : 'transparent', color: viewMode === 'list' ? 'white' : '#64748B', cursor: 'pointer' }}><List size={18} /></button>
                            <button onClick={() => setViewMode('grid')} style={{ padding: '0.6rem 1rem', borderRadius: '10px', border: 'none', backgroundColor: viewMode === 'grid' ? '#0891B2' : 'transparent', color: viewMode === 'grid' ? 'white' : '#64748B', cursor: 'pointer' }}><LayoutGrid size={18} /></button>
                        </div>

                        <button 
                            onClick={() => setShowCreateModal(true)}
                            style={{ 
                                padding: '0.8rem 1.8rem', borderRadius: '18px', 
                                backgroundColor: '#0891B2', color: 'white', border: 'none', 
                                fontWeight: '800', cursor: 'pointer', boxShadow: '0 10px 20px -5px rgba(8, 145, 178, 0.4)',
                                display: 'flex', alignItems: 'center', gap: '0.6rem'
                            }}
                        >
                            <Plus size={20} /> Nuevo Proveedor
                        </button>
                    </div>
                </header>

                {/* SUPER SEARCH BAR */}
                <div style={{ position: 'relative', marginBottom: '2.5rem' }}>
                    <div style={{ 
                        backgroundColor: 'white', padding: '1.2rem 1.8rem', borderRadius: '28px', 
                        border: '1.5px solid #E2E8F0', display: 'flex', gap: '1.2rem', 
                        alignItems: 'center', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)',
                        transition: 'all 0.3s ease'
                    }}>
                        <Search size={22} style={{ color: searchTerm.startsWith('@') ? '#0891B2' : '#94A3B8' }} />
                        <input 
                            placeholder="Buscar por Nombre, NIT o usa @ para comandos (ej: @credito)..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ flex: 1, border: 'none', fontSize: '1.15rem', fontWeight: '700', color: '#1E293B', outline: 'none' }}
                        />
                        
                        {searchTerm && (
                            <button 
                                onClick={() => setSearchTerm('')}
                                style={{ background: '#F1F5F9', border: 'none', padding: '0.5rem', borderRadius: '50%', cursor: 'pointer', color: '#64748B' }}
                            >
                                <X size={18} />
                            </button>
                        )}

                        <div style={{ height: '30px', width: '1.5px', backgroundColor: '#E2E8F0' }}></div>
                        
                        <button 
                            onClick={() => setShowHelp(!showHelp)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: showHelp ? '#0891B2' : '#94A3B8', padding: '0.5rem', transition: 'color 0.2s' }}
                        >
                            <HelpCircle size={24} />
                        </button>
                    </div>

                    {/* Help Tooltip */}
                    {showHelp && (
                        <div style={{ 
                            position: 'absolute', top: '110%', right: '0', width: '320px', 
                            backgroundColor: '#0F172A', color: 'white', padding: '1.5rem', 
                            borderRadius: '24px', zIndex: 50, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)'
                        }}>
                            <div style={{ fontSize: '0.9rem', fontWeight: '900', marginBottom: '1rem', color: '#0891B2', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Info size={16} /> GUÍA DE BÚSQUEDA INTELIGENTE
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                {[
                                    { cmd: '@contado', desc: 'Filtra por pago inmediato' },
                                    { cmd: '@credito', desc: 'Filtra por proveedores a crédito' },
                                    { cmd: '@activo', desc: 'Solo proveedores habilitados' },
                                    { cmd: '@soporte', desc: 'Régimen Documento Soporte' },
                                    { cmd: '@electronica', desc: 'Régimen Factura Electrónica' },
                                ].map((item, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                        <code style={{ color: '#0EA5E9', fontWeight: '800', backgroundColor: 'rgba(14, 165, 233, 0.1)', padding: '0.2rem 0.5rem', borderRadius: '6px' }}>{item.cmd}</code>
                                        <span style={{ color: '#94A3B8' }}>{item.desc}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Content Area */}
                {loading && providers.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '10rem 0' }}>Consultando base de datos...</div>
                ) : (
                    /* Compact List View */
                    <div style={{ backgroundColor: 'white', borderRadius: '28px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
                                <tr>
                                    <th style={{ padding: '1.2rem 1.5rem', textAlign: 'left', color: '#64748B', fontSize: '0.7rem', fontWeight: '900', textTransform: 'uppercase' }}>Nombre del Proveedor</th>
                                    <th style={{ padding: '1.2rem 1.5rem', textAlign: 'left', color: '#64748B', fontSize: '0.7rem', fontWeight: '900', textTransform: 'uppercase' }}>Identificación</th>
                                    <th style={{ padding: '1.2rem 1.5rem', textAlign: 'left', color: '#64748B', fontSize: '0.7rem', fontWeight: '900', textTransform: 'uppercase' }}>Categoría</th>
                                    <th style={{ padding: '1.2rem 1.5rem', textAlign: 'left', color: '#64748B', fontSize: '0.7rem', fontWeight: '900', textTransform: 'uppercase' }}>Tipo Pago</th>
                                    <th style={{ padding: '1.2rem 1.5rem', textAlign: 'right', color: '#64748B', fontSize: '0.7rem', fontWeight: '900', textTransform: 'uppercase' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredProviders.map((p) => (
                                    <tr 
                                        key={p.id} 
                                        onClick={() => setSelectedProvider(p)}
                                        style={{ borderBottom: '1px solid #F1F5F9', cursor: 'pointer', transition: 'background 0.2s' }}
                                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                                    >
                                        <td style={{ padding: '1.2rem 1.5rem' }}>
                                            <div style={{ fontWeight: '900', color: '#0F172A', fontSize: '0.95rem' }}>{p.name}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#0891B2', fontWeight: '800', marginTop: '0.2rem' }}>{p.product || 'Sin producto'}</div>
                                        </td>
                                        <td style={{ padding: '1.2rem 1.5rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span style={{ fontSize: '0.65rem', fontWeight: '900', color: '#94A3B8', backgroundColor: '#F1F5F9', padding: '0.2rem 0.4rem', borderRadius: '6px' }}>{p.document_type || 'NIT'}</span>
                                                <span style={{ fontWeight: '800', color: '#334155', fontSize: '0.9rem' }}>{p.tax_id}</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '1.2rem 1.5rem' }}>
                                            <div style={{ fontSize: '0.75rem', fontWeight: '900', color: '#64748B', backgroundColor: '#F8FAFC', padding: '0.3rem 0.6rem', borderRadius: '8px', border: '1px solid #E2E8F0', display: 'inline-block' }}>
                                                {p.category || 'GENERAL'}
                                            </div>
                                        </td>
                                        <td style={{ padding: '1.2rem 1.5rem' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: '900', color: p.type === 'credito' ? '#10B981' : '#0EA5E9' }}>{p.type?.toUpperCase()}</span>
                                        </td>
                                        <td style={{ padding: '1.2rem 1.5rem', textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                                                <button onClick={(e) => toggleArchiveStatus(e, p.id, p.is_archived)} style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '0.5rem', color: p.is_archived ? '#10B981' : '#EF4444' }}>
                                                    {p.is_archived ? <RotateCcw size={16} /> : <Archive size={16} />}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* MODAL: Nuevo Proveedor */}
                {showCreateModal && (
                    <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '2rem' }} onClick={() => setShowCreateModal(false)}>
                        <div style={{ backgroundColor: 'white', borderRadius: '40px', width: '100%', maxWidth: '1000px', maxHeight: '95vh', overflowY: 'auto', padding: '3.5rem', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => setShowCreateModal(false)} style={{ position: 'absolute', top: '2rem', right: '2.5rem', border: 'none', backgroundColor: '#F1F5F9', padding: '0.8rem', borderRadius: '50%', cursor: 'pointer' }}><X size={24} /></button>
                            
                            <h2 style={{ fontSize: '2.2rem', fontWeight: '950', color: '#0F172A', marginBottom: '2rem', letterSpacing: '-0.02em' }}>Crear Nuevo <span style={{ color: '#0891B2' }}>Proveedor</span></h2>
                            
                            <form onSubmit={handleCreateProvider} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                                {/* Basic Info */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                    <div style={{ borderBottom: '2px solid #F1F5F9', paddingBottom: '0.5rem', marginBottom: '0.5rem', fontWeight: '900', color: '#0891B2', fontSize: '0.8rem', textTransform: 'uppercase' }}>Identidad de Empresa</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        <label style={{ fontSize: '0.85rem', fontWeight: '800', color: '#64748B' }}>Nombre / Razón Social *</label>
                                        <input required style={{ padding: '1rem', borderRadius: '14px', border: '1.5px solid #E2E8F0', outline: 'none', fontWeight: '700' }} value={newProvider.name} onChange={(e) => setNewProvider({...newProvider, name: e.target.value.toUpperCase()})} />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            <label style={{ fontSize: '0.85rem', fontWeight: '800', color: '#64748B' }}>Tipo Doc.</label>
                                            <select style={{ padding: '1rem', borderRadius: '14px', border: '1.5px solid #E2E8F0', outline: 'none', fontWeight: '700' }} value={newProvider.document_type} onChange={(e) => setNewProvider({...newProvider, document_type: e.target.value})}>
                                                <option value="NIT">NIT</option>
                                                <option value="CC">Cédula</option>
                                            </select>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            <label style={{ fontSize: '0.85rem', fontWeight: '800', color: '#64748B' }}>Identificación (NIT/CC) *</label>
                                            <input required style={{ padding: '1rem', borderRadius: '14px', border: '1.5px solid #E2E8F0', outline: 'none', fontWeight: '700' }} value={newProvider.tax_id} onChange={(e) => setNewProvider({...newProvider, tax_id: e.target.value})} />
                                        </div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            <label style={{ fontSize: '0.85rem', fontWeight: '800', color: '#64748B' }}>Categoría</label>
                                            <input style={{ padding: '1rem', borderRadius: '14px', border: '1.5px solid #E2E8F0', outline: 'none', fontWeight: '700' }} value={newProvider.category} onChange={(e) => setNewProvider({...newProvider, category: e.target.value.toUpperCase()})} />
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            <label style={{ fontSize: '0.85rem', fontWeight: '800', color: '#64748B' }}>Tipo Pago</label>
                                            <select style={{ padding: '1rem', borderRadius: '14px', border: '1.5px solid #E2E8F0', outline: 'none', fontWeight: '700' }} value={newProvider.type} onChange={(e) => setNewProvider({...newProvider, type: e.target.value})}>
                                                <option value="contado">Contado (Inmediato)</option>
                                                <option value="credito">Crédito (Facturación)</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        <label style={{ fontSize: '0.85rem', fontWeight: '800', color: '#64748B' }}>Productos / Líneas (Separados por coma)</label>
                                        <input style={{ padding: '1rem', borderRadius: '14px', border: '1.5px solid #E2E8F0', outline: 'none', fontWeight: '700' }} value={newProvider.product} onChange={(e) => setNewProvider({...newProvider, product: e.target.value.toUpperCase()})} />
                                    </div>
                                    <div style={{ borderBottom: '2px solid #F1F5F9', paddingBottom: '0.5rem', marginTop: '1rem', fontWeight: '900', color: '#0891B2', fontSize: '0.8rem', textTransform: 'uppercase' }}>Contacto Directo</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        <label style={{ fontSize: '0.85rem', fontWeight: '800', color: '#64748B' }}>Nombre de Contacto</label>
                                        <input style={{ padding: '1rem', borderRadius: '14px', border: '1.5px solid #E2E8F0', outline: 'none', fontWeight: '700' }} value={newProvider.contact_name} onChange={(e) => setNewProvider({...newProvider, contact_name: e.target.value.toUpperCase()})} />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '1rem' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            <label style={{ fontSize: '0.85rem', fontWeight: '800', color: '#64748B' }}>Teléfono</label>
                                            <input style={{ padding: '1rem', borderRadius: '14px', border: '1.5px solid #E2E8F0', outline: 'none', fontWeight: '700' }} value={newProvider.phone} onChange={(e) => setNewProvider({...newProvider, phone: e.target.value})} />
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            <label style={{ fontSize: '0.85rem', fontWeight: '800', color: '#64748B' }}>Dirección / Oficina</label>
                                            <input style={{ padding: '1rem', borderRadius: '14px', border: '1.5px solid #E2E8F0', outline: 'none', fontWeight: '700' }} value={newProvider.address} onChange={(e) => setNewProvider({...newProvider, address: e.target.value.toUpperCase()})} />
                                        </div>
                                    </div>
                                </div>

                                {/* Financial Info */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                    <div style={{ borderBottom: '2px solid #F1F5F9', paddingBottom: '0.5rem', marginBottom: '0.5rem', fontWeight: '900', color: '#0891B2', fontSize: '0.8rem', textTransform: 'uppercase' }}>Información Financiera</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1rem' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            <label style={{ fontSize: '0.85rem', fontWeight: '800', color: '#64748B' }}>Banco</label>
                                            <input style={{ padding: '1rem', borderRadius: '14px', border: '1.5px solid #E2E8F0', outline: 'none', fontWeight: '700' }} value={newProvider.bank_name} onChange={(e) => setNewProvider({...newProvider, bank_name: e.target.value.toUpperCase()})} />
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            <label style={{ fontSize: '0.85rem', fontWeight: '800', color: '#64748B' }}>Tipo Cuenta</label>
                                            <select style={{ padding: '1rem', borderRadius: '14px', border: '1.5px solid #E2E8F0', outline: 'none', fontWeight: '700' }} value={newProvider.bank_account_type} onChange={(e) => setNewProvider({...newProvider, bank_account_type: e.target.value})}>
                                                <option value="Ahorros">Ahorros</option>
                                                <option value="Corriente">Corriente</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        <label style={{ fontSize: '0.85rem', fontWeight: '800', color: '#64748B' }}>Número de Cuenta</label>
                                        <input style={{ padding: '1rem', borderRadius: '14px', border: '1.5px solid #E2E8F0', outline: 'none', fontWeight: '700' }} value={newProvider.bank_account_number} onChange={(e) => setNewProvider({...newProvider, bank_account_number: e.target.value})} />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            <label style={{ fontSize: '0.85rem', fontWeight: '800', color: '#64748B' }}>Régimen Facturación</label>
                                            <select style={{ padding: '1rem', borderRadius: '14px', border: '1.5px solid #E2E8F0', outline: 'none', fontWeight: '700' }} value={newProvider.billing_type} onChange={(e) => setNewProvider({...newProvider, billing_type: e.target.value})}>
                                                <option value="soporte">Documento Soporte</option>
                                                <option value="electronica">Factura Electrónica</option>
                                            </select>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            <label style={{ fontSize: '0.85rem', fontWeight: '800', color: '#64748B' }}>Condición de Pago (Días)</label>
                                            <input placeholder="Ej: 30 Días" style={{ padding: '1rem', borderRadius: '14px', border: '1.5px solid #E2E8F0', outline: 'none', fontWeight: '700' }} value={newProvider.payment_condition} onChange={(e) => setNewProvider({...newProvider, payment_condition: e.target.value})} />
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        <label style={{ fontSize: '0.85rem', fontWeight: '800', color: '#64748B' }}>Observaciones Técnicas</label>
                                        <textarea rows={2} style={{ padding: '1rem', borderRadius: '14px', border: '1.5px solid #E2E8F0', outline: 'none', fontWeight: '600', resize: 'none' }} value={newProvider.observations} onChange={(e) => setNewProvider({...newProvider, observations: e.target.value})} />
                                    </div>

                                    {/* FILES SECTION */}
                                    <div style={{ borderBottom: '2px solid #F1F5F9', paddingBottom: '0.5rem', marginTop: '1rem', fontWeight: '900', color: '#0891B2', fontSize: '0.8rem', textTransform: 'uppercase' }}>Bóveda de Documentos (PDF)</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        {/* RUT UPLOAD */}
                                        <div style={{ position: 'relative' }}>
                                            <label style={{ fontSize: '0.8rem', fontWeight: '800', color: '#94A3B8', display: 'block', marginBottom: '0.4rem' }}>Registro RUT</label>
                                            <input type="file" accept=".pdf" id="rut-upload" hidden onChange={(e) => handleFileUpload(e, 'rut_url')} />
                                            <label htmlFor="rut-upload" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', padding: '0.8rem', borderRadius: '14px', border: '1.5px dashed #E2E8F0', cursor: 'pointer', backgroundColor: newProvider.rut_url ? '#ECFDF5' : '#F8FAFC', color: newProvider.rut_url ? '#10B981' : '#64748B', fontWeight: '800', fontSize: '0.8rem' }}>
                                                {uploading === 'rut_url' ? <Loader2 size={18} className="animate-spin" /> : newProvider.rut_url ? <CheckCircle2 size={18} /> : <Upload size={18} />}
                                                {newProvider.rut_url ? 'RUT Cargado' : 'Subir RUT'}
                                            </label>
                                        </div>
                                        {/* OTHER DOCS UPLOAD */}
                                        <div style={{ position: 'relative' }}>
                                            <label style={{ fontSize: '0.8rem', fontWeight: '800', color: '#94A3B8', display: 'block', marginBottom: '0.4rem' }}>Otros Anexos</label>
                                            <input type="file" accept=".pdf" id="docs-upload" hidden onChange={(e) => handleFileUpload(e, 'additional_docs_url')} />
                                            <label htmlFor="docs-upload" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', padding: '0.8rem', borderRadius: '14px', border: '1.5px dashed #E2E8F0', cursor: 'pointer', backgroundColor: newProvider.additional_docs_url ? '#ECFDF5' : '#F8FAFC', color: newProvider.additional_docs_url ? '#10B981' : '#64748B', fontWeight: '800', fontSize: '0.8rem' }}>
                                                {uploading === 'additional_docs_url' ? <Loader2 size={18} className="animate-spin" /> : newProvider.additional_docs_url ? <CheckCircle2 size={18} /> : <Upload size={18} />}
                                                {newProvider.additional_docs_url ? 'Doc Cargado' : 'Subir Anexos'}
                                            </label>
                                        </div>
                                    </div>
                                    
                                    <button type="submit" style={{ marginTop: '1rem', padding: '1.2rem', borderRadius: '20px', backgroundColor: '#0F172A', color: 'white', fontWeight: '900', fontSize: '1.1rem', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', boxShadow: '0 20px 40px -10px rgba(15, 23, 42, 0.4)' }}>
                                        <Save size={24} /> Guardar Proveedor Maestro
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
                            backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
                            padding: '2rem'
                        }}
                        onClick={() => setSelectedProvider(null)}
                    >
                        <div 
                            style={{ 
                                backgroundColor: 'white', borderRadius: '40px', width: '100%', maxWidth: '900px',
                                maxHeight: '90vh', overflowY: 'auto', padding: '3.5rem', position: 'relative',
                                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button 
                                onClick={() => setSelectedProvider(null)}
                                style={{ position: 'absolute', top: '2rem', right: '2.5rem', border: 'none', backgroundColor: '#F1F5F9', padding: '0.8rem', borderRadius: '50%', cursor: 'pointer', color: '#64748B' }}
                            >
                                <X size={24} />
                            </button>

                            {/* Ficha Content */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                                        <div style={{ width: '80px', height: '80px', borderRadius: '24px', backgroundColor: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', border: '1px solid #F1F5F9' }}>🏬</div>
                                        <div>
                                            <h2 style={{ fontSize: '2rem', fontWeight: '950', color: '#0F172A', margin: 0, letterSpacing: '-0.02em' }}>{selectedProvider.name}</h2>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginTop: '0.4rem' }}>
                                                <span style={{ fontSize: '0.8rem', fontWeight: '900', color: '#94A3B8', backgroundColor: '#F1F5F9', padding: '0.3rem 0.6rem', borderRadius: '8px' }}>{selectedProvider.document_type || 'NIT'}</span>
                                                <span style={{ fontSize: '1.2rem', fontWeight: '900', color: '#0891B2' }}>{selectedProvider.tax_id}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ backgroundColor: selectedProvider.type === 'credito' ? '#ECFDF5' : '#F0F9FF', color: selectedProvider.type === 'credito' ? '#10B981' : '#0EA5E9', padding: '0.6rem 1.2rem', borderRadius: '16px', fontSize: '0.85rem', fontWeight: '900' }}>
                                        CUENTA {selectedProvider.type?.toUpperCase()}
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                            <div style={{ width: '45px', height: '45px', borderRadius: '14px', backgroundColor: '#F0F9FF', color: '#0EA5E9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><User size={20} /></div>
                                            <div>
                                                <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase' }}>Contacto Directo</div>
                                                <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#1E293B' }}>{selectedProvider.contact_name || '---'}</div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                            <div style={{ width: '45px', height: '45px', borderRadius: '14px', backgroundColor: '#F0F9FF', color: '#0EA5E9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Smartphone size={20} /></div>
                                            <div>
                                                <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase' }}>Teléfono Móvil</div>
                                                <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#1E293B' }}>{selectedProvider.phone || '---'}</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                            <div style={{ width: '45px', height: '45px', borderRadius: '14px', backgroundColor: '#F8FAFC', color: '#0891B2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Wallet size={20} /></div>
                                            <div>
                                                <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase' }}>Entidad Bancaria</div>
                                                <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#1E293B' }}>{selectedProvider.bank_name || 'No registrada'}</div>
                                                <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#64748B' }}>{selectedProvider.bank_account_number || '---'}</div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                            <div style={{ width: '45px', height: '45px', borderRadius: '14px', backgroundColor: '#F8FAFC', color: '#0891B2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FileCheck size={20} /></div>
                                            <div>
                                                <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase' }}>Régimen Facturación</div>
                                                <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#1E293B' }}>
                                                    {selectedProvider.billing_type === 'electronica' ? 'Factura Electrónica' : selectedProvider.billing_type === 'soporte' ? 'Doc. Soporte' : '---'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '2rem' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', marginBottom: '1rem' }}>Clasificación Operativa</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.8rem' }}>
                                        <span style={{ backgroundColor: '#0891B2', padding: '0.6rem 1.2rem', borderRadius: '12px', fontSize: '0.9rem', fontWeight: '900', color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <Tag size={16} /> {selectedProvider.category?.toUpperCase() || 'GENERAL'}
                                        </span>
                                        {(selectedProvider.product || '').split(',').filter((s: string) => s.trim() !== '').map((prod: string, idx: number) => (
                                            <span key={idx} style={{ backgroundColor: '#F1F5F9', padding: '0.6rem 1.2rem', borderRadius: '12px', fontSize: '0.9rem', fontWeight: '800', color: '#475569', border: '1px solid #E2E8F0' }}>
                                                {prod.trim()}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                <div style={{ backgroundColor: '#F8FAFC', padding: '2rem', borderRadius: '28px', border: '1px solid #F1F5F9' }}>
                                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                                        <button onClick={() => selectedProvider.rut_url && window.open(selectedProvider.rut_url, '_blank')} style={{ flex: 1, backgroundColor: 'white', border: '1px solid #E2E8F0', padding: '1rem', borderRadius: '16px', fontSize: '0.85rem', fontWeight: '900', color: selectedProvider.rut_url ? '#0891B2' : '#CBD5E1', cursor: selectedProvider.rut_url ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem' }}>
                                            <FileText size={20} /> Ver RUT
                                        </button>
                                        <button onClick={() => selectedProvider.additional_docs_url && window.open(selectedProvider.additional_docs_url, '_blank')} style={{ flex: 1, backgroundColor: 'white', border: '1px solid #E2E8F0', padding: '1rem', borderRadius: '16px', fontSize: '0.85rem', fontWeight: '900', color: selectedProvider.additional_docs_url ? '#64748B' : '#CBD5E1', cursor: selectedProvider.additional_docs_url ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem' }}>
                                            <ExternalLink size={20} /> Otros Anexos
                                        </button>
                                    </div>
                                    <p style={{ fontSize: '1rem', color: '#64748B', margin: 0, fontStyle: 'italic', lineHeight: 1.5 }}>{selectedProvider.observations || 'Sin anotaciones registradas en el expediente.'}</p>
                                </div>
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
