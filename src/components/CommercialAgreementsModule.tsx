'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { THEME, formatMoney, formatNumber } from '@/lib/adminTheme';
import { 
    Search, 
    Calendar, 
    Clock, 
    AlertCircle, 
    Eye, 
    RefreshCw, 
    Check, 
    X, 
    ChevronRight, 
    Building2, 
    FileText 
} from 'lucide-react';

interface Agreement {
    id: string;
    quote_number: number;
    client_id: string;
    client_name: string;
    model_id: string;
    model_snapshot_name: string;
    subtotal_amount: number;
    total_tax_amount: number;
    total_amount: number;
    status: string;
    start_date: string;
    valid_until: string;
    created_at: string;
    profiles?: {
        company_name?: string;
        contact_name?: string;
        nit?: string;
        phone?: string;
        address?: string;
    };
}

interface AgreementItem {
    id: string;
    product_id: string;
    product_name: string;
    quantity: number;
    cost_basis: number;
    margin_percent: number;
    unit_price: number;
    iva_rate: number;
    iva_amount: number;
    total_price: number;
    products?: {
        accounting_id?: string;
        unit_of_measure?: string;
    };
}

export default function CommercialAgreementsModule() {
    const [agreements, setAgreements] = useState<Agreement[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'warning' | 'expired'>('all');
    
    // Details Drawer State
    const [selectedAgreement, setSelectedAgreement] = useState<Agreement | null>(null);
    const [agreementItems, setAgreementItems] = useState<AgreementItem[]>([]);
    const [loadingItems, setLoadingItems] = useState(false);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    // Renewal Modal State
    const [renewTarget, setRenewTarget] = useState<Agreement | null>(null);
    const [newExpiryDate, setNewExpiryDate] = useState('');
    const [renewing, setRenewing] = useState(false);

    // Notification State
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const fetchAgreements = async () => {
        setLoading(true);
        try {
            // Fetch quotes where status is 'agreement' and join profiles
            const { data, error } = await supabase
                .from('quotes')
                .select('*, profiles:client_id (company_name, contact_name, nit, phone, address)')
                .eq('status', 'agreement')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setAgreements(data || []);
        } catch (err: any) {
            console.error('Error fetching agreements:', err);
            showToast('Error al cargar acuerdos: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAgreements();
    }, []);

    const handleViewPrices = async (agreement: Agreement) => {
        setSelectedAgreement(agreement);
        setIsDrawerOpen(true);
        setLoadingItems(true);
        try {
            const { data, error } = await supabase
                .from('quote_items')
                .select('*, products:product_id (accounting_id, unit_of_measure)')
                .eq('quote_id', agreement.id);

            if (error) throw error;
            setAgreementItems(data || []);
        } catch (err: any) {
            console.error('Error fetching agreement items:', err);
            showToast('Error al cargar lista de precios: ' + err.message, 'error');
        } finally {
            setLoadingItems(false);
        }
    };

    const handleOpenRenew = (agreement: Agreement) => {
        setRenewTarget(agreement);
        // Default to 30 days from now or current valid_until
        const current = agreement.valid_until ? new Date(agreement.valid_until) : new Date();
        if (!agreement.valid_until) {
            current.setDate(current.getDate() + 30);
        }
        setNewExpiryDate(current.toISOString().split('T')[0]);
    };

    const handleRenewSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!renewTarget) return;

        setRenewing(true);
        try {
            const { error } = await supabase
                .from('quotes')
                .update({ 
                    valid_until: new Date(newExpiryDate).toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', renewTarget.id);

            if (error) throw error;

            showToast('Acuerdo comercial renovado exitosamente', 'success');
            setRenewTarget(null);
            fetchAgreements();
            
            // If the renewed agreement was open in the drawer, update its expiry date
            if (selectedAgreement && selectedAgreement.id === renewTarget.id) {
                setSelectedAgreement(prev => prev ? { ...prev, valid_until: newExpiryDate } : null);
            }
        } catch (err: any) {
            console.error('Error renewing agreement:', err);
            showToast('Error al renovar: ' + err.message, 'error');
        } finally {
            setRenewing(false);
        }
    };

    // Calculate status of agreement dynamically
    const getAgreementStatus = (validUntil: string) => {
        if (!validUntil) return { label: 'Sin Vencer', color: '#0D7A57', bgColor: '#EAEFEA', type: 'active' as const };
        
        const expiry = new Date(validUntil);
        const today = new Date();
        today.setHours(0,0,0,0);
        
        const diffTime = expiry.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            return { label: 'Vencido', color: '#EF4444', bgColor: '#FEF2F2', type: 'expired' as const, diffDays };
        } else if (diffDays <= 15) {
            return { label: `Vence en ${diffDays}d`, color: '#D97706', bgColor: '#FFFBEB', type: 'warning' as const, diffDays };
        } else {
            return { label: 'Vigente', color: '#0D7A57', bgColor: '#EAEFEA', type: 'active' as const, diffDays };
        }
    };

    const getDurationText = (start: string, end: string) => {
        if (!start || !end) return 'Indefinida';
        const s = new Date(start);
        const e = new Date(end);
        const diffTime = Math.abs(e.getTime() - s.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays >= 365) {
            const yrs = (diffDays / 365).toFixed(1);
            return `${yrs.replace('.0', '')} año(s)`;
        }
        if (diffDays >= 30) {
            const mos = (diffDays / 30).toFixed(1);
            return `${mos.replace('.0', '')} mes(es)`;
        }
        return `${diffDays} días`;
    };

    const formatQuoteNumber = (seq: number, dateStr?: string) => {
        const date = dateStr ? new Date(dateStr) : new Date();
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const paddedSeq = String(seq).padStart(4, '0');
        return `COT ${day}${month} ${paddedSeq}`;
    };

    // Filter logic
    const filteredAgreements = agreements.filter(agreement => {
        const matchSearch = agreement.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            agreement.profiles?.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            String(agreement.quote_number).includes(searchTerm);
        
        if (!matchSearch) return false;

        if (statusFilter === 'all') return true;
        
        const statusInfo = getAgreementStatus(agreement.valid_until);
        return statusInfo.type === statusFilter;
    });

    const activeCount = agreements.filter(a => getAgreementStatus(a.valid_until).type === 'active').length;
    const warningCount = agreements.filter(a => getAgreementStatus(a.valid_until).type === 'warning').length;
    const expiredCount = agreements.filter(a => getAgreementStatus(a.valid_until).type === 'expired').length;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', fontFamily: THEME.typography.fontFamilySecondary }}>
            
            {/* STAT CARDS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
                <div style={{ 
                    backgroundColor: THEME.colors.surface, 
                    borderRadius: THEME.colors.primary ? THEME.radius.lg : '12px', 
                    padding: '1.5rem', 
                    boxShadow: THEME.shadow.sm, 
                    border: `1px solid ${THEME.colors.border}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem'
                }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Acuerdos Vigentes</span>
                    <span style={{ fontSize: '2rem', fontWeight: '900', color: THEME.colors.primary }}>{activeCount}</span>
                    <span style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary }}>Contratos con precios congelados</span>
                </div>
                
                <div style={{ 
                    backgroundColor: THEME.colors.surface, 
                    borderRadius: THEME.colors.primary ? THEME.radius.lg : '12px', 
                    padding: '1.5rem', 
                    boxShadow: THEME.shadow.sm, 
                    border: `1px solid ${THEME.colors.border}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem'
                }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Próximos a Vencer</span>
                    <span style={{ fontSize: '2rem', fontWeight: '900', color: '#D97706' }}>{warningCount}</span>
                    <span style={{ fontSize: '0.75rem', color: '#D97706', fontWeight: 'bold' }}>Expira en menos de 15 días</span>
                </div>

                <div style={{ 
                    backgroundColor: THEME.colors.surface, 
                    borderRadius: THEME.colors.primary ? THEME.radius.lg : '12px', 
                    padding: '1.5rem', 
                    boxShadow: THEME.shadow.sm, 
                    border: `1px solid ${THEME.colors.border}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem'
                }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Acuerdos Vencidos</span>
                    <span style={{ fontSize: '2rem', fontWeight: '900', color: '#EF4444' }}>{expiredCount}</span>
                    <span style={{ fontSize: '0.75rem', color: '#EF4444', fontWeight: 'bold' }}>Precios inactivos</span>
                </div>
            </div>

            {/* CONTROLS */}
            <div style={{ 
                backgroundColor: THEME.colors.surface, 
                borderRadius: THEME.radius.lg, 
                padding: '1.25rem', 
                border: `1px solid ${THEME.colors.border}`, 
                boxShadow: THEME.shadow.sm,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1.5rem',
                flexWrap: 'wrap'
            }}>
                <div style={{ position: 'relative', flex: 1, minWidth: '280px' }}>
                    <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: THEME.colors.textSecondary }} />
                    <input 
                        type="text" 
                        placeholder="Buscar por cliente o código de acuerdo..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '0.65rem 0.65rem 0.65rem 2.5rem',
                            borderRadius: THEME.radius.md,
                            border: `1px solid ${THEME.colors.border}`,
                            fontSize: '0.85rem',
                            outline: 'none',
                            fontFamily: THEME.typography.fontFamilySecondary
                        }}
                    />
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                    {(['all', 'active', 'warning', 'expired'] as const).map(f => (
                        <button
                            key={f}
                            onClick={() => setStatusFilter(f)}
                            style={{
                                padding: '0.5rem 1rem',
                                borderRadius: THEME.radius.md,
                                fontSize: '0.8rem',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                backgroundColor: statusFilter === f ? THEME.colors.primaryLight : '#F3F4F6',
                                color: statusFilter === f ? THEME.colors.primary : '#4B5563',
                                border: statusFilter === f ? `1px solid ${THEME.colors.primary}20` : '1px solid transparent'
                            }}
                        >
                            {f === 'all' && 'Todos'}
                            {f === 'active' && '🟢 Vigentes'}
                            {f === 'warning' && '🟡 Por Vencer'}
                            {f === 'expired' && '🔴 Vencidos'}
                        </button>
                    ))}
                </div>
            </div>

            {/* AGREEMENTS TABLE */}
            <div style={{ 
                backgroundColor: THEME.colors.surface, 
                borderRadius: THEME.radius.lg, 
                border: `1px solid ${THEME.colors.border}`, 
                boxShadow: THEME.shadow.sm, 
                overflow: 'hidden' 
            }}>
                {loading ? (
                    <div style={{ padding: '4rem', textAlign: 'center', color: THEME.colors.textSecondary, fontWeight: 'bold' }}>Cargando acuerdos comerciales...</div>
                ) : filteredAgreements.length === 0 ? (
                    <div style={{ padding: '4rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: THEME.colors.textSecondary }}>
                            <FileText size={22} />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontWeight: '700', color: THEME.colors.textMain }}>Sin resultados</h3>
                            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: THEME.colors.textSecondary }}>No se encontraron acuerdos comerciales con los filtros aplicados.</p>
                        </div>
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#F9FAFB', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                <th style={{ padding: '0.75rem 1.25rem', ...THEME.typography.tableHeader }}>Código</th>
                                <th style={{ padding: '0.75rem 1.25rem', ...THEME.typography.tableHeader }}>Cliente B2B</th>
                                <th style={{ padding: '0.75rem 1.25rem', ...THEME.typography.tableHeader }}>Modelo de Precios</th>
                                <th style={{ padding: '0.75rem 1.25rem', ...THEME.typography.tableHeader }}>Fecha Inicio</th>
                                <th style={{ padding: '0.75rem 1.25rem', ...THEME.typography.tableHeader }}>Duración</th>
                                <th style={{ padding: '0.75rem 1.25rem', ...THEME.typography.tableHeader }}>Vencimiento</th>
                                <th style={{ padding: '0.75rem 1.25rem', ...THEME.typography.tableHeader }}>Estado</th>
                                <th style={{ padding: '0.75rem 1.25rem' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredAgreements.map(agreement => {
                                const status = getAgreementStatus(agreement.valid_until);
                                return (
                                    <tr 
                                        key={agreement.id} 
                                        style={{ borderBottom: `1px solid ${THEME.colors.border}`, transition: 'background 0.2s' }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F9FAFB'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                    >
                                        <td style={{ padding: '1rem 1.25rem', fontWeight: 'bold', color: THEME.colors.textMain }}>
                                            {formatQuoteNumber(agreement.quote_number, agreement.created_at)}
                                        </td>
                                        <td style={{ padding: '1rem 1.25rem', fontWeight: 'bold', color: THEME.colors.textMain }}>
                                            {agreement.profiles?.company_name || agreement.client_name}
                                        </td>
                                        <td style={{ padding: '1rem 1.25rem', color: THEME.colors.textSecondary }}>
                                            {agreement.model_snapshot_name || 'Personalizado'}
                                        </td>
                                        <td style={{ padding: '1rem 1.25rem', color: THEME.colors.textSecondary }}>
                                            {agreement.start_date ? new Date(agreement.start_date).toLocaleDateString('es-CO') : '---'}
                                        </td>
                                        <td style={{ padding: '1rem 1.25rem', fontWeight: '500', color: THEME.colors.textMain }}>
                                            {getDurationText(agreement.start_date, agreement.valid_until)}
                                        </td>
                                        <td style={{ padding: '1rem 1.25rem', color: THEME.colors.textSecondary }}>
                                            {agreement.valid_until ? new Date(agreement.valid_until).toLocaleDateString('es-CO') : 'Indefinida'}
                                        </td>
                                        <td style={{ padding: '1rem 1.25rem' }}>
                                            <span style={{ 
                                                backgroundColor: status.bgColor, 
                                                color: status.color, 
                                                padding: '3px 8px', 
                                                borderRadius: '4px', 
                                                fontSize: '0.75rem', 
                                                fontWeight: 'bold' 
                                            }}>
                                                {status.label}
                                            </span>
                                        </td>
                                        <td style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                <button
                                                    onClick={() => handleViewPrices(agreement)}
                                                    style={{
                                                        padding: '0.4rem 0.8rem',
                                                        border: `1px solid ${THEME.colors.borderActive}`,
                                                        borderRadius: THEME.radius.sm,
                                                        background: 'white',
                                                        cursor: 'pointer',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 'bold',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        color: THEME.colors.textSecondary
                                                    }}
                                                >
                                                    <Eye size={12} /> Precios
                                                </button>
                                                
                                                <button
                                                    onClick={() => handleOpenRenew(agreement)}
                                                    style={{
                                                        padding: '0.4rem 0.8rem',
                                                        border: 'none',
                                                        borderRadius: THEME.radius.sm,
                                                        background: status.type === 'expired' ? '#FEE2E2' : '#FFFBEB',
                                                        color: status.type === 'expired' ? '#EF4444' : '#D97706',
                                                        cursor: 'pointer',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 'bold',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}
                                                >
                                                    <Clock size={12} /> Renovar
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* DETAIL DRAWER / SLIDE-OVER */}
            {isDrawerOpen && selectedAgreement && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{ 
                        backgroundColor: 'white', 
                        width: '100%', 
                        maxWidth: '750px', 
                        height: '100%', 
                        boxShadow: '-10px 0 25px rgba(0,0,0,0.1)', 
                        display: 'flex', 
                        flexDirection: 'column',
                        animation: 'slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}>
                        {/* Drawer Header */}
                        <div style={{ padding: '1.5rem', borderBottom: `1px solid ${THEME.colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary, fontWeight: 'bold', textTransform: 'uppercase' }}>
                                    Lista de Precios Congelados ({formatQuoteNumber(selectedAgreement.quote_number, selectedAgreement.created_at)})
                                </div>
                                <h2 style={{ margin: '4px 0 0 0', fontWeight: '900', color: THEME.colors.textMain }}>
                                    {selectedAgreement.profiles?.company_name || selectedAgreement.client_name}
                                </h2>
                            </div>
                            <button 
                                onClick={() => setIsDrawerOpen(false)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Drawer Info Banner */}
                        <div style={{ padding: '1rem 1.5rem', backgroundColor: '#F9FAFB', borderBottom: `1px solid ${THEME.colors.border}`, display: 'flex', gap: '2rem' }}>
                            <div>
                                <span style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary, display: 'block' }}>VIGENCIA DEL ACUERDO:</span>
                                <strong style={{ fontSize: '0.85rem' }}>
                                    {selectedAgreement.start_date ? new Date(selectedAgreement.start_date).toLocaleDateString() : 'N/A'} al {selectedAgreement.valid_until ? new Date(selectedAgreement.valid_until).toLocaleDateString() : 'Indefinida'}
                                </strong>
                            </div>
                            <div>
                                <span style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary, display: 'block' }}>ESTADO:</span>
                                <span style={{ 
                                    backgroundColor: getAgreementStatus(selectedAgreement.valid_until).bgColor, 
                                    color: getAgreementStatus(selectedAgreement.valid_until).color, 
                                    padding: '2px 6px', 
                                    borderRadius: '4px', 
                                    fontSize: '0.75rem', 
                                    fontWeight: 'bold' 
                                }}>
                                    {getAgreementStatus(selectedAgreement.valid_until).label}
                                </span>
                            </div>
                            <div>
                                <span style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary, display: 'block' }}>PRODUCTOS CARGADOS:</span>
                                <strong style={{ fontSize: '0.85rem', color: THEME.colors.primary }}>
                                    {loadingItems ? 'Cargando...' : `${agreementItems.length} ítems`}
                                </strong>
                            </div>
                        </div>

                        {/* Drawer List Content */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
                            {loadingItems ? (
                                <div style={{ padding: '4rem', textAlign: 'center', color: THEME.colors.textSecondary, fontWeight: 'bold' }}>Cargando lista de precios...</div>
                            ) : agreementItems.length === 0 ? (
                                <div style={{ padding: '4rem', textAlign: 'center', color: THEME.colors.textSecondary }}>No hay ítems registrados en este acuerdo comercial.</div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                    <thead>
                                        <tr style={{ borderBottom: `1px solid ${THEME.colors.border}` }}>
                                            <th style={{ padding: '0.5rem 0.5rem', ...THEME.typography.tableHeader }}>Cod. Contable</th>
                                            <th style={{ padding: '0.5rem 0.5rem', ...THEME.typography.tableHeader }}>Producto</th>
                                            <th style={{ padding: '0.5rem 0.5rem', ...THEME.typography.tableHeader, textAlign: 'center' }}>U.M.</th>
                                            <th style={{ padding: '0.5rem 0.5rem', ...THEME.typography.tableHeader, textAlign: 'right' }}>Costo Base</th>
                                            <th style={{ padding: '0.5rem 0.5rem', ...THEME.typography.tableHeader, textAlign: 'right' }}>Precio Acordado</th>
                                            <th style={{ padding: '0.5rem 0.5rem', ...THEME.typography.tableHeader, textAlign: 'center' }}>IVA</th>
                                            <th style={{ padding: '0.5rem 0.5rem', ...THEME.typography.tableHeader, textAlign: 'center' }}>Margen</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {agreementItems.map(item => (
                                            <tr key={item.id} style={{ borderBottom: `1px solid ${THEME.colors.border}` }}>
                                                <td style={{ padding: '0.75rem 0.5rem', color: THEME.colors.textSecondary, fontWeight: '500', fontSize: '0.85rem' }}>
                                                    {item.products?.accounting_id || '---'}
                                                </td>
                                                <td style={{ padding: '0.75rem 0.5rem', fontWeight: 'bold', color: THEME.colors.textMain, fontSize: '0.85rem' }}>
                                                    {item.product_name}
                                                </td>
                                                <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: THEME.colors.textSecondary, fontSize: '0.85rem' }}>
                                                    {item.products?.unit_of_measure || 'Kg'}
                                                </td>
                                                <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: '#64748B', fontSize: '0.85rem' }}>
                                                    {formatMoney(item.cost_basis)}
                                                </td>
                                                <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 'bold', color: THEME.colors.primary, fontSize: '0.85rem' }}>
                                                    {formatMoney(item.unit_price)}
                                                </td>
                                                <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: '#64748B', fontSize: '0.85rem' }}>
                                                    {item.iva_rate}%
                                                </td>
                                                <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: '#2563EB', fontWeight: 'bold', fontSize: '0.85rem' }}>
                                                    {Math.round(item.margin_percent * 10) / 10}%
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* Drawer Footer */}
                        <div style={{ padding: '1.5rem', borderTop: `1px solid ${THEME.colors.border}`, display: 'flex', justifyContent: 'flex-end', backgroundColor: '#F9FAFB' }}>
                            <button 
                                onClick={() => setIsDrawerOpen(false)}
                                style={{
                                    padding: '0.65rem 1.5rem',
                                    borderRadius: THEME.radius.md,
                                    border: `1px solid ${THEME.colors.borderActive}`,
                                    backgroundColor: 'white',
                                    color: THEME.colors.textSecondary,
                                    cursor: 'pointer',
                                    fontWeight: 'bold',
                                    fontSize: '0.85rem'
                                }}
                            >
                                Cerrar Lista
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* RENEWAL MODAL */}
            {renewTarget && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <form 
                        onSubmit={handleRenewSubmit}
                        style={{ 
                            backgroundColor: 'white', 
                            borderRadius: THEME.radius.lg, 
                            width: '95%', 
                            maxWidth: '480px', 
                            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', 
                            overflow: 'hidden' 
                        }}
                    >
                        <div style={{ padding: '1.5rem', borderBottom: `1px solid ${THEME.colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontWeight: '900', color: THEME.colors.textMain }}>Renovar Acuerdo Comercial</h3>
                            <button type="button" onClick={() => setRenewTarget(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                                <X size={18} />
                            </button>
                        </div>

                        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div>
                                <span style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, display: 'block', textTransform: 'uppercase', fontWeight: 'bold' }}>Cliente B2B:</span>
                                <strong style={{ fontSize: '1.1rem', color: THEME.colors.textMain }}>{renewTarget.profiles?.company_name || renewTarget.client_name}</strong>
                            </div>
                            
                            <div>
                                <span style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, display: 'block', textTransform: 'uppercase', fontWeight: 'bold' }}>Acuerdo Actual Vence:</span>
                                <span style={{ fontSize: '0.9rem', color: THEME.colors.textMain, fontWeight: '500' }}>
                                    {renewTarget.valid_until ? new Date(renewTarget.valid_until).toLocaleDateString('es-CO', { dateStyle: 'full' }) : 'Indefinido'}
                                </span>
                            </div>

                            <div style={{ backgroundColor: '#FFFBEB', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #FDE68A', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                <AlertCircle size={18} style={{ color: '#D97706', flexShrink: 0, marginTop: '2px' }} />
                                <div style={{ fontSize: '0.8rem', color: '#92400E', lineHeight: '1.4' }}>
                                    La renovación congelará la lista de precios actual para el cliente institucional hasta la nueva fecha especificada.
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: THEME.colors.textSecondary, marginBottom: '4px', textTransform: 'uppercase' }}>Nueva Fecha de Vencimiento:</label>
                                <input 
                                    type="date" 
                                    required
                                    value={newExpiryDate} 
                                    onChange={(e) => setNewExpiryDate(e.target.value)}
                                    style={{ 
                                        width: '100%', 
                                        padding: '10px', 
                                        borderRadius: THEME.radius.md, 
                                        border: `1px solid ${THEME.colors.border}`,
                                        fontFamily: THEME.typography.fontFamilySecondary,
                                        fontWeight: 'bold',
                                        fontSize: '0.9rem'
                                    }}
                                />
                            </div>
                        </div>

                        <div style={{ padding: '1.25rem 1.5rem', borderTop: `1px solid ${THEME.colors.border}`, display: 'flex', gap: '10px', backgroundColor: '#F9FAFB' }}>
                            <button 
                                type="button" 
                                onClick={() => setRenewTarget(null)} 
                                style={{ 
                                    flex: 1, 
                                    padding: '10px', 
                                    borderRadius: THEME.radius.md, 
                                    border: `1px solid ${THEME.colors.borderActive}`, 
                                    backgroundColor: 'white', 
                                    fontWeight: 'bold',
                                    cursor: 'pointer' 
                                }}
                            >
                                Cancelar
                            </button>
                            <button 
                                type="submit" 
                                disabled={renewing}
                                style={{ 
                                    flex: 2, 
                                    padding: '10px', 
                                    borderRadius: THEME.radius.md, 
                                    border: 'none', 
                                    backgroundColor: THEME.colors.primary, 
                                    color: 'white', 
                                    fontWeight: 'bold',
                                    cursor: 'pointer'
                                }}
                            >
                                {renewing ? 'Actualizando...' : 'Renovar Acuerdo'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* TOAST NOTIFICATION */}
            {toast && (
                <div style={{ 
                    position: 'fixed', 
                    bottom: '24px', 
                    right: '24px', 
                    backgroundColor: toast.type === 'success' ? '#0D7A57' : '#EF4444', 
                    color: 'white', 
                    padding: '0.75rem 1.5rem', 
                    borderRadius: '8px', 
                    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px',
                    zIndex: 3000,
                    fontWeight: 'bold',
                    fontSize: '0.85rem',
                    animation: 'slideUp 0.2s ease'
                }}>
                    {toast.type === 'success' ? <Check size={16} /> : <X size={16} />}
                    {toast.message}
                </div>
            )}

            {/* Slide-over CSS Animation */}
            <style dangerouslySetInnerHTML={{ __html: `
                @keyframes slideIn {
                    from { transform: translateX(100%); }
                    to { transform: translateX(0); }
                }
                @keyframes slideUp {
                    from { transform: translateY(100%); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            `}} />
        </div>
    );
}
