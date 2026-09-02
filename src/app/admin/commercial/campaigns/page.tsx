'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { 
    Plus, 
    Megaphone, 
    Sparkles, 
    Users, 
    Package, 
    Calendar, 
    Trash2, 
    Clock, 
    AlertCircle,
    CheckCircle2,
    X,
    Filter,
    Search,
    HelpCircle,
    ArrowLeft,
    Tag,
    BadgePercent,
    DollarSign,
    Check,
    Layers
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { THEME } from '@/lib/adminTheme';

export default function CampaignsPage() {
    const [campaigns, setCampaigns] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [showGuide, setShowGuide] = useState(false);
    const [step, setStep] = useState(1);
    const [isSaving, setIsSaving] = useState(false);
    
    // Step 1: Basic Info
    const [name, setName] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [type, setType] = useState<'margin_adjustment' | 'fixed_price'>('margin_adjustment');
    
    // Step 2: Targets & Items
    const [availableClients, setAvailableClients] = useState<any[]>([]);
    const [selectedClients, setSelectedClients] = useState<string[]>([]);
    
    const [availableProducts, setAvailableProducts] = useState<any[]>([]);
    const [selectedItems, setSelectedItems] = useState<any[]>([]); // { product_id, value }
    
    const [searchClient, setSearchClient] = useState('');
    const [searchProduct, setSearchProduct] = useState('');

    const nameInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetchCampaigns();
        fetchDiscoveryData();
    }, []);

    useEffect(() => {
        if (isCreating && step === 1) {
            setTimeout(() => {
                nameInputRef.current?.focus();
            }, 80);
        }
    }, [isCreating, step]);

    const fetchCampaigns = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('commercial_campaigns')
                .select(`
                    *,
                    campaign_targets(profile_id),
                    campaign_items(product_id)
                `)
                .order('created_at', { ascending: false });

            if (error && error.code !== '42P01') throw error;
            setCampaigns(data || []);
        } catch (err) {
            console.error('Error fetching campaigns:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchDiscoveryData = async () => {
        try {
            // Corrección de rol: b2b_client para cargar los clientes institucionales reales
            const { data: clients } = await supabase
                .from('profiles')
                .select('id, company_name, contact_name, nit')
                .eq('role', 'b2b_client')
                .order('company_name');
            
            const { data: prods } = await supabase
                .from('products')
                .select('id, name, sku, base_price, category')
                .eq('active', true)
                .order('name');

            setAvailableClients(clients || []);
            setAvailableProducts(prods || []);
        } catch (e) {
            console.error('Error fetching discovery data:', e);
        }
    };

    const saveCampaign = async () => {
        if (!name || !startDate || !endDate || selectedClients.length === 0 || selectedItems.length === 0) {
            if (typeof window !== 'undefined' && (window as any).showToast) {
                (window as any).showToast('Por favor completa todos los campos, selecciona al menos un cliente y un producto.', 'warning');
            } else {
                alert('Por favor complete todos los campos, seleccione al menos un cliente y un producto.');
            }
            return;
        }

        try {
            setIsSaving(true);
            
            // 1. Create Campaign
            const { data: campaign, error: campError } = await supabase
                .from('commercial_campaigns')
                .insert([{
                    name,
                    start_date: startDate,
                    end_date: endDate,
                    type,
                    status: 'active'
                }])
                .select()
                .single();

            if (campError) throw campError;

            // 2. Create Targets
            const targetRows = selectedClients.map(clientId => ({
                campaign_id: campaign.id,
                profile_id: clientId
            }));
            const { error: targetError } = await supabase.from('campaign_targets').insert(targetRows);
            if (targetError) throw targetError;

            // 3. Create Items
            const itemRows = selectedItems.map(item => ({
                campaign_id: campaign.id,
                product_id: item.product_id,
                adjustment_value: item.value
            }));
            const { error: itemError } = await supabase.from('campaign_items').insert(itemRows);
            if (itemError) throw itemError;

            if (typeof window !== 'undefined' && (window as any).showToast) {
                (window as any).showToast('Campaña creada y activada exitosamente', 'success');
            } else {
                alert('Campaña creada y activada exitosamente.');
            }
            
            setIsCreating(false);
            setStep(1);
            resetForm();
            fetchCampaigns();

        } catch (err: any) {
            console.error('Error saving campaign:', err);
            if (typeof window !== 'undefined' && (window as any).showToast) {
                (window as any).showToast('Error al guardar: ' + err.message, 'error');
            } else {
                alert('Error al guardar: ' + err.message);
            }
        } finally {
            setIsSaving(false);
        }
    };

    const resetForm = () => {
        setName('');
        setStartDate('');
        setEndDate('');
        setType('margin_adjustment');
        setSelectedClients([]);
        setSelectedItems([]);
        setStep(1);
    };

    const getStatusStyle = (start: string, end: string) => {
        const now = new Date();
        const s = new Date(start);
        const e = new Date(end);

        if (now < s) {
            return { label: 'Programada', color: '#4338CA', bg: '#EEF2FF', border: '#C7D2FE', icon: <Clock size={13} /> };
        }
        if (now > e) {
            return { label: 'Finalizada', color: '#64748B', bg: '#F1F5F9', border: '#E2E8F0', icon: <CheckCircle2 size={13} /> };
        }
        return { label: 'Activa', color: '#065F46', bg: '#ECFDF5', border: '#A7F3D0', icon: <Sparkles size={13} /> };
    };

    const filteredClients = availableClients.filter(c => 
        (c.company_name || c.contact_name || '').toLowerCase().includes(searchClient.toLowerCase()) || 
        (c.nit || '').includes(searchClient)
    );

    const filteredProducts = availableProducts.filter(p => 
        (p.name || '').toLowerCase().includes(searchProduct.toLowerCase()) || 
        (p.sku || '').toLowerCase().includes(searchProduct.toLowerCase()) ||
        (p.category || '').toLowerCase().includes(searchProduct.toLowerCase())
    );

    // Métricas KPI
    const now = new Date();
    const activeCampaigns = campaigns.filter(c => {
        const s = new Date(c.start_date);
        const e = new Date(c.end_date);
        return now >= s && now <= e;
    });

    const activeClientsBenefitedCount = new Set(
        activeCampaigns.flatMap(c => (c.campaign_targets || []).map((t: any) => t.profile_id))
    ).size;

    const activeSkusCount = new Set(
        activeCampaigns.flatMap(c => (c.campaign_items || []).map((i: any) => i.product_id))
    ).size;

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif' }}>
            <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '2rem 1.5rem 4rem 1.5rem' }}>
                
                {/* BACK LINK & HEADER */}
                <div style={{ marginBottom: '1.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <Link 
                            href="/admin/commercial" 
                            style={{ 
                                textDecoration: 'none', 
                                color: '#64748B', 
                                fontWeight: '700', 
                                fontSize: '0.85rem', 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: '6px',
                                marginBottom: '0.6rem',
                                transition: 'color 0.15s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.color = '#0D7A57'}
                            onMouseLeave={e => e.currentTarget.style.color = '#64748B'}
                        >
                            <ArrowLeft size={16} /> Volver al Dashboard Comercial
                        </Link>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <h1 style={{ fontSize: '2.1rem', fontWeight: '900', color: '#0F172A', margin: 0, letterSpacing: '-0.03em' }}>
                                Campañas Temporales
                            </h1>
                            <button 
                                onClick={() => setShowGuide(!showGuide)}
                                title="¿Cómo funciona?"
                                style={{ 
                                    background: showGuide ? '#EAEFEA' : '#F1F5F9', 
                                    border: `1px solid ${showGuide ? '#A7F3D0' : '#E2E8F0'}`, 
                                    color: showGuide ? '#065F46' : '#64748B', 
                                    borderRadius: '10px', 
                                    padding: '6px 10px',
                                    cursor: 'pointer', 
                                    display: 'inline-flex', 
                                    alignItems: 'center', 
                                    gap: '5px',
                                    fontWeight: '700', 
                                    fontSize: '0.78rem',
                                    transition: 'all 0.2s',
                                    outline: 'none'
                                }}
                            >
                                <HelpCircle size={15} /> ¿Cómo funciona?
                            </button>
                        </div>
                        <p style={{ color: '#64748B', fontSize: '0.95rem', marginTop: '0.35rem', marginBottom: 0 }}>
                            Estrategias de precios, liquidación de cosecha y descuentos flash por tiempo limitado para clientes B2B.
                        </p>
                    </div>

                    <button 
                        onClick={() => {
                            resetForm();
                            setIsCreating(true);
                        }}
                        style={{ 
                            padding: '0.75rem 1.4rem', 
                            backgroundColor: '#0D7A57', 
                            color: 'white', 
                            border: 'none', 
                            borderRadius: '12px', 
                            fontWeight: '800', 
                            fontSize: '0.88rem',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            boxShadow: '0 4px 12px rgba(13, 122, 87, 0.25)',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#065F46'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#0D7A57'}
                    >
                        <Plus size={18} strokeWidth={2.5} /> Nueva Campaña
                    </button>
                </div>

                {/* GUIDE COLLAPSIBLE BOX */}
                {showGuide && (
                    <div style={{ 
                        marginBottom: '1.75rem', 
                        backgroundColor: '#F0FDFA', 
                        border: '1px solid #99F6E4', 
                        borderRadius: '16px', 
                        padding: '1.5rem', 
                        color: '#134E4A', 
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.02)',
                        position: 'relative'
                    }}>
                        <button 
                            onClick={() => setShowGuide(false)}
                            style={{ position: 'absolute', right: '1rem', top: '1rem', background: 'none', border: 'none', color: '#0D7A57', cursor: 'pointer' }}
                        >
                            <X size={18} />
                        </button>
                        
                        <div style={{ fontWeight: '800', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.8rem', color: '#065F46' }}>
                            <Sparkles size={18} /> Guía Rápida: Motor de Campañas Temporales
                        </div>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
                            <div style={{ backgroundColor: 'white', padding: '0.9rem', borderRadius: '12px', border: '1px solid #CCFBF1' }}>
                                <div style={{ fontWeight: '800', fontSize: '0.82rem', color: '#0F766E', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <Calendar size={14} /> 1. Vigencia Automática
                                </div>
                                <div style={{ color: '#475569', fontSize: '0.78rem', lineHeight: '1.45' }}>
                                    Define fecha de inicio y fin. Se activa y finaliza automáticamente en los pedidos programados para esas fechas.
                                </div>
                            </div>

                            <div style={{ backgroundColor: 'white', padding: '0.9rem', borderRadius: '12px', border: '1px solid #CCFBF1' }}>
                                <div style={{ fontWeight: '800', fontSize: '0.82rem', color: '#0F766E', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <Users size={14} /> 2. Alcance B2B Específico
                                </div>
                                <div style={{ color: '#475569', fontSize: '0.78rem', lineHeight: '1.45' }}>
                                    Elige qué clientes institucionales participan. No afecta a clientes B2C ni altera sus contratos permanentes.
                                </div>
                            </div>

                            <div style={{ backgroundColor: 'white', padding: '0.9rem', borderRadius: '12px', border: '1px solid #CCFBF1' }}>
                                <div style={{ fontWeight: '800', fontSize: '0.82rem', color: '#0F766E', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <BadgePercent size={14} /> 3. Variación de Margen (%)
                                </div>
                                <div style={{ color: '#475569', fontSize: '0.78rem', lineHeight: '1.45' }}>
                                    Aplica un descuento (ej: <b>-10%</b>) o incremento temporal sobre la lista de precios base.
                                </div>
                            </div>

                            <div style={{ backgroundColor: 'white', padding: '0.9rem', borderRadius: '12px', border: '1px solid #CCFBF1' }}>
                                <div style={{ fontWeight: '800', fontSize: '0.82rem', color: '#0F766E', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <DollarSign size={14} /> 4. Precio Fijo Neto ($)
                                </div>
                                <div style={{ color: '#475569', fontSize: '0.78rem', lineHeight: '1.45' }}>
                                    Sobrescribe el precio final del producto con un valor absoluto en pesos (ej: <b>$3.200</b> por kilo).
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* KPI TOP SUMMARY CARDS */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '1.75rem' }}>
                    <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '1.25rem 1.5rem', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ width: '44px', height: '44px', borderRadius: '12px', backgroundColor: '#EAEFEA', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0D7A57' }}>
                            <Megaphone size={22} />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Campañas Activas</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#0F172A', lineHeight: '1.2', marginTop: '2px' }}>{activeCampaigns.length}</div>
                            <div style={{ fontSize: '0.74rem', color: '#0D7A57', fontWeight: '700' }}>{campaigns.length} registradas en total</div>
                        </div>
                    </div>

                    <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '1.25rem 1.5rem', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ width: '44px', height: '44px', borderRadius: '12px', backgroundColor: '#EAEFEA', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0D7A57' }}>
                            <Users size={22} />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Clientes con Beneficio</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#0F172A', lineHeight: '1.2', marginTop: '2px' }}>{activeClientsBenefitedCount}</div>
                            <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: '600' }}>de {availableClients.length} clientes B2B</div>
                        </div>
                    </div>

                    <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '1.25rem 1.5rem', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ width: '44px', height: '44px', borderRadius: '12px', backgroundColor: '#EAEFEA', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0D7A57' }}>
                            <Package size={22} />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>SKUs en Promoción</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#0F172A', lineHeight: '1.2', marginTop: '2px' }}>{activeSkusCount}</div>
                            <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: '600' }}>productos con precio temporal</div>
                        </div>
                    </div>
                </div>

                {/* MAIN CAMPAIGNS CARD */}
                <div style={{ backgroundColor: 'white', borderRadius: '20px', boxShadow: '0 1px 4px rgba(0, 0, 0, 0.05)', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                    <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h2 style={{ fontSize: '1.15rem', fontWeight: '900', margin: 0, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Layers size={18} style={{ color: '#0D7A57' }} /> Historial de Estrategias
                            </h2>
                            <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.78rem', color: '#64748B', fontWeight: '500' }}>
                                Registro cronológico de campañas activas, programadas y finalizadas
                            </p>
                        </div>
                        <button 
                            onClick={fetchCampaigns} 
                            title="Refrescar lista"
                            style={{ 
                                background: '#F8FAFC', 
                                border: '1px solid #E2E8F0', 
                                color: '#475569', 
                                cursor: 'pointer',
                                padding: '6px 12px',
                                borderRadius: '8px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '0.75rem',
                                fontWeight: '700'
                            }}
                        >
                            <Filter size={14} /> Refrescar
                        </button>
                    </div>

                    {loading ? (
                        <div style={{ padding: '4rem', textAlign: 'center', color: '#94A3B8', fontSize: '0.9rem', fontWeight: '600' }}>
                            Cargando campañas...
                        </div>
                    ) : campaigns.length === 0 ? (
                        /* CLEAN INDUSTRIAL EMPTY STATE */
                        <div style={{ padding: '4.5rem 2rem', textAlign: 'center', maxWidth: '560px', margin: '0 auto' }}>
                            <div style={{ 
                                width: '64px', 
                                height: '64px', 
                                borderRadius: '18px', 
                                backgroundColor: '#EAEFEA', 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                color: '#0D7A57',
                                marginBottom: '1.25rem' 
                            }}>
                                <Megaphone size={32} />
                            </div>
                            
                            <h3 style={{ fontSize: '1.25rem', fontWeight: '900', color: '#0F172A', marginBottom: '0.5rem' }}>
                                Sin campañas temporales activas
                            </h3>
                            <p style={{ color: '#64748B', fontSize: '0.88rem', lineHeight: '1.5', margin: '0 0 1.5rem 0' }}>
                                Crea tu primera campaña temporal para incentivar la compra institucional, liquidar sobreofertas de cosecha o premiar a clientes VIP con precios especiales.
                            </p>

                            {/* CASOS DE USO PRE-CONFIGURADOS */}
                            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '1.75rem' }}>
                                <span style={{ padding: '4px 10px', borderRadius: '99px', backgroundColor: '#F1F5F9', border: '1px solid #E2E8F0', fontSize: '0.72rem', fontWeight: '700', color: '#475569', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <Tag size={12} /> Cosecha de Temporada
                                </span>
                                <span style={{ padding: '4px 10px', borderRadius: '99px', backgroundColor: '#F1F5F9', border: '1px solid #E2E8F0', fontSize: '0.72rem', fontWeight: '700', color: '#475569', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <Users size={12} /> Descuento Clientes VIP
                                </span>
                                <span style={{ padding: '4px 10px', borderRadius: '99px', backgroundColor: '#F1F5F9', border: '1px solid #E2E8F0', fontSize: '0.72rem', fontWeight: '700', color: '#475569', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <Sparkles size={12} /> Precios Flash 7 Días
                                </span>
                            </div>

                            <button 
                                onClick={() => {
                                    resetForm();
                                    setIsCreating(true);
                                }}
                                style={{ 
                                    padding: '0.8rem 1.6rem', 
                                    backgroundColor: '#0D7A57', 
                                    color: 'white', 
                                    border: 'none', 
                                    borderRadius: '12px', 
                                    fontWeight: '800', 
                                    fontSize: '0.88rem',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    boxShadow: '0 4px 12px rgba(13, 122, 87, 0.25)',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#065F46'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = '#0D7A57'}
                            >
                                <Plus size={18} strokeWidth={2.5} /> Crear Primera Campaña
                            </button>
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                                        <th style={{ padding: '1rem 1.25rem', fontSize: '0.72rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Estrategia / Vigencia</th>
                                        <th style={{ padding: '1rem 1.25rem', fontSize: '0.72rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Estado</th>
                                        <th style={{ padding: '1rem 1.25rem', fontSize: '0.72rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Alcance</th>
                                        <th style={{ padding: '1rem 1.25rem', fontSize: '0.72rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Modalidad</th>
                                        <th style={{ padding: '1rem 1.25rem', textAlign: 'right', fontSize: '0.72rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {campaigns.map(c => {
                                        const status = getStatusStyle(c.start_date, c.end_date);
                                        return (
                                            <tr key={c.id} style={{ borderBottom: '1px solid #F1F5F9', transition: 'background 0.15s' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F8FAFC'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                <td style={{ padding: '1rem 1.25rem' }}>
                                                    <div style={{ fontWeight: '800', color: '#0F172A', fontSize: '0.92rem' }}>{c.name}</div>
                                                    <div style={{ fontSize: '0.75rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px' }}>
                                                        <Calendar size={12} style={{ color: '#0D7A57' }} />
                                                        {format(new Date(c.start_date), 'dd MMM', { locale: es })} — {format(new Date(c.end_date), 'dd MMM yyyy', { locale: es })}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '1rem 1.25rem' }}>
                                                    <span style={{ 
                                                        padding: '0.3rem 0.65rem', 
                                                        borderRadius: '99px', 
                                                        fontSize: '0.72rem', 
                                                        fontWeight: '800', 
                                                        backgroundColor: status.bg, 
                                                        color: status.color,
                                                        border: `1px solid ${status.border}`,
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '5px'
                                                    }}>
                                                        {status.icon} {status.label}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '1rem 1.25rem' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: '700', color: '#334155' }} title="Clientes Institucionales">
                                                            <Users size={14} style={{ color: '#0D7A57' }} /> {c.campaign_targets?.length || 0}
                                                        </span>
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: '700', color: '#334155' }} title="Productos en Oferta">
                                                            <Package size={14} style={{ color: '#0D7A57' }} /> {c.campaign_items?.length || 0}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '1rem 1.25rem' }}>
                                                    <span style={{ 
                                                        padding: '0.3rem 0.6rem', 
                                                        borderRadius: '8px', 
                                                        fontSize: '0.75rem', 
                                                        fontWeight: '700', 
                                                        backgroundColor: c.type === 'margin_adjustment' ? '#F0FDFA' : '#F8FAFC',
                                                        color: c.type === 'margin_adjustment' ? '#065F46' : '#334155',
                                                        border: `1px solid ${c.type === 'margin_adjustment' ? '#99F6E4' : '#E2E8F0'}`,
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}>
                                                        {c.type === 'margin_adjustment' ? (
                                                            <><BadgePercent size={12} /> Var. Utilidad (%)</>
                                                        ) : (
                                                            <><DollarSign size={12} /> Precio Fijo ($)</>
                                                        )}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>
                                                    <button 
                                                        onClick={async () => {
                                                            if (confirm(`¿Eliminar la campaña "${c.name}"? Esta acción removerá las reglas de precio asociadas.`)) {
                                                                await supabase.from('commercial_campaigns').delete().eq('id', c.id);
                                                                if (typeof window !== 'undefined' && (window as any).showToast) {
                                                                    (window as any).showToast('Campaña eliminada con éxito', 'info');
                                                                }
                                                                fetchCampaigns();
                                                            }
                                                        }}
                                                        title="Eliminar campaña"
                                                        style={{ 
                                                            background: 'none', 
                                                            border: 'none', 
                                                            color: '#94A3B8', 
                                                            cursor: 'pointer', 
                                                            padding: '0.4rem',
                                                            borderRadius: '6px',
                                                            transition: 'all 0.15s'
                                                        }}
                                                        onMouseEnter={e => e.currentTarget.style.color = '#DC2626'}
                                                        onMouseLeave={e => e.currentTarget.style.color = '#94A3B8'}
                                                    >
                                                        <Trash2 size={16} />
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
            </div>

            {/* CREATE CAMPAIGN MODAL */}
            {isCreating && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(6px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div style={{ backgroundColor: 'white', width: '100%', maxWidth: step === 1 ? '680px' : '1060px', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', transition: 'max-width 0.25s' }}>
                        
                        {/* MODAL HEADER */}
                        <div style={{ padding: '1.25rem 1.75rem', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FAFAFA' }}>
                            <div>
                                <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#0D7A57', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    Paso {step} de 2
                                </div>
                                <h2 style={{ fontSize: '1.25rem', fontWeight: '900', color: '#0F172A', margin: '2px 0 0 0' }}>
                                    {step === 1 ? '1. Configuración de la Estrategia' : '2. Alcance (Clientes y Productos)'}
                                </h2>
                            </div>
                            <button 
                                onClick={() => setIsCreating(false)} 
                                style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: '4px', borderRadius: '6px' }}
                                onMouseEnter={e => e.currentTarget.style.color = '#0F172A'}
                                onMouseLeave={e => e.currentTarget.style.color = '#94A3B8'}
                            >
                                <X size={20} />
                            </button>
                        </div>
                        
                        {/* MODAL BODY */}
                        <div style={{ padding: '1.75rem', maxHeight: '72vh', overflowY: 'auto' }}>
                            {step === 1 ? (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#334155', marginBottom: '0.4rem' }}>
                                            Nombre de la Estrategia *
                                        </label>
                                        <input 
                                            ref={nameInputRef}
                                            placeholder="Ej: Oferta Flash Papa Sabanera Cosecha Norte" 
                                            value={name} 
                                            onChange={e => setName(e.target.value)}
                                            style={{ width: '100%', padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid #CBD5E1', fontSize: '0.95rem', fontWeight: '600', color: '#0F172A', outline: 'none' }} 
                                            onFocus={e => e.target.style.borderColor = '#0D7A57'}
                                            onBlur={e => e.target.style.borderColor = '#CBD5E1'}
                                        />
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#334155', marginBottom: '0.4rem' }}>
                                                Válida Desde (Fecha Inicial) *
                                            </label>
                                            <input 
                                                type="date" 
                                                value={startDate} 
                                                onChange={e => setStartDate(e.target.value)} 
                                                style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '12px', border: '1px solid #CBD5E1', fontSize: '0.9rem', fontWeight: '700', color: '#0F172A', outline: 'none' }} 
                                                onFocus={e => e.target.style.borderColor = '#0D7A57'}
                                                onBlur={e => e.target.style.borderColor = '#CBD5E1'}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#334155', marginBottom: '0.4rem' }}>
                                                Válida Hasta (Fecha Final) *
                                            </label>
                                            <input 
                                                type="date" 
                                                value={endDate} 
                                                onChange={e => setEndDate(e.target.value)} 
                                                style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '12px', border: '1px solid #CBD5E1', fontSize: '0.9rem', fontWeight: '700', color: '#0F172A', outline: 'none' }} 
                                                onFocus={e => e.target.style.borderColor = '#0D7A57'}
                                                onBlur={e => e.target.style.borderColor = '#CBD5E1'}
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#334155', marginBottom: '0.5rem' }}>
                                            Modalidad de Influencia en el Precio
                                        </label>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                            <button 
                                                type="button"
                                                onClick={() => setType('margin_adjustment')}
                                                style={{ 
                                                    padding: '1rem', 
                                                    borderRadius: '12px', 
                                                    border: type === 'margin_adjustment' ? '2px solid #0D7A57' : '1px solid #CBD5E1', 
                                                    backgroundColor: type === 'margin_adjustment' ? '#ECFDF5' : 'white', 
                                                    fontWeight: '800', 
                                                    color: type === 'margin_adjustment' ? '#065F46' : '#64748B', 
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    textAlign: 'center',
                                                    transition: 'all 0.15s'
                                                }}
                                            >
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.92rem' }}>
                                                    <BadgePercent size={18} /> Variar Utilidad (%)
                                                </span>
                                                <span style={{ fontSize: '0.72rem', fontWeight: '500', color: type === 'margin_adjustment' ? '#047857' : '#94A3B8' }}>
                                                    Suma o resta % sobre precio base (ej: -10%)
                                                </span>
                                            </button>

                                            <button 
                                                type="button"
                                                onClick={() => setType('fixed_price')}
                                                style={{ 
                                                    padding: '1rem', 
                                                    borderRadius: '12px', 
                                                    border: type === 'fixed_price' ? '2px solid #0D7A57' : '1px solid #CBD5E1', 
                                                    backgroundColor: type === 'fixed_price' ? '#ECFDF5' : 'white', 
                                                    fontWeight: '800', 
                                                    color: type === 'fixed_price' ? '#065F46' : '#64748B', 
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    textAlign: 'center',
                                                    transition: 'all 0.15s'
                                                }}
                                            >
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.92rem' }}>
                                                    <DollarSign size={18} /> Precio Fijo Neto ($)
                                                </span>
                                                <span style={{ fontSize: '0.72rem', fontWeight: '500', color: type === 'fixed_price' ? '#047857' : '#94A3B8' }}>
                                                    Fija un precio final cerrado en pesos
                                                </span>
                                            </button>
                                        </div>
                                    </div>

                                    <div style={{ backgroundColor: '#F8FAFC', padding: '1rem 1.25rem', borderRadius: '12px', border: '1px solid #E2E8F0', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                        <AlertCircle size={18} style={{ color: '#0D7A57', flexShrink: 0, marginTop: '2px' }} />
                                        <p style={{ margin: 0, color: '#475569', fontSize: '0.82rem', lineHeight: '1.5' }}>
                                            Esta campaña se aplicará <b>únicamente a los clientes institucionales que selecciones en el siguiente paso</b>. No afectará a la tienda pública ni a los contratos que no estén vinculados.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
                                    {/* CLIENT SELECTION */}
                                    <div>
                                        <div style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <label style={{ fontSize: '0.9rem', fontWeight: '900', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Users size={16} style={{ color: '#0D7A57' }} /> Clientes Destinatarios ({selectedClients.length} de {availableClients.length})
                                            </label>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button 
                                                    type="button"
                                                    onClick={() => setSelectedClients(availableClients.map(c => c.id))} 
                                                    style={{ fontSize: '0.72rem', fontWeight: '800', color: '#0D7A57', background: 'none', border: 'none', cursor: 'pointer' }}
                                                >
                                                    Todos
                                                </button>
                                                <span style={{ color: '#CBD5E1' }}>|</span>
                                                <button 
                                                    type="button"
                                                    onClick={() => setSelectedClients([])} 
                                                    style={{ fontSize: '0.72rem', fontWeight: '800', color: '#64748B', background: 'none', border: 'none', cursor: 'pointer' }}
                                                >
                                                    Limpiar
                                                </button>
                                            </div>
                                        </div>
                                        
                                        <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
                                            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                                            <input 
                                                placeholder="Buscar por nombre o NIT..." 
                                                value={searchClient}
                                                onChange={e => setSearchClient(e.target.value)}
                                                style={{ width: '100%', padding: '0.7rem 0.8rem 0.7rem 2.3rem', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
                                            />
                                        </div>
                                        
                                        <div style={{ maxHeight: '340px', overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '0.4rem', backgroundColor: '#FAFAFA' }}>
                                            {filteredClients.length === 0 ? (
                                                <div style={{ padding: '2rem', textAlign: 'center', color: '#94A3B8', fontSize: '0.82rem' }}>
                                                    No se encontraron clientes B2B.
                                                </div>
                                            ) : (
                                                filteredClients.map(c => {
                                                    const isSelected = selectedClients.includes(c.id);
                                                    return (
                                                        <div 
                                                            key={c.id} 
                                                            onClick={() => {
                                                                if (isSelected) {
                                                                    setSelectedClients(selectedClients.filter(id => id !== c.id));
                                                                } else {
                                                                    setSelectedClients([...selectedClients, c.id]);
                                                                }
                                                            }}
                                                            style={{ 
                                                                padding: '0.65rem 0.75rem', 
                                                                borderRadius: '8px', 
                                                                cursor: 'pointer', 
                                                                backgroundColor: isSelected ? '#ECFDF5' : 'white',
                                                                border: `1px solid ${isSelected ? '#A7F3D0' : '#E2E8F0'}`,
                                                                display: 'flex', 
                                                                alignItems: 'center', 
                                                                gap: '10px', 
                                                                marginBottom: '4px',
                                                                transition: 'all 0.15s'
                                                            }}
                                                        >
                                                            <div style={{ 
                                                                width: '18px', 
                                                                height: '18px', 
                                                                borderRadius: '4px', 
                                                                border: `2px solid ${isSelected ? '#0D7A57' : '#CBD5E1'}`, 
                                                                backgroundColor: isSelected ? '#0D7A57' : 'transparent', 
                                                                display: 'flex', 
                                                                alignItems: 'center', 
                                                                justifyContent: 'center',
                                                                color: 'white',
                                                                flexShrink: 0
                                                            }}>
                                                                {isSelected && <Check size={13} strokeWidth={3} />}
                                                            </div>
                                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                                <div style={{ fontWeight: '700', fontSize: '0.85rem', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                    {c.company_name || c.contact_name || 'Sin nombre'}
                                                                </div>
                                                                <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                                                    NIT: {c.nit || 'S/N'}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>

                                    {/* PRODUCT SELECTION */}
                                    <div>
                                        <div style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <label style={{ fontSize: '0.9rem', fontWeight: '900', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Package size={16} style={{ color: '#0D7A57' }} /> SKUs en Promoción ({selectedItems.length})
                                            </label>
                                        </div>
                                        
                                        <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
                                            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                                            <input 
                                                placeholder="Buscar producto por nombre o SKU..." 
                                                value={searchProduct}
                                                onChange={e => setSearchProduct(e.target.value)}
                                                style={{ width: '100%', padding: '0.7rem 0.8rem 0.7rem 2.3rem', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
                                            />
                                        </div>
                                        
                                        <div style={{ maxHeight: '340px', overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '0.4rem', backgroundColor: '#FAFAFA' }}>
                                            {filteredProducts.length === 0 ? (
                                                <div style={{ padding: '2rem', textAlign: 'center', color: '#94A3B8', fontSize: '0.82rem' }}>
                                                    No se encontraron productos activos.
                                                </div>
                                            ) : (
                                                filteredProducts.map(p => {
                                                    const currentItem = selectedItems.find(i => i.product_id === p.id);
                                                    const isConfigured = !!currentItem;
                                                    return (
                                                        <div 
                                                            key={p.id} 
                                                            style={{ 
                                                                padding: '0.75rem', 
                                                                borderRadius: '10px', 
                                                                border: `1px solid ${isConfigured ? '#A7F3D0' : '#E2E8F0'}`, 
                                                                marginBottom: '6px', 
                                                                backgroundColor: isConfigured ? '#ECFDF5' : 'white',
                                                                transition: 'all 0.15s'
                                                            }}
                                                        >
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
                                                                <div>
                                                                    <div style={{ fontWeight: '800', fontSize: '0.85rem', color: '#0F172A' }}>{p.name}</div>
                                                                    <div style={{ fontSize: '0.72rem', color: '#64748B' }}>SKU: {p.sku || 'N/A'} • {p.category || 'General'}</div>
                                                                </div>
                                                                {p.base_price && (
                                                                    <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#0D7A57' }}>
                                                                        Ref: ${Math.round(p.base_price).toLocaleString()}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <div style={{ flex: 1, position: 'relative' }}>
                                                                    <input 
                                                                        type="number"
                                                                        placeholder={type === 'margin_adjustment' ? 'Utilidad (ej: -10 para 10% desc.)' : 'Precio Neto Fijo en $'}
                                                                        value={currentItem?.value !== undefined ? currentItem.value : ''}
                                                                        onFocus={e => e.target.select()}
                                                                        onChange={e => {
                                                                            const val = e.target.value === '' ? '' : parseFloat(e.target.value);
                                                                            const rest = selectedItems.filter(i => i.product_id !== p.id);
                                                                            if (val === '') {
                                                                                setSelectedItems(rest);
                                                                            } else {
                                                                                setSelectedItems([...rest, { product_id: p.id, value: val }]);
                                                                            }
                                                                        }}
                                                                        style={{ 
                                                                            width: '100%', 
                                                                            padding: '0.55rem 2rem 0.55rem 0.65rem', 
                                                                            borderRadius: '8px', 
                                                                            border: isConfigured ? '1.5px solid #0D7A57' : '1px solid #CBD5E1', 
                                                                            fontWeight: '700', 
                                                                            fontSize: '0.85rem',
                                                                            color: '#0F172A',
                                                                            backgroundColor: 'white'
                                                                        }}
                                                                    />
                                                                    <span style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', fontWeight: '800', color: isConfigured ? '#0D7A57' : '#94A3B8', fontSize: '0.78rem' }}>
                                                                        {type === 'margin_adjustment' ? '%' : '$'}
                                                                    </span>
                                                                </div>
                                                                {isConfigured && (
                                                                    <button 
                                                                        type="button"
                                                                        onClick={() => setSelectedItems(selectedItems.filter(i => i.product_id !== p.id))}
                                                                        title="Quitar de campaña"
                                                                        style={{ color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
                                                                    >
                                                                        <X size={16} />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* MODAL FOOTER */}
                        <div style={{ padding: '1.25rem 1.75rem', backgroundColor: '#F8FAFC', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                            {step === 1 ? (
                                <>
                                    <button 
                                        type="button"
                                        onClick={() => setIsCreating(false)} 
                                        style={{ padding: '0.75rem 1.25rem', border: '1px solid #CBD5E1', backgroundColor: 'white', borderRadius: '12px', fontWeight: '700', color: '#64748B', cursor: 'pointer', fontSize: '0.85rem' }}
                                    >
                                        Cancelar
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => setStep(2)} 
                                        disabled={!name || !startDate || !endDate}
                                        style={{ 
                                            padding: '0.75rem 1.75rem', 
                                            backgroundColor: '#0D7A57', 
                                            color: 'white', 
                                            border: 'none', 
                                            borderRadius: '12px', 
                                            fontWeight: '800', 
                                            fontSize: '0.85rem',
                                            cursor: 'pointer', 
                                            opacity: (!name || !startDate || !endDate) ? 0.5 : 1,
                                            boxShadow: '0 4px 12px rgba(13, 122, 87, 0.2)'
                                        }}
                                    >
                                        Siguiente (Alcance) →
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button 
                                        type="button"
                                        onClick={() => setStep(1)} 
                                        style={{ padding: '0.75rem 1.25rem', border: '1px solid #CBD5E1', backgroundColor: 'white', borderRadius: '12px', fontWeight: '700', color: '#64748B', cursor: 'pointer', fontSize: '0.85rem' }}
                                    >
                                        ← Atrás
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={saveCampaign}
                                        disabled={isSaving || selectedClients.length === 0 || selectedItems.length === 0}
                                        style={{ 
                                            padding: '0.75rem 2rem', 
                                            backgroundColor: '#0D7A57', 
                                            color: 'white', 
                                            border: 'none', 
                                            borderRadius: '12px', 
                                            fontWeight: '800', 
                                            fontSize: '0.85rem',
                                            cursor: 'pointer', 
                                            boxShadow: '0 4px 12px rgba(13, 122, 87, 0.25)', 
                                            opacity: (isSaving || selectedClients.length === 0 || selectedItems.length === 0) ? 0.5 : 1,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px'
                                        }}
                                    >
                                        <Sparkles size={16} /> {isSaving ? 'Guardando...' : 'Lanzar Campaña'}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
