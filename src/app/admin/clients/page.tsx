'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import ClientsModule from '@/components/ClientsModule';
import Toast from '@/components/Toast';
import { THEME, formatMoney, formatNumber } from '@/lib/adminTheme';
import { 
    BarChart3, 
    Building2, 
    Network, 
    Home, 
    Zap, 
    Search, 
    ClipboardList, 
    Contact, 
    Plus, 
    Package, 
    Phone, 
    Mail, 
    MapPin, 
    AlertTriangle,
    MessageCircle,
    User,
    Check,
    ChevronDown,
    X,
    FileText,
    Settings,
    HelpCircle,
    ArrowUpRight,
    Trophy,
    Loader2
} from 'lucide-react';

declare global {
    interface Window {
        showToast?: (message: string, type: 'success' | 'error' | 'info') => void;
    }
}

interface Profile {
    id: string;
    company_name?: string;
    razon_social?: string;
    nit?: string;
    contact_name?: string;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    municipality?: string;
    department?: string;
    role: string;
    pricing_model_id?: string;
    credit_limit?: number;
    payment_terms?: string;
    delivery_restrictions?: string;
    latitude?: number;
    longitude?: number;
    geocoding_status?: string;
    total_orders?: number;
    total_spent?: number;
    last_order?: string;
    parent_id?: string;
    is_corporate_parent?: boolean;
    billing_nit?: string;
    billing_razon_social?: string;
    created_at: string;
}

interface Lead {
    id: string;
    company_name?: string;
    contact_name: string;
    phone: string;
    email?: string;
    status: string;
    notes?: string;
    address?: string;
    business_type?: string;
    business_size?: string;
    latitude?: number;
    longitude?: number;
    last_contact_date?: string;
    next_contact_date?: string;
    contact_count?: number;
    created_at: string;
}

interface PricingModel {
    id: string;
    name: string;
    base_margin_percent: number;
    description?: string;
}

interface Order {
    id: string;
    total: number;
    is_b2b: boolean;
}

