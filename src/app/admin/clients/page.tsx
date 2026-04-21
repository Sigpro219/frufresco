'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import Toast from '@/components/Toast';

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
        { id: 'dashboard', label: 'Resumen', icon: '📊' },
        { id: 'b2b', label: 'Institucionales', icon: '🏢' },
        { id: 'groups', label: 'Grupos / Padres', icon: '🏦' }, // Nueva pestaña estratégica
        { id: 'b2c', label: 'Consumidor Final', icon: '🏠' },
        { id: 'leads', label: 'Prospectos', icon: '🔥' },
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
        <main style={{ minHeight: '100vh', backgroundColor: '#F0F2F5' }}>
            <Navbar />
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
                             <span style={{ backgroundColor: '#111827', color: '#D4AF37', padding: '2px 8px', borderRadius: '4px', fontSize: '0.6rem', fontWeight: '900', letterSpacing: '0.05em' }}>CRM & GROWTH</span>
                             <span style={{ color: '#94A3B8', fontSize: '0.7rem', fontWeight: '700' }}>/ GESTIÓN PRINCIPAL</span>
                        </div>
                        <h1 style={{ fontSize: '1.8rem', fontWeight: '900', color: '#111827', margin: 0, letterSpacing: '-0.03em' }}>Centro de <span style={{ color: 'var(--primary)' }}>Clientes</span></h1>
                    </div>
                </header>

                {/* UNIFIED CONTROL BAR (SLENDER) */}
                <div style={{ 
                    display: 'flex', 
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem', 
                    marginBottom: '1.5rem', 
                    backgroundColor: 'white', 
                    padding: '0.4rem 0.6rem', 
                    borderRadius: '12px', 
                    boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                    border: '1px solid #E5E7EB'
                }}>
                    {/* TABS (LEFT) */}
                    <div style={{ display: 'flex', gap: '2px', backgroundColor: '#F9FAFB', padding: '3px', borderRadius: '10px' }}>
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => { setActiveTab(tab.id); setSearchTerm(''); }}
                                style={{
                                    padding: '0.5rem 0.9rem',
                                    border: 'none',
                                    borderRadius: '8px',
                                    background: activeTab === tab.id ? 'white' : 'transparent',
                                    color: activeTab === tab.id ? '#111827' : '#6B7280',
                                    boxShadow: activeTab === tab.id ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                                    fontWeight: '800',
                                    fontSize: '0.75rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    transition: 'all 0.15s'
                                }}
                            >
                                <span style={{ fontSize: '0.9rem' }}>{tab.icon}</span>
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* SEARCH & ACTIONS (RIGHT) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {activeTab !== 'dashboard' && (
                            <>
                                <div style={{ position: 'relative', width: '240px' }}>
                                    <span style={{ position: 'absolute', left: '0.7rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.8rem', color: '#9CA3AF' }}>🔍</span>
                                    <input 
                                        placeholder={`Buscar...`}
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        style={{ 
                                            width: '100%', 
                                            padding: '0.5rem 1rem 0.5rem 2rem', 
                                            borderRadius: '8px', 
                                            border: '1px solid #E5E7EB', 
                                            fontSize: '0.8rem',
                                            fontWeight: '700',
                                            outline: 'none',
                                            backgroundColor: '#F9FAFB'
                                        }}
                                    />
                                </div>

                                <div style={{ height: '24px', width: '1px', backgroundColor: '#E5E7EB', margin: '0 4px' }} />

                                <div style={{ display: 'flex', gap: '4px', backgroundColor: '#F3F4F6', padding: '2px', borderRadius: '8px' }}>
                                    <button onClick={() => setViewMode('table')} style={{ padding: '0.4rem 0.6rem', border: 'none', borderRadius: '6px', background: viewMode === 'table' ? 'white' : 'transparent', fontSize: '0.7rem', fontWeight: '800', cursor: 'pointer', color: viewMode === 'table' ? '#111827' : '#9CA3AF', boxShadow: viewMode === 'table' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none' }}>📋</button>
                                    <button onClick={() => setViewMode('cards')} style={{ padding: '0.4rem 0.6rem', border: 'none', borderRadius: '6px', background: viewMode === 'cards' ? 'white' : 'transparent', fontSize: '0.7rem', fontWeight: '800', cursor: 'pointer', color: viewMode === 'cards' ? '#111827' : '#9CA3AF', boxShadow: viewMode === 'cards' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none' }}>📇</button>
                                </div>

                                <button 
                                    onClick={() => {
                                        if (activeTab === 'leads') handleCreateLead();
                                        else handleCreateClient(activeTab === 'b2c' ? 'b2c_client' : 'b2b_client');
                                    }}
                                    style={{ 
                                        backgroundColor: '#111827', 
                                        color: 'white', 
                                        padding: '0.5rem 1rem', 
                                        borderRadius: '8px', 
                                        border: 'none', 
                                        fontWeight: '900', 
                                        fontSize: '0.75rem',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    <span>➕</span> Crear {activeTab === 'leads' ? 'Prospecto' : 'Cliente'}
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '10rem' }}>
                        <div style={{ fontSize: '4rem', animation: 'bounce 1s infinite' }}>📦</div>
                        <p style={{ fontWeight: '700', color: '#718096', marginTop: '1rem' }}>Sincronizando base de datos...</p>
                    </div>
                ) : (
                    <>
                        {/* DASHBOARD VIEW */}
                        {activeTab === 'dashboard' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
                                {/* Top Row: Main KPIs */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.2rem' }}>
                                    <KPICard title="Clientes B2B" value={clientsB2B.length} icon="🏢" color="#6366F1" subtitle="Institucionales" />
                                    <KPICard title="Clientes B2C" value={clientsB2C.length} icon="🏠" color="#10B981" subtitle="Consumidores" />
                                    <div onClick={() => { setActiveTab('leads'); setSearchTerm('@vencido'); }} style={{ cursor: 'pointer' }}>
                                        <KPICard 
                                            title="Tareas Críticas" 
                                            value={leads.filter(l => l.status !== 'converted' && l.status !== 'rejected' && l.next_contact_date && new Date(l.next_contact_date) <= new Date()).length} 
                                            icon="🚩" 
                                            color="#EF4444" 
                                            subtitle="Prioridad comercial" 
                                        />
                                    </div>
                                    <div onClick={() => { setActiveTab('groups'); setSearchTerm(''); }} style={{ cursor: 'pointer' }}>
                                        <KPICard 
                                            title="Grupos" 
                                            value={clientsB2B.filter(c => c.is_corporate_parent).length} 
                                            icon="🏦" 
                                            color="#8B5CF6" 
                                            subtitle="Corporativos" 
                                        />
                                    </div>
                                </div>

                                {/* Middle Row: Funnel & Critical Tasks & Sales */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
                                    {/* Funnel Box */}
                                    <div style={{ backgroundColor: 'white', borderRadius: '32px', padding: '1.8rem', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', border: '1px solid #F0F2F5' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                            <div>
                                                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '900', color: '#111827' }}>🌪️ Embudo Comercial</h3>
                                                <p style={{ margin: '0.1rem 0 0 0', fontSize: '0.8rem', color: '#6B7280', fontWeight: '600' }}>Trayectoria del prospecto</p>
                                            </div>
                                            <div style={{ backgroundColor: '#F8FAFC', padding: '0.4rem 0.8rem', borderRadius: '12px', border: '1px solid #E5E7EB', textAlign: 'right' }}>
                                                <div style={{ fontSize: '0.65rem', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase' }}>Items</div>
                                                <div style={{ fontSize: '1rem', fontWeight: '900', color: '#111827' }}>{leads.length}</div>
                                            </div>
                                        </div>
                                        <FunnelGraphic leads={leads} />
                                    </div>

                                    {/* Sales Distribution Pie Chart */}
                                    <div style={{ backgroundColor: 'white', borderRadius: '32px', padding: '1.8rem', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', border: '1px solid #F0F2F5' }}>
                                        <div style={{ marginBottom: '1.5rem' }}>
                                            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '900', color: '#111827' }}>💰 Distribución de Ventas</h3>
                                            <p style={{ margin: '0.1rem 0 0 0', fontSize: '0.8rem', color: '#6B7280', fontWeight: '600' }}>Balance B2B vs B2C</p>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '140px' }}>
                                            <SalesPieChart 
                                                totalB2B={orders.filter(o => o.is_b2b).reduce((sum, o) => sum + (o.total || 0), 0)}
                                                totalB2C={orders.filter(o => !o.is_b2b).reduce((sum, o) => sum + (o.total || 0), 0)}
                                            />
                                        </div>
                                    </div>

                                    {/* Task Box */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: '900', color: '#111827' }}>⚡ Alertas de Seguimiento</h3>
                                            <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#EF4444', backgroundColor: '#FEF2F2', padding: '0.4rem 0.8rem', borderRadius: '20px' }}>VENCIDAS</span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', overflowY: 'auto', maxHeight: '500px', paddingRight: '0.5rem' }}>
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
                                                <div style={{ textAlign: 'center', padding: '4rem 2rem', backgroundColor: '#F0FDF4', borderRadius: '32px', border: '2px dashed #DCFCE7' }}>
                                                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏆</div>
                                                    <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: '#166534' }}>¡Gran trabajo comercial!</h4>
                                                    <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: '#15803D', fontWeight: '600' }}>No tienes tareas pendientes vencidas en este momento.</p>
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

function KPICard({ title, value, icon, color, subtitle }: { title: string, value: number | string, icon: string, color: string, subtitle: string }) {
    return (
        <div style={{
            backgroundColor: 'white',
            padding: '1.5rem',
            borderRadius: '24px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
            display: 'flex',
            alignItems: 'center',
            gap: '1.2rem',
            border: '1px solid #E5E7EB',
            borderTop: `4px solid ${color}`,
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            cursor: 'pointer'
        }} onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.06)';
        }} onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.02)';
        }}>
            <div style={{ backgroundColor: `${color}10`, width: '56px', height: '56px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', color: color, flexShrink: 0 }}>
                {icon}
            </div>
            <div>
                <div style={{ fontSize: '0.75rem', color: '#6B7280', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>
                <div style={{ fontSize: '1.8rem', fontWeight: '900', color: '#111827', margin: '0.2rem 0', lineHeight: 1, letterSpacing: '-0.02em' }}>{value}</div>
                <div style={{ fontSize: '0.75rem', color: '#9CA3AF', fontWeight: '700' }}>{subtitle}</div>
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
                background: `conic-gradient(#6366F1 ${b2bPercent}%, #10B981 0)`,
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
            }}>
                <div style={{
                    width: '80px',
                    height: '80px',
                    backgroundColor: 'white',
                    borderRadius: '50%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: 'inset 0 4px 15px rgba(0,0,0,0.08)'
                }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: '800', color: '#94A3B8' }}>TOTAL</span>
                    <span style={{ fontSize: '0.9rem', fontWeight: '900', color: '#1E293B' }}>${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '4px', backgroundColor: '#0369A1' }} />
                    <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase' }}>Canal B2B</div>
                        <div style={{ fontSize: '0.95rem', fontWeight: '900', color: '#0369A1' }}>${totalB2B.toLocaleString()}</div>
                        <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748B' }}>{Math.round(b2bPercent)}% del total</div>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderTop: '1px solid #F1F5F9', paddingTop: '1rem' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '4px', backgroundColor: '#15803D' }} />
                    <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase' }}>Canal B2C</div>
                        <div style={{ fontSize: '0.95rem', fontWeight: '900', color: '#15803D' }}>${totalB2C.toLocaleString()}</div>
                        <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748B' }}>{Math.round(b2cPercent)}% del total</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function FunnelGraphic({ leads }: { leads: Lead[] }) {
    const stages = [
        { label: 'Prospectos', status: 'new', color: '#6366F1' },
        { label: 'En Gestión', status: 'contacted', color: '#F59E0B' },
        { label: 'Convertidos', status: 'converted', color: '#10B981' },
        { label: 'Descartados', status: 'rejected', color: '#EF4444' }
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
            {stages.map((stage, index) => {
                const count = leads.filter(l => l.status === stage.status).length;
                const percent = leads.length > 0 ? (count / leads.length) * 100 : 0;
                // Efecto de reducción de ancho intencional para forma de embudo (opcional pero estético)
                const containerWidth = 100 - (index * 8); 
                
                return (
                    <div key={stage.status} style={{ width: `${containerWidth}%`, minWidth: '140px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.8rem', fontWeight: '800' }}>
                            <div style={{ textTransform: 'uppercase', letterSpacing: '0.05rem', fontSize: '0.65rem', color: '#94A3B8' }}>{stage.label}</div>
                            <div style={{ color: stage.color, fontSize: '0.85rem' }}>{count} <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>({Math.round(percent)}%)</span></div>
                        </div>
                        <div style={{ 
                            height: '10px', 
                            backgroundColor: '#F8FAFB', 
                            borderRadius: '20px', 
                            border: '1px solid #E5E7EB',
                            display: 'flex',
                            justifyContent: 'center', // AQUÍ CENTRAMOS EL CONTENIDO
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
            borderRadius: '20px', 
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
                <div style={{ fontWeight: '900', color: '#9F1239', fontSize: '1rem', marginBottom: '0.2rem' }}>{lead.company_name || lead.contact_name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.65rem', padding: '2px 8px', backgroundColor: '#BE123C', color: 'white', borderRadius: '6px', fontWeight: '900', letterSpacing: '0.05em' }}>⚠️ VENCIDA</span>
                    <span style={{ fontSize: '0.8rem', color: '#E11D48', fontWeight: '800' }}>
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
                    style={{ backgroundColor: '#10B981', color: 'white', border: 'none', width: '38px', height: '38px', borderRadius: '10px', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(16, 185, 129, 0.2)' }}
                    title="WhatsApp Directo"
                >
                    💬
                </button>
                <button 
                    onClick={onWaitlist}
                    style={{ backgroundColor: 'white', color: '#9F1239', border: '1px solid #FFE4E6', padding: '0 1rem', borderRadius: '10px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '900', height: '38px' }}
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
            backgroundColor: 'white', 
            borderRadius: '24px', 
            padding: '2rem', 
            boxShadow: '0 8px 30px rgba(0,0,0,0.04)',
            border: '1px solid #F0F2F5',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
            position: 'relative',
            overflow: 'hidden'
        }}>
            {/* Tag / Status */}
            <div style={{ 
                position: 'absolute', 
                top: '1.5rem', 
                right: '1.5rem',
                padding: '0.4rem 0.8rem',
                borderRadius: '8px',
                fontSize: '0.7rem',
                fontWeight: '900',
                backgroundColor: isB2B ? (profileData?.is_corporate_parent ? '#7E22CE' : '#E0F2FE') : isB2C ? '#DCFCE7' : '#FEE2E2',
                color: isB2B ? (profileData?.is_corporate_parent ? 'white' : '#0369A1') : isB2C ? '#15803D' : '#991B1B',
                textTransform: 'uppercase'
            }}>
                {isB2B ? (profileData?.is_corporate_parent ? '🏦 GRUPO/PADRE' : '🏢 SUCURSAL') : isB2C ? 'Consumidor' : 'Prospecto'}
            </div>

            {/* Header */}
            <div>
                <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '900', color: '#111827', paddingRight: '120px', letterSpacing: '-0.02em' }}>
                    {isB2B ? profileData?.company_name : isB2C ? profileData?.contact_name : leadData?.company_name}
                </h3>
                {isB2B && profileData?.parent_id && (
                    <div style={{ fontSize: '0.75rem', color: '#6366F1', fontWeight: '800', marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ opacity: 0.8 }}>🖇️ Membro de:</span> <span style={{ textDecoration: 'underline' }}>{availableParents?.find(p => p.id === profileData.parent_id)?.company_name || 'Grupo Corporativo'}</span>
                    </div>
                )}
                {isB2B && profileData?.razon_social && <p style={{ margin: '0.4rem 0', fontSize: '0.85rem', color: '#6B7280', fontStyle: 'italic', fontWeight: '600' }}>{profileData.razon_social}</p>}
                {(isB2B || isLead) && <p style={{ margin: '0.6rem 0', fontSize: '0.95rem', color: '#374151', fontWeight: '800' }}>👤 {isB2B ? profileData?.contact_name : leadData?.contact_name}</p>}
            </div>

            {/* Content Fields */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.8rem' }}>
                {(isB2B || isLead || isB2C) && (
                    <InfoRow icon="📞" label="Contacto" value={data.phone} />
                )}
                {(isB2B || isLead || isB2C) && (
                    <InfoRow icon="📧" label="Email" value={data.email} />
                )}
                {isB2B && profileData?.nit && (
                    <InfoRow icon="🆔" label="NIT" value={profileData.nit} />
                )}
                {(isB2B || isB2C) && profileData && (
                    <InfoRow 
                        icon="📍" 
                        label="Ubicación" 
                        value={`${profileData.address || ''}${profileData.municipality || profileData.city ? `, ${profileData.municipality || profileData.city}` : ''}${profileData.department ? `, ${profileData.department}` : ''}`} 
                    />
                )}
                {(isB2B || isB2C) && profileData && profileData.latitude && profileData.longitude && (
                    <div style={{ fontSize: '0.75rem', color: '#0891B2', fontWeight: '700', paddingLeft: '1.5rem' }}>
                        🌐 {profileData.latitude.toFixed(4)}, {profileData.longitude.toFixed(4)} 
                        <span style={{ marginLeft: '8px', color: '#059669' }}>✓ Geo</span>
                    </div>
                )}
                {isB2B && profileData && (
                    <div style={{ padding: '1rem', backgroundColor: '#F8FAFC', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#718096', display: 'block', marginBottom: '0.6rem' }}>⚙️ MODELO DE COTIZACIÓN</label>
                        <select 
                            value={profileData.pricing_model_id || ''} 
                            onChange={(e) => onUpdatePricingModel && onUpdatePricingModel(profileData.id, e.target.value)}
                            style={{ 
                                width: '100%', 
                                padding: '0.6rem', 
                                borderRadius: '10px', 
                                border: '1px solid #CBD5E0', 
                                fontSize: '0.85rem', 
                                fontWeight: '700',
                                backgroundColor: profileData.pricing_model_id ? '#EFF6FF' : 'white',
                                color: profileData.pricing_model_id ? '#1D4ED8' : '#4A5568'
                            }}
                        >
                            <option value="">-- Sin Modelo Asignado --</option>
                            {pricingModels?.map((pm: PricingModel) => (
                                <option key={pm.id} value={pm.id}>{pm.name} ({pm.base_margin_percent}%)</option>
                            ))}
                        </select>
                        {selectedModel && (
                            <div style={{ marginTop: '0.8rem' }}>
                                {selectedModel.description && (
                                    <p style={{ margin: '0 0 0.4rem 0', fontSize: '0.8rem', color: '#64748B', fontStyle: 'italic', lineHeight: '1.2' }}>
                                        &quot;{selectedModel.description}&quot;
                                    </p>
                                )}
                                <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748B' }}>
                                    Margen base: <span style={{ color: '#059669', fontWeight: '800' }}>{selectedModel.base_margin_percent}%</span>
                                </p>
                            </div>
                        )}
                    </div>
                )}
                {isB2B && profileData && (
                    <InfoRow icon="💳" label="Crédito" value={`$${(profileData.credit_limit || 0).toLocaleString()} | ${profileData.payment_terms || 'Contado'}`} />
                )}
                {isB2B && profileData && profileData.delivery_restrictions && (
                    <div style={{ backgroundColor: '#FFFBEB', padding: '0.8rem', borderRadius: '12px', border: '1px solid #FEF3C7' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#B45309', display: 'block', marginBottom: '0.2rem' }}>⚠️ RESTRICCIONES</span>
                        <span style={{ fontSize: '0.8rem', color: '#92400E' }}>{profileData.delivery_restrictions}</span>
                    </div>
                )}
                {isB2C && profileData && profileData.total_orders !== undefined && (
                    <>
                        <InfoRow icon="🛒" label="Actividad" value={`${profileData.total_orders || 0} Pedidos | $${(profileData.total_spent || 0).toLocaleString()} totales`} />
                        {profileData.last_order && <InfoRow icon="📅" label="Último pedido" value={new Date(profileData.last_order as string).toLocaleDateString()} />}
                    </>
                )}
                {isLead && leadData && (
                    <>
                        {/* Negocio y Tamaño en 2 columnas */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', backgroundColor: '#F8FAFC', padding: '0.8rem', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
                            <div>
                                <label style={{ fontSize: '0.6rem', fontWeight: '800', color: '#94A3B8', display: 'block', textTransform: 'uppercase' }}>Tipo Negocio</label>
                                <div style={{ fontSize: '0.8rem', fontWeight: '800', color: '#334155' }}>{leadData.business_type || 'N/A'}</div>
                            </div>
                            <div>
                                <label style={{ fontSize: '0.6rem', fontWeight: '800', color: '#94A3B8', display: 'block', textTransform: 'uppercase' }}>Tamaño</label>
                                <div style={{ fontSize: '0.8rem', fontWeight: '800', color: '#334155' }}>{leadData.business_size || 'N/A'}</div>
                            </div>
                        </div>

                        {/* Contactos y Último en 2 columnas */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.8rem', padding: '0.8rem', backgroundColor: '#F1F5F9', borderRadius: '14px', border: '1px solid #E2E8F0' }}>
                            <div>
                                <label style={{ fontSize: '0.6rem', fontWeight: '800', color: '#64748B', display: 'block' }}>CONTACTOS</label>
                                <div style={{ fontSize: '0.85rem', fontWeight: '900', color: '#1E293B' }}>📞 {leadData.contact_count || 0} veces</div>
                            </div>
                            {leadData.last_contact_date && (
                                <div>
                                    <label style={{ fontSize: '0.6rem', fontWeight: '800', color: '#64748B', display: 'block' }}>ÚLTIMO</label>
                                    <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#475569' }}>{new Date(leadData.last_contact_date as string).toLocaleDateString()}</div>
                                </div>
                            )}
                        </div>

                        {leadData.next_contact_date && (
                            <div style={{ 
                                padding: '0.7rem', 
                                borderRadius: '14px', 
                                backgroundColor: new Date(leadData.next_contact_date as string) < new Date() ? '#FEF2F2' : '#F0FDF4',
                                border: `1px solid ${new Date(leadData.next_contact_date as string) < new Date() ? '#FEE2E2' : '#DCFCE7'}`,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}>
                                <span style={{ fontSize: '1rem' }}>{new Date(leadData.next_contact_date as string) < new Date() ? '🚩' : '📅'}</span>
                                <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <label style={{ fontSize: '0.65rem', fontWeight: '800', color: new Date(leadData.next_contact_date as string) < new Date() ? '#991B1B' : '#166534' }}>
                                        {new Date(leadData.next_contact_date as string) < new Date() ? 'VENCIDA' : 'SIGUIENTE'}
                                    </label>
                                    <div style={{ fontSize: '0.85rem', fontWeight: '900', color: new Date(leadData.next_contact_date as string) < new Date() ? '#B91C1C' : '#15803D' }}>
                                        {new Date(leadData.next_contact_date as string).toLocaleDateString()}
                                    </div>
                                </div>
                            </div>
                        )}

                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#718096', display: 'block', marginBottom: '0.4rem' }}>ESTADO DE GESTIÓN</label>
                            <select
                                value={leadData.status}
                                onChange={(e) => onUpdateStatus && onUpdateStatus(leadData.id, e.target.value)}
                                style={{ 
                                    width: '100%', 
                                    padding: '0.8rem', 
                                    borderRadius: '12px', 
                                    border: '1px solid #E2E8F0',
                                    fontWeight: '700',
                                    backgroundColor: '#F8FAFC'
                                }}
                            >
                                <option value="new">🆕 Nuevo Contacto</option>
                                <option value="contacted">📞 Contactado</option>
                                <option value="converted">✅ Convertido a Cliente</option>
                                <option value="rejected">❌ Descartado</option>
                            </select>
                        </div>

                        {/* Datos de Entrega (GPS + Dirección sugerida) */}
                        <div style={{ backgroundColor: '#F0FDF4', borderRadius: '16px', border: '1px solid #DCFCE7', overflow: 'hidden' }}>
                            <div style={{ padding: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #DCFCE7' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '1rem' }}>📍</span>
                                    <div style={{ fontSize: '0.8rem', fontWeight: '900', color: '#15803D', fontFamily: 'monospace' }}>
                                        {leadData.latitude && leadData.longitude ? `${leadData.latitude.toFixed(6)}, ${leadData.longitude.toFixed(6)}` : 'SIn coordenadas'}
                                    </div>
                                </div>
                                {leadData.latitude && leadData.longitude && (
                                    <a 
                                        href={`https://www.google.com/maps?q=${leadData.latitude},${leadData.longitude}`} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        style={{ color: '#0891B2', textDecoration: 'none', fontSize: '0.75rem', fontWeight: '900', backgroundColor: 'white', padding: '0.3rem 0.6rem', borderRadius: '8px', border: '1px solid #E0F2FE' }}
                                    >
                                        Mapa ↗
                                    </a>
                                )}
                            </div>
                            
                            {/* Extracción de dirección de nota o campo directo */}
                            {(leadData.address || leadData.notes?.includes('DIR:')) && (
                                <div style={{ padding: '0.8rem', backgroundColor: 'white' }}>
                                    <label style={{ fontSize: '0.6rem', fontWeight: '800', color: '#94A3B8', display: 'block', textTransform: 'uppercase', marginBottom: '0.2rem' }}>Punto de Entrega Sugerido</label>
                                    <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#1E293B' }}>
                                        🏠 {leadData.address || leadData.notes?.split('|').find(p => p.trim().startsWith('DIR:'))?.replace('DIR:', '').trim() || 'Ver en bitácora'}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Notas Limpias (Sin basura del bot) */}
                        {leadData.notes && (
                            <div style={{ backgroundColor: '#F8FAFC', padding: '0.8rem', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
                                <span style={{ fontSize: '0.65rem', fontWeight: '800', color: '#94A3B8', display: 'block', marginBottom: '0.3rem', textTransform: 'uppercase' }}>📝 BITÁCORA</span>
                                <span style={{ fontSize: '0.8rem', color: '#475569', lineHeight: '1.2', display: 'block' }}>
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
            <div style={{ marginTop: 'auto', paddingTop: '1.5rem', borderTop: '1px solid #F3F4F6', display: 'flex', gap: '0.6rem' }}>
                {(onViewDetails && !isLead) && (
                    <button 
                        onClick={onViewDetails}
                        style={{ flex: 1, padding: '0.8rem', borderRadius: '12px', border: '1px solid #E5E7EB', background: 'white', fontWeight: '800', cursor: 'pointer', transition: 'all 0.2s', fontSize: '0.8rem', color: '#374151' }} 
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F9FAFB'} 
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                    >
                        Expediente
                    </button>
                )}
                {(isB2B || isB2C || isLead) && (
                    <button 
                        onClick={onEdit}
                        style={{ flex: 1, padding: '0.8rem', borderRadius: '12px', border: '1px solid #E5E7EB', background: 'white', fontWeight: '800', cursor: 'pointer', fontSize: '0.8rem', color: '#374151' }}
                    >
                        Gestionar
                    </button>
                )}
                {isLead && onRegisterContact && (
                    <button 
                        onClick={onRegisterContact}
                        style={{ flex: 1.5, padding: '0.8rem', borderRadius: '12px', border: 'none', background: '#10B981', color: 'white', fontWeight: '900', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.8rem', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)' }}
                    >
                        <span>✅</span> Reportar Contacto
                    </button>
                )}
                <button 
                    onClick={handleWhatsApp}
                    title="Enviar WhatsApp"
                    style={{ 
                        padding: '0.8rem 1rem', 
                        borderRadius: '12px', 
                        border: 'none', 
                        background: '#22C55E', 
                        color: 'white', 
                        fontWeight: '800', 
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        boxShadow: '0 4px 12px rgba(34, 197, 94, 0.2)',
                        transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                    <span style={{ fontSize: '1.2rem' }}>💬</span>
                </button>
            </div>
        </div>
    );
}

function InfoRow({ icon, label, value }: { icon: string, label: string, value: string | number | undefined | null }) {
    return (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '1.1rem' }}>{icon}</span>
            <div style={{ fontSize: '0.85rem' }}>
                <span style={{ color: '#718096', fontWeight: '600' }}>{label}: </span>
                <span style={{ color: '#1A202C', fontWeight: '800' }}>{value || 'N/A'}</span>
            </div>
        </div>
    );
}

function EmptyState({ text }: { text: string }) {
    return (
        <div style={{ textAlign: 'center', padding: '4rem', backgroundColor: 'white', borderRadius: '24px', border: '1px solid #E5E7EB', marginTop: '1rem' }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🏆</div>
            <p style={{ color: '#6B7280', fontWeight: '800', fontSize: '1.1rem' }}>{text}</p>
        </div>
    );
}

function ListView({ data, type, viewMode, pricingModels, availableParents, onEdit, onViewDetails, onUpdatePricingModel, onUpdateStatus, onRegisterContact }: any) {
    if (data.length === 0) return <EmptyState text={`No se encontraron ${type === 'lead' ? 'prospectos' : 'clientes'} en este momento.`} />;

    if (viewMode === 'table') {
        return (
            <div style={{ backgroundColor: 'white', borderRadius: '16px', border: '1px solid #E5E7EB', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                    <thead>
                        <tr style={{ backgroundColor: '#F8FAFB' }}>
                            <th style={{ padding: '1rem', textAlign: 'left', color: '#111827', fontWeight: '900', fontSize: '0.7rem', textTransform: 'uppercase' }}>Nombre / Empresa</th>
                            <th style={{ padding: '1rem', textAlign: 'left', color: '#111827', fontWeight: '900', fontSize: '0.7rem', textTransform: 'uppercase' }}>Contacto Principal</th>
                            <th style={{ padding: '1rem', textAlign: 'left', color: '#111827', fontWeight: '900', fontSize: '0.7rem', textTransform: 'uppercase' }}>Ubicación</th>
                            {type !== 'b2c' && <th style={{ padding: '1rem', textAlign: 'left', color: '#111827', fontWeight: '900', fontSize: '0.7rem', textTransform: 'uppercase' }}>Modelo / Estado</th>}
                            <th style={{ padding: '1rem', textAlign: 'center', color: '#111827', fontWeight: '900', fontSize: '0.7rem', textTransform: 'uppercase' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((item: any, i: number) => {
                            const isLeads = type === 'lead';
                            const title = isLeads ? (item.company_name || item.contact_name) : (type === 'b2c' ? item.contact_name : item.company_name);
                            const subtitle = type === 'b2b' && item.is_corporate_parent ? '🏦 GRUPO PADRE' : '';
                            
                            return (
                                <tr key={item.id || i} style={{ borderTop: '1px solid #F3F4F6', transition: 'all 0.1s' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F9FAFB'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                    <td style={{ padding: '1rem' }}>
                                        <div style={{ fontWeight: '800', color: '#111827', fontSize: '0.9rem' }}>{title}</div>
                                        {subtitle && <div style={{ fontSize: '0.65rem', color: '#7E22CE', fontWeight: '900', marginTop: '2px' }}>{subtitle}</div>}
                                        {item.nit && <div style={{ fontSize: '0.7rem', color: '#9CA3AF', fontWeight: '700' }}>NIT: {item.nit}</div>}
                                    </td>
                                    <td style={{ padding: '1rem' }}>
                                        <div style={{ fontWeight: '700', color: '#374151', fontSize: '0.85rem' }}>{item.contact_name}</div>
                                        <div style={{ fontSize: '0.8rem', color: '#6B7280' }}>📞 {item.phone}</div>
                                    </td>
                                    <td style={{ padding: '1rem' }}>
                                        <div style={{ fontSize: '0.8rem', color: '#374151', fontWeight: '600' }}>{item.city || item.municipality || 'N/A'}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>{item.address?.slice(0, 30)}...</div>
                                    </td>
                                    {type !== 'b2c' && (
                                        <td style={{ padding: '1rem' }}>
                                            {isLeads ? (
                                                <span style={{ 
                                                    padding: '2px 8px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: '900',
                                                    backgroundColor: item.status === 'new' ? '#E0E7FF' : item.status === 'contacted' ? '#FEF3C7' : '#DCFCE7',
                                                    color: item.status === 'new' ? '#4338CA' : item.status === 'contacted' ? '#92400E' : '#15803D'
                                                }}>
                                                    {item.status?.toUpperCase()}
                                                </span>
                                            ) : (
                                                <div style={{ fontSize: '0.8rem', fontWeight: '800', color: '#111827' }}>
                                                    {pricingModels?.find((m: any) => m.id === item.pricing_model_id)?.name || 'Sin Modelo'}
                                                </div>
                                            )}
                                        </td>
                                    )}
                                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                            <button onClick={() => onViewDetails(item)} style={{ padding: '6px', borderRadius: '8px', border: '1px solid #E5E7EB', background: 'white', cursor: 'pointer' }} title="Ver Expediente">📄</button>
                                            <button onClick={() => onEdit(item)} style={{ padding: '6px', borderRadius: '8px', border: '1px solid #E5E7EB', background: 'white', cursor: 'pointer' }} title="Editar">⚙️</button>
                                            {isLeads && onRegisterContact && <button onClick={() => onRegisterContact(item.id)} style={{ padding: '6px', borderRadius: '8px', border: 'none', background: '#10B981', color: 'white', cursor: 'pointer' }} title="Reportar Contacto">✅</button>}
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
            <div style={{ backgroundColor: 'white', borderRadius: '32px', width: '100%', maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto', position: 'relative', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
                <button onClick={onClose} style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', border: 'none', background: '#F3F4F6', width: '40px', height: '40px', borderRadius: '50%', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
                
                <div style={{ padding: '3rem' }}>
                    <header style={{ marginBottom: '2.5rem' }}>
                        <span style={{ color: '#0891B2', fontWeight: '800', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.1rem' }}>
                            {client.role === 'b2c_client' ? 'Ficha de Consumidor Final' : (client as unknown as Lead).status ? 'Ficha de Prospecto (Lead)' : 'Ficha de Cliente Institucional'}
                        </span>
                        <h2 style={{ fontSize: '2.5rem', fontWeight: '900', color: '#111827', margin: '0.5rem 0' }}>
                            {client.role === 'b2c_client' ? client.contact_name : (client.company_name || client.contact_name)}
                        </h2>
                        {client.role !== 'b2c_client' && client.razon_social && <p style={{ color: '#6B7280', fontSize: '1.2rem' }}>{client.razon_social}</p>}
                    </header>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
                        <section>
                            <h4 style={{ fontSize: '1rem', fontWeight: '800', color: '#374151', borderBottom: '2px solid #F3F4F6', paddingBottom: '0.5rem', marginBottom: '1rem' }}>📍 Información Geográfica</h4>
                            <ModalRow label="Dirección" value={client.address} />
                            <ModalRow label="Municipio" value={client.municipality || client.city} />
                            <ModalRow label="Departamento" value={client.department} />
                        </section>

                        <section>
                            <h4 style={{ fontSize: '1rem', fontWeight: '800', color: '#374151', borderBottom: '2px solid #F3F4F6', paddingBottom: '0.5rem', marginBottom: '1rem' }}>👤 Contacto Comercial</h4>
                            <ModalRow label="Nombre" value={client.contact_name} />
                            <ModalRow label="Teléfono" value={client.phone} />
                            <ModalRow label="Email" value={client.email} />
                        </section>

                        <section>
                            <h4 style={{ fontSize: '1rem', fontWeight: '800', color: '#374151', borderBottom: '2px solid #F3F4F6', paddingBottom: '0.5rem', marginBottom: '1rem' }}>💳 Datos Financieros</h4>
                            <ModalRow label="NIT" value={client.nit} />
                            <ModalRow label="Límite Crédito" value={`$${(client.credit_limit || 0).toLocaleString()}`} />
                            <ModalRow label="Términos" value={client.payment_terms} />
                        </section>

                         <section>
                            <h4 style={{ fontSize: '1rem', fontWeight: '800', color: '#10B981', borderBottom: '2px solid #D1FAE5', paddingBottom: '0.5rem', marginBottom: '1rem' }}>🌍 Geolocalización</h4>
                            <ModalRow label="Latitud" value={client.latitude?.toString() || 'Punto no asignado'} />
                            <ModalRow label="Longitud" value={client.longitude?.toString() || 'Punto no asignado'} />
                            <ModalRow label="Estado" value={client.geocoding_status === 'success' ? '✅ Verificado' : '⏳ Pendiente/Manual'} />
                        </section>

                        <section>
                            <h4 style={{ fontSize: '1rem', fontWeight: '800', color: '#374151', borderBottom: '2px solid #F3F4F6', paddingBottom: '0.5rem', marginBottom: '1rem' }}>📈 Configuración Comercial</h4>
                            <ModalRow 
                                label="Modelo" 
                                value={client.role === 'b2c_client' ? 'Modelo B2C (Estándar)' : (selectedModel?.name || 'No asignado')} 
                            />
                            <ModalRow 
                                label="Estructura" 
                                value={client.is_corporate_parent ? '🏦 GRUPO CORPORATIVO (PADRE)' : (client.parent_id ? '🖇️ Sucursal Asociada' : '👤 Independiente')} 
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
                                <p style={{ fontSize: '0.85rem', color: '#6B7280', marginTop: '0.5rem', fontStyle: 'italic' }}>&quot;{selectedModel.description}&quot;</p>
                            )}
                        </section>

                        {(client as unknown as Lead).status && (
                            <section>
                                <h4 style={{ fontSize: '1rem', fontWeight: '800', color: '#6366F1', borderBottom: '2px solid #E0E7FF', paddingBottom: '0.5rem', marginBottom: '1rem' }}>🔥 Perfilamiento de Prospecto</h4>
                                <ModalRow label="Tipo de Negocio" value={(client as unknown as Lead).business_type} />
                                <ModalRow label="Tamaño / Escala" value={(client as unknown as Lead).business_size} />
                                <ModalRow label="Contactos Realizados" value={(client as unknown as Lead).contact_count || 0} />
                                <ModalRow label="Último Contacto" value={(client as unknown as Lead).last_contact_date ? new Date(String((client as unknown as Lead).last_contact_date)).toLocaleString() : 'Nunca'} />
                            </section>
                        )}
                    </div>

                    {client.delivery_restrictions && (
                        <div style={{ marginTop: '2rem', padding: '1.5rem', backgroundColor: '#FFFBEB', borderRadius: '16px', border: '1px solid #FEF3C7' }}>
                            <h4 style={{ margin: '0 0 0.5rem 0', color: '#92400E', fontSize: '0.9rem', fontWeight: '800' }}>⚠️ RESTRICCIONES DE ENTREGA</h4>
                            <p style={{ margin: 0, color: '#B45309' }}>{client.delivery_restrictions}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function ModalRow({ label, value }: { label: string, value?: string | number | null }) {
    return (
        <div style={{ marginBottom: '0.8rem' }}>
            <span style={{ display: 'block', fontSize: '0.75rem', color: '#9CA3AF', fontWeight: '700', textTransform: 'uppercase' }}>{label}</span>
            <span style={{ fontSize: '1rem', color: '#111827', fontWeight: '600' }}>{value || 'No registrado'}</span>
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
            <div style={{ backgroundColor: 'white', borderRadius: '32px', width: '100%', maxWidth: '900px', maxHeight: '95vh', overflowY: 'auto', padding: '3rem', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
                <header style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <h2 style={{ fontSize: '2rem', fontWeight: '900', color: '#111827', margin: 0 }}>
                            {isEdit ? `Editando: ${editData.company_name}` : 'Nuevo Cliente Institucional'}
                        </h2>
                        <p style={{ color: '#6B7280', margin: '0.5rem 0' }}>Gestiona la información comercial y logística del cliente.</p>
                    </div>
                    <button onClick={onClose} style={{ border: 'none', background: '#F3F4F6', width: '40px', height: '40px', borderRadius: '50%', cursor: 'pointer' }}>✕</button>
                </header>

                <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                    {/* SECCIÓN MUESTRA EL ESPACIO PARA RESTRICCIONES SIEMPRE */}
                    <section style={{ gridColumn: '1 / -1', backgroundColor: '#FFFBEB', padding: '1.5rem', borderRadius: '24px', border: '1px solid #FEF3C7' }}>
                        <h4 style={{ fontSize: '1rem', fontWeight: '800', color: '#92400E', paddingBottom: '0.5rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>⚠️</span> RESTRICCIONES DE ENTREGA (LOGÍSTICA)
                        </h4>
                        <textarea 
                            value={formData.delivery_restrictions}
                            onChange={(e) => setFormData({...formData, delivery_restrictions: e.target.value})}
                            placeholder="Indica aquí si hay horarios específicos, muelles de carga, o si se requiere algún equipo especial para la entrega..."
                            style={{ width: '100%', padding: '1.2rem', borderRadius: '16px', border: '1px solid #FEF3C7', minHeight: '100px', outline: 'none', backgroundColor: 'white', fontSize: '1rem', fontWeight: '600' }}
                        />
                    </section>

                    {/* SECCIÓN JERARQUÍA CORPORATIVA */}
                    <section style={{ gridColumn: '1 / -1', backgroundColor: '#F3E8FF', padding: '1.5rem', borderRadius: '24px', border: '1px solid #E9D5FF' }}>
                        <h4 style={{ fontSize: '1rem', fontWeight: '800', color: '#7E22CE', paddingBottom: '0.5rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>🏦</span> ESTRUCTURA CORPORATIVA
                        </h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <input 
                                    type="checkbox" 
                                    checked={formData.is_corporate_parent}
                                    onChange={(e) => setFormData({...formData, is_corporate_parent: e.target.checked, parent_id: ''})}
                                    style={{ width: '20px', height: '20px', accentColor: '#7E22CE' }}
                                />
                                <label style={{ fontWeight: '800', color: '#581C87' }}>¿Es un GRUPO PADRE / NODO DE FACTURACIÓN?</label>
                            </div>

                            {!formData.is_corporate_parent && (
                                <div>
                                    <label style={{ fontSize: '0.8rem', fontWeight: '800', color: '#581C87', display: 'block', marginBottom: '0.5rem' }}>ASOCIAR A UN PADRE Existente (Sede de...)</label>
                                    <select 
                                        value={formData.parent_id}
                                        onChange={(e) => setFormData({...formData, parent_id: e.target.value})}
                                        style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '2px solid #E9D5FF', fontWeight: '700' }}
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
                        <h4 style={{ fontSize: '1rem', fontWeight: '800', color: '#0891B2', borderBottom: '2px solid #E0F2FE', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>DATOS DE LA EMPRESA</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem' }}>
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
                        <h4 style={{ fontSize: '1rem', fontWeight: '800', color: '#374151', borderBottom: '2px solid #F3F4F6', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>CONTACTO</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                            <FormField label="Responsable" value={formData.contact_name} onChange={(v: string) => setFormData({...formData, contact_name: v})} required />
                            <FormField label="Teléfono" value={formData.phone} onChange={(v: string) => setFormData({...formData, phone: v})} required />
                        </div>
                    </section>

                    <section>
                        <h4 style={{ fontSize: '1rem', fontWeight: '800', color: '#374151', borderBottom: '2px solid #F3F4F6', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>UBICACIÓN</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                            <FormField label="Dirección" value={formData.address} onChange={(v: string) => setFormData({...formData, address: v})} required />
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <FormField label="Municipio" value={formData.municipality} onChange={(v: string) => setFormData({...formData, municipality: v, city: v})} />
                                <FormField label="Dpto" value={formData.department} onChange={(v: string) => setFormData({...formData, department: v})} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', backgroundColor: '#F0F9FF', padding: '1rem', borderRadius: '12px', border: '1px solid #BAE6FD' }}>
                                <FormField label="Latitud" type="number" step="any" value={formData.latitude} onChange={(v: string) => setFormData({...formData, latitude: v})} />
                                <FormField label="Longitud" type="number" step="any" value={formData.longitude} onChange={(v: string) => setFormData({...formData, longitude: v})} />
                                <p style={{ gridColumn: '1 / -1', margin: 0, fontSize: '0.7rem', color: '#0369A1', fontWeight: '700' }}>
                                    💡 Las coordenadas permiten optimizar las rutas de despacho automáticamente.
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* SECCIÓN COMERCIAL Y FINANCIERA */}
                    <section style={{ gridColumn: '1 / -1' }}>
                        <h4 style={{ fontSize: '1rem', fontWeight: '800', color: '#10B981', borderBottom: '2px solid #D1FAE5', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>CONFIGURACIÓN COMERCIAL</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <label style={{ fontSize: '0.8rem', fontWeight: '800', color: '#374151' }}>Modelo de Precios</label>
                                <select 
                                    value={formData.pricing_model_id} 
                                    onChange={(e) => setFormData({...formData, pricing_model_id: e.target.value})}
                                    style={{ padding: '0.8rem', borderRadius: '12px', border: '1px solid #E5E7EB', fontWeight: '700' }}
                                >
                                    <option value="">-- Seleccionar --</option>
                                    {pricingModels.map((pm: PricingModel) => (
                                        <option key={pm.id} value={pm.id}>{pm.name} ({pm.base_margin_percent}%)</option>
                                    ))}
                                </select>
                            </div>
                            <FormField label="Cupo de Crédito ($)" type="number" value={formData.credit_limit} onChange={(v: string) => setFormData({...formData, credit_limit: parseFloat(v) || 0})} />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <label style={{ fontSize: '0.8rem', fontWeight: '800', color: '#374151' }}>Términos de Pago</label>
                                <select 
                                    value={formData.payment_terms} 
                                    onChange={(e) => setFormData({...formData, payment_terms: e.target.value})}
                                    style={{ padding: '0.8rem', borderRadius: '12px', border: '1px solid #E5E7EB', fontWeight: '700' }}
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
                        <button type="button" onClick={onClose} style={{ flex: 1, padding: '1.2rem', borderRadius: '20px', border: 'none', background: '#F3F4F6', color: '#4B5563', fontWeight: '800', cursor: 'pointer' }}>Cerrar</button>
                        <button 
                            type="submit" 
                            disabled={saving}
                            style={{ flex: 2, padding: '1.2rem', borderRadius: '20px', border: 'none', background: '#0891B2', color: 'white', fontWeight: '800', cursor: 'pointer', boxShadow: '0 10px 15px -3px rgba(8, 145, 178, 0.3)' }}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: '800', color: '#374151' }}>
                {label} {required && <span style={{ color: '#EF4444' }}>*</span>}
            </label>
            <input 
                type={type}
                step={step}
                value={value || ''}
                onChange={(e) => onChange(e.target.value)}
                required={required}
                style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '1px solid #E5E7EB', outline: 'none', fontWeight: '600' }}
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
                window.showToast?.('Venta potencial registrada ✨', 'success');
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
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(8, 145, 178, 0.1)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '1rem' }}>
            <div style={{ backgroundColor: 'white', borderRadius: '32px', width: '100%', maxWidth: '600px', padding: '2.5rem', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)' }}>
                <header style={{ marginBottom: '2rem' }}>
                    <h2 style={{ fontSize: '1.8rem', fontWeight: '900', color: '#1E293B' }}>{isEdit ? '✏️ Editar Prospecto' : '🔥 Nuevo Prospecto Manual'}</h2>
                    <p style={{ color: '#64748B', fontWeight: '500' }}>{isEdit ? 'Actualiza la información del seguimiento.' : 'Ingresa los datos para iniciar el seguimiento.'}</p>
                </header>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
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
                            <label style={{ fontSize: '0.8rem', fontWeight: '800', color: '#334155' }}>Giro de Negocio</label>
                            <select 
                                value={formData.business_type} 
                                onChange={(e) => setFormData({...formData, business_type: e.target.value})}
                                style={{ padding: '0.8rem', borderRadius: '12px', border: '1px solid #E2E8F0', fontWeight: '700' }}
                            >
                                <option value="">-- Seleccionar --</option>
                                <option value="Restaurante">Restaurante</option>
                                <option value="Fruver">Fruver / Tienda</option>
                                <option value="Hogar">Hogar / Persona</option>
                                <option value="Otro">Otro</option>
                            </select>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            <label style={{ fontSize: '0.8rem', fontWeight: '800', color: '#334155' }}>Escala</label>
                            <select 
                                value={formData.business_size} 
                                onChange={(e) => setFormData({...formData, business_size: e.target.value})}
                                style={{ padding: '0.8rem', borderRadius: '12px', border: '1px solid #E2E8F0', fontWeight: '700' }}
                            >
                                <option value="">-- Seleccionar --</option>
                                <option value="Pequeño">Pequeño</option>
                                <option value="Mediano">Mediano</option>
                                <option value="Grande">Grande</option>
                            </select>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: '800', color: '#334155' }}>Notas Iniciales</label>
                        <textarea 
                            value={formData.notes}
                            onChange={(e) => setFormData({...formData, notes: e.target.value})}
                            placeholder="Ej: Interesado en precios de papa..."
                            style={{ width: '100%', padding: '1rem', borderRadius: '12px', border: '1px solid #E2E8F0', minHeight: '80px', outline: 'none', fontStyle: 'italic' }}
                        />
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                        <button type="button" onClick={onClose} style={{ flex: 1, padding: '1rem', borderRadius: '16px', background: '#F1F5F9', border: 'none', fontWeight: '800', cursor: 'pointer' }}>Cancelar</button>
                        <button type="submit" disabled={saving} style={{ flex: 2, padding: '1rem', borderRadius: '16px', background: '#0891B2', color: 'white', border: 'none', fontWeight: '900', cursor: 'pointer', boxShadow: '0 10px 15px -3px rgba(8, 145, 178, 0.3)' }}>
                            {saving ? 'Guardando...' : (isEdit ? '💾 Actualizar Prospecto' : '🚀 Iniciar Seguimiento')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
