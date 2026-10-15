'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { THEME, formatMoney } from '@/lib/adminTheme';
import {
    Bell, Truck, Calendar, MessageCircle, CheckCircle2, AlertTriangle,
    Clock, Building2, User, Phone, Search, RefreshCw, ExternalLink,
    Check, Sparkles, Filter, AlertCircle, ShoppingCart, ArrowRight,
    Layers, ChevronRight, CheckCheck, Copy
} from 'lucide-react';
import { getBogotaNow, formatDateToYYYYMMDD, addDaysISO } from '@/lib/colombianHolidays';
import { cleanColombianPhone } from '../utils';
import { GalleryOmnibox } from '@/components/common/GalleryOmnibox';

interface ClientProfile {
    id: string;
    company_name?: string;
    contact_name?: string;
    nit?: string;
    address?: string;
    contact_phone?: string;
    phone?: string;
    email?: string;
    parent_id?: string;
    is_corporate_parent?: boolean;
    delivery_restrictions?: any;
    logistics_data?: any;
}

interface HistoricalOrderStats {
    totalOrders: number;
    daysOfWeek: Record<number, number>; // day index (0..6) -> count
    lastOrderDate?: string;
    lastOrderTotal?: number;
    averageTotal?: number;
}

interface MissingOrderItem {
    profile: ClientProfile;
    isHabitualToday: boolean;
    habitualReason: string;
    habitualDaysLabel: string;
    hasActiveOrder: boolean;
    existingOrderSeq?: string;
    lastOrderDate?: string;
    lastOrderTotal?: number;
    averageTotal?: number;
    contactedAt?: string;
}

