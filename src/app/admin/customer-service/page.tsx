'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { THEME, formatMoney } from '@/lib/adminTheme';
import {
    ShieldAlert, ShieldCheck, AlertCircle, AlertTriangle, CheckCircle2,
    Clock, Search, Plus, Trash2, Loader2, ArrowRight, Eye, FileText,
    Camera, Truck, BarChart2, Sparkles, HelpCircle, Store, Warehouse,
    Layers, User, Building2, ChevronDown, ChevronUp, RefreshCw,
    Maximize2, MessageCircle, ExternalLink, X, DollarSign, Percent,
    PackageMinus, Sliders, Settings, Check, Bell, FileSpreadsheet
} from 'lucide-react';
import Link from 'next/link';
import { GalleryOmnibox } from '@/components/common/GalleryOmnibox';
import FinancialAdjustmentModal from '@/components/FinancialAdjustmentModal';
import {
    RCA_CATEGORIES_L1,
    RESPONSIBLE_PARTIES,
    parseRcaFromRecord,
    getStoredTaxonomy,
    DefectCategoryL1,
    ImputedEntity
} from '@/lib/rcaTaxonomy';
import {
    PQR,
    formatPqrFolio,
    formatCleanPqrSubject,
    getClientInitials,
    getTypeBadgeStyle,
    formatDateFriendly,
    cleanColombianPhone,
    getPqrPhotos,
    getPqrAuthorInfo,
    getReplacementOrderUrl,
    buildPqrWhatsAppMessage,
    buildCaseResolutionWhatsAppSummary
} from './utils';

import PqrAuditModal from './components/PqrAuditModal';
import PqrTaxonomyModal from './components/PqrTaxonomyModal';
import PqrNoveltyReviewModal from './components/PqrNoveltyReviewModal';
import PqrLeanDashboard from './components/PqrLeanDashboard';
import MissingOrdersGallery from './components/MissingOrdersGallery';

