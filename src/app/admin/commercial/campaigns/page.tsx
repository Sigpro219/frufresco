'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { 
    Plus, 
    Rocket, 
    Users, 
    Package, 
    Calendar, 
    Trash2, 
    ChevronRight, 
    Clock, 
    AlertCircle,
    CheckCircle2,
    X,
    Filter,
    Search
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function CampaignsPage() {
    const [campaigns, setCampaigns] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [step, setStep] = useState(1);
    const [isSaving, setIsSaving] = useState(false);
    
    // Step 1: Basic Info
    const [name, setName] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [type, setType] = useState('margin_adjustment'); // margin_adjustment | fixed_price
    
    // Step 2: Targets & Items
    const [availableClients, setAvailableClients] = useState<any[]>([]);
    const [selectedClients, setSelectedClients] = useState<string[]>([]);
    
    const [availableProducts, setAvailableProducts] = useState<any[]>([]);
    const [selectedItems, setSelectedItems] = useState<any[]>([]); // { product_id, value }
    
    const [searchClient, setSearchClient] = useState('');
    const [searchProduct, setSearchProduct] = useState('');

    useEffect(() => {
        fetchCampaigns();
        fetchDiscoveryData();
    }, []);

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
        const { data: clients } = await supabase
            .from('profiles')
            .select('id, company_name, contact_name, nit')
            .eq('role_id', 'client_institution')
            .order('company_name');
        
        const { data: prods } = await supabase
            .from('products')
            .select('id, name, sku, base_price')
            .eq('active', true)
            .order('name');

        setAvailableClients(clients || []);
        setAvailableProducts(prods || []);
    };

    const saveCampaign = async () => {
        if (!name || !startDate || !endDate || selectedClients.length === 0 || selectedItems.length === 0) {
            alert('Por favor complete todos los campos, seleccione al menos un cliente y un producto.');
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

            alert('✅ Campaña creada y activada exitosamente.');
            setIsCreating(false);
            setStep(1);
            resetForm();
            fetchCampaigns();

        } catch (err: any) {
            console.error('Error saving campaign:', err);
            alert('Error al guardar: ' + err.message);
        } finally {
            setIsSaving(false);
        }
    };

    const resetForm = () => {
        setName('');
        setStartDate('');
        setEndDate('');
        setSelectedClients([]);
        setSelectedItems([]);
        setStep(1);
    };

    const getStatusStyle = (start: string, end: string) => {
        const now = new Date();
        const s = new Date(start);
        const e = new Date(end);

        if (now < s) return { label: 'Programada', color: '#6366F1', bg: '#EEF2FF', icon: <Clock size={14} /> };
        if (now > e) return { label: 'Finalizada', color: '#94A3B8', bg: '#F1F5F9', icon: <CheckCircle2 size={14} /> };
        return { label: 'Activa', color: '#10B981', bg: '#ECFDF5', icon: <Rocket size={14} /> };
    };

    const filteredClients = availableClients.filter(c => 
        c.company_name?.toLowerCase().includes(searchClient.toLowerCase()) || 
        c.nit?.includes(searchClient)
    );

    const filteredProducts = availableProducts.filter(p => 
        p.name?.toLowerCase().includes(searchProduct.toLowerCase()) || 
        p.sku?.toLowerCase().includes(searchProduct.toLowerCase())
    );

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', fontFamily: 'Inter, sans-serif' }}>
            <Navbar />
            
            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
                {/* HEADER */}
                <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div>
                        <div style={{ marginBottom: '0.5rem' }}>
                            <Link href="/admin/commercial" style={{ textDecoration: 'none', color: '#64748B', fontWeight: '700', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                ← Volver al Dashboard
                            </Link>
                        </div>
                        <h1 style={{ fontSize: '2.5rem', fontWeight: '950', color: '#0F172A', margin: 0, letterSpacing: '-1.5px' }}>
                            Campañas Temporales
                        </h1>
                        <p style={{ color: '#64748B', fontSize: '1.1rem', marginTop: '0.3rem' }}>
                            Gestiona estrategias de precios por tiempo limitado para clientes con contrato.
                        </p>
                    </div>
                    <button 
                        onClick={() => {
                            resetForm();
                            setIsCreating(true);
                        }}
                        style={{ 
                            padding: '0.8rem 1.5rem', 
                            backgroundColor: '#C2410C', 
                            color: 'white', 
                            border: 'none', 
                            borderRadius: '14px', 
                            fontWeight: '800', 
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.6rem',
                            boxShadow: '0 10px 15px -3px rgba(194, 65, 12, 0.2)',
                            transition: 'all 0.2s'
                        }}
                    >
                        <Plus size={20} /> Nueva Campaña
                    </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
                    {/* CAMPAIGNS LIST */}
                    <div style={{ backgroundColor: 'white', borderRadius: '24px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                        <div style={{ padding: '1.5rem', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: '800', margin: 0, color: '#1E293B' }}>Historial de Estrategias</h2>
                            <button onClick={fetchCampaigns} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer' }}><Filter size={16} /></button>
                        </div>

                        {loading ? (
                            <div style={{ padding: '4rem', textAlign: 'center', color: '#94A3B8' }}>Cargando campañas...</div>
                        ) : campaigns.length === 0 ? (
                            <div style={{ padding: '5rem', textAlign: 'center' }}>
                                <div style={{ fontSize: '3rem', marginBottom: '1.5rem' }}>🚀</div>
                                <h3 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#1E293B', marginBottom: '0.5rem' }}>Sin campañas activas</h3>
                                <p style={{ color: '#64748B', maxWidth: '400px', margin: '0 auto' }}> Crea tu primera campaña temporal para incentivar la compra o ajustar la utilidad por periodos de cosecha.</p>
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #F1F5F9' }}>
                                            <th style={{ padding: '1.2rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase' }}>Nombre / Vigencia</th>
                                            <th style={{ padding: '1.2rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase' }}>Estado</th>
                                            <th style={{ padding: '1.2rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase' }}>Alcance</th>
                                            <th style={{ padding: '1.2rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase' }}>Ajuste</th>
                                            <th style={{ padding: '1.2rem', textAlign: 'right' }}>Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {campaigns.map(c => {
                                            const status = getStatusStyle(c.start_date, c.end_date);
                                            return (
                                                <tr key={c.id} style={{ borderBottom: '1px solid #F1F5F9', transition: 'background 0.2s' }}>
                                                    <td style={{ padding: '1.2rem' }}>
                                                        <div style={{ fontWeight: '800', color: '#0F172A', fontSize: '1rem' }}>{c.name}</div>
                                                        <div style={{ fontSize: '0.8rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                                                            <Calendar size={12} />
                                                            {format(new Date(c.start_date), 'dd MMM', { locale: es })} - {format(new Date(c.end_date), 'dd MMM yyyy', { locale: es })}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '1.2rem' }}>
                                                        <span style={{ 
                                                            padding: '0.4rem 0.8rem', 
                                                            borderRadius: '99px', 
                                                            fontSize: '0.75rem', 
                                                            fontWeight: '800', 
                                                            backgroundColor: status.bg, 
                                                            color: status.color,
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '6px'
                                                        }}>
                                                            {status.icon} {status.label}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '1.2rem' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', fontWeight: '700', color: '#475569' }}>
                                                                <Users size={14} /> {c.campaign_targets?.length || 0}
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', fontWeight: '700', color: '#475569' }}>
                                                                <Package size={14} /> {c.campaign_items?.length || 0}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '1.2rem' }}>
                                                        <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#0F172A' }}>
                                                            {c.type === 'margin_adjustment' ? 'Var. Utilidad' : 'Precio Fijo'}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '1.2rem', textAlign: 'right' }}>
                                                        <button 
                                                            onClick={async () => {
                                                                if (confirm('¿Eliminar esta campaña?')) {
                                                                    await supabase.from('commercial_campaigns').delete().eq('id', c.id);
                                                                    fetchCampaigns();
                                                                }
                                                            }}
                                                            style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: '0.5rem' }}
                                                        >
                                                            <Trash2 size={18} />
                                                        </button>
                                                        <button style={{ background: 'none', border: 'none', color: '#0891B2', cursor: 'pointer', padding: '0.5rem' }}>
                                                            <ChevronRight size={20} />
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
            </div>

            {/* CREATE MODAL */}
            {isCreating && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(10px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div style={{ backgroundColor: 'white', width: '100%', maxWidth: step === 1 ? '700px' : '1100px', borderRadius: '32px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', transition: 'max-width 0.3s' }}>
                        <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h2 style={{ fontSize: '1.4rem', fontWeight: '900', color: '#0F172A', margin: 0 }}>
                                    {step === 1 ? '1. Configuración de Campaña' : '2. Selección de Alcance'}
                                </h2>
                            </div>
                            <button onClick={() => setIsCreating(false)} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}><X size={24} /></button>
                        </div>
                        
                        <div style={{ padding: '2rem', maxHeight: '75vh', overflowY: 'auto' }}>
                            {step === 1 ? (
                                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '2rem' }}>
                                    <div>
                                        <div style={{ marginBottom: '1.5rem' }}>
                                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '800', color: '#475569', marginBottom: '0.5rem' }}>Nombre de la Estrategia</label>
                                            <input 
                                                placeholder="Ej: Promo Papa Sabanera Abril" 
                                                value={name} 
                                                onChange={e => setName(e.target.value)}
                                                style={{ width: '100%', padding: '1rem', borderRadius: '14px', border: '1px solid #E2E8F0', fontSize: '1.1rem', fontWeight: '600' }} 
                                            />
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '800', color: '#475569', marginBottom: '0.5rem' }}>Válida Desde</label>
                                                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ width: '100%', padding: '1rem', borderRadius: '14px', border: '1px solid #E2E8F0', fontSize: '1rem', fontWeight: '700' }} />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '800', color: '#475569', marginBottom: '0.5rem' }}>Válida Hasta</label>
                                                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ width: '100%', padding: '1rem', borderRadius: '14px', border: '1px solid #E2E8F0', fontSize: '1rem', fontWeight: '700' }} />
                                            </div>
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '800', color: '#475569', marginBottom: '0.5rem' }}>Influencia en el Precio</label>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                <button 
                                                    onClick={() => setType('margin_adjustment')}
                                                    style={{ padding: '1rem', borderRadius: '14px', border: type === 'margin_adjustment' ? '2.5px solid #C2410C' : '1px solid #E2E8F0', backgroundColor: type === 'margin_adjustment' ? '#FFF7ED' : 'white', fontWeight: '800', color: type === 'margin_adjustment' ? '#C2410C' : '#64748B', cursor: 'pointer' }}
                                                >Variar Utilidad (%)</button>
                                                <button 
                                                    onClick={() => setType('fixed_price')}
                                                    style={{ padding: '1rem', borderRadius: '14px', border: type === 'fixed_price' ? '2.5px solid #C2410C' : '1px solid #E2E8F0', backgroundColor: type === 'fixed_price' ? '#FFF7ED' : 'white', fontWeight: '800', color: type === 'fixed_price' ? '#C2410C' : '#64748B', cursor: 'pointer' }}
                                                >Precio Fijo ($)</button>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ backgroundColor: '#F8FAFC', padding: '1.5rem', borderRadius: '24px', border: '1px solid #E2E8F0' }}>
                                        <AlertCircle size={20} color="#C2410C" style={{ marginBottom: '1rem' }} />
                                        <p style={{ margin: 0, color: '#475569', fontSize: '0.9rem', lineHeight: '1.6' }}>
                                            Esta campaña se aplicará <b>automáticamente</b> a los clientes institucionales seleccionados. No afectará a la landing page pública ni a los clientes B2C.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem' }}>
                                    {/* CLIENT SELECTION */}
                                    <div>
                                        <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <label style={{ fontSize: '1rem', fontWeight: '900', color: '#1E293B' }}>👥 Clientes ({selectedClients.length})</label>
                                            <button onClick={() => setSelectedClients(availableClients.map(c => c.id))} style={{ fontSize: '0.75rem', fontWeight: '800', color: '#0891B2', background: 'none', border: 'none', cursor: 'pointer' }}>Seleccionar Todos</button>
                                        </div>
                                        <div style={{ position: 'relative', marginBottom: '1rem' }}>
                                            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                                            <input 
                                                placeholder="Buscar cliente institucional..." 
                                                value={searchClient}
                                                onChange={e => setSearchClient(e.target.value)}
                                                style={{ width: '100%', padding: '0.8rem 0.8rem 0.8rem 2.5rem', borderRadius: '12px', border: '1px solid #E2E8F0' }}
                                            />
                                        </div>
                                        <div style={{ maxHeight: '350px', overflowY: 'auto', border: '1px solid #F1F5F9', borderRadius: '16px', padding: '0.5rem' }}>
                                            {filteredClients.map(c => (
                                                <div 
                                                    key={c.id} 
                                                    onClick={() => {
                                                        if (selectedClients.includes(c.id)) {
                                                            setSelectedClients(selectedClients.filter(id => id !== c.id));
                                                        } else {
                                                            setSelectedClients([...selectedClients, c.id]);
                                                        }
                                                    }}
                                                    style={{ 
                                                        padding: '0.8rem', 
                                                        borderRadius: '10px', 
                                                        cursor: 'pointer',
                                                        backgroundColor: selectedClients.includes(c.id) ? '#F0F9FF' : 'transparent',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '10px',
                                                        marginBottom: '4px'
                                                    }}
                                                >
                                                    <div style={{ width: '18px', height: '18px', borderRadius: '4px', border: '2px solid #0891B2', backgroundColor: selectedClients.includes(c.id) ? '#0891B2' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        {selectedClients.includes(c.id) && <span style={{ color: 'white', fontSize: '12px' }}>✓</span>}
                                                    </div>
                                                    <div>
                                                        <div style={{ fontWeight: '700', fontSize: '0.9rem' }}>{c.company_name}</div>
                                                        <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>{c.nit}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* PRODUCT SELECTION */}
                                    <div>
                                        <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <label style={{ fontSize: '1rem', fontWeight: '900', color: '#1E293B' }}>📦 Productos ({selectedItems.length})</label>
                                        </div>
                                        <div style={{ position: 'relative', marginBottom: '1rem' }}>
                                            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                                            <input 
                                                placeholder="Buscar producto a ofertar..." 
                                                value={searchProduct}
                                                onChange={e => setSearchProduct(e.target.value)}
                                                style={{ width: '100%', padding: '0.8rem 0.8rem 0.8rem 2.5rem', borderRadius: '12px', border: '1px solid #E2E8F0' }}
                                            />
                                        </div>
                                        <div style={{ maxHeight: '350px', overflowY: 'auto', border: '1px solid #F1F5F9', borderRadius: '16px', padding: '0.5rem' }}>
                                            {filteredProducts.map(p => {
                                                const currentItem = selectedItems.find(i => i.product_id === p.id);
                                                return (
                                                    <div key={p.id} style={{ padding: '0.8rem', borderRadius: '12px', border: '1px solid #F1F5F9', marginBottom: '8px', backgroundColor: currentItem ? '#FFF7ED' : 'transparent' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                            <div style={{ fontWeight: '800', fontSize: '0.9rem' }}>{p.name}</div>
                                                            <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#C2410C' }}>SKU: {p.sku}</div>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                            <div style={{ flex: 1, position: 'relative' }}>
                                                                <input 
                                                                    type="number"
                                                                    placeholder={type === 'margin_adjustment' ? 'Utilidad Ajustada %' : 'Precio Fijo $'}
                                                                    value={currentItem?.value || ''}
                                                                    onChange={e => {
                                                                        const val = parseFloat(e.target.value) || 0;
                                                                        const rest = selectedItems.filter(i => i.product_id !== p.id);
                                                                        if (e.target.value === '') {
                                                                            setSelectedItems(rest);
                                                                        } else {
                                                                            setSelectedItems([...rest, { product_id: p.id, value: val }]);
                                                                        }
                                                                    }}
                                                                    style={{ width: '100%', padding: '0.6rem 2rem 0.6rem 0.6rem', borderRadius: '8px', border: currentItem ? '2px solid #C2410C' : '1px solid #E2E8F0', fontWeight: '700' }}
                                                                />
                                                                <span style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', fontWeight: '800', color: '#94A3B8' }}>
                                                                    {type === 'margin_adjustment' ? '%' : '$'}
                                                                </span>
                                                            </div>
                                                            {currentItem && (
                                                                <button 
                                                                    onClick={() => setSelectedItems(selectedItems.filter(i => i.product_id !== p.id))}
                                                                    style={{ color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer' }}
                                                                >
                                                                    <X size={18} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div style={{ padding: '1.5rem 2rem', backgroundColor: '#F8FAFC', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                            {step === 1 ? (
                                <button 
                                    onClick={() => setStep(2)} 
                                    disabled={!name || !startDate || !endDate}
                                    style={{ padding: '0.8rem 2.5rem', backgroundColor: '#111827', color: 'white', border: 'none', borderRadius: '14px', fontWeight: '900', cursor: 'pointer', opacity: (!name || !startDate || !endDate) ? 0.5 : 1 }}
                                >
                                    Siguiente →
                                </button>
                            ) : (
                                <>
                                    <button onClick={() => setStep(1)} style={{ padding: '0.8rem 1.5rem', border: '1px solid #D1D5DB', backgroundColor: 'white', borderRadius: '14px', fontWeight: '800', color: '#64748B', cursor: 'pointer' }}>Atrás</button>
                                    <button 
                                        onClick={saveCampaign}
                                        disabled={isSaving || selectedClients.length === 0 || selectedItems.length === 0}
                                        style={{ padding: '0.8rem 2.5rem', backgroundColor: '#C2410C', color: 'white', border: 'none', borderRadius: '14px', fontWeight: '900', cursor: 'pointer', boxShadow: '0 4px 12px rgba(194, 65, 12, 0.25)', opacity: (isSaving || selectedClients.length === 0 || selectedItems.length === 0) ? 0.5 : 1 }}
                                    >
                                        {isSaving ? 'Guardando...' : 'Lanzar Campaña 🚀'}
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