export default function AdminClientsPage() {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [clientsB2B, setClientsB2B] = useState<Profile[]>([]);
    const [clientsB2C, setClientsB2C] = useState<Profile[]>([]);
    const [leads, setLeads] = useState<Lead[]>([]);
    const [pricingModels, setPricingModels] = useState<PricingModel[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedClient, setSelectedClient] = useState<Profile | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<Partial<Profile> | null>(null);
    const [editTargetLead, setEditTargetLead] = useState<Lead | null>(null);
    const [isInfoGuideOpen, setIsInfoGuideOpen] = useState(false);
    const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Clientes B2B (Profiles) - Traemos TODO para filtrar luego o mostrar padres
            const { data: b2bData } = await supabase
                .from('profiles')
                .select('*')
                .eq('role', 'b2b_client')
                .order('company_name', { ascending: true });

            // 2. Leads (Prospectos)
            const { data: leadData } = await supabase
                .from('leads')
                .select('*')
                .order('created_at', { ascending: false });

            // 3. Modelos de Precios
            const { data: pmData } = await supabase
                .from('pricing_models')
                .select('*')
                .order('name', { ascending: true });

            // 4. Clientes B2C (Profiles)
            const { data: b2cData } = await supabase
                .from('profiles')
                .select('*')
                .eq('role', 'b2c_client')
                .order('created_at', { ascending: false });
            
            // 5. Órdenes para ventas
            const { data: orderData } = await supabase
                .from('orders')
                .select('id, total, is_b2b');
            
            setClientsB2B(b2bData || []);
            setLeads(leadData || []);
            setPricingModels(pmData || []);
            setClientsB2C(b2cData || []);
            setOrders(orderData || []);
        } catch (error) {
            console.error('Error fetching client data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateLeadStatus = async (id: string, newStatus: string) => {
        const { error } = await supabase
            .from('leads')
            .update({ status: newStatus })
            .eq('id', id);

        if (error) {
            window.showToast?.('Error al actualizar lead', 'error');
        } else {
            setLeads(leads.map(l => l.id === id ? { ...l, status: newStatus } : l));
            window.showToast?.('Estado de lead actualizado', 'success');
        }
    };

    const handleUpdatePricingModel = async (clientId: string, modelId: string) => {
        const client = clientsB2B.find(c => c.id === clientId);
        
        // DOBLE CONFIRMACIÓN (Crítica para integridad de datos)
        if (client?.pricing_model_id && modelId !== client.pricing_model_id) {
            const currentModel = pricingModels.find(m => m.id === client.pricing_model_id);
            const newModel = pricingModels.find(m => m.id === modelId);
            
            // Primera confirmación
            const confirm1 = window.confirm(
                `¿Deseas cambiar el modelo de precios de este cliente?\n\n` +
                `Actual: ${currentModel?.name || 'Varios'}\n` +
                `Nuevo: ${newModel?.name || 'Ninguno'}\n\n` +
                `Esta acción afectará los márgenes de las futuras cotizaciones.`
            );
            if (!confirm1) return;

            // Segunda confirmación (Énfasis en la criticidad)
            const confirm2 = window.confirm(
                `⚠️ ATENCIÓN: Esta acción es CRÍTICA.\n\n` +
                `El cambio de modelo re-estructurará cómo se calculan los precios para este cliente. ¿Estás absolutamente seguro de proceder?`
            );
            if (!confirm2) return;
        }

        const { error } = await supabase
            .from('profiles')
            .update({ pricing_model_id: modelId || null })
            .eq('id', clientId);

        if (error) {
            window.showToast?.('Error al actualizar el modelo', 'error');
        } else {
            setClientsB2B(clientsB2B.map(c => c.id === clientId ? { ...c, pricing_model_id: modelId } : c));
            window.showToast?.('Modelo de precios actualizado', 'success');
        }
    };

    const handleUpdateLeadContact = async (id: string, contactMade: boolean = true) => {
        const lead = leads.find(l => l.id === id);
        if (!lead) return;

        const { error } = await supabase
            .from('leads')
            .update({ 
                last_contact_date: new Date().toISOString(),
                contact_count: (lead.contact_count || 0) + (contactMade ? 1 : 0),
                status: lead.status === 'new' ? 'contacted' : lead.status
            })
            .eq('id', id);

        if (error) {
            window.showToast?.('Error al registrar contacto', 'error');
        } else {
            setLeads(leads.map(l => l.id === id ? { 
                ...l, 
                last_contact_date: new Date().toISOString(),
                contact_count: (l.contact_count || 0) + (contactMade ? 1 : 0),
                status: l.status === 'new' ? 'contacted' : l.status
            } : l));
            window.showToast?.('Contacto registrado con éxito', 'success');
        }
    };

    const handleScheduleLeadTask = async (id: string, date: string) => {
        const { error } = await supabase
            .from('leads')
            .update({ next_contact_date: date })
            .eq('id', id);

        if (error) {
            window.showToast?.('Error al programar tarea', 'error');
        } else {
            setLeads(leads.map(l => l.id === id ? { ...l, next_contact_date: date } : l));
            window.showToast?.('Tarea programada', 'success');
        }
    };

    const handleViewDetails = (client: Profile) => {
        setSelectedClient(client);
        setIsModalOpen(true);
    };

    const handleEditClient = (client: Profile) => {
        setEditTarget(client);
        setIsFormModalOpen(true);
    };

    const handleEditLead = (lead: Lead) => {
        setEditTargetLead(lead);
        setIsLeadModalOpen(true);
    };

    const handleCreateLead = () => {
        setEditTargetLead(null);
        setIsLeadModalOpen(true);
    };

    const handleCreateClient = (role: 'b2b_client' | 'b2c_client' = 'b2b_client') => {
        setEditTarget({ role }); // Send role even if new
        setIsFormModalOpen(true);
    };

    const tabs = [
        { id: 'dashboard', label: 'Resumen', icon: <BarChart3 size={15} strokeWidth={1.5} /> },
        { id: 'b2b', label: 'Institucionales', icon: <Building2 size={15} strokeWidth={1.5} /> },
        { id: 'groups', label: 'Grupos / Padres', icon: <Network size={15} strokeWidth={1.5} /> },
        { id: 'b2c', label: 'Consumidor Final', icon: <Home size={15} strokeWidth={1.5} /> },
        { id: 'leads', label: 'Prospectos', icon: <Zap size={15} strokeWidth={1.5} /> },
    ];

    const filterData = <T extends object>(data: T[], fields: string[]): T[] => {
        if (!searchTerm) return data;
        
        const terms = searchTerm.toLowerCase().split(' ').filter(t => t);
        
        return data.filter(item => {
            const itemObj = item as Record<string, string | number | boolean | null | undefined>;
            
            return terms.every(term => {
                // Etiquetas Especiales
                if (term.startsWith('@')) {
                    const tag = term.slice(1);
                    
                    // Tags para Leads
                    if (tag === 'vencido') return !!itemObj.next_contact_date && new Date(String(itemObj.next_contact_date)) < new Date();
                    if (tag === 'nuevo') return itemObj.status === 'new';
                    if (tag === 'contactado') return itemObj.status === 'contacted';
                    if (tag === 'crm') return itemObj.status !== 'converted' && itemObj.status !== 'rejected';
                    
                    // Tags para Clientes
                    if (tag === 'b2b') return itemObj.role === 'b2b_client';
                    if (tag === 'b2c') return itemObj.role === 'b2c_client';
                    if (tag === 'geo') return !!(itemObj.latitude && itemObj.longitude);
                    if (tag === 'sin_geo') return !(itemObj.latitude && itemObj.longitude);
                    
                    // Filtro por ciudad/zona
                    if (tag.length > 2) {
                        const locationStr = `${itemObj.municipality || ''} ${itemObj.city || ''} ${itemObj.department || ''}`.toLowerCase();
                        if (locationStr.includes(tag)) return true;
                    }
                }
                
                // Búsqueda pro texto regular
                return fields.some(field => {
                    const value = itemObj[field];
                    return String(value || '').toLowerCase().includes(term);
                });
            });
        });
    };

    return (
        <main style={{ minHeight: '100vh', backgroundColor: THEME.colors.background }}>
            <Toast />

            {/* MODAL DETALLES */}
            {isModalOpen && selectedClient && (
                <ClientDetailsModal 
                    client={selectedClient} 
                    onClose={() => setIsModalOpen(false)} 
                    pricingModels={pricingModels}
                />
            )}

            {/* MODAL FORMULARIO (NUEVO / EDITAR) */}
            {isFormModalOpen && (
                <ClientFormModal 
                    onClose={() => setIsFormModalOpen(false)} 
                    onRefresh={fetchData}
                    pricingModels={pricingModels}
                    editData={editTarget}
                    availableParents={clientsB2B.filter(c => c.is_corporate_parent && c.id !== editTarget?.id)}
                />
            )}

            {/* MODAL LEAD (NUEVO) */}
            {isLeadModalOpen && (
                <LeadFormModal 
                    onClose={() => setIsLeadModalOpen(false)} 
                    onRefresh={fetchData} 
                />
            )}

            <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '1.2rem 2rem' }}>
                <header style={{ marginBottom: '1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                             <span style={{ backgroundColor: THEME.colors.textMain, color: 'white', padding: '2px 8px', borderRadius: THEME.radius.sm, fontSize: '0.6rem', fontWeight: '700', letterSpacing: '0.05em' }}>CRM & GROWTH</span>
                             <span style={{ color: THEME.colors.textSecondary, fontSize: '0.7rem', fontWeight: '600' }}>/ GESTIÓN PRINCIPAL</span>
                        </div>
                        <h1 style={{ fontSize: '1.8rem', fontWeight: '700', color: THEME.colors.textMain, margin: 0, letterSpacing: '-0.03em', fontFamily: THEME.typography.fontFamilyMain }}>Centro de <span style={{ color: THEME.colors.primary }}>Clientes</span></h1>
                    </div>
                </header>

                {/* UNIFIED CONTROL BAR (SLENDER) */}
                <div style={{ 
                    display: 'flex', 
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem', 
                    marginBottom: '1.5rem', 
                    backgroundColor: THEME.colors.surface, 
                    padding: '4px', 
                    borderRadius: THEME.radius.lg, 
                    boxShadow: THEME.shadow.sm,
                    border: `1px solid ${THEME.colors.border}`
                }}>
                    {/* TABS (LEFT) */}
                    <div style={{ display: 'flex', gap: '2px', backgroundColor: THEME.colors.background, padding: '4px', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}` }}>
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => { setActiveTab(tab.id); setSearchTerm(''); }}
                                style={{
                                    padding: '0.5rem 0.9rem',
                                    border: 'none',
                                    borderRadius: THEME.radius.md,
                                    background: activeTab === tab.id ? THEME.colors.primary : 'transparent',
                                    color: activeTab === tab.id ? 'white' : THEME.colors.textSecondary,
                                    boxShadow: activeTab === tab.id ? '0 1px 4px rgba(13,122,87,0.25)' : 'none',
                                    fontWeight: activeTab === tab.id ? '600' : '500',
                                    fontSize: '0.75rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    transition: 'all 0.15s'
                                }}
                                onMouseEnter={(e) => {
                                    if (activeTab !== tab.id) {
                                        e.currentTarget.style.backgroundColor = THEME.colors.primaryLight;
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (activeTab !== tab.id) {
                                        e.currentTarget.style.backgroundColor = 'transparent';
                                    }
                                }}
                            >
                                {tab.icon}
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* SEARCH & ACTIONS (RIGHT) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {activeTab !== 'dashboard' && (
                            <>
                                <div style={{ position: 'relative', width: '240px' }}>
                                    <span style={{ position: 'absolute', left: '0.7rem', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center' }}>
                                        <Search size={15} strokeWidth={1.5} style={{ color: THEME.colors.textSecondary }} />
                                    </span>
                                    <input 
                                        placeholder={`Buscar...`}
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        style={{ 
                                            width: '100%', 
                                            padding: '0.5rem 1rem 0.5rem 2rem', 
                                            borderRadius: THEME.radius.md, 
                                            border: `1px solid ${THEME.colors.border}`, 
                                            fontSize: '0.8rem',
                                            fontWeight: '600',
                                            outline: 'none',
                                            backgroundColor: THEME.colors.background,
                                            color: THEME.colors.textMain
                                        }}
                                    />
                                </div>

                                <div style={{ height: '24px', width: '1px', backgroundColor: THEME.colors.border, margin: '0 4px' }} />

                                <div style={{ display: 'flex', gap: '4px', backgroundColor: THEME.colors.background, padding: '2px', borderRadius: THEME.radius.md }}>
                                    <button onClick={() => setViewMode('table')} style={{ padding: '0.4rem 0.6rem', border: 'none', borderRadius: '6px', background: viewMode === 'table' ? THEME.colors.surface : 'transparent', fontSize: '0.7rem', fontWeight: '800', cursor: 'pointer', color: viewMode === 'table' ? THEME.colors.textMain : THEME.colors.textSecondary, boxShadow: viewMode === 'table' ? THEME.shadow.sm : 'none', display: 'flex', alignItems: 'center' }}>
                                        <ClipboardList size={14} strokeWidth={1.5} />
                                    </button>
                                    <button onClick={() => setViewMode('cards')} style={{ padding: '0.4rem 0.6rem', border: 'none', borderRadius: '6px', background: viewMode === 'cards' ? THEME.colors.surface : 'transparent', fontSize: '0.7rem', fontWeight: '800', cursor: 'pointer', color: viewMode === 'cards' ? THEME.colors.textMain : THEME.colors.textSecondary, boxShadow: viewMode === 'cards' ? THEME.shadow.sm : 'none', display: 'flex', alignItems: 'center' }}>
                                        <Contact size={14} strokeWidth={1.5} />
                                    </button>
                                </div>

                                <button 
                                    onClick={() => {
                                        if (activeTab === 'leads') handleCreateLead();
                                        else handleCreateClient(activeTab === 'b2c' ? 'b2c_client' : 'b2b_client');
                                    }}
                                    style={{ 
                                        backgroundColor: THEME.colors.primary, 
                                        color: 'white', 
                                        padding: '0.5rem 1rem', 
                                        borderRadius: THEME.radius.md, 
                                        border: 'none', 
                                        fontWeight: '600', 
                                        fontSize: '0.75rem',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        transition: 'background-color 0.2s'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = THEME.colors.primaryHover}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = THEME.colors.primary}
                                >
                                    <Plus size={14} strokeWidth={1.5} /> Crear {activeTab === 'leads' ? 'Prospecto' : 'Cliente'}
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '10rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                            <Loader2 size={64} className="animate-spin" style={{ color: THEME.colors.primary }} />
                        </div>
                        <p style={{ fontWeight: '600', color: THEME.colors.textSecondary, marginTop: '1rem' }}>Sincronizando base de datos...</p>
                    </div>
                ) : (
                    <>
                        {/* DASHBOARD VIEW */}
                        {activeTab === 'dashboard' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
                                {/* Top Row: Main KPIs */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.2rem' }}>
                                    <KPICard title="Clientes B2B" value={clientsB2B.length} icon={<Building2 size={18} strokeWidth={1.5} />} subtitle="Institucionales" />
                                    <KPICard title="Clientes B2C" value={clientsB2C.length} icon={<Home size={18} strokeWidth={1.5} />} subtitle="Consumidores" />
                                    <div onClick={() => { setActiveTab('leads'); setSearchTerm('@vencido'); }} style={{ cursor: 'pointer' }}>
                                        <KPICard 
                                            title="Tareas Críticas" 
                                            value={leads.filter(l => l.status !== 'converted' && l.status !== 'rejected' && l.next_contact_date && new Date(l.next_contact_date) <= new Date()).length} 
                                            icon={<AlertTriangle size={18} strokeWidth={1.5} />} 
                                            subtitle="Prioridad comercial" 
                                        />
                                    </div>
                                    <div onClick={() => { setActiveTab('groups'); setSearchTerm(''); }} style={{ cursor: 'pointer' }}>
                                        <KPICard 
                                            title="Grupos" 
                                            value={clientsB2B.filter(c => c.is_corporate_parent).length} 
                                            icon={<Network size={18} strokeWidth={1.5} />} 
                                            subtitle="Corporativos" 
                                        />
                                    </div>
                                </div>

                                {/* Middle Row: Funnel & Critical Tasks & Sales */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
                                    {/* Funnel Box */}
                                    <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.lg, boxShadow: THEME.shadow.sm, border: `1px solid ${THEME.colors.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: `1px solid ${THEME.colors.border}`, borderLeft: `3px solid ${THEME.colors.primary}`, backgroundColor: THEME.colors.surface }}>
                                            <div>
                                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '600', color: THEME.colors.textMain, fontFamily: THEME.typography.fontFamilyMain, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <BarChart3 size={18} strokeWidth={1.5} style={{ color: THEME.colors.primary }} /> Embudo Comercial
                                                </h3>
                                                <p style={{ margin: '0.1rem 0 0 0', fontSize: '0.8rem', color: THEME.colors.textSecondary, fontWeight: '500' }}>Trayectoria del prospecto</p>
                                            </div>
                                            <div style={{ backgroundColor: THEME.colors.background, padding: '0.4rem 0.8rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, textAlign: 'right' }}>
                                                <div style={{ fontSize: '0.65rem', fontWeight: '600', color: THEME.colors.textSecondary, textTransform: 'uppercase' }}>Items</div>
                                                <div style={{ fontSize: '1rem', fontWeight: '700', color: THEME.colors.textMain }}>{leads.length}</div>
                                            </div>
                                        </div>
                                        <div style={{ padding: '1.5rem' }}>
                                            <FunnelGraphic leads={leads} />
                                        </div>
                                    </div>

                                    {/* Sales Distribution Pie Chart */}
                                    <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.lg, boxShadow: THEME.shadow.sm, border: `1px solid ${THEME.colors.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                        <div style={{ padding: '1.25rem 1.5rem', borderBottom: `1px solid ${THEME.colors.border}`, borderLeft: `3px solid ${THEME.colors.primary}`, backgroundColor: THEME.colors.surface }}>
                                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '600', color: THEME.colors.textMain, fontFamily: THEME.typography.fontFamilyMain, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <BarChart3 size={18} strokeWidth={1.5} style={{ color: THEME.colors.primary }} /> Distribución de Ventas
                                            </h3>
                                            <p style={{ margin: '0.1rem 0 0 0', fontSize: '0.8rem', color: THEME.colors.textSecondary, fontWeight: '500' }}>Balance B2B vs B2C</p>
                                        </div>
                                        <div style={{ padding: '1.5rem', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '140px' }}>
                                            <SalesPieChart 
                                                totalB2B={orders.filter(o => o.is_b2b).reduce((sum, o) => sum + (o.total || 0), 0)}
                                                totalB2C={orders.filter(o => !o.is_b2b).reduce((sum, o) => sum + (o.total || 0), 0)}
                                            />
                                        </div>
                                    </div>

                                    {/* Task Box */}
                                    <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.lg, boxShadow: THEME.shadow.sm, border: `1px solid ${THEME.colors.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: `1px solid ${THEME.colors.border}`, borderLeft: `3px solid ${THEME.colors.primary}`, backgroundColor: THEME.colors.surface }}>
                                            <div>
                                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '600', color: THEME.colors.textMain, fontFamily: THEME.typography.fontFamilyMain, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <AlertTriangle size={18} strokeWidth={1.5} style={{ color: THEME.colors.primary }} /> Alertas de Seguimiento
                                                </h3>
                                                <p style={{ margin: '0.1rem 0 0 0', fontSize: '0.8rem', color: THEME.colors.textSecondary, fontWeight: '500' }}>Tareas críticas pendientes</p>
                                            </div>
                                            <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#EF4444', backgroundColor: '#FEF2F2', padding: '0.4rem 0.8rem', borderRadius: '20px' }}>VENCIDAS</span>
                                        </div>
                                        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.2rem', overflowY: 'auto', maxHeight: '500px' }}>
                                            {leads.filter(l => l.status !== 'converted' && l.status !== 'rejected' && l.next_contact_date && new Date(l.next_contact_date) <= new Date()).length > 0 ? (
                                                leads.filter(l => l.status !== 'converted' && l.status !== 'rejected' && l.next_contact_date && new Date(l.next_contact_date) <= new Date())
                                                    .sort((a, b) => new Date(a.next_contact_date!).getTime() - new Date(b.next_contact_date!).getTime())
                                                    .map(lead => (
                                                        <CriticalLeadRow 
                                                            key={lead.id} 
                                                            lead={lead} 
                                                            onWaitlist={() => {
                                                                setActiveTab('leads');
                                                                setSearchTerm(lead.company_name || lead.contact_name);
                                                            }} 
                                                        />
                                                    ))
                                            ) : (
                                                <div style={{ textAlign: 'center', padding: '2rem 1.5rem', backgroundColor: '#F0FDF4', borderRadius: THEME.radius.lg, border: `2px dashed ${THEME.colors.border}` }}>
                                                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}>
                                                        <Trophy size={32} strokeWidth={1.5} style={{ color: THEME.colors.primary }} />
                                                    </div>
                                                    <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '600', color: THEME.colors.textMain }}>¡Gran trabajo comercial!</h4>
                                                    <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.8rem', color: THEME.colors.textSecondary, fontWeight: '500' }}>No tienes tareas pendientes vencidas en este momento.</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* B2B VIEW */}
                        {activeTab === 'b2b' && (
                            <ListView 
                                data={filterData(clientsB2B, ['company_name', 'razon_social', 'nit', 'contact_name', 'city', 'municipality', 'department', 'address'])}
                                type="b2b"
                                viewMode={viewMode}
                                pricingModels={pricingModels}
                                availableParents={clientsB2B.filter(c => c.is_corporate_parent)}
                                onEdit={handleEditClient}
                                onViewDetails={handleViewDetails}
                                onUpdatePricingModel={handleUpdatePricingModel}
                            />
                        )}

                        {/* B2C VIEW */}
                        {activeTab === 'b2c' && (
                            <ListView 
                                data={filterData(clientsB2C, ['contact_name', 'phone', 'email', 'address', 'municipality', 'department'])}
                                type="b2c"
                                viewMode={viewMode}
                                onEdit={handleEditClient}
                                onViewDetails={handleViewDetails}
                            />
                        )}

                        {/* GROUPS VIEW */}
                        {activeTab === 'groups' && (
                            <ListView 
                                data={filterData(clientsB2B.filter(c => c.is_corporate_parent), ['company_name', 'nit', 'contact_name'])}
                                type="b2b"
                                viewMode={viewMode}
                                pricingModels={pricingModels}
                                availableParents={clientsB2B.filter(c => c.is_corporate_parent)}
                                onEdit={handleEditClient}
                                onViewDetails={handleViewDetails}
                            />
                        )}

                        {/* LEADS VIEW */}
                        {activeTab === 'leads' && (
                            <ListView 
                                data={filterData(leads, ['company_name', 'contact_name', 'phone', 'email', 'notes', 'business_type'])}
                                type="lead"
                                viewMode={viewMode}
                                onEdit={(lead) => handleEditLead(lead as Lead)}
                                onViewDetails={(lead) => handleViewDetails(lead as unknown as Profile)}
                                onUpdateStatus={handleUpdateLeadStatus}
                                onRegisterContact={handleUpdateLeadContact}
                            />
                        )}
                    </>
                )}
            </div>

            {isLeadModalOpen && (
                <LeadFormModal 
                    editData={editTargetLead}
                    onClose={() => {
                        setIsLeadModalOpen(false);
                        setEditTargetLead(null);
                    }} 
                    onRefresh={fetchData} 
                />
            )}
        </main>
    );
}