export default function CustomerServicePage({ initialTab }: { initialTab?: 'all' | 'pending' | 'in_progress' | 'resolved' | 'rejected' | 'novelties' } = {}) {
    // Data State
    const [pqrs, setPqrs] = useState<PQR[]>([]);
    const [novelties, setNovelties] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [totalOrdersCount, setTotalOrdersCount] = useState<number | null>(null);
    const [deliveredOrdersCount, setDeliveredOrdersCount] = useState<number | null>(null);

    // Lists for Imputation & Taxonomy
    const [providersList, setProvidersList] = useState<{ id: string; name: string; nit?: string; phone?: string }[]>([]);
    const [collaboratorsList, setCollaboratorsList] = useState<{ id: string; contact_name: string; role: string; phone?: string; is_active?: boolean }[]>([]);
    const [customTaxonomy, setCustomTaxonomy] = useState<DefectCategoryL1[]>([]);

    // Navigation & Filtering
    const [mainView, setMainView] = useState<'cases' | 'lean_dashboard' | 'missing_orders'>('cases');
    const [leanSubTab, setLeanSubTab] = useState<'analytics' | 'daily_report'>('analytics');
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'in_progress' | 'resolved' | 'rejected' | 'novelties'>(initialTab || 'pending');
    const [showKpis, setShowKpis] = useState(true);

    useEffect(() => {
        if (initialTab) {
            setActiveTab(initialTab);
        }
    }, [initialTab]);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const tab = params.get('tab');
            if (tab && ['all', 'pending', 'in_progress', 'resolved', 'rejected', 'novelties'].includes(tab)) {
                setActiveTab(tab as any);
            }
            const view = params.get('view');
            if (view && ['cases', 'lean_dashboard', 'missing_orders'].includes(view)) {
                setMainView(view as any);
            }
        }
    }, []);

    // Sticky Magnetic Stacking Measurement (Zero Gap Protocol)
    const toolbarRef = useRef<HTMLDivElement>(null);
    const [toolbarHeight, setToolbarHeight] = useState(54);

    useEffect(() => {
        if (!toolbarRef.current) return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const height = entry.borderBoxSize?.[0]?.blockSize || entry.contentRect?.height;
                if (height) setToolbarHeight(Math.ceil(height));
            }
        });
        observer.observe(toolbarRef.current);
        return () => observer.disconnect();
    }, []);

    // Active Modals State
    const [selectedAuditPqr, setSelectedAuditPqr] = useState<PQR | null>(null);
    const [auditModalOpen, setAuditModalOpen] = useState(false);
    const [showTaxonomyModal, setShowTaxonomyModal] = useState(false);
    const [selectedNovelty, setSelectedNovelty] = useState<any | null>(null);
    const [showFinancialModal, setShowFinancialModal] = useState(false);
    const [financialModalMode, setFinancialModalMode] = useState<'credit_note' | 'invoice_adjustment'>('credit_note');
    const [zoomPhotoUrl, setZoomPhotoUrl] = useState<string | null>(null);

    // Toast feedback
    const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'warning' } | null>(null);

    const showToast = (text: string, type: 'success' | 'error' | 'warning' = 'success') => {
        setToastMessage({ text, type });
        setTimeout(() => {
            setToastMessage(null);
        }, 4000);
    };

    // Load Taxonomy & KPIs preferences
    useEffect(() => {
        const saved = localStorage.getItem('cs_show_kpis');
        if (saved !== null) {
            setShowKpis(saved === 'true');
        }
        setCustomTaxonomy(getStoredTaxonomy());
    }, []);

    const toggleShowKpis = () => {
        setShowKpis(prev => {
            const next = !prev;
            localStorage.setItem('cs_show_kpis', String(next));
            return next;
        });
    };

    // Data Fetching
    const fetchData = useCallback(async (silentOrEvent?: boolean | React.MouseEvent) => {
        const silent = silentOrEvent === true;
        if (!silent) setLoading(true);
        try {
            const { data: pqrsData, error: pqrsError } = await supabase
                .from('customer_service_pqrs')
                .select(`
                    *,
                    profiles:client_id(id, company_name, contact_name, role, nit, email, phone, contact_phone, corporate_role, delivery_restrictions, logistics_data),
                    orders:order_id(id, sequence_id, total, created_at, origin_source, admin_notes, shipping_address, delivery_date, delivery_slot, is_manual_delivery, logistics_data)
                `)
                .order('created_at', { ascending: false });

            if (pqrsError) throw pqrsError;
            const rawList = pqrsData || [];
            const chronologicalIds = [...rawList]
                .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                .map(p => p.id);
            const seqMap = new Map<string, number>();
            chronologicalIds.forEach((id, index) => seqMap.set(id, index + 1));

            const enrichedPqrs = rawList.map(p => ({
                ...p,
                sequence_number: seqMap.get(p.id) || 1
            }));
            setPqrs(enrichedPqrs);

            const { data: returnsData, error: returnsError } = await supabase
                .from('billing_returns')
                .select(`
                    *,
                    products(name, sku, unit_of_measure),
                    orders(
                        sequence_id,
                        total,
                        created_at,
                        origin_source,
                        admin_notes,
                        profiles(id, company_name, contact_name, role, nit, phone, contact_phone),
                        order_items(product_id, unit_price)
                    )
                `)
                .order('created_at', { ascending: false });

            if (returnsError) throw returnsError;
            setNovelties(returnsData || []);

            const { count: delCount } = await supabase
                .from('orders')
                .select('*', { count: 'exact', head: true })
                .in('status', ['completed', 'delivered', 'recibido']);
            if (delCount !== null) setDeliveredOrdersCount(delCount);

            const { count: ordCount } = await supabase
                .from('orders')
                .select('*', { count: 'exact', head: true });
            if (ordCount !== null) setTotalOrdersCount(ordCount);

            const { data: provsData } = await supabase
                .from('providers')
                .select('id, name, tax_id, phone')
                .order('name');
            setProvidersList((provsData || []).map((p: any) => ({ ...p, nit: p.tax_id || '' })));

            const { data: colabsData } = await supabase
                .from('collaborators')
                .select('id, contact_name, role, phone, is_active')
                .order('contact_name');
            setCollaboratorsList(colabsData || []);

        } catch (e: any) {
            console.error('Error fetching customer service data:', e);
            if (!silent) showToast('Error cargando datos: ' + e.message, 'error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Real-Time Synchronization (WebSockets + Tab Focus + Silent Heartbeat)
    useEffect(() => {
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        const triggerSilentRefresh = () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                fetchData(true);
            }, 350);
        };

        const channel = supabase
            .channel('customer-service-live-sync')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_service_pqrs' }, triggerSilentRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'billing_returns' }, triggerSilentRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, triggerSilentRefresh)
            .subscribe();

        const handleFocusOrVisibility = () => {
            if (document.visibilityState === 'visible') {
                triggerSilentRefresh();
            }
        };

        window.addEventListener('focus', handleFocusOrVisibility);
        document.addEventListener('visibilitychange', handleFocusOrVisibility);

        const heartbeatInterval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                fetchData(true);
            }
        }, 10000);

        return () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            clearInterval(heartbeatInterval);
            window.removeEventListener('focus', handleFocusOrVisibility);
            document.removeEventListener('visibilitychange', handleFocusOrVisibility);
            supabase.removeChannel(channel);
        };
    }, [fetchData]);

    // Open Audit Wizard Modal
    const handleOpenAuditModal = (pqr: PQR) => {
        setSelectedAuditPqr(pqr);
        setAuditModalOpen(true);
    };

    // Open Financial Adjustment Modal from Audit
    const handleOpenFinancialModal = (mode: 'credit_note' | 'invoice_adjustment') => {
        setFinancialModalMode(mode);
        setShowFinancialModal(true);
    };

    // Process Single Novelty
    const handleProcessNovelty = async (novelty: any, decision: 'approved' | 'rejected') => {
        setActionLoading(true);
        try {
            const { error } = await supabase
                .from('billing_returns')
                .update({
                    status: decision,
                    resolved_at: new Date().toISOString()
                })
                .eq('id', novelty.id);

            if (error) throw error;

            showToast(`Novedad ${decision === 'approved' ? 'aprobada' : 'rechazada'} exitosamente.`, 'success');
            setSelectedNovelty(null);
            fetchData();
        } catch (e: any) {
            showToast('Error al procesar novedad: ' + e.message, 'error');
        } finally {
            setActionLoading(false);
        }
    };

    // KPI Metrics Calculation
    const kpiMetrics = useMemo(() => {
        const totalPqrs = pqrs.length;
        const pendingCount = pqrs.filter(p => p.status === 'pending').length;
        const inProgressCount = pqrs.filter(p => p.status === 'in_progress').length;
        const resolvedCount = pqrs.filter(p => p.status === 'resolved' || p.status === 'rejected').length;
        const rejectedCount = pqrs.filter(p => p.status === 'rejected').length;
        const noveltiesCount = novelties.filter(n => n.status === 'pending_review').length;

        const claimOrderIds = new Set(pqrs.filter(p => p.order_id).map(p => p.order_id));
        const effectiveDelivered = deliveredOrdersCount || Math.max(totalPqrs, 100);
        const ftrPercentage = Math.max(0, Math.min(100, ((effectiveDelivered - claimOrderIds.size) / effectiveDelivered) * 100));

        const totalCoQ = novelties.reduce((sum, n) => {
            if (n.status === 'approved' || n.status === 'pending_review') {
                const oi = n.orders?.order_items?.find((item: any) => item.product_id === n.product_id);
                const price = Number(oi?.unit_price || 0);
                return sum + (price * (Number(n.quantity_returned) || 0));
            }
            return sum;
        }, 0);

        const resolvedWithDates = pqrs.filter(p => p.resolved_at && p.created_at);
        let avgMttrHours = 0;
        if (resolvedWithDates.length > 0) {
            const totalHours = resolvedWithDates.reduce((acc, p) => {
                const diffMs = new Date(p.resolved_at!).getTime() - new Date(p.created_at).getTime();
                return acc + (diffMs / (1000 * 60 * 60));
            }, 0);
            avgMttrHours = Math.round(totalHours / resolvedWithDates.length);
        }

        const rcaCounts: Record<string, number> = {};
        const auditedPqrs = pqrs.filter(p => {
            const rca = parseRcaFromRecord(p);
            return rca.isExplicitRca || p.status === 'resolved' || p.status === 'rejected';
        });
        auditedPqrs.forEach(p => {
            const rca = parseRcaFromRecord(p);
            const cat = rca.categoryL1 || 'dano_mecanico';
            rcaCounts[cat] = (rcaCounts[cat] || 0) + 1;
        });
        const topRcaEntry = Object.entries(rcaCounts).sort((a, b) => b[1] - a[1])[0];
        const topRcaLabel = topRcaEntry
            ? (customTaxonomy.find(c => c.code === topRcaEntry[0])?.label || 'Daño Mecánico')
            : 'Sin casos auditados';
        const topRcaPct = auditedPqrs.length > 0 && topRcaEntry ? Math.round((topRcaEntry[1] / auditedPqrs.length) * 100) : 0;

        return {
            totalPqrs,
            pendingCount,
            inProgressCount,
            resolvedCount,
            rejectedCount,
            noveltiesCount,
            ftrPercentage,
            totalCoQ,
            avgMttrHours,
            topRcaLabel,
            topRcaPct
        };
    }, [pqrs, novelties, deliveredOrdersCount, customTaxonomy]);

    // Multi-Criteria Omnibox Search & Tab Filtering
    const filteredPqrs = useMemo(() => {
        let result = pqrs;

        if (activeTab === 'pending') {
            result = result.filter(p => p.status === 'pending');
        } else if (activeTab === 'in_progress') {
            result = result.filter(p => p.status === 'in_progress');
        } else if (activeTab === 'resolved') {
            result = result.filter(p => p.status === 'resolved' || p.status === 'rejected');
        } else if (activeTab === 'rejected') {
            result = result.filter(p => p.status === 'rejected');
        }

        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase().trim();
            result = result.filter(p => {
                const author = getPqrAuthorInfo(p);
                const rca = parseRcaFromRecord(p);
                const orderSeq = p.orders?.sequence_id ? `#${p.orders.sequence_id}` : '';
                const pqrFolio = formatPqrFolio(p);
                const pqrShortId = `#${p.id.substring(0, 8)}`;

                return (
                    p.subject?.toLowerCase().includes(term) ||
                    p.description?.toLowerCase().includes(term) ||
                    author.clientDisplayName.toLowerCase().includes(term) ||
                    author.nit?.toLowerCase().includes(term) ||
                    orderSeq.toLowerCase().includes(term) ||
                    pqrFolio.toLowerCase().includes(term) ||
                    pqrShortId.toLowerCase().includes(term) ||
                    (rca.isExplicitRca && rca.categoryL1?.toLowerCase().includes(term)) ||
                    (rca.isExplicitRca && rca.subtypeL2?.toLowerCase().includes(term)) ||
                    (rca.isExplicitRca && rca.responsible?.toLowerCase().includes(term)) ||
                    rca.imputedEntities?.some(e => e.name.toLowerCase().includes(term))
                );
            });
        }

        return result;
    }, [pqrs, activeTab, searchTerm]);

    const filteredNovelties = useMemo(() => {
        if (!searchTerm.trim()) return novelties;
        const term = searchTerm.toLowerCase().trim();
        return novelties.filter(n => {
            const clientName = n.orders?.profiles?.company_name || n.orders?.profiles?.contact_name || '';
            const prodName = n.products?.name || '';
            const orderSeq = n.orders?.sequence_id ? `#${n.orders.sequence_id}` : '';
            return (
                clientName.toLowerCase().includes(term) ||
                prodName.toLowerCase().includes(term) ||
                orderSeq.toLowerCase().includes(term) ||
                n.reason?.toLowerCase().includes(term)
            );
        });
    }, [novelties, searchTerm]);

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F4F7F6', width: '100%', fontFamily: 'var(--font-inter), sans-serif' }}>
            {/* Master 1600px Container */}
            <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '1.25rem 1.75rem 3.5rem 1.75rem' }}>
                
                {/* 1. Header Bar */}
                <header style={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '16px',
                    paddingBottom: '1rem',
                    borderBottom: '1px solid #E2E8F0'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            padding: '10px',
                            backgroundColor: '#0D7A57',
                            color: 'white',
                            borderRadius: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 2px 6px rgba(13, 122, 87, 0.25)'
                        }}>
                            <ShieldAlert size={22} />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                <h1 style={{
                                    fontSize: '1.25rem',
                                    fontWeight: '900',
                                    color: '#1A231E',
                                    margin: 0,
                                    letterSpacing: '-0.02em',
                                    fontFamily: 'var(--font-outfit), sans-serif'
                                }}>
                                    Gestión de Calidad, PQRS & Devoluciones
                                </h1>
                                <span style={{
                                    fontSize: '0.7rem',
                                    fontWeight: '700',
                                    padding: '3px 10px',
                                    borderRadius: '20px',
                                    backgroundColor: '#EAEFEA',
                                    color: '#0D7A57',
                                    border: '1px solid #C4D7C4'
                                }}>
                                    SDD v1.9.37
                                </span>
                            </div>
                            <p style={{ fontSize: '0.75rem', color: '#64748B', margin: '2px 0 0 0', fontWeight: '500' }}>
                                Consola de Auditoría Técnica, Análisis Causa Raíz (RCA Lean), Pareto Dual 80/20 y Planes de Acción CAPA
                            </p>
                        </div>
                    </div>

                    {/* Header Action Buttons & View Switcher */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        {/* View Switcher Pill */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            backgroundColor: '#F1F5F9',
                            border: '1px solid #CBD5E1',
                            borderRadius: '12px',
                            padding: '3px',
                            gap: '3px'
                        }}>
                            <button
                                type="button"
                                onClick={() => setMainView('cases')}
                                style={{
                                    padding: '7px 14px',
                                    fontSize: '0.75rem',
                                    fontWeight: mainView === 'cases' ? '800' : '600',
                                    color: mainView === 'cases' ? '#FFFFFF' : '#475569',
                                    backgroundColor: mainView === 'cases' ? '#0D7A57' : 'transparent',
                                    borderRadius: '9px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: mainView === 'cases' ? '0 2px 6px rgba(13, 122, 87, 0.3)' : 'none',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <FileText size={14} />
                                <span>Consola de Casos</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setMainView('lean_dashboard')}
                                style={{
                                    padding: '7px 14px',
                                    fontSize: '0.75rem',
                                    fontWeight: mainView === 'lean_dashboard' ? '800' : '600',
                                    color: mainView === 'lean_dashboard' ? '#FFFFFF' : '#475569',
                                    backgroundColor: mainView === 'lean_dashboard' ? '#0D7A57' : 'transparent',
                                    borderRadius: '9px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: mainView === 'lean_dashboard' ? '0 2px 6px rgba(13, 122, 87, 0.3)' : 'none',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <BarChart2 size={14} />
                                <span>Dashboard Lean & Pareto</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setMainView('missing_orders')}
                                style={{
                                    padding: '7px 14px',
                                    fontSize: '0.75rem',
                                    fontWeight: mainView === 'missing_orders' ? '800' : '600',
                                    color: mainView === 'missing_orders' ? '#FFFFFF' : '#475569',
                                    backgroundColor: mainView === 'missing_orders' ? '#0D7A57' : 'transparent',
                                    borderRadius: '9px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: mainView === 'missing_orders' ? '0 2px 6px rgba(13, 122, 87, 0.3)' : 'none',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <Bell size={14} />
                                <span>Pedidos Pendientes</span>
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={() => setShowTaxonomyModal(true)}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '8px 14px',
                                fontSize: '0.75rem',
                                fontWeight: '700',
                                color: '#334155',
                                backgroundColor: 'white',
                                border: '1px solid #CBD5E1',
                                borderRadius: '10px',
                                cursor: 'pointer',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                            }}
                        >
                            <Settings size={14} style={{ color: '#64748B' }} />
                            <span>Taxonomía RCA</span>
                        </button>

                        {mainView === 'cases' && (
                            <button
                                type="button"
                                onClick={toggleShowKpis}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '8px 14px',
                                    fontSize: '0.75rem',
                                    fontWeight: '600',
                                    color: '#475569',
                                    backgroundColor: 'white',
                                    border: '1px solid #CBD5E1',
                                    borderRadius: '10px',
                                    cursor: 'pointer',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                                }}
                            >
                                <BarChart2 size={14} />
                                <span>{showKpis ? 'Ocultar KPIs' : 'Ver KPIs'}</span>
                                {showKpis ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={fetchData}
                            disabled={loading}
                            title="Recargar datos"
                            style={{
                                padding: '8px',
                                backgroundColor: 'white',
                                border: '1px solid #CBD5E1',
                                borderRadius: '10px',
                                color: '#475569',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            <RefreshCw size={15} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                        </button>
                    </div>
                </header>

                {mainView === 'lean_dashboard' ? (
                    <PqrLeanDashboard
                        pqrs={pqrs}
                        novelties={novelties}
                        totalOrdersCount={totalOrdersCount}
                        deliveredOrdersCount={deliveredOrdersCount}
                        customTaxonomy={customTaxonomy}
                        onRefresh={fetchData}
                        showToast={showToast}
                    />
                ) : mainView === 'missing_orders' ? (
                    <MissingOrdersGallery
                        onNavigateToCreateOrder={(profileId) => {
                            window.location.href = `/admin/orders/create?clientId=${profileId}`;
                        }}
                    />
                ) : (
                    <>
                        {/* 2. Collapsible KPI Cockpit */}
                        {showKpis && (
                    <section style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                        gap: '14px',
                        margin: '1rem 0'
                    }}>
                        {/* KPI 1: FTR */}
                        <div style={{
                            backgroundColor: 'white',
                            padding: '1.1rem 1.25rem',
                            borderRadius: '14px',
                            border: '1px solid #E2E8F0',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <div>
                                <span style={{ fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.04em', display: 'block' }}>
                                    First Time Right (FTR)
                                </span>
                                <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#0D7A57', marginTop: '2px', letterSpacing: '-0.02em' }}>
                                    {kpiMetrics.ftrPercentage.toFixed(1)}%
                                </div>
                                <span style={{ fontSize: '0.7rem', color: '#64748B' }}>
                                    Entregas conformes sin novedades
                                </span>
                            </div>
                            <div style={{ padding: '10px', backgroundColor: '#EAEFEA', color: '#0D7A57', borderRadius: '12px', border: '1px solid #C4D7C4' }}>
                                <CheckCircle2 size={22} />
                            </div>
                        </div>

                        {/* KPI 2: CoQ */}
                        <div style={{
                            backgroundColor: 'white',
                            padding: '1.1rem 1.25rem',
                            borderRadius: '14px',
                            border: '1px solid #E2E8F0',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <div>
                                <span style={{ fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.04em', display: 'block' }}>
                                    Costo de Calidad (CoQ)
                                </span>
                                <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#1A231E', marginTop: '2px', letterSpacing: '-0.02em' }}>
                                    {formatMoney(kpiMetrics.totalCoQ)}
                                </div>
                                <span style={{ fontSize: '0.7rem', color: '#64748B' }}>
                                    Impacto monetario por mermas/NCs
                                </span>
                            </div>
                            <div style={{ padding: '10px', backgroundColor: '#F8FAFC', color: '#475569', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                                <DollarSign size={22} />
                            </div>
                        </div>

                        {/* KPI 3: MTTR */}
                        <div style={{
                            backgroundColor: 'white',
                            padding: '1.1rem 1.25rem',
                            borderRadius: '14px',
                            border: '1px solid #E2E8F0',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <div>
                                <span style={{ fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.04em', display: 'block' }}>
                                    Tiempo Medio Cierre (MTTR)
                                </span>
                                <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#1A231E', marginTop: '2px', letterSpacing: '-0.02em' }}>
                                    {kpiMetrics.avgMttrHours}h
                                </div>
                                <span style={{ fontSize: '0.7rem', color: '#64748B' }}>
                                    Promedio de resolución de casos
                                </span>
                            </div>
                            <div style={{ padding: '10px', backgroundColor: '#F8FAFC', color: '#475569', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                                <Clock size={22} />
                            </div>
                        </div>

                        {/* KPI 4: Pareto Top RCA */}
                        <div style={{
                            backgroundColor: 'white',
                            padding: '1.1rem 1.25rem',
                            borderRadius: '14px',
                            border: '1px solid #E2E8F0',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <div>
                                <span style={{ fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.04em', display: 'block' }}>
                                    Pareto #1 Macrocausa
                                </span>
                                <div style={{ fontSize: '1.15rem', fontWeight: '900', color: '#1A231E', marginTop: '2px', letterSpacing: '-0.01em', maxWidth: '170px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {kpiMetrics.topRcaLabel}
                                </div>
                                <span style={{ fontSize: '0.7rem', color: '#64748B' }}>
                                    Concentra el <strong>{kpiMetrics.topRcaPct}%</strong> de incidencias
                                </span>
                            </div>
                            <div style={{ padding: '10px', backgroundColor: '#F8FAFC', color: '#475569', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                                <ShieldAlert size={22} />
                            </div>
                        </div>
                    </section>
                )}

                {/* 3. Sticky Solid Toolbar (Línea 1 Sticky: top 85px, zIndex 70) */}
                <div
                    ref={toolbarRef}
                    style={{
                        position: 'sticky',
                        top: '85px',
                        zIndex: 70,
                        margin: '1rem 0',
                        padding: '10px 14px',
                        backgroundColor: '#FFFFFF',
                        borderRadius: '16px',
                        border: '1px solid #CBD5E1',
                        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)',
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '12px',
                        overflow: 'visible'
                    }}
                >
                    {/* Filter Segmented Control Pills */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        backgroundColor: '#F8FAFC',
                        border: '1px solid #CBD5E1',
                        borderRadius: '10px',
                        padding: '3px',
                        overflowX: 'auto'
                    }}>
                        <button
                            type="button"
                            onClick={() => setActiveTab('pending')}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '7px',
                                fontSize: '0.75rem',
                                fontWeight: activeTab === 'pending' ? '800' : '600',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                backgroundColor: activeTab === 'pending' ? '#0D7A57' : 'transparent',
                                color: activeTab === 'pending' ? '#FFFFFF' : '#475569',
                                boxShadow: activeTab === 'pending' ? '0 2px 6px rgba(13, 122, 87, 0.35)' : 'none',
                                transition: 'all 0.15s ease-in-out'
                            }}
                        >
                            <span>Pendientes</span>
                            <span style={{
                                fontSize: '0.68rem',
                                fontWeight: '900',
                                padding: '1px 6px',
                                borderRadius: '10px',
                                backgroundColor: activeTab === 'pending' ? 'rgba(255, 255, 255, 0.25)' : '#E2E8F0',
                                color: activeTab === 'pending' ? '#FFFFFF' : '#475569'
                            }}>
                                {kpiMetrics.pendingCount}
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setActiveTab('resolved')}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '7px',
                                fontSize: '0.75rem',
                                fontWeight: activeTab === 'resolved' ? '800' : '600',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                backgroundColor: activeTab === 'resolved' ? '#0D7A57' : 'transparent',
                                color: activeTab === 'resolved' ? '#FFFFFF' : '#475569',
                                boxShadow: activeTab === 'resolved' ? '0 2px 6px rgba(13, 122, 87, 0.35)' : 'none',
                                transition: 'all 0.15s ease-in-out'
                            }}
                        >
                            <span>Resueltos</span>
                            <span style={{
                                fontSize: '0.68rem',
                                fontWeight: '900',
                                padding: '1px 6px',
                                borderRadius: '10px',
                                backgroundColor: activeTab === 'resolved' ? 'rgba(255, 255, 255, 0.25)' : '#E2E8F0',
                                color: activeTab === 'resolved' ? '#FFFFFF' : '#475569'
                            }}>
                                {kpiMetrics.resolvedCount}
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setActiveTab('all')}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '7px',
                                fontSize: '0.75rem',
                                fontWeight: activeTab === 'all' ? '800' : '600',
                                border: 'none',
                                cursor: 'pointer',
                                backgroundColor: activeTab === 'all' ? '#0D7A57' : 'transparent',
                                color: activeTab === 'all' ? '#FFFFFF' : '#475569',
                                boxShadow: activeTab === 'all' ? '0 2px 6px rgba(13, 122, 87, 0.35)' : 'none'
                            }}
                        >
                            Todos ({kpiMetrics.totalPqrs})
                        </button>
                    </div>

                    {/* Omnibox Search Bar */}
                    <div style={{ flex: '1', maxWidth: '420px', minWidth: '260px' }}>
                        <GalleryOmnibox
                            value={searchTerm}
                            onChange={setSearchTerm}
                            placeholder="Buscar caso, cliente, NIT, RCA o #PED..."
                            filteredCount={activeTab === 'novelties' ? filteredNovelties.length : filteredPqrs.length}
                            totalCount={activeTab === 'novelties' ? novelties.length : pqrs.length}
                        />
                    </div>
                </div>

                {/* 4. Master Data Table */}
                {activeTab !== 'novelties' ? (
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '14px',
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                        overflow: 'visible'
                    }}>
                        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left', tableLayout: 'fixed' }}>
                            <thead style={{ position: 'sticky', top: `${85 + toolbarHeight}px`, zIndex: 40, backgroundColor: '#F8FAFC' }}>
                                <tr style={{ backgroundColor: '#F8FAFC' }}>
                                    <th style={{ width: '9%', position: 'sticky', top: `${85 + toolbarHeight}px`, zIndex: 40, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', padding: '10px 8px', fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B', borderTopLeftRadius: '14px' }}>
                                        Folio & Fecha
                                    </th>
                                    <th style={{ width: '14%', position: 'sticky', top: `${85 + toolbarHeight}px`, zIndex: 40, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', padding: '10px 8px', fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B' }}>
                                        Cliente & Canal
                                    </th>
                                    <th style={{ width: '15%', position: 'sticky', top: `${85 + toolbarHeight}px`, zIndex: 40, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', padding: '10px 8px', fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B' }}>
                                        Asunto & Pedido
                                    </th>
                                    <th style={{ width: '4%', position: 'sticky', top: `${85 + toolbarHeight}px`, zIndex: 40, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', padding: '10px 4px', fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B', textAlign: 'center' }}>
                                        Evidencia
                                    </th>
                                    <th style={{ width: '17%', position: 'sticky', top: `${85 + toolbarHeight}px`, zIndex: 40, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', padding: '10px 8px', fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B' }}>
                                        Diagnóstico RCA
                                    </th>
                                    <th style={{ width: '19%', position: 'sticky', top: `${85 + toolbarHeight}px`, zIndex: 40, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', padding: '10px 8px', fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B' }}>
                                        Imputabilidad & Cobro
                                    </th>
                                    <th style={{ width: '13%', position: 'sticky', top: `${85 + toolbarHeight}px`, zIndex: 40, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', padding: '10px 8px', fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B' }}>
                                        Estado
                                    </th>
                                    <th style={{ width: '9%', position: 'sticky', top: `${85 + toolbarHeight}px`, zIndex: 40, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', padding: '10px 8px', fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B', textAlign: 'right', borderTopRightRadius: '14px' }}>
                                        Acciones
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredPqrs.length > 0 ? (
                                    filteredPqrs.map((pqr, idx) => {
                                        const author = getPqrAuthorInfo(pqr);
                                        const photos = getPqrPhotos(pqr);
                                        const rca = parseRcaFromRecord(pqr);
                                        const typeStyle = getTypeBadgeStyle(pqr.type);
                                        const catObj = customTaxonomy.find(c => c.code === rca.categoryL1);

                                        return (
                                            <tr
                                                key={pqr.id}
                                                onClick={() => handleOpenAuditModal(pqr)}
                                                style={{
                                                    backgroundColor: idx % 2 === 0 ? 'white' : '#FAFAFA',
                                                    cursor: 'pointer',
                                                    transition: 'background-color 0.15s ease'
                                                }}
                                                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F1F5F9')}
                                                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = idx % 2 === 0 ? 'white' : '#FAFAFA')}
                                            >
                                                {/* 1. Folio & Fecha (3 Filas) */}
                                                <td style={{ padding: '8px 10px', borderBottom: '1px solid #F1F5F9', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <span style={{
                                                                fontSize: '0.65rem',
                                                                fontWeight: '800',
                                                                textTransform: 'uppercase',
                                                                padding: '2px 6px',
                                                                borderRadius: '4px',
                                                                backgroundColor: typeStyle.bg,
                                                                color: typeStyle.text,
                                                                border: `1px solid ${typeStyle.border}`
                                                            }}>
                                                                {typeStyle.label}
                                                            </span>
                                                            <span style={{ fontFamily: 'monospace', fontWeight: '800', color: '#1A231E', fontSize: '0.78rem' }}>
                                                                {formatPqrFolio(pqr)}
                                                            </span>
                                                        </div>
                                                        <div style={{ fontSize: '0.69rem', fontWeight: '600', color: '#475569' }}>
                                                            {formatDateFriendly(pqr.created_at)}
                                                        </div>
                                                        <div style={{ fontSize: '0.65rem', color: '#94A3B8' }}>
                                                            {new Date(pqr.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* 2. Cliente & Canal (3 Filas) */}
                                                <td style={{ padding: '8px 10px', borderBottom: '1px solid #F1F5F9', verticalAlign: 'middle', minWidth: 0 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <div style={{
                                                            width: '28px',
                                                            height: '28px',
                                                            borderRadius: '50%',
                                                            backgroundColor: author.isInternalCase ? '#E0F2FE' : '#EAEFEA',
                                                            color: author.isInternalCase ? '#0284C7' : '#0D7A57',
                                                            fontWeight: '900',
                                                            fontSize: '0.72rem',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            flexShrink: 0
                                                        }}>
                                                            {author.isInternalCase ? 'IN' : getClientInitials(author.clientDisplayName)}
                                                        </div>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: 1 }}>
                                                            <div style={{ fontWeight: '800', color: '#1A231E', fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={author.clientDisplayName}>
                                                                {author.clientDisplayName}
                                                            </div>
                                                            <div style={{ fontSize: '0.69rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                {author.isInternalCase ? (
                                                                    <span style={{ color: '#0284C7', fontWeight: 700 }}>Área: {author.internalArea}</span>
                                                                ) : (
                                                                    <>
                                                                        {author.nit ? <span>NIT: {author.nit}</span> : <span>Consumidor Final</span>}
                                                                        {author.phoneParsed.isValid && (
                                                                            <a
                                                                                href={`https://wa.me/${author.phoneParsed.waNumber}?text=${encodeURIComponent(buildPqrWhatsAppMessage(pqr, 'initial'))}`}
                                                                                target="_blank"
                                                                                rel="noopener noreferrer"
                                                                                onClick={e => e.stopPropagation()}
                                                                                style={{ color: '#0D7A57', display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
                                                                                title="Chat WhatsApp con Cliente"
                                                                            >
                                                                                <MessageCircle size={12} />
                                                                            </a>
                                                                        )}
                                                                    </>
                                                                )}
                                                            </div>
                                                            <div style={{ fontSize: '0.65rem', color: author.isInternalCase ? '#7C3AED' : '#94A3B8', fontWeight: author.isInternalCase ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {author.isInternalCase ? 'NOVEDAD INTERNA PLANTA / RRHH' : (pqr.profiles?.corporate_role ? pqr.profiles.corporate_role.toUpperCase() : 'CANAL INSTITUCIONAL')}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* 3. Asunto & Pedido (3 Filas) */}
                                                <td style={{ padding: '8px 10px', borderBottom: '1px solid #F1F5F9', verticalAlign: 'middle', minWidth: 0 }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                        <div style={{ fontWeight: '700', color: '#1A231E', fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={formatCleanPqrSubject(pqr.subject)}>
                                                            {formatCleanPqrSubject(pqr.subject)}
                                                        </div>
                                                        {author.isInternalCase ? (
                                                            <span style={{ fontSize: '0.66rem', fontWeight: 700, color: '#0369A1', backgroundColor: '#F0F9FF', padding: '1px 6px', borderRadius: '4px', border: '1px solid #BAE6FD', display: 'inline-block', width: 'fit-content' }}>
                                                                Ámbito Interno (Sin Pedido)
                                                            </span>
                                                        ) : pqr.order_id ? (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                <span style={{ fontSize: '0.68rem', fontWeight: '700', padding: '1px 6px', borderRadius: '4px', backgroundColor: '#F1F5F9', color: '#334155', border: '1px solid #E2E8F0' }}>
                                                                    Pedido #{pqr.orders?.sequence_id || 'N/A'}
                                                                </span>
                                                                {pqr.orders?.total && (
                                                                    <span style={{ fontSize: '0.69rem', color: '#64748B', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>
                                                                        {formatMoney(pqr.orders.total)}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <span style={{ fontSize: '0.67rem', color: '#64748B', backgroundColor: '#F8FAFC', padding: '1px 6px', borderRadius: '4px', border: '1px solid #E2E8F0', display: 'inline-block', width: 'fit-content' }}>
                                                                Sin Pedido Enlazado
                                                            </span>
                                                        )}
                                                        <div style={{ fontSize: '0.65rem', color: '#94A3B8' }}>
                                                            {author.isInternalCase
                                                                ? (author.internalSubscopeLabel || 'Gestión Interna de Planta')
                                                                : (pqr.orders?.delivery_date ? `Entrega: ${pqr.orders.delivery_date}` : 'Registro Directo')}
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* 4. Evidencia */}
                                                <td style={{ padding: '8px 6px', borderBottom: '1px solid #F1F5F9', verticalAlign: 'middle', textAlign: 'center' }}>
                                                    {photos.length > 0 ? (
                                                        <div
                                                            style={{ position: 'relative', display: 'inline-block', cursor: 'pointer' }}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setZoomPhotoUrl(photos[0]);
                                                            }}
                                                        >
                                                            <img
                                                                src={photos[0]}
                                                                alt="Evidencia"
                                                                style={{
                                                                    width: '36px',
                                                                    height: '36px',
                                                                    borderRadius: '7px',
                                                                    objectFit: 'cover',
                                                                    border: '1px solid #E2E8F0',
                                                                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                                                    display: 'block'
                                                                }}
                                                            />
                                                            {photos.length > 1 && (
                                                                <span style={{
                                                                    position: 'absolute',
                                                                    top: '-4px',
                                                                    right: '-4px',
                                                                    backgroundColor: '#0F172A',
                                                                    color: 'white',
                                                                    fontSize: '0.6rem',
                                                                    fontWeight: '800',
                                                                    borderRadius: '50%',
                                                                    width: '16px',
                                                                    height: '16px',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                                                                }}>
                                                                    +{photos.length - 1}
                                                                </span>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span style={{ fontSize: '0.68rem', color: '#94A3B8', fontStyle: 'italic' }}>
                                                            Sin fotos
                                                        </span>
                                                    )}
                                                </td>

                                                {/* 5. Diagnóstico RCA (3 Filas) */}
                                                <td style={{ padding: '8px 10px', borderBottom: '1px solid #F1F5F9', verticalAlign: 'middle', minWidth: 0 }}>
                                                    {(!rca.isExplicitRca && pqr.status === 'pending') ? (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                            <span style={{
                                                                fontSize: '0.7rem',
                                                                fontWeight: '600',
                                                                padding: '2px 8px',
                                                                borderRadius: '6px',
                                                                backgroundColor: '#F8FAFC',
                                                                color: '#64748B',
                                                                border: '1px dashed #CBD5E1',
                                                                display: 'inline-block',
                                                                width: 'fit-content'
                                                            }}>
                                                                Pendiente de auditoría
                                                            </span>
                                                            <span style={{ fontSize: '0.68rem', color: '#94A3B8' }}>
                                                                Sin diagnóstico asignado
                                                            </span>
                                                            <span style={{ fontSize: '0.64rem', color: '#CBD5E1' }}>
                                                                Requiere dictamen técnico
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                            {/* Fila 1: Categoría L1 */}
                                                            <span style={{
                                                                fontSize: '0.72rem',
                                                                fontWeight: '700',
                                                                padding: '2px 8px',
                                                                borderRadius: '6px',
                                                                backgroundColor: '#F8FAFC',
                                                                color: '#1A231E',
                                                                border: '1px solid #E2E8F0',
                                                                display: 'inline-block',
                                                                width: 'fit-content',
                                                                maxWidth: '100%',
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                                whiteSpace: 'nowrap'
                                                            }} title={catObj?.label || 'Sin clasificar'}>
                                                                {catObj?.label.split('.')[1]?.trim() || catObj?.label || 'Sin clasificar'}
                                                            </span>
                                                            {/* Fila 2: Subtipo L2 */}
                                                            <div style={{ fontSize: '0.68rem', color: '#475569', fontWeight: '500', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={rca.subtypeL2?.replace(/_/g, ' ') || 'Sin subtipo L2'}>
                                                                {rca.subtypeL2 ? rca.subtypeL2.replace(/_/g, ' ') : 'Clasificación general'}
                                                            </div>
                                                            {/* Fila 3: Taxonomía info */}
                                                            <div style={{ fontSize: '0.64rem', color: '#94A3B8' }}>
                                                                Taxonomía RCA Nivel 2
                                                            </div>
                                                        </div>
                                                    )}
                                                </td>

                                                {/* 6. Imputabilidad & Cobro (3 Filas Estrictas) */}
                                                <td style={{ padding: '8px 10px', borderBottom: '1px solid #F1F5F9', verticalAlign: 'middle', minWidth: 0 }}>
                                                    {(() => {
                                                        const isUnauditedPending = !rca.isExplicitRca && pqr.status === 'pending' && (!rca.imputedEntities || rca.imputedEntities.length === 0);
                                                        if (isUnauditedPending) {
                                                            return (
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                                    <span style={{
                                                                        fontSize: '0.68rem',
                                                                        fontWeight: '600',
                                                                        padding: '2px 8px',
                                                                        borderRadius: '6px',
                                                                        backgroundColor: '#F8FAFC',
                                                                        color: '#64748B',
                                                                        border: '1px dashed #CBD5E1',
                                                                        display: 'inline-block',
                                                                        width: 'fit-content'
                                                                    }}>
                                                                        Sin imputar
                                                                    </span>
                                                                    <span style={{ fontSize: '0.68rem', color: '#94A3B8' }}>
                                                                        $0 sin cobro definido
                                                                    </span>
                                                                    <span style={{ fontSize: '0.64rem', color: '#CBD5E1' }}>
                                                                        Pendiente de dictamen
                                                                    </span>
                                                                </div>
                                                            );
                                                        }

                                                        const totalImputedCop = (rca.imputedEntities || []).reduce((acc, e) => acc + (Number(e.deductionAmount) || 0), 0);
                                                        const isClosedCase = pqr.status === 'resolved' || pqr.status === 'rejected';

                                                        return (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                                {/* Fila 1: Responsable Primario */}
                                                                <div>
                                                                    {rca.responsible && rca.responsible !== 'no_definido' ? (
                                                                        <span style={{
                                                                            fontSize: '0.67rem',
                                                                            fontWeight: '800',
                                                                            textTransform: 'uppercase',
                                                                            padding: '2px 6px',
                                                                            borderRadius: '4px',
                                                                            backgroundColor: '#EAEFEA',
                                                                            color: '#0D7A57',
                                                                            border: '1px solid #C4D7C4',
                                                                            display: 'inline-block',
                                                                            maxWidth: '100%',
                                                                            overflow: 'hidden',
                                                                            textOverflow: 'ellipsis',
                                                                            whiteSpace: 'nowrap'
                                                                        }} title={RESPONSIBLE_PARTIES[rca.responsible as any]?.label || rca.responsible}>
                                                                            {RESPONSIBLE_PARTIES[rca.responsible as any]?.label || rca.responsible}
                                                                        </span>
                                                                    ) : (
                                                                        <span style={{
                                                                            fontSize: '0.67rem',
                                                                            fontWeight: '700',
                                                                            textTransform: 'uppercase',
                                                                            padding: '2px 6px',
                                                                            borderRadius: '4px',
                                                                            backgroundColor: '#F8FAFC',
                                                                            color: '#64748B',
                                                                            border: '1px solid #E2E8F0',
                                                                            display: 'inline-block',
                                                                            whiteSpace: 'nowrap'
                                                                        }}>
                                                                            Sin Asignar
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                {/* Fila 2: Impacto Financiero / Cobro */}
                                                                <div>
                                                                    {totalImputedCop > 0 ? (
                                                                        <span style={{
                                                                            fontSize: '0.67rem',
                                                                            fontWeight: '800',
                                                                            padding: '1px 6px',
                                                                            borderRadius: '4px',
                                                                            backgroundColor: '#FEF2F2',
                                                                            color: '#DC2626',
                                                                            border: '1px solid #FECACA',
                                                                            display: 'inline-block',
                                                                            whiteSpace: 'nowrap',
                                                                            fontVariantNumeric: 'tabular-nums'
                                                                        }}>
                                                                            Cobro: ${totalImputedCop.toLocaleString('es-CO')}
                                                                        </span>
                                                                    ) : (rca.imputedEntities && rca.imputedEntities.length > 0 && isClosedCase) ? (
                                                                        <span style={{
                                                                            fontSize: '0.67rem',
                                                                            fontWeight: '700',
                                                                            padding: '1px 6px',
                                                                            borderRadius: '4px',
                                                                            backgroundColor: '#EFF6FF',
                                                                            color: '#1E40AF',
                                                                            border: '1px solid #BFDBFE',
                                                                            display: 'inline-block',
                                                                            whiteSpace: 'nowrap'
                                                                        }}>
                                                                            $0 Exonerado
                                                                        </span>
                                                                    ) : (
                                                                        <span style={{ fontSize: '0.66rem', color: '#94A3B8' }}>
                                                                            Sin cobro monetario
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                {/* Fila 3: Personas Imputadas con porcentaje */}
                                                                {rca.imputedEntities && rca.imputedEntities.length > 0 ? (
                                                                    <div style={{ fontSize: '0.67rem', color: '#475569', fontWeight: '500', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={rca.imputedEntities.map(e => `${e.name} (${e.sharePercent}% — $${(Number(e.deductionAmount) || 0).toLocaleString('es-CO')})`).join(', ')}>
                                                                        {rca.imputedEntities.map(e => e.name).join(', ')}
                                                                    </div>
                                                                ) : (
                                                                    <span style={{ fontSize: '0.65rem', color: '#94A3B8' }}>Sin personas imputadas</span>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}
                                                </td>

                                                {/* 7. Estado & Resolución (3 Filas) */}
                                                <td style={{ padding: '8px 10px', borderBottom: '1px solid #F1F5F9', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
                                                        {pqr.status === 'resolved' ? (
                                                            <>
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: '800', backgroundColor: '#EAEFEA', color: '#0D7A57', border: '1px solid #C4D7C4' }}>
                                                                    <CheckCircle2 size={12} />
                                                                    <span>Resuelto</span>
                                                                </span>
                                                                <span style={{ fontSize: '0.66rem', color: '#475569', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '3px', paddingLeft: '2px' }} title={`Auditado por: ${rca.auditedBy || 'FruFresco Admin'}`}>
                                                                    <User size={10} color="#64748B" />
                                                                    <span>Por: {(rca.auditedBy || 'FruFresco Admin').split(' ')[0]}</span>
                                                                </span>
                                                                <span style={{ fontSize: '0.64rem', color: '#94A3B8', paddingLeft: '2px' }}>
                                                                    Dictamen formal
                                                                </span>
                                                            </>
                                                        ) : pqr.status === 'rejected' ? (
                                                            <>
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: '800', backgroundColor: '#FEF2F2', color: '#991B1B', border: '1px solid #FECDD3' }}>
                                                                    <AlertCircle size={12} />
                                                                    <span>Rechazado</span>
                                                                </span>
                                                                <span style={{ fontSize: '0.66rem', color: '#475569', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '3px', paddingLeft: '2px' }} title={`Auditado por: ${rca.auditedBy || 'FruFresco Admin'}`}>
                                                                    <User size={10} color="#64748B" />
                                                                    <span>Por: {(rca.auditedBy || 'FruFresco Admin').split(' ')[0]}</span>
                                                                </span>
                                                                <span style={{ fontSize: '0.64rem', color: '#94A3B8', paddingLeft: '2px' }}>
                                                                    Caso desestimado
                                                                </span>
                                                            </>
                                                        ) : pqr.status === 'in_progress' ? (
                                                            <>
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: '800', backgroundColor: '#F1F5F9', color: '#334155', border: '1px solid #CBD5E1' }}>
                                                                    <Clock size={12} />
                                                                    <span>En Auditoría</span>
                                                                </span>
                                                                <span style={{ fontSize: '0.66rem', color: '#64748B', paddingLeft: '2px' }}>
                                                                    Revisión en curso
                                                                </span>
                                                                <span style={{ fontSize: '0.64rem', color: '#94A3B8', paddingLeft: '2px' }}>
                                                                    En investigación
                                                                </span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: '800', backgroundColor: '#FFFBEB', color: '#B45309', border: '1px solid #FDE68A' }}>
                                                                    <AlertTriangle size={12} />
                                                                    <span>Pendiente</span>
                                                                </span>
                                                                <span style={{ fontSize: '0.66rem', color: '#94A3B8', paddingLeft: '2px' }}>
                                                                    Esperando dictamen
                                                                </span>
                                                                <span style={{ fontSize: '0.64rem', color: '#CBD5E1', paddingLeft: '2px' }}>
                                                                    Sin asignar
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>

                                                {/* 8. Acciones (Icon-Buttons de Precisión 26px) */}
                                                <td style={{ padding: '8px 8px', borderBottom: '1px solid #F1F5F9', verticalAlign: 'middle', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', flexWrap: 'nowrap' }} onClick={e => e.stopPropagation()}>
                                                        {author.phoneParsed.isValid ? (
                                                            <a
                                                                href={`https://wa.me/${author.phoneParsed.waNumber}?text=${encodeURIComponent(buildCaseResolutionWhatsAppSummary(pqr))}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                style={{
                                                                    width: '26px',
                                                                    height: '26px',
                                                                    backgroundColor: '#ECFDF5',
                                                                    color: '#047857',
                                                                    border: '1px solid #A7F3D0',
                                                                    borderRadius: '6px',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                                                                    cursor: 'pointer',
                                                                    flexShrink: 0
                                                                }}
                                                                title={`Enviar respuesta al cliente por WhatsApp (${author.phoneParsed.display})`}
                                                                aria-label={`WhatsApp ${author.phoneParsed.display}`}
                                                            >
                                                                <MessageCircle size={14} style={{ color: '#059669' }} />
                                                            </a>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => showToast('El cliente no tiene un teléfono celular válido registrado.', 'warning')}
                                                                style={{
                                                                    width: '26px',
                                                                    height: '26px',
                                                                    backgroundColor: '#F8FAFC',
                                                                    color: '#94A3B8',
                                                                    border: '1px solid #E2E8F0',
                                                                    borderRadius: '6px',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    cursor: 'pointer',
                                                                    flexShrink: 0
                                                                }}
                                                                title="Sin teléfono registrado (clic para ver aviso)"
                                                                aria-label="WhatsApp no disponible"
                                                            >
                                                                <MessageCircle size={14} />
                                                            </button>
                                                        )}

                                                        {(() => {
                                                            const isRowClosed = pqr.status === 'resolved' || pqr.status === 'rejected';
                                                            return (
                                                                <>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleOpenAuditModal(pqr)}
                                                                        style={{
                                                                            width: '26px',
                                                                            height: '26px',
                                                                            backgroundColor: isRowClosed ? '#F8FAFC' : '#0D7A57',
                                                                            color: isRowClosed ? '#0F172A' : 'white',
                                                                            borderRadius: '6px',
                                                                            border: isRowClosed ? '1px solid #CBD5E1' : 'none',
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center',
                                                                            cursor: 'pointer',
                                                                            boxShadow: isRowClosed ? 'none' : '0 1px 2px rgba(13, 122, 87, 0.2)',
                                                                            flexShrink: 0
                                                                        }}
                                                                        title={isRowClosed ? "Ver Auditoría Completa" : "Auditar y Resolver Caso"}
                                                                    >
                                                                        <Eye size={13} style={{ color: isRowClosed ? '#0F172A' : 'white' }} />
                                                                    </button>

                                                                    <Link
                                                                        href={`/admin/customer-service/rnc/${pqr.id}/print`}
                                                                        target="_blank"
                                                                        style={{
                                                                            width: '26px',
                                                                            height: '26px',
                                                                            color: isRowClosed ? '#0D7A57' : '#475569',
                                                                            backgroundColor: isRowClosed ? '#F0FDF4' : 'white',
                                                                            border: isRowClosed ? '1px solid #86EFAC' : '1px solid #CBD5E1',
                                                                            borderRadius: '6px',
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center',
                                                                            textDecoration: 'none',
                                                                            flexShrink: 0
                                                                        }}
                                                                        title="Ver / Descargar Informe de Auditoría RNC (PDF)"
                                                                    >
                                                                        <FileText size={13} />
                                                                    </Link>
                                                                </>
                                                            );
                                                        })()}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan={8} style={{ padding: '3rem 1rem', textAlign: 'center', color: '#64748B' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                                <ShieldCheck size={36} style={{ color: '#94A3B8' }} />
                                                <div style={{ fontWeight: '700', fontSize: '0.85rem', color: '#334155' }}>
                                                    No se encontraron casos de PQRS con los filtros actuales.
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                                                    Prueba ajustando el término de búsqueda en el Omnibox o cambiando de pestaña.
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    /* Novelties Table View */
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '14px',
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                        overflow: 'visible'
                    }}>
                        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left', tableLayout: 'fixed' }}>
                            <thead style={{ position: 'sticky', top: `${85 + toolbarHeight}px`, zIndex: 40, backgroundColor: '#F8FAFC' }}>
                                <tr style={{ backgroundColor: '#F8FAFC' }}>
                                    <th style={{ position: 'sticky', top: `${85 + toolbarHeight}px`, zIndex: 40, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', padding: '12px 16px', fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B', borderTopLeftRadius: '14px' }}>
                                        Pedido & Fecha
                                    </th>
                                    <th style={{ position: 'sticky', top: `${85 + toolbarHeight}px`, zIndex: 40, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', padding: '12px 16px', fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B' }}>
                                        Cliente
                                    </th>
                                    <th style={{ position: 'sticky', top: `${85 + toolbarHeight}px`, zIndex: 40, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', padding: '12px 16px', fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B' }}>
                                        Producto Afectado
                                    </th>
                                    <th style={{ position: 'sticky', top: `${85 + toolbarHeight}px`, zIndex: 40, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', padding: '12px 16px', fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B' }}>
                                        Cantidad Devuelta
                                    </th>
                                    <th style={{ position: 'sticky', top: `${85 + toolbarHeight}px`, zIndex: 40, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', padding: '12px 16px', fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B' }}>
                                        Impacto Financiero
                                    </th>
                                    <th style={{ position: 'sticky', top: `${85 + toolbarHeight}px`, zIndex: 40, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', padding: '12px 16px', fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B' }}>
                                        Motivo Declarado
                                    </th>
                                    <th style={{ position: 'sticky', top: `${85 + toolbarHeight}px`, zIndex: 40, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', padding: '12px 16px', fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B' }}>
                                        Estado
                                    </th>
                                    <th style={{ position: 'sticky', top: `${85 + toolbarHeight}px`, zIndex: 40, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', padding: '12px 16px', fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B', textAlign: 'right', borderTopRightRadius: '14px' }}>
                                        Acción
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredNovelties.length > 0 ? (
                                    filteredNovelties.map((nov, idx) => {
                                        const oi = nov.orders?.order_items?.find((item: any) => item.product_id === nov.product_id);
                                        const price = Number(oi?.unit_price || 0);
                                        const qty = Number(nov.quantity_returned) || 0;
                                        const totalImpact = price * qty;

                                        return (
                                            <tr key={nov.id} style={{ backgroundColor: idx % 2 === 0 ? 'white' : '#FAFAFA' }}>
                                                <td style={{ padding: '12px 16px', borderBottom: '1px solid #F1F5F9', verticalAlign: 'middle', whiteSpace: 'nowrap', fontWeight: '800', color: '#1A231E', fontSize: '0.78rem' }}>
                                                    #{nov.orders?.sequence_id || 'N/A'}
                                                    <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 'normal' }}>
                                                        {formatDateFriendly(nov.created_at)}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '12px 16px', borderBottom: '1px solid #F1F5F9', verticalAlign: 'middle', fontWeight: '700', color: '#1A231E', fontSize: '0.78rem' }}>
                                                    {nov.orders?.profiles?.company_name || nov.orders?.profiles?.contact_name || 'Cliente'}
                                                </td>
                                                <td style={{ padding: '12px 16px', borderBottom: '1px solid #F1F5F9', verticalAlign: 'middle' }}>
                                                    <div style={{ fontWeight: '800', color: '#1A231E', fontSize: '0.78rem' }}>{nov.products?.name || 'Producto'}</div>
                                                    <div style={{ fontSize: '0.68rem', color: '#64748B', fontFamily: 'monospace' }}>SKU: {nov.products?.sku || 'N/A'}</div>
                                                </td>
                                                <td style={{ padding: '12px 16px', borderBottom: '1px solid #F1F5F9', verticalAlign: 'middle', fontWeight: '800', color: '#991B1B', fontSize: '0.78rem' }}>
                                                    -{qty} {nov.products?.unit_of_measure || 'Und'}
                                                </td>
                                                <td style={{ padding: '12px 16px', borderBottom: '1px solid #F1F5F9', verticalAlign: 'middle', fontWeight: '800', color: '#1A231E', fontSize: '0.78rem' }}>
                                                    {formatMoney(totalImpact)}
                                                </td>
                                                <td style={{ padding: '12px 16px', borderBottom: '1px solid #F1F5F9', verticalAlign: 'middle', maxWidth: '250px', color: '#475569', fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={nov.reason}>
                                                    {nov.reason || 'Sin motivo'}
                                                </td>
                                                <td style={{ padding: '12px 16px', borderBottom: '1px solid #F1F5F9', verticalAlign: 'middle' }}>
                                                    {nov.status === 'approved' ? (
                                                        <span style={{ fontSize: '0.68rem', fontWeight: '800', padding: '2px 8px', borderRadius: '12px', backgroundColor: '#EAEFEA', color: '#0D7A57', border: '1px solid #C4D7C4' }}>
                                                            Aprobada
                                                        </span>
                                                    ) : nov.status === 'rejected' ? (
                                                        <span style={{ fontSize: '0.68rem', fontWeight: '800', padding: '2px 8px', borderRadius: '12px', backgroundColor: '#FEF2F2', color: '#991B1B', border: '1px solid #FECDD3' }}>
                                                            Rechazada
                                                        </span>
                                                    ) : (
                                                        <span style={{ fontSize: '0.68rem', fontWeight: '800', padding: '2px 8px', borderRadius: '12px', backgroundColor: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}>
                                                            Pendiente Revisión
                                                        </span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '12px 16px', borderBottom: '1px solid #F1F5F9', verticalAlign: 'middle', textAlign: 'right' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedNovelty(nov)}
                                                        style={{
                                                            padding: '6px 12px',
                                                            backgroundColor: '#0D7A57',
                                                            color: 'white',
                                                            fontWeight: '700',
                                                            fontSize: '0.75rem',
                                                            borderRadius: '8px',
                                                            border: 'none',
                                                            cursor: 'pointer',
                                                            boxShadow: '0 2px 4px rgba(13, 122, 87, 0.25)'
                                                        }}
                                                    >
                                                        Auditar
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan={8} style={{ padding: '3rem 1rem', textAlign: 'center', color: '#64748B', fontSize: '0.78rem' }}>
                                            No hay novedades de línea registradas con los filtros seleccionados.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
                </>
                )}
            </div>

            {/* ================= MODALS ================= */}

            {/* 1. Stepper Wizard Audit Modal */}
            <PqrAuditModal
                pqr={selectedAuditPqr}
                isOpen={auditModalOpen}
                onClose={() => {
                    setAuditModalOpen(false);
                    setSelectedAuditPqr(null);
                }}
                onResolved={() => {
                    fetchData();
                }}
                providersList={providersList}
                collaboratorsList={collaboratorsList}
                customTaxonomy={customTaxonomy}
                onOpenTaxonomyModal={() => setShowTaxonomyModal(true)}
                onOpenFinancialModal={handleOpenFinancialModal}
                novelties={novelties}
                showToast={showToast}
                onZoomPhoto={(url) => setZoomPhotoUrl(url)}
            />

            {/* 2. Taxonomy Configuration Modal */}
            <PqrTaxonomyModal
                isOpen={showTaxonomyModal}
                onClose={() => setShowTaxonomyModal(false)}
                customTaxonomy={customTaxonomy}
                onSaved={(updated) => setCustomTaxonomy(updated)}
                showToast={showToast}
            />

            {/* 3. Novelty Review Modal */}
            <PqrNoveltyReviewModal
                novelty={selectedNovelty}
                isOpen={!!selectedNovelty}
                onClose={() => setSelectedNovelty(null)}
                onProcessed={handleProcessNovelty}
                actionLoading={actionLoading}
            />

            {/* 4. Financial Adjustment Modal */}
            {showFinancialModal && (
                <FinancialAdjustmentModal
                    isOpen={showFinancialModal}
                    onClose={() => setShowFinancialModal(false)}
                    onSuccess={() => {
                        if (selectedAuditPqr?.id) {
                            try {
                                localStorage.removeItem(`pqr_audit_draft_${selectedAuditPqr.id}`);
                            } catch {}
                        }
                        setShowFinancialModal(false);
                        setSelectedAuditPqr(null);
                        fetchData();
                    }}
                    mode={financialModalMode}
                    pqr={selectedAuditPqr}
                    orderItems={[]}
                    defaultImputedTargetType={selectedAuditPqr ? (parseRcaFromRecord(selectedAuditPqr).imputedTargetType as any) : undefined}
                    defaultImputedEntities={selectedAuditPqr ? (parseRcaFromRecord(selectedAuditPqr).imputedEntities as any) : undefined}
                    providersList={providersList}
                    collaboratorsList={collaboratorsList}
                />
            )}

            {/* 5. Fullscreen Photo Zoom Modal */}
            {zoomPhotoUrl && (
                <div 
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 99999,
                        backgroundColor: 'rgba(0, 0, 0, 0.92)',
                        backdropFilter: 'blur(8px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '1.5rem'
                    }}
                    onClick={() => setZoomPhotoUrl(null)}
                >
                    <button
                        onClick={() => setZoomPhotoUrl(null)}
                        style={{
                            position: 'absolute',
                            top: '16px',
                            right: '16px',
                            padding: '10px',
                            backgroundColor: 'rgba(255, 255, 255, 0.15)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '50%',
                            cursor: 'pointer'
                        }}
                    >
                        <X size={24} />
                    </button>
                    <img
                        src={zoomPhotoUrl}
                        alt="Evidencia Fullscreen"
                        style={{
                            maxWidth: '90vw',
                            maxHeight: '88vh',
                            objectFit: 'contain',
                            borderRadius: '12px',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
                        }}
                        onClick={e => e.stopPropagation()}
                    />
                </div>
            )}

            {/* Toast Notification */}
            {toastMessage && (
                <div 
                    style={{
                        position: 'fixed',
                        bottom: '20px',
                        right: '20px',
                        zIndex: 999999,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '12px 18px',
                        borderRadius: '14px',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                        fontSize: '0.78rem',
                        fontWeight: '700',
                        backgroundColor: toastMessage.type === 'error' ? '#FEF2F2' : toastMessage.type === 'warning' ? '#FFFBEB' : '#EAEFEA',
                        color: toastMessage.type === 'error' ? '#991B1B' : toastMessage.type === 'warning' ? '#92400E' : '#0D7A57',
                        border: `1px solid ${toastMessage.type === 'error' ? '#FECDD3' : toastMessage.type === 'warning' ? '#FDE68A' : '#C4D7C4'}`
                    }}
                >
                    {toastMessage.type === 'error' ? (
                        <AlertCircle size={18} style={{ color: '#E11D48' }} />
                    ) : toastMessage.type === 'warning' ? (
                        <AlertTriangle size={18} style={{ color: '#D97706' }} />
                    ) : (
                        <CheckCircle2 size={18} style={{ color: '#0D7A57' }} />
                    )}
                    <span>{toastMessage.text}</span>
                </div>
            )}
        </main>
    );
}