const DAYS_NAMES_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export default function MissingOrdersGallery({
    onNavigateToCreateOrder
}: {
    onNavigateToCreateOrder?: (profileId: string) => void;
}) {
    // 1. Target Delivery Date (Defaults to tomorrow or next business day)
    const [targetDate, setTargetDate] = useState<string>(() => {
        const bogotaNow = getBogotaNow();
        const tomorrow = new Date(bogotaNow);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return formatDateToYYYYMMDD(tomorrow);
    });

    // 2. Dynamic Sticky Toolbar Measurement (Magnetic Stacking Zero Gap)
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

    // 3. Data State
    const [profiles, setProfiles] = useState<ClientProfile[]>([]);
    const [ordersMap, setOrdersMap] = useState<Record<string, { id: string; sequence_id?: number; total?: number; status: string }>>({});
    const [draftsMap, setDraftsMap] = useState<Record<string, { id: string; subject?: string }>>({});
    const [historyStats, setHistoryStats] = useState<Record<string, HistoricalOrderStats>>({});
    const [loading, setLoading] = useState<boolean>(true);
    const [refreshing, setRefreshing] = useState<boolean>(false);

    // 4. Search and Status Filter
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [statusFilter, setStatusFilter] = useState<'missing_only' | 'all' | 'contacted' | 'uncontacted'>('missing_only');
    const [copiedId, setCopiedId] = useState<string | null>(null);

    // 5. Contacted tracking stored locally by targetDate
    const storageKey = `cs_reminders_${targetDate}`;
    const [contactedMap, setContactedMap] = useState<Record<string, string>>(() => {
        if (typeof window === 'undefined') return {};
        try {
            const raw = localStorage.getItem(`cs_reminders_${targetDate}`);
            return raw ? JSON.parse(raw) : {};
        } catch {
            return {};
        }
    });

    useEffect(() => {
        try {
            const raw = localStorage.getItem(`cs_reminders_${targetDate}`);
            setContactedMap(raw ? JSON.parse(raw) : {});
        } catch {
            setContactedMap({});
        }
    }, [targetDate]);

    const markAsContacted = useCallback((profileId: string) => {
        const now = getBogotaNow();
        const timeStr = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });
        const updated = {
            ...contactedMap,
            [profileId]: timeStr
        };
        setContactedMap(updated);
        try {
            localStorage.setItem(storageKey, JSON.stringify(updated));
        } catch (e) {
            console.error('Error saving reminder state to localStorage:', e);
        }
    }, [contactedMap, storageKey]);

    const removeContacted = useCallback((profileId: string) => {
        const updated = { ...contactedMap };
        delete updated[profileId];
        setContactedMap(updated);
        try {
            localStorage.setItem(storageKey, JSON.stringify(updated));
        } catch (e) {
            console.error('Error removing reminder state from localStorage:', e);
        }
    }, [contactedMap, storageKey]);

    // 6. Fetch Data from Supabase
    const fetchData = useCallback(async () => {
        setRefreshing(true);
        try {
            // A. Fetch active institutional/B2B profiles
            const { data: profs, error: profError } = await supabase
                .from('profiles')
                .select('id, company_name, contact_name, nit, address, contact_phone, phone, email, parent_id, is_corporate_parent, delivery_restrictions, logistics_data')
                .eq('role', 'b2b_client')
                .eq('is_active', true)
                .order('company_name', { ascending: true });

            if (profError) throw profError;
            const validProfiles = (profs || []).filter(p => !p.is_corporate_parent);
            setProfiles(validProfiles);

            // B. Fetch orders scheduled for the target delivery date
            const { data: targetOrders, error: ordersError } = await supabase
                .from('orders')
                .select('id, profile_id, sequence_id, total, status')
                .eq('delivery_date', targetDate)
                .neq('status', 'cancelled')
                .neq('status', 'rejected');

            if (ordersError) console.warn('Warning fetching target orders:', ordersError);
            const ordMap: Record<string, any> = {};
            (targetOrders || []).forEach(o => {
                if (o.profile_id) ordMap[o.profile_id] = o;
            });
            setOrdersMap(ordMap);

            // C. Fetch pending drafts for target date
            const { data: targetDrafts } = await supabase
                .from('order_drafts')
                .select('id, profile_id, email_subject, status')
                .eq('delivery_date', targetDate)
                .neq('status', 'rejected')
                .neq('status', 'processed');

            const drfMap: Record<string, any> = {};
            (targetDrafts || []).forEach(d => {
                if (d.profile_id) drfMap[d.profile_id] = d;
            });
            setDraftsMap(drfMap);

            // D. Fetch 90-day order history to calculate day-of-week frequencies
            const ninetyDaysAgo = new Date(getBogotaNow());
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
            const ninetyDaysStr = formatDateToYYYYMMDD(ninetyDaysAgo);

            const { data: histOrders } = await supabase
                .from('orders')
                .select('id, profile_id, delivery_date, total, status')
                .gte('delivery_date', ninetyDaysStr)
                .neq('status', 'cancelled')
                .neq('status', 'rejected')
                .order('delivery_date', { ascending: false });

            const statsMap: Record<string, HistoricalOrderStats> = {};
            (histOrders || []).forEach(o => {
                if (!o.profile_id || !o.delivery_date) return;
                if (!statsMap[o.profile_id]) {
                    statsMap[o.profile_id] = {
                        totalOrders: 0,
                        daysOfWeek: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
                        lastOrderDate: o.delivery_date,
                        lastOrderTotal: Number(o.total) || 0,
                        averageTotal: 0
                    };
                }
                const st = statsMap[o.profile_id];
                st.totalOrders += 1;
                const dObj = new Date(o.delivery_date + 'T12:00:00');
                if (!isNaN(dObj.getTime())) {
                    const dayIdx = dObj.getDay();
                    st.daysOfWeek[dayIdx] = (st.daysOfWeek[dayIdx] || 0) + 1;
                }
            });

            // Calculate averages
            Object.values(statsMap).forEach(st => {
                if (st.totalOrders > 0 && st.lastOrderTotal) {
                    st.averageTotal = Math.round(st.lastOrderTotal);
                }
            });

            setHistoryStats(statsMap);
        } catch (err) {
            console.error('Error fetching missing orders data:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [targetDate]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // 7. Target Day of the Week calculation
    const targetDayIndex = useMemo(() => {
        const d = new Date(targetDate + 'T12:00:00');
        return isNaN(d.getTime()) ? 1 : d.getDay();
    }, [targetDate]);

    const targetDayName = DAYS_NAMES_ES[targetDayIndex];

    // 8. Compile items with frequency & order match
    const allCompiledItems: MissingOrderItem[] = useMemo(() => {
        return profiles.map(profile => {
            const hasOrder = Boolean(ordersMap[profile.id]);
            const hasDraft = Boolean(draftsMap[profile.id]);
            const existingOrder = ordersMap[profile.id];
            const stats = historyStats[profile.id];

            let isHabitual = false;
            let habitualReason = '';
            let habitualDaysLabel = '';

            // A. Check explicit configuration in logistics_data.allowed_days
            let logisticsObj = profile.logistics_data;
            if (typeof logisticsObj === 'string') {
                try {
                    logisticsObj = JSON.parse(logisticsObj);
                } catch {
                    logisticsObj = null;
                }
            }
            const allowedDays: number[] = Array.isArray(logisticsObj?.allowed_days)
                ? logisticsObj.allowed_days
                : (Array.isArray(logisticsObj?.days) ? logisticsObj.days : []);

            if (allowedDays.length > 0) {
                const mappedDays = allowedDays.map(d => (d === 7 ? 0 : d));
                const sortedUnique = Array.from(new Set(mappedDays)).sort((a, b) => a - b);

                // Friendly formatting for common business patterns
                if (sortedUnique.length === 5 && [1, 2, 3, 4, 5].every(d => sortedUnique.includes(d))) {
                    habitualDaysLabel = 'Lunes a Viernes';
                } else if (sortedUnique.length === 6 && [1, 2, 3, 4, 5, 6].every(d => sortedUnique.includes(d))) {
                    habitualDaysLabel = 'Lunes a Sábado';
                } else if (sortedUnique.length === 7) {
                    habitualDaysLabel = 'Todos los días';
                } else {
                    habitualDaysLabel = mappedDays
                        .map(d => DAYS_NAMES_ES[d])
                        .filter(Boolean)
                        .join(' y ');
                }

                if (mappedDays.includes(targetDayIndex)) {
                    isHabitual = true;
                    habitualReason = `Configurado en ficha de cliente (${habitualDaysLabel})`;
                }
            }

            // B. If not explicit, check delivery_restrictions text safely
            if (!isHabitual && profile.delivery_restrictions) {
                const rawRestrictions = typeof profile.delivery_restrictions === 'string'
                    ? profile.delivery_restrictions
                    : (typeof profile.delivery_restrictions === 'object'
                        ? JSON.stringify(profile.delivery_restrictions)
                        : String(profile.delivery_restrictions));
                const text = rawRestrictions.toLowerCase();
                const dayWord = targetDayName.toLowerCase();
                if (text.includes(dayWord) || text.includes('todos los d') || text.includes('lunes a sabado') || text.includes('diario')) {
                    isHabitual = true;
                    habitualReason = `Menciona "${targetDayName}" en restricciones de entrega`;
                    if (!habitualDaysLabel) habitualDaysLabel = rawRestrictions;
                }
            }

            // C. If still not detected, evaluate historical patterns (e.g. >= 3 orders on this day in last 90 days)
            if (!isHabitual && stats && stats.totalOrders >= 4) {
                const countOnThisDay = stats.daysOfWeek[targetDayIndex] || 0;
                const ratio = countOnThisDay / stats.totalOrders;
                if (countOnThisDay >= 3 && ratio >= 0.25) {
                    isHabitual = true;
                    habitualReason = `Historial: ${countOnThisDay} pedidos despachados los días ${targetDayName}`;
                    const topDays = Object.entries(stats.daysOfWeek)
                        .filter(([_, cnt]) => cnt >= 3)
                        .map(([d]) => DAYS_NAMES_ES[Number(d)])
                        .join(' y ');
                    if (!habitualDaysLabel) habitualDaysLabel = topDays || `Frecuencia: ${targetDayName}`;
                }
            }

            const contactedAt = contactedMap[profile.id];

            return {
                profile,
                isHabitualToday: isHabitual,
                habitualReason: habitualReason || 'Cliente B2B recurrente',
                habitualDaysLabel: habitualDaysLabel || 'Frecuencia semanal',
                hasActiveOrder: hasOrder || hasDraft,
                existingOrderSeq: existingOrder?.sequence_id ? `#${existingOrder.sequence_id}` : (hasDraft ? 'En Borrador' : undefined),
                lastOrderDate: stats?.lastOrderDate,
                lastOrderTotal: stats?.lastOrderTotal,
                averageTotal: stats?.averageTotal,
                contactedAt
            };
        });
    }, [profiles, ordersMap, draftsMap, historyStats, targetDayIndex, targetDayName, contactedMap]);

    // 9. Filtered Items by Omnibox Search and Status
    const filteredItems = useMemo(() => {
        let result = allCompiledItems;

        // Status Filter
        if (statusFilter === 'missing_only') {
            result = result.filter(item => item.isHabitualToday && !item.hasActiveOrder);
        } else if (statusFilter === 'contacted') {
            result = result.filter(item => Boolean(item.contactedAt));
        } else if (statusFilter === 'uncontacted') {
            result = result.filter(item => item.isHabitualToday && !item.hasActiveOrder && !item.contactedAt);
        } else if (statusFilter === 'all') {
            result = result.filter(item => item.isHabitualToday);
        }

        // Search Term Filter
        if (searchTerm.trim()) {
            const clean = searchTerm.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
            result = result.filter(item => {
                const comp = String(item.profile.company_name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const cont = String(item.profile.contact_name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const nit = String(item.profile.nit || '').toLowerCase();
                const phone = String(item.profile.contact_phone || item.profile.phone || '').toLowerCase();
                const addr = String(item.profile.address || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                return comp.includes(clean) || cont.includes(clean) || nit.includes(clean) || phone.includes(clean) || addr.includes(clean);
            });
        }

        // Sorting: Uncontacted first, then by company name
        return result.sort((a, b) => {
            if (!a.contactedAt && b.contactedAt) return -1;
            if (a.contactedAt && !b.contactedAt) return 1;
            return String(a.profile.company_name || '').localeCompare(String(b.profile.company_name || ''));
        });
    }, [allCompiledItems, statusFilter, searchTerm]);

    // 10. Metrics Summary for Top Banner
    const metrics = useMemo(() => {
        const habitualTotal = allCompiledItems.filter(i => i.isHabitualToday).length;
        const withOrder = allCompiledItems.filter(i => i.isHabitualToday && i.hasActiveOrder).length;
        const missingCount = allCompiledItems.filter(i => i.isHabitualToday && !i.hasActiveOrder).length;
        const contactedCount = allCompiledItems.filter(i => i.isHabitualToday && !i.hasActiveOrder && i.contactedAt).length;
        return { habitualTotal, withOrder, missingCount, contactedCount };
    }, [allCompiledItems]);

    // 11. Helper to generate the Gemba reminder text
    const buildMessageText = (item: MissingOrderItem) => {
        const contactName = item.profile.contact_name?.trim() || item.profile.company_name?.trim() || 'Estimado Cliente';
        return `🍅 ¡Hola ${contactName}!
¡Mañana salimos de ruta! 🚚
Hoy estamos organizando los pedidos y recibimos solicitudes hasta las 4:00 p.m. 🕒
✉️ Esperamos tu pedido: pedidos@frufresco.com
Quedamos atentos`;
    };

    // 12. Handler to Send WhatsApp Reminder (Gemba Template)
    const handleSendWhatsApp = (item: MissingOrderItem) => {
        const phone = item.profile.contact_phone || item.profile.phone;
        const cleanPhone = cleanColombianPhone(phone);
        if (!cleanPhone) {
            alert('Este cliente no tiene un teléfono celular registrado válido.');
            return;
        }

        const messageText = buildMessageText(item);
        const encoded = encodeURIComponent(messageText);
        const waUrl = `https://wa.me/57${cleanPhone}?text=${encoded}`;

        markAsContacted(item.profile.id);
        window.open(waUrl, '_blank');
    };

    // 13. Handler to Copy Reminder Message to Clipboard (1-Clic)
    const handleCopyMessage = async (item: MissingOrderItem) => {
        const text = buildMessageText(item);
        try {
            await navigator.clipboard.writeText(text);
            setCopiedId(item.profile.id);
            markAsContacted(item.profile.id);
            setTimeout(() => {
                setCopiedId(current => (current === item.profile.id ? null : current));
            }, 2500);
        } catch (err) {
            console.error('Error copying text to clipboard:', err);
            // Fallback for older contexts or permissions
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            try {
                document.execCommand('copy');
                setCopiedId(item.profile.id);
                markAsContacted(item.profile.id);
                setTimeout(() => {
                    setCopiedId(current => (current === item.profile.id ? null : current));
                }, 2500);
            } catch (fallbackErr) {
                alert('No se pudo copiar el mensaje automáticamente.');
            }
            document.body.removeChild(textArea);
        }
    };

    return (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
            
            {/* 1. Header & Route Configuration Card */}
            <div style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '16px',
                padding: '1.2rem 1.5rem',
                border: '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1rem',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '12px',
                        backgroundColor: '#FEF3C7',
                        color: '#D97706',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                    }}>
                        <Bell size={22} strokeWidth={2.2} />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <h2 style={{
                                margin: 0,
                                fontSize: '1.1rem',
                                fontWeight: 800,
                                color: '#0F172A',
                                letterSpacing: '-0.02em',
                                fontFamily: 'var(--font-outfit), sans-serif'
                            }}>
                                Control de Pedidos Pendientes & Recordatorios
                            </h2>
                            <span style={{
                                fontSize: '0.7rem',
                                fontWeight: 800,
                                backgroundColor: '#E0F2FE',
                                color: '#0369A1',
                                padding: '2px 8px',
                                borderRadius: '12px',
                                border: '1px solid #BAE6FD'
                            }}>
                                SDD v1.9.193
                            </span>
                        </div>
                        <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: '#64748B', fontWeight: 500 }}>
                            Clientes institucionales que habitualmente reciben ruta el día <strong>{targetDayName}</strong> y aún tienen su pedido pendiente.
                        </p>
                    </div>
                </div>

                {/* Target Date Picker & Presets */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        backgroundColor: '#F8FAFC',
                        border: '1.5px solid #CBD5E1',
                        borderRadius: '12px',
                        padding: '6px 12px'
                    }}>
                        <Calendar size={16} style={{ color: '#0D7A57' }} />
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155' }}>
                            Ruta Objetivo:
                        </span>
                        <input
                            type="date"
                            value={targetDate}
                            onChange={(e) => {
                                if (e.target.value) setTargetDate(e.target.value);
                            }}
                            style={{
                                border: 'none',
                                outline: 'none',
                                backgroundColor: 'transparent',
                                fontSize: '0.85rem',
                                fontWeight: 700,
                                color: '#0F172A',
                                cursor: 'pointer'
                            }}
                        />
                    </div>

                    <button
                        type="button"
                        onClick={fetchData}
                        disabled={refreshing}
                        style={{
                            padding: '8px 14px',
                            backgroundColor: '#F1F5F9',
                            border: '1px solid #CBD5E1',
                            borderRadius: '12px',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            color: '#334155',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                        Actualizar
                    </button>
                </div>
            </div>

            {/* 2. Top KPI Cards */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                gap: '12px'
            }}>
                {/* KPI 1: Habituales del Día */}
                <div style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '14px',
                    padding: '1.1rem 1.25rem',
                    border: '1px solid #E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                }}>
                    <div>
                        <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Habituales ({targetDayName})
                        </div>
                        <div style={{ fontSize: '1.55rem', fontWeight: 900, color: '#0F172A', marginTop: '2px', letterSpacing: '-0.02em' }}>
                            {loading ? '...' : metrics.habitualTotal}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                            Clientes de ruta programada
                        </div>
                    </div>
                    <div style={{ padding: '10px', backgroundColor: '#F8FAFC', color: '#475569', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                        <Building2 size={22} />
                    </div>
                </div>

                {/* KPI 2: Pedidos Ya Montados */}
                <div style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '14px',
                    padding: '1.1rem 1.25rem',
                    border: '1px solid #E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                }}>
                    <div>
                        <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Pedidos Ya Recibidos
                        </div>
                        <div style={{ fontSize: '1.55rem', fontWeight: 900, color: '#0D7A57', marginTop: '2px', letterSpacing: '-0.02em' }}>
                            {loading ? '...' : metrics.withOrder}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#15803D' }}>
                            En firme o en borrador
                        </div>
                    </div>
                    <div style={{ padding: '10px', backgroundColor: '#DCFCE7', color: '#15803D', borderRadius: '12px', border: '1px solid #BBF7D0' }}>
                        <CheckCircle2 size={22} />
                    </div>
                </div>

                {/* KPI 3: Pedidos Pendientes */}
                <div style={{
                    backgroundColor: metrics.missingCount > 0 ? '#FFFBEB' : '#FFFFFF',
                    borderRadius: '14px',
                    padding: '1.1rem 1.25rem',
                    border: `1.5px solid ${metrics.missingCount > 0 ? '#F59E0B' : '#E2E8F0'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    boxShadow: metrics.missingCount > 0 ? '0 3px 8px rgba(245, 158, 11, 0.12)' : '0 1px 3px rgba(0,0,0,0.02)'
                }}>
                    <div>
                        <div style={{ fontSize: '0.68rem', fontWeight: 800, color: metrics.missingCount > 0 ? '#92400E' : '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Pedidos Pendientes
                        </div>
                        <div style={{ fontSize: '1.55rem', fontWeight: 900, color: metrics.missingCount > 0 ? '#B45309' : '#0F172A', marginTop: '2px', letterSpacing: '-0.02em' }}>
                            {loading ? '...' : metrics.missingCount}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: metrics.missingCount > 0 ? '#B45309' : '#64748B' }}>
                            Pendientes de enviar orden
                        </div>
                    </div>
                    <div style={{ padding: '10px', backgroundColor: metrics.missingCount > 0 ? '#FDE68A' : '#F8FAFC', color: metrics.missingCount > 0 ? '#B45309' : '#64748B', borderRadius: '12px', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                        <AlertTriangle size={22} />
                    </div>
                </div>

                {/* KPI 4: Contactados Hoy */}
                <div style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '14px',
                    padding: '1.1rem 1.25rem',
                    border: '1px solid #E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                }}>
                    <div>
                        <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#0369A1', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Recordatorios Enviados
                        </div>
                        <div style={{ fontSize: '1.55rem', fontWeight: 900, color: '#0284C7', marginTop: '2px', letterSpacing: '-0.02em' }}>
                            {loading ? '...' : metrics.contactedCount}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#0369A1' }}>
                            Gestionados en jornada
                        </div>
                    </div>
                    <div style={{ padding: '10px', backgroundColor: '#E0F2FE', color: '#0369A1', borderRadius: '12px', border: '1px solid #BAE6FD' }}>
                        <MessageCircle size={22} />
                    </div>
                </div>
            </div>

            {/* 3. Línea 1 Sticky Toolbar (top: 85px, zIndex: 70) — Magnetic Stacking Protocol */}
            <div
                ref={toolbarRef}
                style={{
                    position: 'sticky',
                    top: '85px',
                    zIndex: 70,
                    margin: '0.5rem 0',
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
                        onClick={() => setStatusFilter('missing_only')}
                        style={{
                            padding: '6px 12px',
                            fontSize: '0.75rem',
                            fontWeight: statusFilter === 'missing_only' ? '800' : '600',
                            borderRadius: '7px',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            backgroundColor: statusFilter === 'missing_only' ? '#D97706' : 'transparent',
                            color: statusFilter === 'missing_only' ? '#FFFFFF' : '#475569',
                            boxShadow: statusFilter === 'missing_only' ? '0 2px 6px rgba(217, 119, 6, 0.35)' : 'none',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <AlertTriangle size={14} />
                        <span>Solo Pendientes</span>
                        <span style={{
                            fontSize: '0.68rem',
                            fontWeight: '900',
                            padding: '1px 6px',
                            borderRadius: '10px',
                            backgroundColor: statusFilter === 'missing_only' ? 'rgba(255, 255, 255, 0.25)' : '#E2E8F0',
                            color: statusFilter === 'missing_only' ? '#FFFFFF' : '#475569'
                        }}>
                            {metrics.missingCount}
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setStatusFilter('uncontacted')}
                        style={{
                            padding: '6px 12px',
                            fontSize: '0.75rem',
                            fontWeight: statusFilter === 'uncontacted' ? '800' : '600',
                            borderRadius: '7px',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            backgroundColor: statusFilter === 'uncontacted' ? '#DC2626' : 'transparent',
                            color: statusFilter === 'uncontacted' ? '#FFFFFF' : '#475569',
                            boxShadow: statusFilter === 'uncontacted' ? '0 2px 6px rgba(220, 38, 38, 0.35)' : 'none',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <AlertCircle size={14} />
                        <span>Sin Contactar</span>
                        <span style={{
                            fontSize: '0.68rem',
                            fontWeight: '900',
                            padding: '1px 6px',
                            borderRadius: '10px',
                            backgroundColor: statusFilter === 'uncontacted' ? 'rgba(255, 255, 255, 0.25)' : '#E2E8F0',
                            color: statusFilter === 'uncontacted' ? '#FFFFFF' : '#475569'
                        }}>
                            {Math.max(0, metrics.missingCount - metrics.contactedCount)}
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setStatusFilter('contacted')}
                        style={{
                            padding: '6px 12px',
                            fontSize: '0.75rem',
                            fontWeight: statusFilter === 'contacted' ? '800' : '600',
                            borderRadius: '7px',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            backgroundColor: statusFilter === 'contacted' ? '#0D7A57' : 'transparent',
                            color: statusFilter === 'contacted' ? '#FFFFFF' : '#475569',
                            boxShadow: statusFilter === 'contacted' ? '0 2px 6px rgba(13, 122, 87, 0.35)' : 'none',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <CheckCheck size={14} />
                        <span>Ya Contactados</span>
                        <span style={{
                            fontSize: '0.68rem',
                            fontWeight: '900',
                            padding: '1px 6px',
                            borderRadius: '10px',
                            backgroundColor: statusFilter === 'contacted' ? 'rgba(255, 255, 255, 0.25)' : '#E2E8F0',
                            color: statusFilter === 'contacted' ? '#FFFFFF' : '#475569'
                        }}>
                            {metrics.contactedCount}
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setStatusFilter('all')}
                        style={{
                            padding: '6px 12px',
                            fontSize: '0.75rem',
                            fontWeight: statusFilter === 'all' ? '800' : '600',
                            borderRadius: '7px',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            backgroundColor: statusFilter === 'all' ? '#1E293B' : 'transparent',
                            color: statusFilter === 'all' ? '#FFFFFF' : '#475569',
                            boxShadow: statusFilter === 'all' ? '0 2px 6px rgba(30, 41, 59, 0.35)' : 'none',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <Layers size={14} />
                        <span>Todos ({metrics.habitualTotal})</span>
                    </button>
                </div>

                {/* Superbuscador Omnibox Universal FruFresco */}
                <div style={{ flex: '1', maxWidth: '420px', minWidth: '260px' }}>
                    <GalleryOmnibox
                        value={searchTerm}
                        onChange={setSearchTerm}
                        placeholder="Buscar cliente, hotel, NIT o contacto (presiona /)..."
                        filteredCount={filteredItems.length}
                        totalCount={allCompiledItems.length}
                    />
                </div>
            </div>

            {/* 4. Línea 2 Sticky: Master Data Table Container (overflow: 'visible' inviolable) */}
            <div style={{
                backgroundColor: 'white',
                borderRadius: '14px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                overflow: 'visible'
            }}>
                {loading ? (
                    <div style={{ padding: '3.5rem', textAlign: 'center', color: '#64748B' }}>
                        <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 12px auto', color: '#0D7A57' }} />
                        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Analizando patrones y pedidos para la ruta de {targetDayName}...</div>
                    </div>
                ) : filteredItems.length === 0 ? (
                    <div style={{ padding: '3.5rem 2rem', textAlign: 'center' }}>
                        <div style={{
                            width: '56px',
                            height: '56px',
                            borderRadius: '50%',
                            backgroundColor: '#DCFCE7',
                            color: '#15803D',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 1rem auto'
                        }}>
                            <CheckCircle2 size={30} />
                        </div>
                        <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                            {statusFilter === 'missing_only' 
                                ? '¡Excelente! No hay pedidos pendientes para esta ruta.'
                                : 'No se encontraron clientes con los filtros seleccionados.'}
                        </h3>
                        <p style={{ fontSize: '0.85rem', color: '#64748B', maxWidth: '500px', margin: '8px auto 0 auto' }}>
                            {statusFilter === 'missing_only'
                                ? 'Todos los clientes habituales de este día ya cuentan con su pedido en el sistema o ya fueron gestionados.'
                                : 'Prueba cambiando el término de búsqueda o seleccionando otra fecha de ruta arriba.'}
                        </p>
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left' }}>
                        <thead style={{ position: 'sticky', top: `${85 + toolbarHeight}px`, zIndex: 40, backgroundColor: '#F8FAFC' }}>
                            <tr style={{ backgroundColor: '#F8FAFC' }}>
                                <th style={{
                                    position: 'sticky',
                                    top: `${85 + toolbarHeight}px`,
                                    zIndex: 40,
                                    backgroundColor: '#F8FAFC',
                                    borderBottom: '2px solid #E2E8F0',
                                    padding: '12px 16px',
                                    fontSize: '0.68rem',
                                    fontWeight: '800',
                                    textTransform: 'uppercase',
                                    color: '#64748B',
                                    borderTopLeftRadius: '14px'
                                }}>
                                    Cliente / Empresa
                                </th>
                                <th style={{
                                    position: 'sticky',
                                    top: `${85 + toolbarHeight}px`,
                                    zIndex: 40,
                                    backgroundColor: '#F8FAFC',
                                    borderBottom: '2px solid #E2E8F0',
                                    padding: '12px 16px',
                                    fontSize: '0.68rem',
                                    fontWeight: '800',
                                    textTransform: 'uppercase',
                                    color: '#64748B'
                                }}>
                                    Contacto & Teléfono
                                </th>
                                <th style={{
                                    position: 'sticky',
                                    top: `${85 + toolbarHeight}px`,
                                    zIndex: 40,
                                    backgroundColor: '#F8FAFC',
                                    borderBottom: '2px solid #E2E8F0',
                                    padding: '12px 16px',
                                    fontSize: '0.68rem',
                                    fontWeight: '800',
                                    textTransform: 'uppercase',
                                    color: '#64748B'
                                }}>
                                    Frecuencia Habitual
                                </th>
                                <th style={{
                                    position: 'sticky',
                                    top: `${85 + toolbarHeight}px`,
                                    zIndex: 40,
                                    backgroundColor: '#F8FAFC',
                                    borderBottom: '2px solid #E2E8F0',
                                    padding: '12px 16px',
                                    fontSize: '0.68rem',
                                    fontWeight: '800',
                                    textTransform: 'uppercase',
                                    color: '#64748B'
                                }}>
                                    Último Pedido
                                </th>
                                <th style={{
                                    position: 'sticky',
                                    top: `${85 + toolbarHeight}px`,
                                    zIndex: 40,
                                    backgroundColor: '#F8FAFC',
                                    borderBottom: '2px solid #E2E8F0',
                                    padding: '12px 16px',
                                    fontSize: '0.68rem',
                                    fontWeight: '800',
                                    textTransform: 'uppercase',
                                    color: '#64748B'
                                }}>
                                    Estado Hoy
                                </th>
                                <th style={{
                                    position: 'sticky',
                                    top: `${85 + toolbarHeight}px`,
                                    zIndex: 40,
                                    backgroundColor: '#F8FAFC',
                                    borderBottom: '2px solid #E2E8F0',
                                    padding: '12px 16px',
                                    fontSize: '0.68rem',
                                    fontWeight: '800',
                                    textTransform: 'uppercase',
                                    color: '#64748B',
                                    textAlign: 'right',
                                    borderTopRightRadius: '14px'
                                }}>
                                    Acción de Contacto
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredItems.map((item, idx) => {
                                const phone = item.profile.contact_phone || item.profile.phone;
                                const isContacted = Boolean(item.contactedAt);

                                return (
                                    <tr
                                        key={item.profile.id}
                                        style={{
                                            backgroundColor: idx % 2 === 0 ? 'white' : '#FAFAFA',
                                            transition: 'background-color 0.15s ease'
                                        }}
                                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F1F5F9')}
                                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = idx % 2 === 0 ? 'white' : '#FAFAFA')}
                                    >
                                        {/* 1. Cliente */}
                                        <td style={{ padding: '12px 16px', borderBottom: '1px solid #F1F5F9', verticalAlign: 'middle' }}>
                                            <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#1A231E' }}>
                                                {item.profile.company_name || 'Sin Razón Social'}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px', fontSize: '0.72rem', color: '#64748B' }}>
                                                <span>NIT: {item.profile.nit || 'No registrado'}</span>
                                                {item.profile.address && (
                                                    <span>• {String(item.profile.address).slice(0, 32)}</span>
                                                )}
                                            </div>
                                        </td>

                                        {/* 2. Contacto & Teléfono */}
                                        <td style={{ padding: '12px 16px', borderBottom: '1px solid #F1F5F9', verticalAlign: 'middle' }}>
                                            <div style={{ fontWeight: 700, color: '#334155', fontSize: '0.82rem' }}>
                                                {item.profile.contact_name || 'Encargado de Compras'}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '3px', fontSize: '0.74rem', color: '#0D7A57', fontWeight: 600 }}>
                                                <Phone size={12} />
                                                <span>{phone || 'Sin número'}</span>
                                            </div>
                                        </td>

                                        {/* 3. Frecuencia Habitual */}
                                        <td style={{ padding: '12px 16px', borderBottom: '1px solid #F1F5F9', verticalAlign: 'middle' }}>
                                            <div style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '5px',
                                                padding: '3px 8px',
                                                borderRadius: '8px',
                                                backgroundColor: '#F1F5F9',
                                                color: '#334155',
                                                fontWeight: 700,
                                                fontSize: '0.74rem',
                                                border: '1px solid #E2E8F0'
                                            }}>
                                                <Calendar size={12} style={{ color: '#0D7A57' }} />
                                                {item.habitualDaysLabel}
                                            </div>
                                            <div style={{ fontSize: '0.68rem', color: '#94A3B8', marginTop: '3px' }}>
                                                {item.habitualReason}
                                            </div>
                                        </td>

                                        {/* 4. Último Pedido */}
                                        <td style={{ padding: '12px 16px', borderBottom: '1px solid #F1F5F9', verticalAlign: 'middle' }}>
                                            {item.lastOrderDate ? (
                                                <div>
                                                    <div style={{ fontWeight: 700, color: '#334155', fontSize: '0.8rem' }}>
                                                        {item.lastOrderDate}
                                                    </div>
                                                    {item.lastOrderTotal && item.lastOrderTotal > 0 && (
                                                        <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 500 }}>
                                                            {formatMoney(item.lastOrderTotal)}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <span style={{ color: '#94A3B8', fontSize: '0.74rem' }}>Sin historial reciente</span>
                                            )}
                                        </td>

                                        {/* 5. Estado Hoy */}
                                        <td style={{ padding: '12px 16px', borderBottom: '1px solid #F1F5F9', verticalAlign: 'middle' }}>
                                            {item.hasActiveOrder ? (
                                                <span style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    padding: '3px 10px',
                                                    borderRadius: '20px',
                                                    backgroundColor: '#DCFCE7',
                                                    color: '#15803D',
                                                    fontWeight: 800,
                                                    fontSize: '0.72rem',
                                                    border: '1px solid #86EFAC'
                                                }}>
                                                    <Check size={13} /> {item.existingOrderSeq || 'Ya Radicado'}
                                                </span>
                                            ) : isContacted ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                    <span style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '5px',
                                                        padding: '3px 10px',
                                                        borderRadius: '20px',
                                                        backgroundColor: '#E0F2FE',
                                                        color: '#0369A1',
                                                        fontWeight: 800,
                                                        fontSize: '0.72rem',
                                                        border: '1px solid #BAE6FD'
                                                    }}>
                                                        <CheckCheck size={12} /> Enviado ({item.contactedAt})
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeContacted(item.profile.id)}
                                                        style={{
                                                            background: 'none',
                                                            border: 'none',
                                                            color: '#94A3B8',
                                                            fontSize: '0.68rem',
                                                            cursor: 'pointer',
                                                            textAlign: 'left',
                                                            padding: '0 4px',
                                                            textDecoration: 'underline'
                                                        }}
                                                    >
                                                        Desmarcar
                                                    </button>
                                                </div>
                                            ) : (
                                                <span style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '5px',
                                                    padding: '3px 10px',
                                                    borderRadius: '20px',
                                                    backgroundColor: '#FEF3C7',
                                                    color: '#B45309',
                                                    fontWeight: 800,
                                                    fontSize: '0.72rem',
                                                    border: '1px solid #FCD34D'
                                                }}>
                                                    <Clock size={12} /> Sin Pedido (Pendiente)
                                                </span>
                                            )}
                                        </td>

                                        {/* 6. Acción WhatsApp */}
                                        <td style={{ padding: '12px 16px', borderBottom: '1px solid #F1F5F9', verticalAlign: 'middle', textAlign: 'right' }}>
                                            {item.hasActiveOrder ? (
                                                <span style={{ color: '#16A34A', fontSize: '0.75rem', fontWeight: 700 }}>
                                                    Orden en Proceso
                                                </span>
                                            ) : (
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                                                    {/* Botón WhatsApp */}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSendWhatsApp(item)}
                                                        title="Abrir WhatsApp Web con mensaje listo"
                                                        style={{
                                                            padding: '7px 12px',
                                                            backgroundColor: isContacted ? '#F1F5F9' : '#0D7A57',
                                                            color: isContacted ? '#475569' : '#FFFFFF',
                                                            border: isContacted ? '1px solid #CBD5E1' : 'none',
                                                            borderRadius: '9px',
                                                            fontWeight: 800,
                                                            fontSize: '0.74rem',
                                                            cursor: 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '6px',
                                                            boxShadow: isContacted ? 'none' : '0 2px 6px rgba(13, 122, 87, 0.25)',
                                                            transition: 'all 0.15s ease'
                                                        }}
                                                    >
                                                        <MessageCircle size={14} />
                                                        <span>{isContacted ? 'Reenviar' : 'Recordar'}</span>
                                                    </button>

                                                    {/* Botón Copiar al Portapapeles (1-Clic) */}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleCopyMessage(item)}
                                                        title="Copiar texto del recordatorio al portapapeles en 1 clic"
                                                        style={{
                                                            padding: '7px 10px',
                                                            backgroundColor: copiedId === item.profile.id ? '#DCFCE7' : '#F8FAFC',
                                                            color: copiedId === item.profile.id ? '#15803D' : '#475569',
                                                            border: copiedId === item.profile.id ? '1px solid #86EFAC' : '1px solid #CBD5E1',
                                                            borderRadius: '9px',
                                                            fontWeight: 700,
                                                            fontSize: '0.72rem',
                                                            cursor: 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '5px',
                                                            transition: 'all 0.15s ease'
                                                        }}
                                                    >
                                                        {copiedId === item.profile.id ? (
                                                            <>
                                                                <Check size={13} style={{ color: '#16A34A' }} />
                                                                <span>¡Copiado!</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Copy size={13} />
                                                                <span>Copiar</span>
                                                            </>
                                                        )}
                                                    </button>

                                                    {onNavigateToCreateOrder && (
                                                        <button
                                                            type="button"
                                                            onClick={() => onNavigateToCreateOrder(item.profile.id)}
                                                            title="Montar pedido manualmente para este cliente"
                                                            style={{
                                                                padding: '7px',
                                                                backgroundColor: '#F8FAFC',
                                                                border: '1px solid #CBD5E1',
                                                                borderRadius: '9px',
                                                                color: '#475569',
                                                                cursor: 'pointer',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center'
                                                            }}
                                                        >
                                                            <ShoppingCart size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </section>
    );
}