function KPICard({ title, value, icon, subtitle }: { title: string, value: number | string, icon: React.ReactNode, subtitle: string }) {
    return (
        <div style={{
            backgroundColor: THEME.colors.surface,
            padding: '1.25rem 1.5rem',
            borderRadius: THEME.radius.lg,
            boxShadow: THEME.shadow.sm,
            display: 'flex',
            alignItems: 'center',
            gap: '1.2rem',
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
                <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>
                <div style={{ fontSize: '1.3rem', fontWeight: '700', color: THEME.colors.textMain, margin: '0.1rem 0', lineHeight: 1.2 }}>{value}</div>
                <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, fontWeight: '500' }}>{subtitle}</div>
            </div>
        </div>
    );
}

function SalesPieChart({ totalB2B, totalB2C }: { totalB2B: number, totalB2C: number }) {
    const total = totalB2B + totalB2C;
    const b2bPercent = total > 0 ? (totalB2B / total) * 100 : 0;
    const b2cPercent = total > 0 ? (totalB2C / total) * 100 : 0;

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '2.5rem', width: '100%', justifyContent: 'center' }}>
            <div style={{
                width: '120px',
                height: '120px',
                borderRadius: '50%',
                background: `conic-gradient(${THEME.colors.primary} ${b2bPercent}%, ${THEME.colors.textSecondary} 0)`,
                boxShadow: THEME.shadow.md,
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
            }}>
                <div style={{
                    width: '80px',
                    height: '80px',
                    backgroundColor: THEME.colors.surface,
                    borderRadius: '50%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.05)'
                }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: '600', color: THEME.colors.textSecondary }}>TOTAL</span>
                    <span style={{ fontSize: '0.9rem', fontWeight: '700', color: THEME.colors.textMain }}>{formatMoney(total)}</span>
                </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '4px', backgroundColor: THEME.colors.primary }} />
                    <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, textTransform: 'uppercase' }}>Canal B2B</div>
                        <div style={{ fontSize: '0.95rem', fontWeight: '700', color: THEME.colors.primary }}>{formatMoney(totalB2B)}</div>
                        <div style={{ fontSize: '0.75rem', fontWeight: '500', color: THEME.colors.textSecondary }}>{Math.round(b2bPercent)}% del total</div>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderTop: `1px solid ${THEME.colors.border}`, paddingTop: '1rem' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '4px', backgroundColor: THEME.colors.textSecondary }} />
                    <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, textTransform: 'uppercase' }}>Canal B2C</div>
                        <div style={{ fontSize: '0.95rem', fontWeight: '700', color: THEME.colors.textSecondary }}>{formatMoney(totalB2C)}</div>
                        <div style={{ fontSize: '0.75rem', fontWeight: '500', color: THEME.colors.textSecondary }}>{Math.round(b2cPercent)}% del total</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function FunnelGraphic({ leads }: { leads: Lead[] }) {
    const stages = [
        { label: 'Prospectos', status: 'new', color: THEME.colors.textSecondary },
        { label: 'En Gestión', status: 'contacted', color: '#D97706' },
        { label: 'Convertidos', status: 'converted', color: THEME.colors.primary },
        { label: 'Descartados', status: 'rejected', color: '#DC2626' }
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
            {stages.map((stage, index) => {
                const count = leads.filter(l => l.status === stage.status).length;
                const percent = leads.length > 0 ? (count / leads.length) * 100 : 0;
                const containerWidth = 100 - (index * 8); 
                
                return (
                    <div key={stage.status} style={{ width: `${containerWidth}%`, minWidth: '140px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.8rem', fontWeight: '600' }}>
                            <div style={{ textTransform: 'uppercase', letterSpacing: '0.05rem', fontSize: '0.65rem', color: THEME.colors.textSecondary }}>{stage.label}</div>
                            <div style={{ color: stage.color, fontSize: '0.85rem' }}>{count} <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>({Math.round(percent)}%)</span></div>
                        </div>
                        <div style={{ 
                            height: '10px', 
                            backgroundColor: THEME.colors.background, 
                            borderRadius: '20px', 
                            border: `1px solid ${THEME.colors.border}`,
                            display: 'flex',
                            justifyContent: 'center',
                            overflow: 'hidden',
                            position: 'relative'
                        }}>
                            <div style={{ 
                                height: '100%', 
                                width: `${percent}%`, 
                                backgroundColor: stage.color, 
                                borderRadius: '20px',
                                transition: 'all 1s cubic-bezier(0.4, 0, 0.2, 1)',
                                boxShadow: `0 0 10px ${stage.color}44`,
                                border: `1px solid ${stage.color}`
                            }} />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function CriticalLeadRow({ lead, onWaitlist }: { lead: Lead, onWaitlist: () => void }) {
    const overdueTime = lead.next_contact_date ? new Date().getTime() - new Date(lead.next_contact_date).getTime() : 0;
    const overdueDays = Math.floor(overdueTime / (1000 * 3600 * 24));
    
    return (
        <div style={{ 
            backgroundColor: '#FFF1F2', 
            padding: '1.2rem', 
            borderRadius: THEME.radius.lg, 
            border: '1px solid #FFE4E6', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            gap: '1.2rem',
            transition: 'all 0.2s ease',
            boxShadow: '0 2px 4px rgba(159, 18, 57, 0.03)'
        }} onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateX(4px)';
            e.currentTarget.style.boxShadow = '0 6px 12px rgba(159, 18, 57, 0.08)';
        }} onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateX(0)';
            e.currentTarget.style.boxShadow = '0 2px 4px rgba(159, 18, 57, 0.03)';
        }}>
            <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '700', color: '#9F1239', fontSize: '1rem', marginBottom: '0.2rem' }}>{lead.company_name || lead.contact_name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.65rem', padding: '2px 8px', backgroundColor: '#BE123C', color: 'white', borderRadius: THEME.radius.sm, fontWeight: '700', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <AlertTriangle size={10} strokeWidth={1.5} /> VENCIDA
                    </span>
                    <span style={{ fontSize: '0.8rem', color: '#E11D48', fontWeight: '600' }}>
                        {overdueDays <= 0 ? 'Para hoy' : `Hace ${overdueDays} días`}
                    </span>
                </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                    onClick={() => {
                        const cleanPhone = lead.phone.replace(/\D/g, '');
                        window.open(`https://wa.me/57${cleanPhone}?text=Hola ${lead.contact_name}, te escribimos de FruFresco...`, '_blank');
                    }}
                    style={{ backgroundColor: '#10B981', color: 'white', border: 'none', width: '38px', height: '38px', borderRadius: THEME.radius.md, cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(16, 185, 129, 0.2)' }}
                    title="WhatsApp Directo"
                >
                    <MessageCircle size={18} strokeWidth={1.5} />
                </button>
                <button 
                    onClick={onWaitlist}
                    style={{ backgroundColor: 'white', color: '#9F1239', border: '1px solid #FFE4E6', padding: '0 1rem', borderRadius: THEME.radius.md, cursor: 'pointer', fontSize: '0.75rem', fontWeight: '700', height: '38px' }}
                >
                    Gestionar
                </button>
            </div>
        </div>
    );
}

function ClientCard({ type, data, pricingModels, availableParents, onUpdatePricingModel, onUpdateStatus, onViewDetails, onEdit, onRegisterContact, onScheduleTask }: { 
    type: 'b2b' | 'b2c' | 'lead', 
    data: Profile | Lead, 
    pricingModels?: PricingModel[],
    availableParents?: Profile[],
    onUpdatePricingModel?: (id: string, modelId: string) => void,
    onUpdateStatus?: (id: string, status: string) => void,
    onViewDetails?: () => void,
    onEdit?: () => void,
    onRegisterContact?: () => void,
    onScheduleTask?: (date: string) => void
}) {
    const isB2B = type === 'b2b';
    const isB2C = type === 'b2c';
    const isLead = type === 'lead';

    const profileData = (isB2B || isB2C) ? (data as Profile) : null;
    const leadData = isLead ? (data as Lead) : null;

    const selectedModel = isB2B ? pricingModels?.find((m: PricingModel) => m.id === profileData?.pricing_model_id) : null;

    const handleWhatsApp = () => {
        const currentData = (isLead ? leadData : profileData) as any;
        if (!currentData?.phone) return alert('No hay teléfono registrado');
        
        const cleanPhone = currentData.phone.replace(/\D/g, '');
        // Evitar duplicar el código de país (57 para Colombia)
        const finalPhone = cleanPhone.startsWith('57') ? cleanPhone : `57${cleanPhone}`;
        
        const contactName = isLead ? leadData?.contact_name : profileData?.contact_name;
        const message = encodeURIComponent(`Hola ${contactName || ''}, te contactamos de Frubana Express.`);
        window.open(`https://wa.me/${finalPhone}?text=${message}`, '_blank');
    };

    return (
        <div style={{ 
            backgroundColor: THEME.colors.surface, 
            borderRadius: THEME.radius.lg, 
            padding: '1.5rem', 
            boxShadow: THEME.shadow.md,
            border: `1px solid ${THEME.colors.border}`,
            display: 'flex',
            flexDirection: 'column',
            gap: '1.2rem',
            position: 'relative',
            overflow: 'hidden',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
        }} onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = THEME.shadow.lg;
        }} onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = THEME.shadow.md;
        }}>
            {/* Tag / Status */}
            <div style={{ 
                position: 'absolute', 
                top: '1.2rem', 
                right: '1.2rem',
                padding: '0.4rem 0.8rem',
                borderRadius: THEME.radius.sm,
                fontSize: '0.65rem',
                fontWeight: '700',
                backgroundColor: isB2B ? (profileData?.is_corporate_parent ? '#FAE8FF' : '#E0F2FE') : isB2C ? '#DCFCE7' : '#FEE2E2',
                color: isB2B ? (profileData?.is_corporate_parent ? '#7E22CE' : '#0369A1') : isB2C ? '#15803D' : '#991B1B',
                textTransform: 'uppercase',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
            }}>
                {isB2B ? (
                    profileData?.is_corporate_parent ? (
                        <>
                            <Building2 size={12} strokeWidth={1.5} />
                            <span>GRUPO/PADRE</span>
                        </>
                    ) : (
                        <>
                            <Building2 size={12} strokeWidth={1.5} />
                            <span>SUCURSAL</span>
                        </>
                    )
                ) : isB2C ? (
                    <>
                        <User size={12} strokeWidth={1.5} />
                        <span>Consumidor</span>
                    </>
                ) : (
                    <>
                        <User size={12} strokeWidth={1.5} />
                        <span>Prospecto</span>
                    </>
                )}
            </div>

            {/* Header */}
            <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '700', color: THEME.colors.textMain, paddingRight: '120px', letterSpacing: '-0.02em', fontFamily: THEME.typography.fontFamilyMain }}>
                    {isB2B ? profileData?.company_name : isB2C ? profileData?.contact_name : leadData?.company_name}
                </h3>
                {isB2B && profileData?.parent_id && (
                    <div style={{ fontSize: '0.75rem', color: THEME.colors.primary, fontWeight: '600', marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Network size={12} strokeWidth={1.5} />
                        <span style={{ opacity: 0.8 }}>Miembro de:</span> <span style={{ textDecoration: 'underline' }}>{availableParents?.find(p => p.id === profileData.parent_id)?.company_name || 'Grupo Corporativo'}</span>
                    </div>
                )}
                {isB2B && profileData?.razon_social && <p style={{ margin: '0.4rem 0', fontSize: '0.8rem', color: THEME.colors.textSecondary, fontStyle: 'italic', fontWeight: '500' }}>{profileData.razon_social}</p>}
                {(isB2B || isLead) && (
                    <p style={{ margin: '0.6rem 0', fontSize: '0.85rem', color: THEME.colors.textMain, fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <User size={14} strokeWidth={1.5} color={THEME.colors.primary} />
                        <span>{isB2B ? profileData?.contact_name : leadData?.contact_name}</span>
                    </p>
                )}
            </div>

            {/* Content Fields */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.6rem' }}>
                {(isB2B || isLead || isB2C) && (
                    <InfoRow icon={<Phone size={14} strokeWidth={1.5} />} label="Contacto" value={data.phone} />
                )}
                {(isB2B || isLead || isB2C) && (
                    <InfoRow icon={<Mail size={14} strokeWidth={1.5} />} label="Email" value={data.email} />
                )}
                {isB2B && profileData?.nit && (
                    <InfoRow icon={<FileText size={14} strokeWidth={1.5} />} label="NIT" value={profileData.nit} />
                )}
                {(isB2B || isB2C) && profileData && (
                    <InfoRow 
                        icon={<MapPin size={14} strokeWidth={1.5} />} 
                        label="Ubicación" 
                        value={`${profileData.address || ''}${profileData.municipality || profileData.city ? `, ${profileData.municipality || profileData.city}` : ''}${profileData.department ? `, ${profileData.department}` : ''}`} 
                    />
                )}
                {(isB2B || isB2C) && profileData && profileData.latitude && profileData.longitude && (
                    <div style={{ fontSize: '0.75rem', color: THEME.colors.primary, fontWeight: '600', paddingLeft: '1.5rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <MapPin size={12} strokeWidth={1.5} />
                        <span>{profileData.latitude.toFixed(4)}, {profileData.longitude.toFixed(4)}</span>
                        <span style={{ marginLeft: '8px', color: '#059669' }}>✓ Geo</span>
                    </div>
                )}
                {isB2B && profileData && (
                    <div style={{ padding: '0.8rem', backgroundColor: THEME.colors.background, borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}` }}>
                        <label style={{ fontSize: '0.7rem', fontWeight: '700', color: THEME.colors.textSecondary, display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '0.4rem', letterSpacing: '0.05em' }}>
                            <Settings size={12} strokeWidth={1.5} color={THEME.colors.primary} />
                            <span>MODELO DE COTIZACIÓN</span>
                        </label>
                        <select 
                            value={profileData.pricing_model_id || ''} 
                            onChange={(e) => onUpdatePricingModel && onUpdatePricingModel(profileData.id, e.target.value)}
                            style={{ 
                                width: '100%', 
                                padding: '0.4rem 0.6rem', 
                                borderRadius: THEME.radius.sm, 
                                border: `1px solid ${THEME.colors.border}`, 
                                fontSize: '0.8rem', 
                                fontWeight: '600',
                                backgroundColor: profileData.pricing_model_id ? THEME.colors.primaryLight : 'white',
                                color: profileData.pricing_model_id ? THEME.colors.primary : THEME.colors.textMain
                            }}
                        >
                            <option value="">-- Sin Modelo Asignado --</option>
                            {pricingModels?.map((pm: PricingModel) => (
                                <option key={pm.id} value={pm.id}>{pm.name} ({pm.base_margin_percent}%)</option>
                            ))}
                        </select>
                        {selectedModel && (
                            <div style={{ marginTop: '0.6rem' }}>
                                {selectedModel.description && (
                                    <p style={{ margin: '0 0 0.2rem 0', fontSize: '0.75rem', color: THEME.colors.textSecondary, fontStyle: 'italic', lineHeight: '1.2' }}>
                                        &quot;{selectedModel.description}&quot;
                                    </p>
                                )}
                                <p style={{ margin: 0, fontSize: '0.75rem', color: THEME.colors.textSecondary }}>
                                    Margen base: <span style={{ color: THEME.colors.primary, fontWeight: '700' }}>{selectedModel.base_margin_percent}%</span>
                                </p>
                            </div>
                        )}
                    </div>
                )}
                {isB2B && profileData && (
                    <InfoRow icon={<FileText size={14} strokeWidth={1.5} />} label="Crédito" value={`${formatMoney(profileData.credit_limit || 0)} | ${profileData.payment_terms || 'Contado'}`} />
                )}
                {isB2B && profileData && profileData.delivery_restrictions && (
                    <div style={{ backgroundColor: '#FFFBEB', padding: '0.6rem 0.8rem', borderRadius: THEME.radius.md, border: '1px solid #FEF3C7', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#B45309', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <AlertTriangle size={12} strokeWidth={1.5} />
                            <span>RESTRICCIONES</span>
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#92400E' }}>{profileData.delivery_restrictions}</span>
                    </div>
                )}
                {isB2C && profileData && profileData.total_orders !== undefined && (
                    <>
                        <InfoRow icon={<Package size={14} strokeWidth={1.5} />} label="Actividad" value={`${formatNumber(profileData.total_orders || 0)} Pedidos | ${formatMoney(profileData.total_spent || 0)} totales`} />
                        {profileData.last_order && <InfoRow icon={<ClipboardList size={14} strokeWidth={1.5} />} label="Último pedido" value={new Date(profileData.last_order as string).toLocaleDateString()} />}
                    </>
                )}
                {isLead && leadData && (
                    <>
                        {/* Negocio y Tamaño en 2 columnas */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', backgroundColor: THEME.colors.background, padding: '0.6rem 0.8rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}` }}>
                            <div>
                                <label style={{ fontSize: '0.65rem', fontWeight: '600', color: THEME.colors.textSecondary, display: 'block', textTransform: 'uppercase' }}>Tipo Negocio</label>
                                <div style={{ fontSize: '0.8rem', fontWeight: '700', color: THEME.colors.textMain }}>{leadData.business_type || 'N/A'}</div>
                            </div>
                            <div>
                                <label style={{ fontSize: '0.65rem', fontWeight: '600', color: THEME.colors.textSecondary, display: 'block', textTransform: 'uppercase' }}>Tamaño</label>
                                <div style={{ fontSize: '0.8rem', fontWeight: '700', color: THEME.colors.textMain }}>{leadData.business_size || 'N/A'}</div>
                            </div>
                        </div>

                        {/* Contactos y Último en 2 columnas */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.8rem', padding: '0.6rem 0.8rem', backgroundColor: THEME.colors.background, borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}` }}>
                            <div>
                                <label style={{ fontSize: '0.65rem', fontWeight: '600', color: THEME.colors.textSecondary, display: 'block' }}>CONTACTOS</label>
                                <div style={{ fontSize: '0.8rem', fontWeight: '700', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Phone size={12} strokeWidth={1.5} color={THEME.colors.primary} />
                                    <span>{formatNumber(leadData.contact_count || 0)} veces</span>
                                </div>
                            </div>
                            {leadData.last_contact_date && (
                                <div>
                                    <label style={{ fontSize: '0.65rem', fontWeight: '600', color: THEME.colors.textSecondary, display: 'block' }}>ÚLTIMO</label>
                                    <div style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textMain }}>{new Date(leadData.last_contact_date as string).toLocaleDateString()}</div>
                                </div>
                            )}
                        </div>

                        {leadData.next_contact_date && (
                            <div style={{ 
                                padding: '0.6rem 0.8rem', 
                                borderRadius: THEME.radius.md, 
                                backgroundColor: new Date(leadData.next_contact_date as string) < new Date() ? '#FEF2F2' : '#F0FDF4',
                                border: `1px solid ${new Date(leadData.next_contact_date as string) < new Date() ? '#FEE2E2' : '#DCFCE7'}`,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}>
                                <AlertTriangle size={14} strokeWidth={1.5} color={new Date(leadData.next_contact_date as string) < new Date() ? '#EF4444' : '#22C55E'} />
                                <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <label style={{ fontSize: '0.65rem', fontWeight: '700', color: new Date(leadData.next_contact_date as string) < new Date() ? '#991B1B' : '#166534' }}>
                                        {new Date(leadData.next_contact_date as string) < new Date() ? 'VENCIDA' : 'SIGUIENTE'}
                                    </label>
                                    <div style={{ fontSize: '0.8rem', fontWeight: '700', color: new Date(leadData.next_contact_date as string) < new Date() ? '#B91C1C' : '#15803D' }}>
                                        {new Date(leadData.next_contact_date as string).toLocaleDateString()}
                                    </div>
                                </div>
                            </div>
                        )}

                        <div style={{ marginBottom: '0.4rem' }}>
                            <label style={{ fontSize: '0.7rem', fontWeight: '700', color: THEME.colors.textSecondary, display: 'block', marginBottom: '0.4rem' }}>ESTADO DE GESTIÓN</label>
                            <select
                                value={leadData.status}
                                onChange={(e) => onUpdateStatus && onUpdateStatus(leadData.id, e.target.value)}
                                style={{ 
                                    width: '100%', 
                                    padding: '0.5rem', 
                                    borderRadius: THEME.radius.sm, 
                                    border: `1px solid ${THEME.colors.border}`,
                                    fontWeight: '600',
                                    fontSize: '0.8rem',
                                    backgroundColor: 'white',
                                    color: THEME.colors.textMain
                                }}
                            >
                                <option value="new">Nuevo Contacto</option>
                                <option value="contacted">Contactado</option>
                                <option value="converted">Convertido a Cliente</option>
                                <option value="rejected">Descartado</option>
                            </select>
                        </div>

                        {/* Datos de Entrega (GPS + Dirección sugerida) */}
                        <div style={{ backgroundColor: '#F0FDF4', borderRadius: THEME.radius.md, border: '1px solid #DCFCE7', overflow: 'hidden' }}>
                            <div style={{ padding: '0.5rem 0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #DCFCE7' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <MapPin size={12} strokeWidth={1.5} color="#15803D" />
                                    <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#15803D', fontFamily: 'monospace' }}>
                                        {leadData.latitude && leadData.longitude ? `${leadData.latitude.toFixed(6)}, ${leadData.longitude.toFixed(6)}` : 'Sin coordenadas'}
                                    </div>
                                </div>
                                {leadData.latitude && leadData.longitude && (
                                    <a 
                                        href={`https://www.google.com/maps?q=${leadData.latitude},${leadData.longitude}`} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        style={{ color: THEME.colors.primary, textDecoration: 'none', fontSize: '0.7rem', fontWeight: '700', backgroundColor: 'white', padding: '0.2rem 0.4rem', borderRadius: THEME.radius.sm, border: '1px solid #DCFCE7' }}
                                    >
                                        Mapa ↗
                                    </a>
                                )}
                            </div>
                            
                            {/* Extracción de dirección de nota o campo directo */}
                            {(leadData.address || leadData.notes?.includes('DIR:')) && (
                                <div style={{ padding: '0.6rem 0.8rem', backgroundColor: 'white' }}>
                                    <label style={{ fontSize: '0.6rem', fontWeight: '600', color: THEME.colors.textSecondary, display: 'block', textTransform: 'uppercase', marginBottom: '0.2rem' }}>Punto de Entrega Sugerido</label>
                                    <div style={{ fontSize: '0.8rem', fontWeight: '600', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Home size={12} strokeWidth={1.5} color={THEME.colors.primary} />
                                        <span>{leadData.address || leadData.notes?.split('|').find(p => p.trim().startsWith('DIR:'))?.replace('DIR:', '').trim() || 'Ver en bitácora'}</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Notas Limpias (Sin basura del bot) */}
                        {leadData.notes && (
                            <div style={{ backgroundColor: THEME.colors.background, padding: '0.6rem 0.8rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}` }}>
                                <span style={{ fontSize: '0.6rem', fontWeight: '700', color: THEME.colors.textSecondary, display: 'block', marginBottom: '0.2rem', textTransform: 'uppercase' }}>BITÁCORA</span>
                                <span style={{ fontSize: '0.75rem', color: THEME.colors.textMain, lineHeight: '1.2', display: 'block' }}>
                                    {leadData.notes
                                        .split('|')
                                        .map(p => p.trim())
                                        .filter(p => !p.toLowerCase().includes('gps:') && !p.toLowerCase().includes('mun:') && !p.toLowerCase().includes('orig:') && !p.toLowerCase().includes('bot_') && !p.toLowerCase().startsWith('dir:'))
                                        .join(' | ') || (
                                            <span style={{ fontStyle: 'italic', opacity: 0.6 }}>Registro automático del bot (sin notas manuales).</span>
                                        )}
                                </span>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Actions */}
            <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: `1px solid ${THEME.colors.border}`, display: 'flex', gap: '0.4rem' }}>
                {(onViewDetails && !isLead) && (
                    <button 
                        onClick={onViewDetails}
                        style={{ 
                            flex: 1, 
                            padding: '0.5rem', 
                            borderRadius: THEME.radius.sm, 
                            border: `1px solid ${THEME.colors.borderActive}`, 
                            background: 'transparent', 
                            fontWeight: '600', 
                            cursor: 'pointer', 
                            transition: 'all 0.2s', 
                            fontSize: '0.75rem', 
                            color: THEME.colors.textSecondary,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px'
                        }} 
                        onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = THEME.colors.primary;
                            e.currentTarget.style.color = THEME.colors.primary;
                        }} 
                        onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = THEME.colors.borderActive;
                            e.currentTarget.style.color = THEME.colors.textSecondary;
                        }}
                    >
                        <FileText size={14} strokeWidth={1.5} />
                        <span>Expediente</span>
                    </button>
                )}
                {(isB2B || isB2C || isLead) && (
                    <button 
                        onClick={onEdit}
                        style={{ 
                            flex: 1, 
                            padding: '0.5rem', 
                            borderRadius: THEME.radius.sm, 
                            border: `1px solid ${THEME.colors.borderActive}`, 
                            background: 'transparent', 
                            fontWeight: '600', 
                            cursor: 'pointer', 
                            fontSize: '0.75rem', 
                            color: THEME.colors.textSecondary,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = THEME.colors.primary;
                            e.currentTarget.style.color = THEME.colors.primary;
                        }} 
                        onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = THEME.colors.borderActive;
                            e.currentTarget.style.color = THEME.colors.textSecondary;
                        }}
                    >
                        <Settings size={14} strokeWidth={1.5} />
                        <span>Gestionar</span>
                    </button>
                )}
                {isLead && onRegisterContact && (
                    <button 
                        onClick={onRegisterContact}
                        style={{ 
                            flex: 1.5, 
                            padding: '0.5rem', 
                            borderRadius: THEME.radius.sm, 
                            border: 'none', 
                            background: THEME.colors.primary, 
                            color: 'white', 
                            fontWeight: '600', 
                            cursor: 'pointer', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            gap: '4px', 
                            fontSize: '0.75rem', 
                            boxShadow: '0 4px 10px rgba(13, 122, 87, 0.15)',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = THEME.colors.primaryHover}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = THEME.colors.primary}
                    >
                        <Check size={14} strokeWidth={1.5} />
                        <span>Reportar</span>
                    </button>
                )}
                <button 
                    onClick={handleWhatsApp}
                    title="Enviar WhatsApp"
                    style={{ 
                        padding: '0.5rem 0.8rem', 
                        borderRadius: THEME.radius.sm, 
                        border: 'none', 
                        background: '#22C55E', 
                        color: 'white', 
                        fontWeight: '600', 
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        boxShadow: '0 4px 10px rgba(34, 197, 94, 0.15)',
                        transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                    <MessageCircle size={14} strokeWidth={1.5} />
                </button>
            </div>
        </div>
    );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode, label: string, value: string | number | undefined | null }) {
    return (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ display: 'inline-flex', color: THEME.colors.primary }}>{icon}</span>
            <div style={{ fontSize: '0.8rem', fontFamily: THEME.typography.fontFamilySecondary }}>
                <span style={{ color: THEME.colors.textSecondary, fontWeight: '500' }}>{label}: </span>
                <span style={{ color: THEME.colors.textMain, fontWeight: '600' }}>{value || 'N/A'}</span>
            </div>
        </div>
    );
}

function EmptyState({ text }: { text: string }) {
    return (
        <div style={{ textAlign: 'center', padding: '3rem', backgroundColor: 'white', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, marginTop: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.8rem', color: THEME.colors.primary }}>
                <Trophy size={36} strokeWidth={1.5} />
            </div>
            <p style={{ color: THEME.colors.textSecondary, fontWeight: '600', fontSize: '1rem', margin: 0 }}>{text}</p>
        </div>
    );
}

function ListView({ data, type, viewMode, pricingModels, availableParents, onEdit, onViewDetails, onUpdatePricingModel, onUpdateStatus, onRegisterContact }: any) {
    if (data.length === 0) return <EmptyState text={`No se encontraron ${type === 'lead' ? 'prospectos' : 'clientes'} en este momento.`} />;

    if (viewMode === 'table') {
        return (
            <div style={{ backgroundColor: 'white', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, overflow: 'hidden', boxShadow: THEME.shadow.sm }}>
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                    <thead>
                        <tr style={{ backgroundColor: '#F9FAFB' }}>
                            <th style={{ padding: '0.65rem 1.25rem', textAlign: 'left', color: THEME.colors.textSecondary, fontWeight: '600', fontSize: '0.65rem', letterSpacing: '0.05em', textTransform: 'uppercase', borderBottom: `1px solid ${THEME.colors.border}` }}>Nombre / Empresa</th>
                            <th style={{ padding: '0.65rem 1.25rem', textAlign: 'left', color: THEME.colors.textSecondary, fontWeight: '600', fontSize: '0.65rem', letterSpacing: '0.05em', textTransform: 'uppercase', borderBottom: `1px solid ${THEME.colors.border}` }}>Contacto Principal</th>
                            <th style={{ padding: '0.65rem 1.25rem', textAlign: 'left', color: THEME.colors.textSecondary, fontWeight: '600', fontSize: '0.65rem', letterSpacing: '0.05em', textTransform: 'uppercase', borderBottom: `1px solid ${THEME.colors.border}` }}>Ubicación</th>
                            {type !== 'b2c' && <th style={{ padding: '0.65rem 1.25rem', textAlign: 'left', color: THEME.colors.textSecondary, fontWeight: '600', fontSize: '0.65rem', letterSpacing: '0.05em', textTransform: 'uppercase', borderBottom: `1px solid ${THEME.colors.border}` }}>Modelo / Estado</th>}
                            <th style={{ padding: '0.65rem 1.25rem', textAlign: 'center', color: THEME.colors.textSecondary, fontWeight: '600', fontSize: '0.65rem', letterSpacing: '0.05em', textTransform: 'uppercase', borderBottom: `1px solid ${THEME.colors.border}` }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((item: any, i: number) => {
                            const isLeads = type === 'lead';
                            const title = isLeads ? (item.company_name || item.contact_name) : (type === 'b2c' ? item.contact_name : item.company_name);
                            const subtitle = type === 'b2b' && item.is_corporate_parent ? 'GRUPO PADRE' : '';
                            
                            return (
                                <tr key={item.id || i} style={{ borderTop: `1px solid ${THEME.colors.border}`, transition: 'all 0.1s' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F8FAF9'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                    <td style={{ padding: '0.65rem 1.25rem' }}>
                                        <div style={{ fontWeight: '700', color: THEME.colors.textMain, fontSize: '0.85rem' }}>{title}</div>
                                        {subtitle && (
                                            <div style={{ fontSize: '0.65rem', color: '#7E22CE', fontWeight: '700', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                <Building2 size={10} strokeWidth={1.5} />
                                                <span>{subtitle}</span>
                                            </div>
                                        )}
                                        {item.nit && <div style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary, fontWeight: '500' }}>NIT: {item.nit}</div>}
                                    </td>
                                    <td style={{ padding: '0.65rem 1.25rem' }}>
                                        <div style={{ fontWeight: '600', color: THEME.colors.textMain, fontSize: '0.8rem' }}>{item.contact_name}</div>
                                        <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <Phone size={10} strokeWidth={1.5} />
                                            <span>{item.phone}</span>
                                        </div>
                                    </td>
                                    <td style={{ padding: '0.65rem 1.25rem' }}>
                                        <div style={{ fontSize: '0.8rem', color: THEME.colors.textMain, fontWeight: '500' }}>{item.city || item.municipality || 'N/A'}</div>
                                        <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary }}>{item.address?.slice(0, 30)}...</div>
                                    </td>
                                    {type !== 'b2c' && (
                                        <td style={{ padding: '0.65rem 1.25rem' }}>
                                            {isLeads ? (
                                                <span style={{ 
                                                    padding: '2px 6px', borderRadius: THEME.radius.sm, fontSize: '0.65rem', fontWeight: '700',
                                                    backgroundColor: item.status === 'new' ? '#E0E7FF' : item.status === 'contacted' ? '#FEF3C7' : '#DCFCE7',
                                                    color: item.status === 'new' ? '#4338CA' : item.status === 'contacted' ? '#92400E' : '#15803D'
                                                }}>
                                                    {item.status?.toUpperCase()}
                                                </span>
                                            ) : (
                                                <div style={{ fontSize: '0.8rem', fontWeight: '600', color: THEME.colors.textMain }}>
                                                    {pricingModels?.find((m: any) => m.id === item.pricing_model_id)?.name || 'Sin Modelo'}
                                                </div>
                                            )}
                                        </td>
                                    )}
                                    <td style={{ padding: '0.65rem 1.25rem', textAlign: 'center' }}>
                                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                            <button 
                                                onClick={() => onViewDetails(item)} 
                                                style={{ 
                                                    padding: '4px 8px', 
                                                    borderRadius: THEME.radius.sm, 
                                                    border: `1px solid ${THEME.colors.borderActive}`, 
                                                    background: 'transparent', 
                                                    color: THEME.colors.textSecondary,
                                                    fontSize: '0.75rem',
                                                    fontWeight: '600',
                                                    cursor: 'pointer',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px'
                                                }} 
                                                title="Ver Expediente"
                                            >
                                                <FileText size={12} strokeWidth={1.5} />
                                                <span>Ver</span>
                                            </button>
                                            <button 
                                                onClick={() => onEdit(item)} 
                                                style={{ 
                                                    padding: '4px 8px', 
                                                    borderRadius: THEME.radius.sm, 
                                                    border: `1px solid ${THEME.colors.borderActive}`, 
                                                    background: 'transparent', 
                                                    color: THEME.colors.textSecondary,
                                                    fontSize: '0.75rem',
                                                    fontWeight: '600',
                                                    cursor: 'pointer',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px'
                                                }} 
                                                title="Editar"
                                            >
                                                <Settings size={12} strokeWidth={1.5} />
                                                <span>Editar</span>
                                            </button>
                                            {isLeads && onRegisterContact && (
                                                <button 
                                                    onClick={() => onRegisterContact(item.id)} 
                                                    style={{ 
                                                        padding: '4px 8px', 
                                                        borderRadius: THEME.radius.sm, 
                                                        border: 'none', 
                                                        background: THEME.colors.primary, 
                                                        color: 'white', 
                                                        fontSize: '0.75rem',
                                                        fontWeight: '600',
                                                        cursor: 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }} 
                                                    title="Reportar Contacto"
                                                >
                                                    <Check size={12} strokeWidth={1.5} />
                                                    <span>Reportar</span>
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    }

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
            {data.map((item: any) => (
                <ClientCard 
                    key={item.id} 
                    type={type} 
                    data={item} 
                    pricingModels={pricingModels}
                    availableParents={availableParents}
                    onUpdatePricingModel={onUpdatePricingModel}
                    onUpdateStatus={onUpdateStatus}
                    onViewDetails={() => onViewDetails(item)}
                    onEdit={() => onEdit(item)}
                    onRegisterContact={() => onRegisterContact && onRegisterContact(item.id)}
                />
            ))}
        </div>
    );
}

function ClientDetailsModal({ client, onClose, pricingModels }: { client: Profile, onClose: () => void, pricingModels: PricingModel[] }) {
    const selectedModel = pricingModels.find((m: PricingModel) => m.id === client.pricing_model_id);

    return (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
            <div style={{ backgroundColor: 'white', borderRadius: THEME.radius.lg, width: '100%', maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto', position: 'relative', boxShadow: THEME.shadow.lg }}>
                <button onClick={onClose} style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', border: 'none', background: '#F3F4F6', width: '40px', height: '40px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: THEME.colors.textSecondary }}><X size={18} strokeWidth={1.5} /></button>
                
                <div style={{ padding: '2.5rem' }}>
                    <header style={{ marginBottom: '2rem' }}>
                        <span style={{ color: THEME.colors.primary, fontWeight: '700', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {client.role === 'b2c_client' ? 'Ficha de Consumidor Final' : (client as unknown as Lead).status ? 'Ficha de Prospecto (Lead)' : 'Ficha de Cliente Institucional'}
                        </span>
                        <h2 style={{ fontSize: '1.8rem', fontWeight: '700', color: THEME.colors.textMain, margin: '0.5rem 0', fontFamily: THEME.typography.fontFamilyMain }}>
                            {client.role === 'b2c_client' ? client.contact_name : (client.company_name || client.contact_name)}
                        </h2>
                        {client.role !== 'b2c_client' && client.razon_social && <p style={{ color: THEME.colors.textSecondary, fontSize: '1rem', margin: 0 }}>{client.razon_social}</p>}
                    </header>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
                        <section style={{ backgroundColor: THEME.colors.background, padding: '1.2rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}` }}>
                            <h4 style={{ fontSize: '0.85rem', fontWeight: '700', color: THEME.colors.textMain, borderBottom: `1px solid ${THEME.colors.border}`, paddingBottom: '0.4rem', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <MapPin size={16} strokeWidth={1.5} color={THEME.colors.primary} />
                                <span>Información Geográfica</span>
                            </h4>
                            <ModalRow label="Dirección" value={client.address} />
                            <ModalRow label="Municipio" value={client.municipality || client.city} />
                            <ModalRow label="Departamento" value={client.department} />
                        </section>

                        <section style={{ backgroundColor: THEME.colors.background, padding: '1.2rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}` }}>
                            <h4 style={{ fontSize: '0.85rem', fontWeight: '700', color: THEME.colors.textMain, borderBottom: `1px solid ${THEME.colors.border}`, paddingBottom: '0.4rem', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <User size={16} strokeWidth={1.5} color={THEME.colors.primary} />
                                <span>Contacto Comercial</span>
                            </h4>
                            <ModalRow label="Nombre" value={client.contact_name} />
                            <ModalRow label="Teléfono" value={client.phone} />
                            <ModalRow label="Email" value={client.email} />
                        </section>

                        <section style={{ backgroundColor: THEME.colors.background, padding: '1.2rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}` }}>
                            <h4 style={{ fontSize: '0.85rem', fontWeight: '700', color: THEME.colors.textMain, borderBottom: `1px solid ${THEME.colors.border}`, paddingBottom: '0.4rem', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <FileText size={16} strokeWidth={1.5} color={THEME.colors.primary} />
                                <span>Datos Financieros</span>
                            </h4>
                            <ModalRow label="NIT" value={client.nit} />
                            <ModalRow label="Límite Crédito" value={formatMoney(client.credit_limit || 0)} />
                            <ModalRow label="Términos" value={client.payment_terms} />
                        </section>

                         <section style={{ backgroundColor: THEME.colors.background, padding: '1.2rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}` }}>
                            <h4 style={{ fontSize: '0.85rem', fontWeight: '700', color: THEME.colors.textMain, borderBottom: `1px solid ${THEME.colors.border}`, paddingBottom: '0.4rem', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Network size={16} strokeWidth={1.5} color={THEME.colors.primary} />
                                <span>Geolocalización</span>
                            </h4>
                            <ModalRow label="Latitud" value={client.latitude?.toString() || 'Punto no asignado'} />
                            <ModalRow label="Longitud" value={client.longitude?.toString() || 'Punto no asignado'} />
                            <ModalRow label="Estado" value={client.geocoding_status === 'success' ? 'Verificado' : 'Pendiente/Manual'} />
                        </section>

                        <section style={{ backgroundColor: THEME.colors.background, padding: '1.2rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}` }}>
                            <h4 style={{ fontSize: '0.85rem', fontWeight: '700', color: THEME.colors.textMain, borderBottom: `1px solid ${THEME.colors.border}`, paddingBottom: '0.4rem', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Settings size={16} strokeWidth={1.5} color={THEME.colors.primary} />
                                <span>Configuración Comercial</span>
                            </h4>
                            <ModalRow 
                                label="Modelo" 
                                value={client.role === 'b2c_client' ? 'Modelo B2C (Estándar)' : (selectedModel?.name || 'No asignado')} 
                            />
                            <ModalRow 
                                label="Estructura" 
                                value={client.is_corporate_parent ? 'Grupo Corporativo (Padre)' : (client.parent_id ? 'Sucursal Asociada' : 'Independiente')} 
                            />
                            {client.parent_id && (
                                <ModalRow 
                                    label="Pertenece a" 
                                    value="Ver en lista (Jerarquía activa)" 
                                />
                            )}
                            <ModalRow 
                                label="Margen Base" 
                                value={client.role === 'b2c_client' ? 'Diferencial x Catálogo' : (selectedModel ? `${selectedModel.base_margin_percent}%` : 'N/A')} 
                            />
                            {(client.role !== 'b2c_client' && selectedModel?.description) && (
                                <p style={{ fontSize: '0.8rem', color: THEME.colors.textSecondary, marginTop: '0.5rem', fontStyle: 'italic' }}>&quot;{selectedModel.description}&quot;</p>
                            )}
                        </section>

                        {(client as unknown as Lead).status && (
                            <section style={{ backgroundColor: THEME.colors.background, padding: '1.2rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}` }}>
                                <h4 style={{ fontSize: '0.85rem', fontWeight: '700', color: THEME.colors.textMain, borderBottom: `1px solid ${THEME.colors.border}`, paddingBottom: '0.4rem', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Zap size={16} strokeWidth={1.5} color={THEME.colors.primary} />
                                    <span>Perfilamiento de Prospecto</span>
                                </h4>
                                <ModalRow label="Tipo de Negocio" value={(client as unknown as Lead).business_type} />
                                <ModalRow label="Tamaño / Escala" value={(client as unknown as Lead).business_size} />
                                <ModalRow label="Contactos Realizados" value={(client as unknown as Lead).contact_count || 0} />
                                <ModalRow label="Último Contacto" value={(client as unknown as Lead).last_contact_date ? new Date(String((client as unknown as Lead).last_contact_date)).toLocaleDateString() : 'Nunca'} />
                            </section>
                        )}
                    </div>

                    {client.delivery_restrictions && (
                        <div style={{ marginTop: '1.5rem', padding: '1rem 1.2rem', backgroundColor: '#FFFBEB', borderRadius: THEME.radius.md, border: '1px solid #FEF3C7', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <h4 style={{ margin: 0, color: '#92400E', fontSize: '0.85rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <AlertTriangle size={14} strokeWidth={1.5} />
                                <span>RESTRICCIONES DE ENTREGA</span>
                            </h4>
                            <p style={{ margin: 0, color: '#B45309', fontSize: '0.85rem' }}>{client.delivery_restrictions}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function ModalRow({ label, value }: { label: string, value?: string | number | null }) {
    return (
        <div style={{ marginBottom: '0.6rem' }}>
            <span style={{ display: 'block', fontSize: '0.65rem', color: THEME.colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
            <span style={{ fontSize: '0.85rem', color: THEME.colors.textMain, fontWeight: '600' }}>{value || 'No registrado'}</span>
        </div>
    );
}

function ClientFormModal({ onClose, onRefresh, pricingModels, editData, availableParents }: { onClose: () => void, onRefresh: () => void, pricingModels: PricingModel[], editData?: Partial<Profile> | null, availableParents: Profile[] }) {
    const isEdit = !!editData;
    const [formData, setFormData] = useState({
        company_name: editData?.company_name || '',
        razon_social: editData?.razon_social || '',
        nit: editData?.nit || '',
        contact_name: editData?.contact_name || '',
        phone: editData?.phone || '',
        email: editData?.email || '',
        address: editData?.address || '',
        city: editData?.city || 'Bogotá',
        municipality: editData?.municipality || 'Bogotá',
        department: editData?.department || 'Cundinamarca',
        pricing_model_id: editData?.pricing_model_id || '',
        credit_limit: editData?.credit_limit || 0,
        payment_terms: editData?.payment_terms || 'Contado',
        delivery_restrictions: editData?.delivery_restrictions || '',
        latitude: editData?.latitude || '',
        longitude: editData?.longitude || '',
        geocoding_status: editData?.geocoding_status || 'manual',
        is_corporate_parent: editData?.is_corporate_parent || false,
        parent_id: editData?.parent_id || '',
        billing_nit: editData?.billing_nit || '',
        billing_razon_social: editData?.billing_razon_social || ''
    });
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (isEdit) {
                const { error } = await supabase
                    .from('profiles')
                    .update({
                        ...formData,
                        latitude: formData.latitude ? parseFloat(String(formData.latitude)) : null,
                        longitude: formData.longitude ? parseFloat(String(formData.longitude)) : null
                    })
                    .eq('id', (editData as Profile).id);
                if (error) throw error;
                window.showToast?.('Base de datos actualizada', 'success');
            } else {
                const targetRole = (editData as unknown as Profile)?.role || 'b2b_client';
                const { error } = await supabase
                    .from('profiles')
                    .insert([{ 
                        ...formData, 
                        role: targetRole,
                        latitude: formData.latitude ? parseFloat(String(formData.latitude)) : null,
                        longitude: formData.longitude ? parseFloat(String(formData.longitude)) : null
                    }]);
                if (error) throw error;
                window.showToast?.('Cliente creado con éxito', 'success');
            }
            onRefresh();
            onClose();
        } catch (err: unknown) {
            console.error(err);
            const message = err instanceof Error ? err.message : 'Error desconocido';
            window.showToast?.('Error: ' + message, 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '1rem' }}>
            <div style={{ backgroundColor: 'white', borderRadius: THEME.radius.lg, width: '100%', maxWidth: '900px', maxHeight: '95vh', overflowY: 'auto', padding: '2.5rem', boxShadow: THEME.shadow.lg }}>
                <header style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <h2 style={{ fontSize: '1.6rem', fontWeight: '700', color: THEME.colors.textMain, margin: 0, fontFamily: THEME.typography.fontFamilyMain }}>
                            {isEdit ? `Editando: ${editData.company_name}` : 'Nuevo Cliente Institucional'}
                        </h2>
                        <p style={{ color: THEME.colors.textSecondary, margin: '0.4rem 0', fontSize: '0.85rem' }}>Gestiona la información comercial y logística del cliente.</p>
                    </div>
                    <button onClick={onClose} style={{ border: 'none', background: '#F3F4F6', width: '40px', height: '40px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: THEME.colors.textSecondary }}><X size={18} strokeWidth={1.5} /></button>
                </header>

                <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                    {/* SECCIÓN MUESTRA EL ESPACIO PARA RESTRICCIONES SIEMPRE */}
                    <section style={{ gridColumn: '1 / -1', backgroundColor: '#FFFBEB', padding: '1.2rem', borderRadius: THEME.radius.md, border: '1px solid #FEF3C7' }}>
                        <h4 style={{ fontSize: '0.85rem', fontWeight: '700', color: '#92400E', paddingBottom: '0.4rem', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <AlertTriangle size={16} strokeWidth={1.5} />
                            <span>RESTRICCIONES DE ENTREGA (LOGÍSTICA)</span>
                        </h4>
                        <textarea 
                            value={formData.delivery_restrictions}
                            onChange={(e) => setFormData({...formData, delivery_restrictions: e.target.value})}
                            placeholder="Indica aquí si hay horarios específicos, muelles de carga, o si se requiere algún equipo especial para la entrega..."
                            style={{ width: '100%', padding: '0.8rem', borderRadius: THEME.radius.sm, border: '1px solid #FEF3C7', minHeight: '80px', outline: 'none', backgroundColor: 'white', fontSize: '0.85rem', fontWeight: '600' }}
                        />
                    </section>

                    {/* SECCIÓN JERARQUÍA CORPORATIVA */}
                    <section style={{ gridColumn: '1 / -1', backgroundColor: '#F3E8FF', padding: '1.2rem', borderRadius: THEME.radius.md, border: '1px solid #E9D5FF' }}>
                        <h4 style={{ fontSize: '0.85rem', fontWeight: '700', color: '#7E22CE', paddingBottom: '0.4rem', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Building2 size={16} strokeWidth={1.5} />
                            <span>ESTRUCTURA CORPORATIVA</span>
                        </h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <input 
                                    type="checkbox" 
                                    checked={formData.is_corporate_parent}
                                    onChange={(e) => setFormData({...formData, is_corporate_parent: e.target.checked, parent_id: ''})}
                                    style={{ width: '20px', height: '20px', accentColor: '#7E22CE' }}
                                />
                                <label style={{ fontWeight: '700', color: '#581C87', fontSize: '0.85rem' }}>¿Es un GRUPO PADRE / NODO DE FACTURACIÓN?</label>
                            </div>

                            {!formData.is_corporate_parent && (
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#581C87', display: 'block', marginBottom: '0.4rem' }}>ASOCIAR A UN PADRE Existente (Sede de...)</label>
                                    <select 
                                        value={formData.parent_id}
                                        onChange={(e) => setFormData({...formData, parent_id: e.target.value})}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: THEME.radius.sm, border: '2px solid #E9D5FF', fontWeight: '600', fontSize: '0.85rem' }}
                                    >
                                        <option value="">-- CLIENTE INDEPENDIENTE --</option>
                                        {availableParents.map(parent => (
                                            <option key={parent.id} value={parent.id}>{parent.company_name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                    </section>

                    {/* SECCIÓN DATOS BÁSICOS */}
                    <section style={{ gridColumn: '1 / -1' }}>
                        <h4 style={{ fontSize: '0.9rem', fontWeight: '700', color: THEME.colors.primary, borderBottom: `2px solid ${THEME.colors.primaryLight}`, paddingBottom: '0.4rem', marginBottom: '1rem' }}>DATOS DE LA EMPRESA</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.2rem' }}>
                            <FormField label="Nombre Comercial (Sede)" value={formData.company_name} onChange={(v: string) => setFormData({...formData, company_name: v})} required />
                            <FormField 
                                label={formData.is_corporate_parent ? "Razón Social Factura" : "Razón Social Oficina"} 
                                value={formData.razon_social} 
                                onChange={(v: string) => setFormData({...formData, razon_social: v})} 
                            />
                            <FormField 
                                label={formData.is_corporate_parent ? "NIT Facturación" : "NIT Local"} 
                                value={formData.nit} 
                                onChange={(v: string) => setFormData({...formData, nit: v})} 
                            />
                        </div>
                    </section>

                    <section>
                        <h4 style={{ fontSize: '0.9rem', fontWeight: '700', color: THEME.colors.textMain, borderBottom: `2px solid ${THEME.colors.border}`, paddingBottom: '0.4rem', marginBottom: '1rem' }}>CONTACTO</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <FormField label="Responsable" value={formData.contact_name} onChange={(v: string) => setFormData({...formData, contact_name: v})} required />
                            <FormField label="Teléfono" value={formData.phone} onChange={(v: string) => setFormData({...formData, phone: v})} required />
                        </div>
                    </section>

                    <section>
                        <h4 style={{ fontSize: '0.9rem', fontWeight: '700', color: THEME.colors.textMain, borderBottom: `2px solid ${THEME.colors.border}`, paddingBottom: '0.4rem', marginBottom: '1rem' }}>UBICACIÓN</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <FormField label="Dirección" value={formData.address} onChange={(v: string) => setFormData({...formData, address: v})} required />
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <FormField label="Municipio" value={formData.municipality} onChange={(v: string) => setFormData({...formData, municipality: v, city: v})} />
                                <FormField label="Dpto" value={formData.department} onChange={(v: string) => setFormData({...formData, department: v})} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', backgroundColor: '#F0F9FF', padding: '0.8rem', borderRadius: THEME.radius.md, border: '1px solid #BAE6FD' }}>
                                <FormField label="Latitud" type="number" step="any" value={formData.latitude} onChange={(v: string) => setFormData({...formData, latitude: v})} />
                                <FormField label="Longitud" type="number" step="any" value={formData.longitude} onChange={(v: string) => setFormData({...formData, longitude: v})} />
                                <p style={{ gridColumn: '1 / -1', margin: 0, fontSize: '0.7rem', color: '#0369A1', fontWeight: '600' }}>
                                    💡 Las coordenadas permiten optimizar las rutas de despacho automáticamente.
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* SECCIÓN COMERCIAL Y FINANCIERA */}
                    <section style={{ gridColumn: '1 / -1' }}>
                        <h4 style={{ fontSize: '0.9rem', fontWeight: '700', color: THEME.colors.primary, borderBottom: `2px solid ${THEME.colors.primaryLight}`, paddingBottom: '0.4rem', marginBottom: '1rem' }}>CONFIGURACIÓN COMERCIAL</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.2rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary }}>Modelo de Precios</label>
                                <select 
                                    value={formData.pricing_model_id} 
                                    onChange={(e) => setFormData({...formData, pricing_model_id: e.target.value})}
                                    style={{ padding: '0.6rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, fontWeight: '600', fontSize: '0.85rem' }}
                                >
                                    <option value="">-- Seleccionar --</option>
                                    {pricingModels.map((pm: PricingModel) => (
                                        <option key={pm.id} value={pm.id}>{pm.name} ({pm.base_margin_percent}%)</option>
                                    ))}
                                </select>
                            </div>
                            <FormField label="Cupo de Crédito ($)" type="number" value={formData.credit_limit} onChange={(v: string) => setFormData({...formData, credit_limit: parseFloat(v) || 0})} />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary }}>Términos de Pago</label>
                                <select 
                                    value={formData.payment_terms} 
                                    onChange={(e) => setFormData({...formData, payment_terms: e.target.value})}
                                    style={{ padding: '0.6rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, fontWeight: '600', fontSize: '0.85rem' }}
                                >
                                    <option value="Contado">Contado</option>
                                    <option value="Crédito 8 días">Crédito 8 días</option>
                                    <option value="Crédito 15 días">Crédito 15 días</option>
                                    <option value="Crédito 30 días">Crédito 30 días</option>
                                </select>
                            </div>
                        </div>
                    </section>
                    
                    <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                        <button type="button" onClick={onClose} style={{ flex: 1, padding: '1rem', borderRadius: THEME.radius.sm, border: 'none', background: '#F3F4F6', color: THEME.colors.textSecondary, fontWeight: '700', cursor: 'pointer' }}>Cerrar</button>
                        <button 
                            type="submit" 
                            disabled={saving}
                            style={{ flex: 2, padding: '1rem', borderRadius: THEME.radius.sm, border: 'none', background: THEME.colors.primary, color: 'white', fontWeight: '700', cursor: 'pointer', boxShadow: '0 4px 10px rgba(13, 122, 87, 0.15)', transition: 'all 0.2s' }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = THEME.colors.primaryHover}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = THEME.colors.primary}
                        >
                            {saving ? 'Guardando...' : (isEdit ? 'Actualizar Información' : 'Registrar Cliente')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function FormField({ label, value, onChange, type = 'text', required = false, step = undefined }: { label: string, value: string | number | undefined, onChange: (v: string) => void, type?: string, required?: boolean, step?: string }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary }}>
                {label} {required && <span style={{ color: '#EF4444' }}>*</span>}
            </label>
            <input 
                type={type}
                step={step}
                value={value || ''}
                onChange={(e) => onChange(e.target.value)}
                required={required}
                style={{ width: '100%', padding: '0.6rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, outline: 'none', fontWeight: '600', fontSize: '0.85rem' }}
            />
        </div>
    );
}

function LeadFormModal({ onClose, onRefresh, editData }: { onClose: () => void, onRefresh: () => void, editData?: Partial<Lead> | null }) {
    const isEdit = !!editData?.id;
    const [formData, setFormData] = useState({
        company_name: editData?.company_name || '',
        contact_name: editData?.contact_name || '',
        phone: editData?.phone || '',
        email: editData?.email || '',
        status: editData?.status || 'new',
        business_type: editData?.business_type || '',
        business_size: editData?.business_size || '',
        notes: editData?.notes || ''
    });
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (isEdit) {
                const { error } = await supabase
                    .from('leads')
                    .update(formData)
                    .eq('id', editData.id!);
                if (error) throw error;
                window.showToast?.('Información del prospecto actualizada', 'success');
            } else {
                const { error } = await supabase
                    .from('leads')
                    .insert([formData]);
                if (error) throw error;
                window.showToast?.('Venta potencial registrada', 'success');
            }
            onRefresh();
            onClose();
        } catch (err: any) {
            window.showToast?.('Error al crear lead: ' + err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(13, 122, 87, 0.1)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '1rem' }}>
            <div style={{ backgroundColor: 'white', borderRadius: THEME.radius.lg, width: '100%', maxWidth: '600px', padding: '2rem', boxShadow: THEME.shadow.lg }}>
                <header style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: THEME.colors.textMain, margin: 0, fontFamily: THEME.typography.fontFamilyMain }}>
                            {isEdit ? 'Editar Prospecto' : 'Nuevo Prospecto Manual'}
                        </h2>
                        <p style={{ color: THEME.colors.textSecondary, fontWeight: '500', fontSize: '0.85rem', margin: '0.2rem 0' }}>{isEdit ? 'Actualiza la información del seguimiento.' : 'Ingresa los datos para iniciar el seguimiento.'}</p>
                    </div>
                    <button onClick={onClose} style={{ border: 'none', background: '#F3F4F6', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: THEME.colors.textSecondary }}><X size={16} strokeWidth={1.5} /></button>
                </header>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <FormField label="¿Nombre Empresa?" value={formData.company_name} onChange={(v) => setFormData({...formData, company_name: v})} />
                        <FormField label="Contacto (Persona) *" value={formData.contact_name} onChange={(v) => setFormData({...formData, contact_name: v})} required />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <FormField label="Celular / WhatsApp *" value={formData.phone} onChange={(v) => setFormData({...formData, phone: v})} required />
                        <FormField label="Email" value={formData.email} onChange={(v) => setFormData({...formData, email: v})} />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary }}>Giro de Negocio</label>
                            <select 
                                value={formData.business_type} 
                                onChange={(e) => setFormData({...formData, business_type: e.target.value})}
                                style={{ padding: '0.6rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, fontWeight: '600', fontSize: '0.85rem' }}
                            >
                                <option value="">-- Seleccionar --</option>
                                <option value="Restaurante">Restaurante</option>
                                <option value="Fruver">Fruver / Tienda</option>
                                <option value="Hogar">Hogar / Persona</option>
                                <option value="Otro">Otro</option>
                            </select>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary }}>Escala</label>
                            <select 
                                value={formData.business_size} 
                                onChange={(e) => setFormData({...formData, business_size: e.target.value})}
                                style={{ padding: '0.6rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, fontWeight: '600', fontSize: '0.85rem' }}
                            >
                                <option value="">-- Seleccionar --</option>
                                <option value="Pequeño">Pequeño</option>
                                <option value="Mediano">Mediano</option>
                                <option value="Grande">Grande</option>
                            </select>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary }}>Notas Iniciales</label>
                        <textarea 
                            value={formData.notes}
                            onChange={(e) => setFormData({...formData, notes: e.target.value})}
                            placeholder="Ej: Interesado en precios de papa..."
                            style={{ width: '100%', padding: '0.6rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, minHeight: '80px', outline: 'none', fontStyle: 'italic', fontSize: '0.85rem' }}
                        />
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                        <button type="button" onClick={onClose} style={{ flex: 1, padding: '0.8rem', borderRadius: THEME.radius.sm, background: '#F1F5F9', border: 'none', fontWeight: '700', cursor: 'pointer', fontSize: '0.85rem', color: THEME.colors.textSecondary }}>Cancelar</button>
                        <button 
                            type="submit" 
                            disabled={saving} 
                            style={{ flex: 2, padding: '0.8rem', borderRadius: THEME.radius.sm, background: THEME.colors.primary, color: 'white', border: 'none', fontWeight: '700', cursor: 'pointer', boxShadow: '0 4px 10px rgba(13, 122, 87, 0.15)', fontSize: '0.85rem', transition: 'all 0.2s' }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = THEME.colors.primaryHover}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = THEME.colors.primary}
                        >
                            {saving ? 'Guardando...' : (isEdit ? 'Actualizar Prospecto' : 'Iniciar Seguimiento')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
