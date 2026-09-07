'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { THEME, formatMoney, formatNumber } from '@/lib/adminTheme';
import {
    DollarSign,
    TrendingUp,
    TrendingDown,
    Package,
    Users,
    AlertTriangle,
    Search,
    RefreshCw,
    Calendar,
    ArrowUpRight,
    ArrowDownRight,
    Minus,
    CheckCircle2,
    ShieldAlert,
    Filter,
    BarChart2,
    PieChart as PieChartIcon,
    Layers,
    Award,
    AlertCircle,
    Building2,
    Home,
    Clock,
    Zap,
    ExternalLink,
    FileText,
    MapPin,
    ChevronRight,
    PhoneCall,
    Compass,
    ShieldCheck,
    Truck,
    Globe,
    LayoutGrid,
    Navigation
} from 'lucide-react';
import Link from 'next/link';
import { Map as GoogleMap, Marker, InfoWindow, useMap } from '@vis.gl/react-google-maps';

type TimeRange = 'today' | '7d' | '15d' | '30d' | 'this_month' | 'all';

// Known coordinates for localities in Bogotá and municipalities in Cundinamarca
const ZONE_COORDINATES: Record<string, { lat: number; lng: number }> = {
    'usaquén': { lat: 4.7016, lng: -74.0305 },
    'usaquen': { lat: 4.7016, lng: -74.0305 },
    'suba': { lat: 4.7483, lng: -74.0886 },
    'chapinero': { lat: 4.6542, lng: -74.0608 },
    'barrios unidos': { lat: 4.6680, lng: -74.0750 },
    'teusaquillo': { lat: 4.6404, lng: -74.0850 },
    'engativá': { lat: 4.7000, lng: -74.1150 },
    'engativa': { lat: 4.7000, lng: -74.1150 },
    'fontibón': { lat: 4.6750, lng: -74.1450 },
    'fontibon': { lat: 4.6750, lng: -74.1450 },
    'puente aranda': { lat: 4.6289, lng: -74.1135 },
    'kennedy': { lat: 4.6291, lng: -74.1535 },
    'bosa': { lat: 4.6050, lng: -74.1850 },
    'ciudad bolívar': { lat: 4.5450, lng: -74.1550 },
    'ciudad bolivar': { lat: 4.5450, lng: -74.1550 },
    'usme': { lat: 4.5300, lng: -74.1200 },
    'san cristóbal': { lat: 4.5650, lng: -74.0850 },
    'san cristobal': { lat: 4.5650, lng: -74.0850 },
    'santa fe': { lat: 4.6000, lng: -74.0720 },
    'la candelaria': { lat: 4.5960, lng: -74.0730 },
    'santa fe / la candelaria': { lat: 4.5980, lng: -74.0725 },
    'los mártires': { lat: 4.6080, lng: -74.0890 },
    'los martires': { lat: 4.6080, lng: -74.0890 },
    'antonio nariño': { lat: 4.5880, lng: -74.0980 },
    'antonio narino': { lat: 4.5880, lng: -74.0980 },
    'antonio nariño / san cristóbal': { lat: 4.5750, lng: -74.0900 },
    'tunjuelito': { lat: 4.5750, lng: -74.1350 },
    'rafael uribe uribe': { lat: 4.5700, lng: -74.1100 },
    'tunjuelito / rafael uribe': { lat: 4.5720, lng: -74.1220 },
    'chía': { lat: 4.8620, lng: -74.0550 },
    'chia': { lat: 4.8620, lng: -74.0550 },
    'cota': { lat: 4.8100, lng: -74.1000 },
    'chía / cota': { lat: 4.8360, lng: -74.0770 },
    'funza': { lat: 4.7170, lng: -74.2120 },
    'mosquera': { lat: 4.7060, lng: -74.2300 },
    'funza / mosquera': { lat: 4.7110, lng: -74.2210 },
    'soacha': { lat: 4.5800, lng: -74.2200 },
    'bogotá d.c. (otras zonas)': { lat: 4.6500, lng: -74.0800 }
};

const CORABASTOS_HUB = { lat: 4.6280, lng: -74.1534, name: 'Bodega Central FruFresco (Corabastos)' };

const NEIGHBORHOOD_TO_LOCALITY: Record<string, string> = {
    // Usaquén
    'cedritos': 'Usaquén', 'santa bárbara': 'Usaquén', 'santa barbara': 'Usaquén', 'unillanos': 'Usaquén',
    'san patricio': 'Usaquén', 'country': 'Usaquén', 'santa ana': 'Usaquén', 'pepe sierra': 'Usaquén',
    'toberín': 'Usaquén', 'toberin': 'Usaquén', 'la carolina': 'Usaquén', 'unicentro': 'Usaquén',

    // Chapinero
    'chicó': 'Chapinero', 'chico': 'Chapinero', 'rosales': 'Chapinero', 'zona g': 'Chapinero',
    'lourdes': 'Chapinero', 'antiguo country': 'Chapinero', 'el retiro': 'Chapinero', 'nogal': 'Chapinero',
    'porciúncula': 'Chapinero', 'quinta camacho': 'Chapinero',

    // Suba
    'pontevedra': 'Suba', 'floresta': 'Suba', 'niza': 'Suba', 'colina': 'Suba', 'alhambra': 'Suba',
    'paso ancho': 'Suba', 'san josé de bavaria': 'Suba', 'prado veraniego': 'Suba', 'mazurén': 'Suba',
    'gratamira': 'Suba',

    // Teusaquillo
    'salitre': 'Teusaquillo', 'galerías': 'Teusaquillo', 'galerias': 'Teusaquillo', 'palermo': 'Teusaquillo',
    'la soledad': 'Teusaquillo', 'santa sofía': 'Teusaquillo',

    // Kennedy
    'castilla': 'Kennedy', 'tintal': 'Kennedy', 'américas': 'Kennedy', 'americas': 'Kennedy', 'corabastos': 'Kennedy',
    'plaza de las américas': 'Kennedy', 'banderas': 'Kennedy', 'timiza': 'Kennedy',

    // Engativá
    'álamos': 'Engativá', 'alamos': 'Engativá', 'normandía': 'Engativá', 'normandia': 'Engativá',
    'villas de granada': 'Engativá', 'minuto de dios': 'Engativá', 'quirigua': 'Engativá',

    // Fontibón
    'modelia': 'Fontibón', 'hayuelos': 'Fontibón', 'zona franca': 'Fontibón', 'capellanía': 'Fontibón',

    // Puente Aranda
    'centenario': 'Puente Aranda', 'industrial': 'Puente Aranda', 'ciudad montes': 'Puente Aranda',

    // Barrios Unidos
    'polo': 'Barrios Unidos', 'alcázares': 'Barrios Unidos', 'alcazares': 'Barrios Unidos', 'rio negro': 'Barrios Unidos'
};

const getLocalityFromCoords = (lat: number | null | undefined, lng: number | null | undefined, profile?: any): string => {
    if (lat && lng && !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
        // Sabana Norte / Cundinamarca
        if (lat > 4.83) return 'Chía / Cota';
        if (lng < -74.19 && lat > 4.68) return 'Funza / Mosquera';
        if (lng < -74.18 && lat < 4.62) return 'Soacha';

        // Bogotá Norte
        if (lat >= 4.695) {
            return lng > -74.055 ? 'Usaquén' : 'Suba';
        }
        // Bogotá Nororiente / Chapinero
        if (lat >= 4.635 && lat < 4.695 && lng > -74.065) {
            return 'Chapinero';
        }
        // Bogotá Noroccidente / Centro-Occidente
        if (lat >= 4.65 && lat < 4.695) {
            if (lng > -74.09) return 'Barrios Unidos';
            if (lng > -74.13) return 'Engativá';
            return 'Fontibón';
        }
        // Bogotá Centro
        if (lat >= 4.615 && lat < 4.65) {
            if (lng > -74.09) return 'Teusaquillo';
            if (lng > -74.13) return 'Puente Aranda';
            return 'Fontibón';
        }
        if (lat >= 4.585 && lat < 4.615) {
            if (lng > -74.08) return 'Santa Fe / La Candelaria';
            if (lng > -74.11) return 'Los Mártires';
            if (lng > -74.14) return 'Puente Aranda';
            return 'Kennedy';
        }
        // Bogotá Sur
        if (lat >= 4.55 && lat < 4.585) {
            if (lng > -74.10) return 'Antonio Nariño / San Cristóbal';
            if (lng > -74.15) return 'Tunjuelito / Rafael Uribe';
            return 'Bosa';
        }
        if (lat < 4.55) {
            if (lng > -74.12) return 'Usme';
            return 'Ciudad Bolívar';
        }
    }

    // Fallback: Si no hay coordenadas GPS válidas, clasificar por barrio o texto
    if (profile) {
        const addr = (profile.address || '').toLowerCase();
        for (const [neigh, loc] of Object.entries(NEIGHBORHOOD_TO_LOCALITY)) {
            if (addr.includes(neigh)) return loc;
        }
        const localities = [
            'usaquén', 'chapinero', 'santa fe', 'san cristóbal', 'usme', 'tunjuelito',
            'bosa', 'kennedy', 'fontibón', 'engativá', 'suba', 'barrios unidos',
            'teusaquillo', 'los mártires', 'antonio nariño', 'puente aranda',
            'la candelaria', 'rafael uribe', 'ciudad bolívar', 'chía', 'cota',
            'mosquera', 'funza', 'soacha'
        ];
        for (const loc of localities) {
            if (addr.includes(loc)) {
                return loc.charAt(0).toUpperCase() + loc.slice(1);
            }
        }
        if (profile.municipality && profile.municipality.toLowerCase() !== 'bogotá') {
            return profile.municipality;
        }
        if (profile.city && profile.city.toLowerCase() !== 'bogotá') {
            return profile.city;
        }
    }

    return 'Bogotá D.C. (Otras Zonas)';
};

const getZoneCoord = (zoneName: string): { lat: number; lng: number } | null => {
    if (!zoneName) return null;
    const clean = zoneName.toLowerCase().trim();
    for (const [key, coord] of Object.entries(ZONE_COORDINATES)) {
        if (clean === key || clean.includes(key) || key.includes(clean)) return coord;
    }
    return { lat: 4.6500, lng: -74.0800 };
};

function MapFocusController({ target }: { target: { lat: number; lng: number } | null }) {
    const map = useMap();
    useEffect(() => {
        if (!map || !target) return;
        map.panTo(target);
        map.setZoom(12.5);
    }, [map, target]);
    return null;
}

// Compact money formatter for large figures ($9.87B, $35.9M, $45.000)
const formatCompactMoney = (num: number): string => {
    if (num === null || num === undefined || isNaN(num)) return '$0';
    const abs = Math.abs(num);
    const sign = num < 0 ? '-' : '';
    if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}B`;
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
    if (abs >= 1e4) return `${sign}$${Math.round(abs / 1e3)}K`;
    return formatMoney(num);
};

// Compact growth percentage formatter to prevent visual overflows
const formatGrowthPct = (pct: number): string => {
    if (pct === null || pct === undefined || isNaN(pct)) return '0%';
    const abs = Math.abs(pct);
    if (abs >= 10000) return '>999%';
    if (abs >= 1000) return `${(abs / 1000).toFixed(1)}K%`;
    return `${Math.abs(Math.round(pct * 10) / 10)}%`;
};

// Executive formatter for Hero Sales KPI ($9.871 Millones, $45.5 Millones, etc.)
const formatHeroSales = (num: number): { val: string; unit: string } => {
    if (!num || isNaN(num)) return { val: '$0', unit: '' };
    const abs = Math.abs(num);
    const sign = num < 0 ? '-' : '';
    if (abs >= 1e12) {
        return { val: `${sign}$${(abs / 1e9).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`, unit: 'Millones' };
    }
    if (abs >= 1e9) {
        return { val: `${sign}$${(abs / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`, unit: 'Millones' };
    }
    if (abs >= 1e6) {
        const val = abs / 1e6;
        return { val: `${sign}$${val.toLocaleString('es-CO', { maximumFractionDigits: val >= 100 ? 0 : 1 })}`, unit: 'Millones' };
    }
    if (abs >= 1e3) {
        return { val: `${sign}$${Math.round(abs / 1e3).toLocaleString('es-CO')}`, unit: 'Mil' };
    }
    return { val: `${sign}$${abs.toLocaleString('es-CO')}`, unit: 'COP' };
};

// Executive formatter for Hero Logistics Volume (163.814 Ton, 12.5 Ton, 450 Kg)
const formatHeroVolume = (numKg: number): { val: string; unit: string } => {
    if (!numKg || isNaN(numKg)) return { val: '0', unit: 'Kg' };
    const abs = Math.abs(numKg);
    if (abs >= 1000) {
        const tons = abs / 1000;
        return {
            val: tons.toLocaleString('es-CO', { maximumFractionDigits: tons >= 100 ? 0 : 1 }),
            unit: 'Ton'
        };
    }
    return {
        val: abs.toLocaleString('es-CO', { maximumFractionDigits: 1 }),
        unit: 'Kg'
    };
};

// Dynamic font-size scaler to guarantee single-line fit on KPI cards
const getAdaptiveFontSize = (text: string, baseSize = '1.75rem'): string => {
    if (!text) return baseSize;
    if (text.length > 17) return '1.25rem';
    if (text.length > 14) return '1.4rem';
    if (text.length > 11) return '1.55rem';
    return baseSize;
};

interface ClientConsumptionItem {
    id: string;
    name: string;
    nit?: string;
    role: string;
    type: 'Institucional' | 'Hogar';
    currentVolume: number;
    currentAmount: number;
    prevAmount: number;
    prevVolume: number;
    growthPct: number;
    orderCount: number;
    avgTicket: number;
}

interface ProductRotItem {
    id: string;
    name: string;
    sku: string;
    category: string;
    unit: string;
    quantity: number;
    revenue: number;
    cost: number;
    marginPct: number;
    sharePct: number;
}

interface CostTrendItem {
    id: string;
    name: string;
    sku: string;
    purchaseCost: number;
    matrixCost: number;
    variancePct: number;
    trend: 'up' | 'down' | 'equal';
}

interface CommercialAlertItem {
    id: string;
    type: 'quote_expiring' | 'quote_expired' | 'agreement_expiring' | 'lead_pending' | 'churn_risk';
    severity: 'critical' | 'warning' | 'info';
    title: string;
    subtitle: string;
    dateInfo: string;
    linkUrl: string;
    linkText: string;
    amount?: number;
}

interface GeoZoneItem {
    zone: string;
    clientCount: number;
    orderCount: number;
    salesAmount: number;
    volumeKg: number;
    percentage: number;
    orderSharePct: number;
    clientSharePct: number;
    salesSharePct: number;
}

export interface ClientMapPin {
    id: string;
    name: string;
    type: 'Institucional' | 'Hogar';
    address: string;
    zone: string;
    amount: number;
    volumeKg: number;
    orderCount: number;
    lat: number;
    lng: number;
}

interface FunnelMetrics {
    leadsCount: number;
    quotesCount: number;
    agreementsCount: number;
    activeBuyersCount: number;
    quotesAmount: number;
    agreementsAmount: number;
    buyersAmount: number;
    leadToQuotePct: number;
    quoteToAgreementPct: number;
    agreementToBuyerPct: number;
    globalConversionPct: number;
}

export default function CommercialUnifiedDashboard() {
    const [timeRange, setTimeRange] = useState<TimeRange>('30d');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchClient, setSearchClient] = useState('');
    const [clientSort, setClientSort] = useState<'amount' | 'volume' | 'growth' | 'risk'>('amount');

    // Scarcity state
    const [scarcityLockedMap, setScarcityLockedMap] = useState<Record<string, any>>({});

    // KPI Summary
    const [kpis, setKpis] = useState({
        totalSales: 0,
        b2bSales: 0,
        b2cSales: 0,
        prevTotalSales: 0,
        salesGrowthPct: 0,
        weightedMargin: 0,
        totalVolumeKg: 0,
        prevTotalVolumeKg: 0,
        volumeGrowthPct: 0,
        activeClientsCount: 0,
        totalClientsCount: 0,
        totalOrdersCount: 0,
        fulfillmentRate: 98.4
    });

    const [clientsData, setClientsData] = useState<ClientConsumptionItem[]>([]);
    const [topProducts, setTopProducts] = useState<ProductRotItem[]>([]);
    const [slowProducts, setSlowProducts] = useState<ProductRotItem[]>([]);
    const [costIncreases, setCostIncreases] = useState<CostTrendItem[]>([]);
    const [costDecreases, setCostDecreases] = useState<CostTrendItem[]>([]);

    // Sales Funnel state
    const [funnelData, setFunnelData] = useState<FunnelMetrics>({
        leadsCount: 0,
        quotesCount: 0,
        agreementsCount: 0,
        activeBuyersCount: 0,
        quotesAmount: 0,
        agreementsAmount: 0,
        buyersAmount: 0,
        leadToQuotePct: 0,
        quoteToAgreementPct: 0,
        agreementToBuyerPct: 0,
        globalConversionPct: 0
    });

    // Commercial Alerts state
    const [alertsList, setAlertsList] = useState<CommercialAlertItem[]>([]);
    const [alertFilter, setAlertFilter] = useState<'all' | 'critical' | 'quotes' | 'leads'>('all');

    // Geographic Zones & Client Pins state
    const [geoZones, setGeoZones] = useState<GeoZoneItem[]>([]);
    const [clientPins, setClientPins] = useState<ClientMapPin[]>([]);
    const [geoViewMode, setGeoViewMode] = useState<'map' | 'grid'>('map');
    const [selectedZone, setSelectedZone] = useState<GeoZoneItem | null>(null);
    const [selectedPin, setSelectedPin] = useState<ClientMapPin | null>(null);
    const [focusTarget, setFocusTarget] = useState<{ lat: number; lng: number } | null>(null);

    // Calculate dates based on timeRange
    const getDateRanges = useCallback((range: TimeRange) => {
        const now = new Date();
        let startDate: Date;
        let prevStartDate: Date;
        let prevEndDate: Date;

        switch (range) {
            case 'today':
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
                prevEndDate = new Date(startDate.getTime() - 1);
                prevStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
                break;
            case '7d':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                prevEndDate = new Date(startDate.getTime() - 1);
                prevStartDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
                break;
            case '15d':
                startDate = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
                prevEndDate = new Date(startDate.getTime() - 1);
                prevStartDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            case 'this_month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                prevEndDate = new Date(startDate.getTime() - 1);
                prevStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                break;
            case 'all':
                startDate = new Date(2020, 0, 1);
                prevStartDate = new Date(2019, 0, 1);
                prevEndDate = new Date(2019, 11, 31);
                break;
            case '30d':
            default:
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                prevEndDate = new Date(startDate.getTime() - 1);
                prevStartDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
                break;
        }

        return {
            startIso: startDate.toISOString(),
            prevStartIso: prevStartDate.toISOString(),
            prevEndIso: prevEndDate.toISOString()
        };
    }, []);

    const fetchAllData = useCallback(async () => {
        setLoading(true);
        try {
            const { startIso, prevStartIso, prevEndIso } = getDateRanges(timeRange);

            // 1. Fetch Profiles (con georreferenciación GPS real)
            const { data: profilesData } = await supabase
                .from('profiles')
                .select('id, role, company_name, contact_name, nit, phone, city, address, municipality, department, latitude, longitude');

            const profileMap = new Map<string, any>();
            (profilesData || []).forEach(p => profileMap.set(p.id, p));

            // 2. Fetch Active Products Catalog, Matrix Costs, Purchases, Leads & Quotes
            const [productsRes, matrixRes, appSettingsRes, purchasesRes, leadsRes, quotesRes] = await Promise.all([
                supabase
                    .from('products')
                    .select('id, name, sku, category, unit_of_measure, is_active, base_price')
                    .eq('is_active', true),
                supabase
                    .from('commercial_cost_matrix')
                    .select('product_id, manual_cost, is_active')
                    .eq('is_active', true),
                supabase
                    .from('app_settings')
                    .select('key, value')
                    .eq('key', 'scarcity_locked_skus')
                    .maybeSingle(),
                supabase
                    .from('purchases')
                    .select('product_id, unit_price, created_at')
                    .order('created_at', { ascending: false }),
                supabase
                    .from('leads')
                    .select('id, company_name, contact_name, phone, email, business_type, business_size, status, created_at, next_contact_date, last_contact_date, municipality, address'),
                supabase
                    .from('quotes')
                    .select('id, quote_number, client_id, lead_id, client_name, total_amount, subtotal_amount, status, valid_until, start_date, created_at')
                    .order('created_at', { ascending: false })
            ]);

            const leadsRaw = leadsRes.data || [];
            const quotesRaw = quotesRes.data || [];

            const productMap = new Map<string, any>();
            (productsRes.data || []).forEach(p => productMap.set(p.id, p));

            const matrixCostMap = new Map<string, number>();
            (matrixRes.data || []).forEach(m => matrixCostMap.set(m.product_id, Number(m.manual_cost || 0)));

            // Latest purchase fallback map
            const latestPurchaseMap = new Map<string, number>();
            (purchasesRes.data || []).forEach(pc => {
                if (!latestPurchaseMap.has(pc.product_id)) {
                    latestPurchaseMap.set(pc.product_id, Number(pc.unit_price || 0));
                }
            });

            // Parse Scarcity map
            let currentScarcityMap: Record<string, any> = {};
            if (appSettingsRes.data?.value) {
                try {
                    currentScarcityMap = typeof appSettingsRes.data.value === 'string' 
                        ? JSON.parse(appSettingsRes.data.value) 
                        : appSettingsRes.data.value;
                } catch (e) {
                    console.error('Error parsing scarcity_locked_skus:', e);
                }
            }
            setScarcityLockedMap(currentScarcityMap);

            // 3. Fetch Orders in current period and previous period (con coordenadas de despacho)
            const [currentOrdersRes, prevOrdersRes] = await Promise.all([
                supabase
                    .from('orders')
                    .select('id, profile_id, total, status, delivery_date, created_at, latitude, longitude')
                    .gte('created_at', startIso),
                supabase
                    .from('orders')
                    .select('id, profile_id, total, status, delivery_date, created_at, latitude, longitude')
                    .gte('created_at', prevStartIso)
                    .lte('created_at', prevEndIso)
            ]);

            const currentOrders = currentOrdersRes.data || [];
            const prevOrders = prevOrdersRes.data || [];

            // 4. Fetch Order Items for current orders and prev orders
            const currentOrderIds = currentOrders.map(o => o.id);
            const prevOrderIds = prevOrders.map(o => o.id);

            let currentItems: any[] = [];
            if (currentOrderIds.length > 0) {
                for (let i = 0; i < currentOrderIds.length; i += 80) {
                    const slice = currentOrderIds.slice(i, i + 80);
                    const { data: batchItems } = await supabase
                        .from('order_items')
                        .select('id, order_id, product_id, quantity, unit_price')
                        .in('order_id', slice);
                    if (batchItems) currentItems.push(...batchItems);
                }
            }

            let prevItems: any[] = [];
            if (prevOrderIds.length > 0) {
                for (let i = 0; i < prevOrderIds.length; i += 80) {
                    const slice = prevOrderIds.slice(i, i + 80);
                    const { data: batchItems } = await supabase
                        .from('order_items')
                        .select('id, order_id, product_id, quantity, unit_price')
                        .in('order_id', slice);
                    if (batchItems) prevItems.push(...batchItems);
                }
            }

            // Map order items by order_id
            const currentItemsByOrder = new Map<string, any[]>();
            currentItems.forEach(it => {
                if (!currentItemsByOrder.has(it.order_id)) currentItemsByOrder.set(it.order_id, []);
                currentItemsByOrder.get(it.order_id)!.push(it);
            });

            const prevItemsByOrder = new Map<string, any[]>();
            prevItems.forEach(it => {
                if (!prevItemsByOrder.has(it.order_id)) prevItemsByOrder.set(it.order_id, []);
                prevItemsByOrder.get(it.order_id)!.push(it);
            });

            // --- CALCULATE SALES & KPIS ---
            let totalSales = 0;
            let b2bSales = 0;
            let b2cSales = 0;
            const activeClientSet = new Set<string>();

            // Client aggregation map
            const clientAggMap = new Map<string, {
                volume: number;
                amount: number;
                orderCount: number;
            }>();

            currentOrders.forEach(o => {
                const prof = profileMap.get(o.profile_id);
                const isB2B = prof?.role === 'b2b_client' || (prof?.company_name && prof?.role !== 'b2c_client');
                const amt = Number(o.total || 0);

                totalSales += amt;
                if (isB2B) b2bSales += amt;
                else b2cSales += amt;

                if (o.profile_id) {
                    activeClientSet.add(o.profile_id);
                    if (!clientAggMap.has(o.profile_id)) {
                        clientAggMap.set(o.profile_id, { volume: 0, amount: 0, orderCount: 0 });
                    }
                    const cRecord = clientAggMap.get(o.profile_id)!;
                    cRecord.amount += amt;
                    cRecord.orderCount += 1;

                    const oItems = currentItemsByOrder.get(o.id) || [];
                    oItems.forEach(it => {
                        cRecord.volume += Number(it.quantity || 0);
                    });
                }
            });

            // Previous period sales & volume
            let prevTotalSales = 0;
            const prevClientAggMap = new Map<string, { volume: number; amount: number }>();
            prevOrders.forEach(o => {
                const amt = Number(o.total || 0);
                prevTotalSales += amt;

                if (o.profile_id) {
                    if (!prevClientAggMap.has(o.profile_id)) {
                        prevClientAggMap.set(o.profile_id, { volume: 0, amount: 0 });
                    }
                    const pRecord = prevClientAggMap.get(o.profile_id)!;
                    pRecord.amount += amt;

                    const oItems = prevItemsByOrder.get(o.id) || [];
                    oItems.forEach(it => {
                        pRecord.volume += Number(it.quantity || 0);
                    });
                }
            });

            // Sales growth %
            const salesGrowthPct = prevTotalSales > 0 
                ? Math.round(((totalSales - prevTotalSales) / prevTotalSales) * 1000) / 10 
                : 0;

            // Total volume in Kg/Units
            let totalVolumeKg = 0;
            currentItems.forEach(it => {
                totalVolumeKg += Number(it.quantity || 0);
            });

            let prevTotalVolumeKg = 0;
            prevItems.forEach(it => {
                prevTotalVolumeKg += Number(it.quantity || 0);
            });

            const volumeGrowthPct = prevTotalVolumeKg > 0
                ? Math.round(((totalVolumeKg - prevTotalVolumeKg) / prevTotalVolumeKg) * 1000) / 10
                : 0;

            // --- WEIGHTED GROSS MARGIN ON ACTUAL ITEMS ---
            let totalItemRevenue = 0;
            let totalItemCost = 0;

            currentItems.forEach(it => {
                const qty = Number(it.quantity || 0);
                if (qty <= 0) return;

                const price = Number(it.unit_price || 0);
                const cost = matrixCostMap.get(it.product_id) || latestPurchaseMap.get(it.product_id) || 0;

                if (price > 0 && cost > 0) {
                    totalItemRevenue += qty * price;
                    totalItemCost += qty * cost;
                }
            });

            const weightedMargin = totalItemRevenue > 0
                ? Math.round(((totalItemRevenue - totalItemCost) / totalItemRevenue) * 1000) / 10
                : 24.5;

            setKpis({
                totalSales,
                b2bSales,
                b2cSales,
                prevTotalSales,
                salesGrowthPct,
                weightedMargin,
                totalVolumeKg: Math.round(totalVolumeKg),
                prevTotalVolumeKg: Math.round(prevTotalVolumeKg),
                volumeGrowthPct,
                activeClientsCount: activeClientSet.size,
                totalClientsCount: profileMap.size,
                totalOrdersCount: currentOrders.length,
                fulfillmentRate: 98.4
            });

            // --- BUILD CLIENT CONSUMPTION LIST ---
            const clientList: ClientConsumptionItem[] = [];
            clientAggMap.forEach((val, cId) => {
                const prof = profileMap.get(cId);
                const prev = prevClientAggMap.get(cId) || { volume: 0, amount: 0 };
                const isB2B = prof?.role === 'b2b_client' || (prof?.company_name && prof?.role !== 'b2c_client');

                let growthPct = 0;
                if (prev.amount > 0) {
                    growthPct = Math.round(((val.amount - prev.amount) / prev.amount) * 1000) / 10;
                } else if (val.amount > 0) {
                    growthPct = 100;
                }

                clientList.push({
                    id: cId,
                    name: prof?.company_name || prof?.contact_name || 'Cliente sin nombre',
                    nit: prof?.nit,
                    role: prof?.role || 'b2b_client',
                    type: isB2B ? 'Institucional' : 'Hogar',
                    currentVolume: Math.round(val.volume * 10) / 10,
                    currentAmount: val.amount,
                    prevAmount: prev.amount,
                    prevVolume: Math.round(prev.volume * 10) / 10,
                    growthPct,
                    orderCount: val.orderCount,
                    avgTicket: val.orderCount > 0 ? Math.round(val.amount / val.orderCount) : val.amount
                });
            });

            setClientsData(clientList);

            // --- AGGREGATE PRODUCT ROTATION (TOP VS SLOW) ---
            const productAgg = new Map<string, { quantity: number; revenue: number; cost: number }>();
            currentItems.forEach(it => {
                const pId = it.product_id;
                if (!pId) return;

                if (!productAgg.has(pId)) {
                    productAgg.set(pId, { quantity: 0, revenue: 0, cost: 0 });
                }
                const record = productAgg.get(pId)!;
                const qty = Number(it.quantity || 0);
                const price = Number(it.unit_price || 0);
                const cost = matrixCostMap.get(pId) || latestPurchaseMap.get(pId) || 0;

                record.quantity += qty;
                record.revenue += qty * price;
                record.cost += qty * cost;
            });

            const rankedProducts: ProductRotItem[] = [];
            productAgg.forEach((val, pId) => {
                const prod = productMap.get(pId);
                const marginPct = val.revenue > 0 
                    ? Math.round(((val.revenue - val.cost) / val.revenue) * 1000) / 10
                    : 0;

                rankedProducts.push({
                    id: pId,
                    name: prod?.name || 'Producto sin nombre',
                    sku: prod?.sku || 'N/A',
                    category: prod?.category || 'General',
                    unit: prod?.unit_of_measure || 'Kg',
                    quantity: Math.round(val.quantity * 10) / 10,
                    revenue: Math.round(val.revenue),
                    cost: Math.round(val.cost),
                    marginPct,
                    sharePct: 0
                });
            });

            // Sort by quantity descending
            rankedProducts.sort((a, b) => b.quantity - a.quantity);
            const topQty = rankedProducts[0]?.quantity || 1;
            rankedProducts.forEach(p => {
                p.sharePct = Math.round((p.quantity / topQty) * 100);
            });

            setTopProducts(rankedProducts.slice(0, 10));

            // Slow movers: Active products with zero or minimal sales in this period
            const slowList: ProductRotItem[] = [];
            productsRes.data?.forEach(prod => {
                const agg = productAgg.get(prod.id);
                const qty = agg ? agg.quantity : 0;
                if (qty <= 5) {
                    slowList.push({
                        id: prod.id,
                        name: prod.name,
                        sku: prod.sku,
                        category: prod.category || 'General',
                        unit: prod.unit_of_measure || 'Kg',
                        quantity: qty,
                        revenue: agg ? agg.revenue : 0,
                        cost: 0,
                        marginPct: 0,
                        sharePct: 0
                    });
                }
            });
            slowList.sort((a, b) => a.quantity - b.quantity);
            setSlowProducts(slowList.slice(0, 10));

            // --- COST TRENDS (ALZAS / BAJAS VS MATRIZ) ---
            const upsList: CostTrendItem[] = [];
            const downsList: CostTrendItem[] = [];
            matrixCostMap.forEach((matCost, pId) => {
                const lastPurch = latestPurchaseMap.get(pId);
                const prod = productMap.get(pId);
                if (matCost > 0 && lastPurch && lastPurch > 0 && prod) {
                    const variancePct = Math.round(((lastPurch - matCost) / matCost) * 1000) / 10;
                    if (variancePct > 1) {
                        upsList.push({
                            id: pId,
                            name: prod.name,
                            sku: prod.sku,
                            purchaseCost: lastPurch,
                            matrixCost: matCost,
                            variancePct,
                            trend: 'up'
                        });
                    } else if (variancePct < -1) {
                        downsList.push({
                            id: pId,
                            name: prod.name,
                            sku: prod.sku,
                            purchaseCost: lastPurch,
                            matrixCost: matCost,
                            variancePct,
                            trend: 'down'
                        });
                    }
                }
            });
            upsList.sort((a, b) => b.variancePct - a.variancePct);
            downsList.sort((a, b) => a.variancePct - b.variancePct);
            setCostIncreases(upsList.slice(0, 6));
            setCostDecreases(downsList.slice(0, 6));

            // --- SALES FUNNEL (EMBUDO DE CONVERSIÓN COMERCIAL) ---
            const filteredLeads = timeRange === 'all'
                ? leadsRaw
                : leadsRaw.filter(l => l.created_at >= startIso);
            const leadsCount = filteredLeads.length > 0 ? filteredLeads.length : leadsRaw.length;

            const filteredQuotes = timeRange === 'all'
                ? quotesRaw
                : quotesRaw.filter(q => q.created_at >= startIso);
            const effectiveQuotes = filteredQuotes.length > 0 ? filteredQuotes : quotesRaw;

            const quotesSentCount = effectiveQuotes.filter(q => ['sent', 'agreement', 'approved', 'draft'].includes(q.status)).length;
            const quotesAmount = effectiveQuotes.reduce((sum, q) => sum + Number(q.total_amount || q.subtotal_amount || 0), 0);

            const agreementsList = effectiveQuotes.filter(q => q.status === 'agreement' || q.status === 'approved');
            const agreementsCount = agreementsList.length > 0 ? agreementsList.length : quotesRaw.filter(q => q.status === 'agreement').length;
            const agreementsAmount = agreementsList.reduce((sum, q) => sum + Number(q.total_amount || q.subtotal_amount || 0), 0);

            const activeBuyersCount = activeClientSet.size;
            const buyersAmount = totalSales;

            const leadToQuotePct = leadsCount > 0 ? Math.min(100, Math.round((quotesSentCount / leadsCount) * 100)) : 0;
            const quoteToAgreementPct = quotesSentCount > 0 ? Math.min(100, Math.round((agreementsCount / quotesSentCount) * 100)) : 0;
            const agreementToBuyerPct = agreementsCount > 0 ? Math.min(100, Math.round((activeBuyersCount / agreementsCount) * 100)) : 0;
            const globalConversionPct = leadsCount > 0 ? Math.min(100, Math.round((activeBuyersCount / leadsCount) * 100)) : 0;

            setFunnelData({
                leadsCount,
                quotesCount: quotesSentCount,
                agreementsCount,
                activeBuyersCount,
                quotesAmount,
                agreementsAmount,
                buyersAmount,
                leadToQuotePct,
                quoteToAgreementPct,
                agreementToBuyerPct,
                globalConversionPct
            });

            // --- COMMERCIAL ALERTS & EXPIRATIONS (CENTRO DE ALERTAS ACTIVAS) ---
            const generatedAlerts: CommercialAlertItem[] = [];
            const today = new Date();

            quotesRaw.forEach(q => {
                if (!q.valid_until) return;
                const vDate = new Date(q.valid_until + 'T23:59:59');
                const diffDays = Math.ceil((vDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

                if (q.status === 'sent' || q.status === 'draft') {
                    if (diffDays < 0) {
                        generatedAlerts.push({
                            id: `quote-exp-${q.id}`,
                            type: 'quote_expired',
                            severity: 'critical',
                            title: `Cotización #${q.quote_number} Vencida`,
                            subtitle: q.client_name || 'Cliente sin nombre',
                            dateInfo: `Venció hace ${Math.abs(diffDays)}d (${q.valid_until})`,
                            linkUrl: `/admin/commercial/quotes/${q.id}`,
                            linkText: 'Ver Cotización',
                            amount: Number(q.total_amount || 0)
                        });
                    } else if (diffDays <= 3) {
                        generatedAlerts.push({
                            id: `quote-expiring-${q.id}`,
                            type: 'quote_expiring',
                            severity: 'warning',
                            title: `Cotización #${q.quote_number} por Vencer`,
                            subtitle: q.client_name || 'Cliente sin nombre',
                            dateInfo: diffDays === 0 ? 'Vence hoy' : `Vence en ${diffDays} día(s)`,
                            linkUrl: `/admin/commercial/quotes/${q.id}`,
                            linkText: 'Ver Cotización',
                            amount: Number(q.total_amount || 0)
                        });
                    }
                } else if (q.status === 'agreement') {
                    if (diffDays <= 0) {
                        generatedAlerts.push({
                            id: `agree-exp-${q.id}`,
                            type: 'agreement_expiring',
                            severity: 'critical',
                            title: `Acuerdo #${q.quote_number} Vencido`,
                            subtitle: q.client_name || 'Cliente sin nombre',
                            dateInfo: `Expiró el ${q.valid_until}`,
                            linkUrl: `/admin/commercial/quotes/${q.id}`,
                            linkText: 'Re-negociar',
                            amount: Number(q.total_amount || 0)
                        });
                    } else if (diffDays <= 30) {
                        generatedAlerts.push({
                            id: `agree-expiring-${q.id}`,
                            type: 'agreement_expiring',
                            severity: diffDays <= 7 ? 'critical' : 'warning',
                            title: `Acuerdo #${q.quote_number} por Expirar`,
                            subtitle: q.client_name || 'Cliente sin nombre',
                            dateInfo: `Vence en ${diffDays} días (${q.valid_until})`,
                            linkUrl: `/admin/commercial/quotes/${q.id}`,
                            linkText: 'Re-negociar',
                            amount: Number(q.total_amount || 0)
                        });
                    }
                }
            });

            leadsRaw.forEach(l => {
                if (l.status === 'new') {
                    const cDate = new Date(l.created_at);
                    const daysSinceCreated = Math.floor((today.getTime() - cDate.getTime()) / (1000 * 60 * 60 * 24));
                    if (daysSinceCreated >= 3) {
                        generatedAlerts.push({
                            id: `lead-new-${l.id}`,
                            type: 'lead_pending',
                            severity: daysSinceCreated >= 7 ? 'critical' : 'warning',
                            title: `Prospecto sin Contacto (${daysSinceCreated}d)`,
                            subtitle: l.company_name || l.contact_name || 'Prospecto sin nombre',
                            dateInfo: `Registrado el ${cDate.toLocaleDateString('es-CO')}`,
                            linkUrl: `/admin/commercial?tab=clients`,
                            linkText: 'Contactar'
                        });
                    }
                } else if (l.next_contact_date) {
                    const nextDate = new Date(l.next_contact_date + 'T23:59:59');
                    const diffDays = Math.ceil((nextDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    if (diffDays <= 1) {
                        generatedAlerts.push({
                            id: `lead-contact-${l.id}`,
                            type: 'lead_pending',
                            severity: diffDays < 0 ? 'critical' : 'warning',
                            title: diffDays < 0 ? 'Contacto Agendado Vencido' : 'Contacto Agendado Hoy',
                            subtitle: l.company_name || l.contact_name || 'Prospecto',
                            dateInfo: `Fecha: ${l.next_contact_date}`,
                            linkUrl: `/admin/commercial?tab=clients`,
                            linkText: 'Contactar'
                        });
                    }
                }
            });

            clientList.forEach(c => {
                if (c.growthPct <= -25 && c.prevAmount > 100000) {
                    generatedAlerts.push({
                        id: `churn-${c.id}`,
                        type: 'churn_risk',
                        severity: c.growthPct <= -50 ? 'critical' : 'warning',
                        title: `Riesgo de Fuga (${c.growthPct}%)`,
                        subtitle: c.name,
                        dateInfo: `Caída de ${formatMoney(c.prevAmount)} a ${formatMoney(c.currentAmount)}`,
                        linkUrl: `/admin/commercial?tab=clients`,
                        linkText: 'Ver Historial',
                        amount: c.currentAmount
                    });
                }
            });

            const severityWeight = { critical: 0, warning: 1, info: 2 };
            generatedAlerts.sort((a, b) => severityWeight[a.severity] - severityWeight[b.severity]);
            setAlertsList(generatedAlerts);

            // --- GEOGRAPHIC CLIENT DISTRIBUTION & GPS MAPPING ---
            const zoneMap = new Map<string, {
                clientSet: Set<string>;
                orderCount: number;
                salesAmount: number;
                volumeKg: number;
            }>();

            const clientPinMap = new Map<string, ClientMapPin>();

            currentOrders.forEach(o => {
                const prof = profileMap.get(o.profile_id);
                const isB2B = prof?.role === 'b2b_client' || (prof?.company_name && prof?.role !== 'b2c_client');
                const amt = Number(o.total || 0);

                // Priority: order GPS -> profile GPS
                const lat = Number(o.latitude || prof?.latitude || 0);
                const lng = Number(o.longitude || prof?.longitude || 0);
                const hasValidGps = lat !== 0 && lng !== 0 && !isNaN(lat) && !isNaN(lng);

                const zName = getLocalityFromCoords(lat, lng, prof);

                if (!zoneMap.has(zName)) {
                    zoneMap.set(zName, { clientSet: new Set(), orderCount: 0, salesAmount: 0, volumeKg: 0 });
                }
                const rec = zoneMap.get(zName)!;
                rec.orderCount += 1;
                rec.salesAmount += amt;
                if (o.profile_id) rec.clientSet.add(o.profile_id);

                let orderVol = 0;
                const oItems = currentItemsByOrder.get(o.id) || [];
                oItems.forEach(it => {
                    const q = Number(it.quantity || 0);
                    rec.volumeKg += q;
                    orderVol += q;
                });

                // Client Map Pin aggregation
                if (o.profile_id && hasValidGps) {
                    if (!clientPinMap.has(o.profile_id)) {
                        clientPinMap.set(o.profile_id, {
                            id: o.profile_id,
                            name: prof?.company_name || prof?.contact_name || 'Cliente sin nombre',
                            type: isB2B ? 'Institucional' : 'Hogar',
                            address: prof?.address || 'Dirección no registrada',
                            zone: zName,
                            amount: 0,
                            volumeKg: 0,
                            orderCount: 0,
                            lat,
                            lng
                        });
                    }
                    const pin = clientPinMap.get(o.profile_id)!;
                    pin.amount += amt;
                    pin.volumeKg += orderVol;
                    pin.orderCount += 1;
                }
            });

            const calculatedZones: GeoZoneItem[] = [];
            const totalPeriodOrders = currentOrders.length || 1;
            const totalPeriodClients = activeClientSet.size || 1;
            const totalPeriodSales = totalSales || 1;

            zoneMap.forEach((val, zName) => {
                const orderSharePct = totalPeriodOrders > 0
                    ? Math.round((val.orderCount / totalPeriodOrders) * 1000) / 10
                    : 0;
                const clientSharePct = totalPeriodClients > 0
                    ? Math.round((val.clientSet.size / totalPeriodClients) * 1000) / 10
                    : 0;
                const salesSharePct = totalPeriodSales > 0
                    ? Math.round((val.salesAmount / totalPeriodSales) * 1000) / 10
                    : 0;

                calculatedZones.push({
                    zone: zName,
                    clientCount: val.clientSet.size,
                    orderCount: val.orderCount,
                    salesAmount: Math.round(val.salesAmount),
                    volumeKg: Math.round(val.volumeKg),
                    percentage: orderSharePct,
                    orderSharePct,
                    clientSharePct,
                    salesSharePct
                });
            });

            if (calculatedZones.length === 0) {
                const profZoneMap = new Map<string, number>();
                profileMap.forEach(p => {
                    const lat = Number(p.latitude || 0);
                    const lng = Number(p.longitude || 0);
                    const z = getLocalityFromCoords(lat, lng, p);
                    profZoneMap.set(z, (profZoneMap.get(z) || 0) + 1);
                });
                const totalProf = profileMap.size || 1;
                profZoneMap.forEach((count, zName) => {
                    const clientSharePct = Math.round((count / totalProf) * 1000) / 10;
                    calculatedZones.push({
                        zone: zName,
                        clientCount: count,
                        orderCount: 0,
                        salesAmount: 0,
                        volumeKg: 0,
                        percentage: clientSharePct,
                        orderSharePct: clientSharePct,
                        clientSharePct,
                        salesSharePct: 0
                    });
                });
                calculatedZones.sort((a, b) => b.clientCount - a.clientCount);
            } else {
                // Sort by logistics frequency (orderCount) descending, then by sales
                calculatedZones.sort((a, b) => b.orderCount !== a.orderCount ? b.orderCount - a.orderCount : b.salesAmount - a.salesAmount);
            }

            setGeoZones(calculatedZones);
            setClientPins(Array.from(clientPinMap.values()));

        } catch (err) {
            console.error('Error in CommercialUnifiedDashboard fetchAllData:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [timeRange, getDateRanges]);

    useEffect(() => {
        fetchAllData();
    }, [fetchAllData]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchAllData();
    };

    // Filter & Sort Clients
    const filteredClients = useMemo(() => {
        let list = [...clientsData];
        if (searchClient.trim()) {
            const q = searchClient.toLowerCase().trim();
            list = list.filter(c => 
                c.name.toLowerCase().includes(q) || 
                (c.nit && c.nit.toLowerCase().includes(q))
            );
        }

        switch (clientSort) {
            case 'volume':
                list.sort((a, b) => b.currentVolume - a.currentVolume);
                break;
            case 'growth':
                list.sort((a, b) => b.growthPct - a.growthPct);
                break;
            case 'risk':
                list.sort((a, b) => a.growthPct - b.growthPct);
                break;
            case 'amount':
            default:
                list.sort((a, b) => b.currentAmount - a.currentAmount);
                break;
        }

        return list;
    }, [clientsData, searchClient, clientSort]);

    // Filter Commercial Alerts
    const filteredAlerts = useMemo(() => {
        if (alertFilter === 'critical') return alertsList.filter(a => a.severity === 'critical');
        if (alertFilter === 'quotes') return alertsList.filter(a => a.type.startsWith('quote') || a.type.startsWith('agreement'));
        if (alertFilter === 'leads') return alertsList.filter(a => a.type.startsWith('lead') || a.type === 'churn_risk');
        return alertsList;
    }, [alertsList, alertFilter]);

    // Critical alerts count for badge
    const criticalAlertsCount = useMemo(() => {
        return alertsList.filter(a => a.severity === 'critical').length;
    }, [alertsList]);

    return (
        <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '1.5rem 2rem 3rem 2rem', display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
            
            {/* 1. HEADER & TIME RANGE SELECTOR */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', backgroundColor: 'white', padding: '1.25rem 1.5rem', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm }}>
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: '900', color: THEME.colors.textMain, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <BarChart2 size={24} color={THEME.colors.primary} /> Cockpit Comercial & Telemetría BI
                    </h1>
                    <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: THEME.colors.textSecondary, fontWeight: '500' }}>
                        Monitoreo en tiempo real de facturación, consumo de clientes, rotación y rentabilidad.
                    </p>
                </div>

                {/* Time range pills */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', backgroundColor: '#F1F5F9', padding: '3px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                        {(
                            [
                                { id: 'today', label: 'Hoy' },
                                { id: '7d', label: '7 Días' },
                                { id: '15d', label: '15 Días' },
                                { id: '30d', label: '30 Días' },
                                { id: 'this_month', label: 'Mes Actual' },
                                { id: 'all', label: 'Histórico' }
                            ] as const
                        ).map(t => {
                            const isSelected = timeRange === t.id;
                            return (
                                <button
                                    key={t.id}
                                    onClick={() => setTimeRange(t.id)}
                                    style={{
                                        padding: '0.35rem 0.85rem',
                                        fontSize: '0.78rem',
                                        fontWeight: isSelected ? '800' : '600',
                                        color: isSelected ? 'white' : THEME.colors.textSecondary,
                                        backgroundColor: isSelected ? THEME.colors.primary : 'transparent',
                                        border: 'none',
                                        borderRadius: '7px',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s',
                                        boxShadow: isSelected ? '0 2px 4px rgba(13,122,87,0.2)' : 'none'
                                    }}
                                >
                                    {t.label}
                                </button>
                            );
                        })}
                    </div>

                    <button
                        onClick={handleRefresh}
                        disabled={loading || refreshing}
                        title="Actualizar métricas"
                        style={{
                            padding: '0.45rem',
                            borderRadius: '8px',
                            backgroundColor: '#F8FAFC',
                            border: `1px solid ${THEME.colors.border}`,
                            color: THEME.colors.textSecondary,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* 2. HERO KPI CARDS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
                
                {/* CARD 1: VENTAS TOTALES */}
                <div style={{ backgroundColor: 'white', padding: '1.15rem 1.25rem', minHeight: '148px', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1, minWidth: 0, paddingRight: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Ventas Facturadas
                                </span>
                                <span title={`${kpis.salesGrowthPct}% vs periodo anterior`} style={{ fontWeight: '800', color: kpis.salesGrowthPct >= 0 ? '#15803D' : '#DC2626', backgroundColor: kpis.salesGrowthPct >= 0 ? '#DCFCE7' : '#FEE2E2', padding: '1px 6px', borderRadius: '8px', fontSize: '0.67rem', display: 'inline-flex', alignItems: 'center', gap: '2px', whiteSpace: 'nowrap' }}>
                                    {kpis.salesGrowthPct >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                                    {formatGrowthPct(kpis.salesGrowthPct)}
                                </span>
                            </div>
                            <div
                                title={`${formatMoney(kpis.totalSales)} COP exactos`}
                                style={{
                                    display: 'flex',
                                    alignItems: 'baseline',
                                    gap: '6px',
                                    margin: '0.35rem 0 0 0',
                                    whiteSpace: 'nowrap',
                                    lineHeight: 1.2
                                }}
                            >
                                <span style={{ fontSize: '1.75rem', fontWeight: '900', color: THEME.colors.textMain, letterSpacing: '-0.02em' }}>
                                    {loading ? '...' : formatHeroSales(kpis.totalSales).val}
                                </span>
                                <span style={{ fontSize: '0.88rem', fontWeight: '800', color: '#64748B' }}>
                                    {formatHeroSales(kpis.totalSales).unit}
                                </span>
                            </div>
                        </div>
                        <div style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <DollarSign size={20} color="#059669" />
                        </div>
                    </div>
                    
                    {/* FOOTER: DEDICADO 100% A INSTITUCIONAL Y HOGAR DE EXTREMO A EXTREMO */}
                    <div style={{ marginTop: '0.75rem', paddingTop: '0.65rem', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem' }}>
                        <span title={`Institucional Total: ${formatMoney(kpis.b2bSales)}`} style={{ color: '#0369A1', fontWeight: '700', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Building2 size={12} /> Institucional: <strong>{formatCompactMoney(kpis.b2bSales)}</strong>
                        </span>
                        <span title={`Hogar Total: ${formatMoney(kpis.b2cSales)}`} style={{ color: '#475569', fontWeight: '600', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Home size={12} /> Hogar: <strong>{formatCompactMoney(kpis.b2cSales)}</strong>
                        </span>
                    </div>
                </div>

                {/* CARD 2: MARGEN BRUTO PONDERADO */}
                <div style={{ backgroundColor: 'white', padding: '1.15rem 1.25rem', minHeight: '148px', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <span style={{ fontSize: '0.72rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Margen Bruto Ponderado
                            </span>
                            <div style={{ fontSize: '1.75rem', fontWeight: '900', color: kpis.weightedMargin >= 20 ? THEME.colors.primary : '#D97706', margin: '0.35rem 0 0 0', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                                {loading ? '...' : `${kpis.weightedMargin}%`}
                            </div>
                        </div>
                        <div style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <TrendingUp size={20} color={THEME.colors.primary} />
                        </div>
                    </div>
                    
                    <div style={{ marginTop: '0.75rem', paddingTop: '0.65rem', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem' }}>
                        <span style={{ color: THEME.colors.textSecondary, fontWeight: '600' }}>
                            Sobre Precio Venta Real
                        </span>
                        <span style={{ backgroundColor: '#DCFCE7', color: '#15803D', fontWeight: '800', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem' }}>
                            Meta: &gt;20%
                        </span>
                    </div>
                </div>

                {/* CARD 3: VOLUMEN FÍSICO ENTREGADO */}
                <div style={{ backgroundColor: 'white', padding: '1.15rem 1.25rem', minHeight: '148px', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1, minWidth: 0, paddingRight: '8px' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Volumen Movilizado
                            </span>
                            <div
                                title={`${formatNumber(kpis.totalVolumeKg, 1)} Kg exactos`}
                                style={{
                                    display: 'flex',
                                    alignItems: 'baseline',
                                    gap: '6px',
                                    margin: '0.35rem 0 0 0',
                                    whiteSpace: 'nowrap',
                                    lineHeight: 1.2
                                }}
                            >
                                <span style={{ fontSize: '1.75rem', fontWeight: '900', color: THEME.colors.textMain, letterSpacing: '-0.02em' }}>
                                    {loading ? '...' : formatHeroVolume(kpis.totalVolumeKg).val}
                                </span>
                                <span style={{ fontSize: '0.88rem', fontWeight: '800', color: '#64748B' }}>
                                    {formatHeroVolume(kpis.totalVolumeKg).unit}
                                </span>
                            </div>
                        </div>
                        <div style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Package size={20} color="#2563EB" />
                        </div>
                    </div>
                    
                    <div style={{ marginTop: '0.75rem', paddingTop: '0.65rem', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem' }}>
                        <span style={{ color: THEME.colors.textSecondary, fontWeight: '600' }}>
                            {kpis.totalOrdersCount} pedidos cerrados
                        </span>
                        <span title={`${kpis.volumeGrowthPct}% vs periodo anterior`} style={{ fontWeight: '800', color: kpis.volumeGrowthPct >= 0 ? '#10B981' : '#EF4444', display: 'inline-flex', alignItems: 'center', gap: '2px', whiteSpace: 'nowrap' }}>
                            {kpis.volumeGrowthPct >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                            {formatGrowthPct(kpis.volumeGrowthPct)}
                        </span>
                    </div>
                </div>

                {/* CARD 4: CLIENTES ACTIVOS VS BASE */}
                <div style={{ backgroundColor: 'white', padding: '1.15rem 1.25rem', minHeight: '148px', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1, minWidth: 0, paddingRight: '8px' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Clientes Activos
                            </span>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', margin: '0.35rem 0 0 0', flexWrap: 'nowrap' }}>
                                <span style={{ fontSize: '1.75rem', fontWeight: '900', color: THEME.colors.textMain, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                                    {loading ? '...' : kpis.activeClientsCount}
                                </span>
                                <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#64748B', whiteSpace: 'nowrap' }}>
                                    compradores
                                </span>
                            </div>
                        </div>
                        <div style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: '#F5F3FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Users size={20} color="#7C3AED" />
                        </div>
                    </div>
                    
                    <div style={{ marginTop: '0.75rem', paddingTop: '0.65rem', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem' }}>
                        <span style={{ color: THEME.colors.textSecondary, fontWeight: '600' }}>
                            De {kpis.totalClientsCount} clientes registrados
                        </span>
                        <span style={{ color: '#7C3AED', fontWeight: '800' }}>
                            {kpis.totalClientsCount > 0 ? Math.round((kpis.activeClientsCount / kpis.totalClientsCount) * 100) : 0}% Penetración
                        </span>
                    </div>
                </div>

                {/* CARD 5: CONTROL DE ESCASEZ POKA-YOKE */}
                <div style={{ backgroundColor: Object.keys(scarcityLockedMap).length > 0 ? '#FEF2F2' : '#F0FDFA', padding: '1.15rem 1.25rem', minHeight: '148px', borderRadius: THEME.radius.lg, border: `1px solid ${Object.keys(scarcityLockedMap).length > 0 ? '#FCA5A5' : '#99F6E4'}`, boxShadow: THEME.shadow.sm, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1, minWidth: 0, paddingRight: '8px' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: '900', color: Object.keys(scarcityLockedMap).length > 0 ? '#B91C1C' : '#0D7A57', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Quiebre de Abastos (Escasez)
                            </span>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', margin: '0.35rem 0 0 0', flexWrap: 'nowrap' }}>
                                <span style={{ fontSize: '1.75rem', fontWeight: '900', color: Object.keys(scarcityLockedMap).length > 0 ? '#991B1B' : '#065F46', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                                    {loading ? '...' : Object.keys(scarcityLockedMap).length}
                                </span>
                                <span style={{ fontSize: '0.85rem', fontWeight: '800', color: Object.keys(scarcityLockedMap).length > 0 ? '#B91C1C' : '#0D7A57', whiteSpace: 'nowrap' }}>
                                    SKUs
                                </span>
                            </div>
                        </div>
                        <div style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: Object.keys(scarcityLockedMap).length > 0 ? '#FEE2E2' : '#CCFBF1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <ShieldAlert size={20} color={Object.keys(scarcityLockedMap).length > 0 ? '#DC2626' : '#0D7A57'} />
                        </div>
                    </div>
                    
                    <div style={{ marginTop: '0.75rem', paddingTop: '0.65rem', borderTop: `1px solid ${Object.keys(scarcityLockedMap).length > 0 ? '#FEE2E2' : '#E6FFFA'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem' }}>
                        <span style={{ color: Object.keys(scarcityLockedMap).length > 0 ? '#B91C1C' : '#065F46', fontWeight: '700' }}>
                            {Object.keys(scarcityLockedMap).length > 0 ? 'Bloqueo Activo en Mercado' : 'Abastecimiento Normal'}
                        </span>
                        <Link href="/admin/commercial?tab=clients" style={{ textDecoration: 'none', color: THEME.colors.primary, fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            Gestionar <ExternalLink size={12} />
                        </Link>
                    </div>
                </div>

            </div>

            {/* 2.5 EMBUDO DE CONVERSIÓN COMERCIAL & CENTRO DE ALERTAS ACTIVAS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(520px, 1fr))', gap: '1.25rem', alignItems: 'stretch' }}>
                
                {/* CARD 1: EMBUDO DE CONVERSIÓN COMERCIAL (SALES FUNNEL) */}
                <div style={{ backgroundColor: 'white', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm, padding: '1.4rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.15rem' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Compass size={20} color={THEME.colors.primary} /> Embudo de Conversión Comercial (Sales Funnel)
                                </h2>
                                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.78rem', color: THEME.colors.textSecondary }}>
                                    Ciclo de vida Institucional: Prospectos ➔ Cotizaciones ➔ Acuerdos ➔ Compras Facturadas.
                                </p>
                            </div>
                            <span style={{ fontSize: '0.72rem', fontWeight: '800', backgroundColor: '#ECFDF5', color: '#059669', padding: '4px 10px', borderRadius: '12px', border: '1px solid #A7F3D0', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <ShieldCheck size={13} /> Conversión Global: {funnelData.globalConversionPct}%
                            </span>
                        </div>

                        {/* Funnel Cascading Steps (Geometría Real de Embudo Progresivo) */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                            
                            {/* STEP 1: PROSPECTOS (LEADS) - BOCA ANCHA 100% */}
                            <div style={{ width: '100%', backgroundColor: '#F8FAFC', borderRadius: '10px', borderTop: '3px solid #2563EB', borderRight: '1px solid #BFDBFE', borderBottom: '1px solid #BFDBFE', borderLeft: '1px solid #BFDBFE', padding: '0.75rem 1rem', boxShadow: '0 2px 5px rgba(37, 99, 235, 0.05)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #DBEAFE' }}>
                                            <Users size={16} color="#2563EB" />
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: '800', fontSize: '0.84rem', color: THEME.colors.textMain }}>
                                                1. Prospectos Calificados (Leads)
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary }}>
                                                Base en prospección y cualificación activa
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontWeight: '900', fontSize: '1.05rem', color: '#1E40AF' }}>
                                            {loading ? '...' : `${funnelData.leadsCount} Leads`}
                                        </div>
                                        <Link href="/admin/commercial?tab=clients" style={{ fontSize: '0.7rem', color: THEME.colors.primary, fontWeight: '700', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '2px', marginTop: '2px' }}>
                                            Ver Base <ExternalLink size={10} />
                                        </Link>
                                    </div>
                                </div>
                            </div>

                            {/* CONNECTOR 1 -> 2 (Funnel Slope) */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', margin: '-2px 0' }}>
                                <div style={{ width: '45px', height: '1.5px', background: 'linear-gradient(to right, transparent, #CBD5E1)' }} />
                                <span style={{ fontSize: '0.67rem', fontWeight: '800', color: '#1E40AF', backgroundColor: '#EFF6FF', padding: '2px 9px', borderRadius: '10px', border: '1px solid #DBEAFE', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                    <ChevronRight size={11} /> Avance a Cotiz: {funnelData.leadToQuotePct}%
                                </span>
                                {funnelData.leadToQuotePct < 100 && (
                                    <span style={{ fontSize: '0.65rem', fontWeight: '700', color: '#64748B' }}>
                                        (Fuga: {Math.max(0, 100 - funnelData.leadToQuotePct)}%)
                                    </span>
                                )}
                                <div style={{ width: '45px', height: '1.5px', background: 'linear-gradient(to left, transparent, #CBD5E1)' }} />
                            </div>

                            {/* STEP 2: COTIZACIONES - ANCHO 86% CENTRADO */}
                            <div style={{ width: '86%', margin: '0 auto', backgroundColor: '#FAF5FF', borderRadius: '10px', borderTop: '3px solid #7E22CE', borderRight: '1px solid #E9D5FF', borderBottom: '1px solid #E9D5FF', borderLeft: '1px solid #E9D5FF', padding: '0.7rem 0.95rem', boxShadow: '0 2px 6px rgba(126, 34, 206, 0.05)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ width: '30px', height: '30px', borderRadius: '8px', backgroundColor: '#F3E8FF', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #D8B4FE' }}>
                                            <FileText size={15} color="#7E22CE" />
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: '800', fontSize: '0.82rem', color: THEME.colors.textMain }}>
                                                2. Cotizaciones Presentadas
                                            </div>
                                            <div style={{ fontSize: '0.68rem', color: THEME.colors.textSecondary }}>
                                                Propuestas con matriz y precios base
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontWeight: '900', fontSize: '1rem', color: '#6B21A8' }}>
                                            {loading ? '...' : `${funnelData.quotesCount} Cotiz.`}
                                        </div>
                                        <div title={formatMoney(funnelData.quotesAmount)} style={{ fontSize: '0.72rem', fontWeight: '700', color: '#7E22CE', marginTop: '1px' }}>
                                            {formatCompactMoney(funnelData.quotesAmount)}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* CONNECTOR 2 -> 3 (Funnel Slope) */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', margin: '-2px 0' }}>
                                <div style={{ width: '35px', height: '1.5px', background: 'linear-gradient(to right, transparent, #CBD5E1)' }} />
                                <span style={{ fontSize: '0.67rem', fontWeight: '800', color: '#6B21A8', backgroundColor: '#F3E8FF', padding: '2px 9px', borderRadius: '10px', border: '1px solid #E9D5FF', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                    <ChevronRight size={11} /> Cierre a Acuerdos: {funnelData.quoteToAgreementPct}%
                                </span>
                                {funnelData.quoteToAgreementPct < 100 && (
                                    <span style={{ fontSize: '0.65rem', fontWeight: '700', color: '#DC2626', backgroundColor: '#FEE2E2', padding: '1px 6px', borderRadius: '6px' }}>
                                        Fuga: -{Math.max(0, 100 - funnelData.quoteToAgreementPct)}%
                                    </span>
                                )}
                                <div style={{ width: '35px', height: '1.5px', background: 'linear-gradient(to left, transparent, #CBD5E1)' }} />
                            </div>

                            {/* STEP 3: ACUERDOS COMERCIALES - ANCHO 72% CENTRADO */}
                            <div style={{ width: '72%', margin: '0 auto', backgroundColor: '#FFFBEB', borderRadius: '10px', borderTop: '3px solid #D97706', borderRight: '1px solid #FDE68A', borderBottom: '1px solid #FDE68A', borderLeft: '1px solid #FDE68A', padding: '0.7rem 0.9rem', boxShadow: '0 2px 6px rgba(217, 119, 6, 0.05)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ width: '30px', height: '30px', borderRadius: '8px', backgroundColor: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #FCD34D' }}>
                                            <Award size={15} color="#B45309" />
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: '800', fontSize: '0.82rem', color: THEME.colors.textMain }}>
                                                3. Acuerdos Vigentes
                                            </div>
                                            <div style={{ fontSize: '0.68rem', color: THEME.colors.textSecondary }}>
                                                Precios preferenciales vigentes
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontWeight: '900', fontSize: '1rem', color: '#92400E' }}>
                                            {loading ? '...' : `${funnelData.agreementsCount} Acuerdos`}
                                        </div>
                                        <div title={formatMoney(funnelData.agreementsAmount)} style={{ fontSize: '0.72rem', fontWeight: '700', color: '#B45309', marginTop: '1px' }}>
                                            {formatCompactMoney(funnelData.agreementsAmount)}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* CONNECTOR 3 -> 4 (Funnel Slope) */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', margin: '-2px 0' }}>
                                <div style={{ width: '28px', height: '1.5px', background: 'linear-gradient(to right, transparent, #CBD5E1)' }} />
                                <span style={{ fontSize: '0.67rem', fontWeight: '800', color: '#065F46', backgroundColor: '#ECFDF5', padding: '2px 9px', borderRadius: '10px', border: '1px solid #A7F3D0', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                    <ChevronRight size={11} /> Activación Efectiva: {funnelData.agreementToBuyerPct}%
                                </span>
                                {funnelData.agreementToBuyerPct < 100 && (
                                    <span style={{ fontSize: '0.65rem', fontWeight: '700', color: '#DC2626', backgroundColor: '#FEE2E2', padding: '1px 6px', borderRadius: '6px' }}>
                                        Fuga: -{Math.max(0, 100 - funnelData.agreementToBuyerPct)}%
                                    </span>
                                )}
                                <div style={{ width: '28px', height: '1.5px', background: 'linear-gradient(to left, transparent, #CBD5E1)' }} />
                            </div>

                            {/* STEP 4: CLIENTES FACTURADOS - BASE ESTRECHA 58% CENTRADO */}
                            <div style={{ width: '58%', margin: '0 auto', backgroundColor: '#F0FDF4', borderRadius: '10px', borderTop: '3.5px solid #15803D', borderRight: '1.5px solid #86EFAC', borderBottom: '1.5px solid #86EFAC', borderLeft: '1.5px solid #86EFAC', padding: '0.7rem 0.85rem', boxShadow: '0 4px 12px rgba(21, 128, 61, 0.12)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ width: '28px', height: '28px', borderRadius: '8px', backgroundColor: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #86EFAC' }}>
                                            <CheckCircle2 size={15} color="#15803D" />
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: '900', fontSize: '0.8rem', color: '#14532D', whiteSpace: 'nowrap' }}>
                                                4. Compradores Activos
                                            </div>
                                            <div style={{ fontSize: '0.66rem', color: '#166534', whiteSpace: 'nowrap' }}>
                                                Despachos facturados
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontWeight: '900', fontSize: '0.98rem', color: '#15803D', whiteSpace: 'nowrap' }}>
                                            {loading ? '...' : `${funnelData.activeBuyersCount} Clientes`}
                                        </div>
                                        <div title={formatMoney(funnelData.buyersAmount)} style={{ fontSize: '0.72rem', fontWeight: '800', color: THEME.colors.primary, marginTop: '1px', whiteSpace: 'nowrap' }}>
                                            {formatCompactMoney(funnelData.buyersAmount)}
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>

                {/* CARD 2: CENTRO DE ALERTAS & VENCIMIENTOS EN TIEMPO REAL */}
                <div style={{ backgroundColor: 'white', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm, padding: '1.4rem', display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.85rem' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <AlertCircle size={20} color="#DC2626" /> Alertas & Vencimientos Comerciales
                                </h2>
                                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.78rem', color: THEME.colors.textSecondary }}>
                                    Control preventivo de cotizaciones y acuerdos por vencer o prospectos sin contacto.
                                </p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {criticalAlertsCount > 0 && (
                                    <span style={{ fontSize: '0.7rem', fontWeight: '800', backgroundColor: '#FEE2E2', color: '#B91C1C', padding: '3px 8px', borderRadius: '12px', border: '1px solid #FCA5A5' }}>
                                        {criticalAlertsCount} Críticas
                                    </span>
                                )}
                                <span style={{ fontSize: '0.7rem', fontWeight: '700', backgroundColor: '#F1F5F9', color: '#475569', padding: '3px 8px', borderRadius: '12px' }}>
                                    {alertsList.length} Totales
                                </span>
                            </div>
                        </div>

                        {/* Filter pills */}
                        <div style={{ display: 'flex', gap: '6px', marginBottom: '0.85rem', flexWrap: 'wrap' }}>
                            {(
                                [
                                    { id: 'all', label: `Todas (${alertsList.length})` },
                                    { id: 'critical', label: `Críticas (${criticalAlertsCount})` },
                                    { id: 'quotes', label: 'Cotizaciones / Acuerdos' },
                                    { id: 'leads', label: 'Prospectos / Fugas' }
                                ] as const
                            ).map(f => {
                                const isSelected = alertFilter === f.id;
                                return (
                                    <button
                                        key={f.id}
                                        onClick={() => setAlertFilter(f.id)}
                                        style={{
                                            padding: '0.25rem 0.65rem',
                                            fontSize: '0.72rem',
                                            fontWeight: isSelected ? '800' : '600',
                                            color: isSelected ? 'white' : THEME.colors.textSecondary,
                                            backgroundColor: isSelected ? THEME.colors.primary : '#F8FAFC',
                                            border: `1px solid ${isSelected ? THEME.colors.primary : '#E2E8F0'}`,
                                            borderRadius: '6px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {f.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Alerts List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', flex: 1, maxHeight: '420px', overflowY: 'auto', paddingRight: '4px', scrollbarWidth: 'thin', scrollbarColor: '#CBD5E1 transparent' }}>
                        {filteredAlerts.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: THEME.colors.textSecondary, fontSize: '0.82rem' }}>
                                <CheckCircle2 size={32} color="#10B981" style={{ margin: '0 auto 8px auto', display: 'block' }} />
                                No hay alertas comerciales pendientes en este criterio.
                            </div>
                        ) : (
                            filteredAlerts.map(alert => {
                                const isCrit = alert.severity === 'critical';
                                const isWarn = alert.severity === 'warning';
                                return (
                                    <div
                                        key={alert.id}
                                        style={{
                                            padding: '0.7rem 0.85rem',
                                            borderRadius: '8px',
                                            backgroundColor: isCrit ? '#FEF2F2' : isWarn ? '#FFFBEB' : '#F8FAFC',
                                            borderTop: `1px solid ${isCrit ? '#FECACA' : isWarn ? '#FDE68A' : '#E2E8F0'}`,
                                            borderRight: `1px solid ${isCrit ? '#FECACA' : isWarn ? '#FDE68A' : '#E2E8F0'}`,
                                            borderBottom: `1px solid ${isCrit ? '#FECACA' : isWarn ? '#FDE68A' : '#E2E8F0'}`,
                                            borderLeft: `4px solid ${isCrit ? '#EF4444' : isWarn ? '#F59E0B' : '#3B82F6'}`,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '5px'
                                        }}
                                    >
                                        {/* Tier 1: Alert badge, amount, and date/clock */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{ fontWeight: '800', fontSize: '0.78rem', color: isCrit ? '#991B1B' : isWarn ? '#92400E' : THEME.colors.textMain }}>
                                                    {alert.title}
                                                </span>
                                                {alert.amount && alert.amount > 0 && (
                                                    <span title={formatMoney(alert.amount)} style={{ fontSize: '0.7rem', fontWeight: '800', color: THEME.colors.primary, backgroundColor: '#FFFFFF', padding: '1px 6px', borderRadius: '4px', border: '1px solid #E2E8F0' }}>
                                                        {formatCompactMoney(alert.amount)}
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: '0.68rem', color: isCrit ? '#B91C1C' : isWarn ? '#B45309' : '#64748B', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                                                <Clock size={11} /> {alert.dateInfo}
                                            </div>
                                        </div>

                                        {/* Tier 2: Entity name and action button */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                            <div style={{ fontSize: '0.8rem', fontWeight: '700', color: THEME.colors.textMain, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                                                {alert.subtitle}
                                            </div>
                                            <Link
                                                href={alert.linkUrl}
                                                style={{
                                                    textDecoration: 'none',
                                                    fontSize: '0.7rem',
                                                    fontWeight: '800',
                                                    padding: '0.28rem 0.65rem',
                                                    borderRadius: '6px',
                                                    backgroundColor: isCrit ? '#DC2626' : THEME.colors.primary,
                                                    color: 'white',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    whiteSpace: 'nowrap',
                                                    flexShrink: 0
                                                }}
                                            >
                                                {alert.linkText} <ChevronRight size={11} />
                                            </Link>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

            </div>

            {/* 3. CONSUMPTION BY CLIENT & CHURN PREVENTION (INDICADORES 1 & 2 DE IMAGEN 2) */}
            <div style={{ backgroundColor: 'white', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm, padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '800', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Users size={20} color={THEME.colors.primary} /> Consumo por Cliente & Detección de Fugas (Churn)
                        </h2>
                        <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: THEME.colors.textSecondary }}>
                            Seguimiento de volumen físico (Kg) y variación porcentual (Δ%) contra el periodo histórico equivalente.
                        </p>
                    </div>

                    {/* Filters & Sorting */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        {/* Search */}
                        <div style={{ position: 'relative', width: '240px' }}>
                            <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                            <input
                                type="text"
                                placeholder="Buscar cliente o NIT..."
                                value={searchClient}
                                onChange={e => setSearchClient(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '0.4rem 0.75rem 0.4rem 2.2rem',
                                    borderRadius: '8px',
                                    border: `1px solid ${THEME.colors.border}`,
                                    fontSize: '0.8rem',
                                    outline: 'none'
                                }}
                            />
                        </div>

                        {/* Sort Selector */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#F8FAFC', padding: '3px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                            {(
                                [
                                    { id: 'amount', label: 'Mayor Facturación' },
                                    { id: 'volume', label: 'Mayor Kg' },
                                    { id: 'growth', label: 'Creciendo (↑)' },
                                    { id: 'risk', label: 'En Riesgo (↓)' }
                                ] as const
                            ).map(s => {
                                const isSelected = clientSort === s.id;
                                return (
                                    <button
                                        key={s.id}
                                        onClick={() => setClientSort(s.id)}
                                        style={{
                                            padding: '0.3rem 0.65rem',
                                            fontSize: '0.72rem',
                                            fontWeight: isSelected ? '800' : '600',
                                            color: isSelected ? THEME.colors.primary : THEME.colors.textSecondary,
                                            backgroundColor: isSelected ? 'white' : 'transparent',
                                            border: 'none',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            boxShadow: isSelected ? '0 1px 3px rgba(0,0,0,0.05)' : 'none'
                                        }}
                                    >
                                        {s.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div style={{ overflowX: 'auto', maxHeight: '420px', overflowY: 'auto', border: `1px solid ${THEME.colors.border}`, borderRadius: '8px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                        <thead style={{ position: 'sticky', top: 0, backgroundColor: '#F8FAFC', zIndex: 2, borderBottom: `1px solid ${THEME.colors.border}` }}>
                            <tr>
                                <th style={{ ...THEME.typography.tableHeader, padding: '0.75rem 1rem' }}>Cliente / Razón Social</th>
                                <th style={{ ...THEME.typography.tableHeader, padding: '0.75rem 1rem' }}>Canal</th>
                                <th style={{ ...THEME.typography.tableHeader, padding: '0.75rem 1rem', textAlign: 'right' }}>Volumen (Kg)</th>
                                <th style={{ ...THEME.typography.tableHeader, padding: '0.75rem 1rem', textAlign: 'right' }}>Facturado ($)</th>
                                <th style={{ ...THEME.typography.tableHeader, padding: '0.75rem 1rem', textAlign: 'right' }}>Histórico ($)</th>
                                <th style={{ ...THEME.typography.tableHeader, padding: '0.75rem 1rem', textAlign: 'center' }}>Variación (Δ%)</th>
                                <th style={{ ...THEME.typography.tableHeader, padding: '0.75rem 1rem', textAlign: 'right' }}>Pedidos</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredClients.length === 0 ? (
                                <tr>
                                    <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: THEME.colors.textSecondary }}>
                                        No se encontraron registros de consumo para el periodo seleccionado.
                                    </td>
                                </tr>
                            ) : (
                                filteredClients.map((c, idx) => {
                                    const isRisk = c.growthPct < -15;
                                    const isGrowing = c.growthPct > 5;
                                    return (
                                        <tr key={c.id || idx} style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: idx % 2 === 0 ? 'white' : '#FAFAFA' }}>
                                            <td style={{ padding: '0.75rem 1rem' }}>
                                                <div style={{ fontWeight: '800', color: THEME.colors.textMain }}>{c.name}</div>
                                                {c.nit && <div style={{ fontSize: '0.72rem', color: THEME.colors.textSecondary }}>NIT: {c.nit}</div>}
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem' }}>
                                                <span style={{
                                                    fontSize: '0.7rem',
                                                    fontWeight: '700',
                                                    padding: '2px 8px',
                                                    borderRadius: '12px',
                                                    backgroundColor: c.type === 'Institucional' ? '#EFF6FF' : '#F3F4F6',
                                                    color: c.type === 'Institucional' ? '#1D4ED8' : '#475569',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px'
                                                }}>
                                                    {c.type === 'Institucional' ? <Building2 size={11} /> : <Home size={11} />}
                                                    {c.type}
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: '700', color: THEME.colors.textMain }}>
                                                {formatNumber(c.currentVolume, 1)} Kg
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: '800', color: THEME.colors.primary }}>
                                                {formatMoney(c.currentAmount)}
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#64748B' }}>
                                                {formatMoney(c.prevAmount)}
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                                <span style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '3px',
                                                    padding: '3px 8px',
                                                    borderRadius: '12px',
                                                    fontSize: '0.72rem',
                                                    fontWeight: '800',
                                                    backgroundColor: isRisk ? '#FEE2E2' : isGrowing ? '#DCFCE7' : '#F1F5F9',
                                                    color: isRisk ? '#B91C1C' : isGrowing ? '#15803D' : '#475569'
                                                }}>
                                                    {isRisk ? <ArrowDownRight size={12} /> : isGrowing ? <ArrowUpRight size={12} /> : <Minus size={12} />}
                                                    {c.growthPct > 0 ? `+${c.growthPct}%` : `${c.growthPct}%`}
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: '600' }}>
                                                {c.orderCount}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 3.5 DISTRIBUCIÓN GEOGRÁFICA & DENSIDAD DE PEDIDOS (MAPA LOGÍSTICO INTERACTIVO) */}
            <div style={{ backgroundColor: 'white', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm, padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '800', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <MapPin size={20} color={THEME.colors.primary} /> Distribución de Clientes por Zona Geográfica & Cobertura Logística
                        </h2>
                        <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: THEME.colors.textSecondary }}>
                            Desglose de facturación, volumen (Kg) y concentración de clientes por localidad en Bogotá D.C. y municipios de Cundinamarca.
                        </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        {/* Selector de modo de vista: Mapa vs Cuadrícula */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', backgroundColor: '#F1F5F9', padding: '3px', borderRadius: '8px' }}>
                            <button
                                onClick={() => setGeoViewMode('map')}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    padding: '0.3rem 0.75rem',
                                    borderRadius: '6px',
                                    border: 'none',
                                    backgroundColor: geoViewMode === 'map' ? 'white' : 'transparent',
                                    color: geoViewMode === 'map' ? THEME.colors.primary : THEME.colors.textSecondary,
                                    fontSize: '0.74rem',
                                    fontWeight: geoViewMode === 'map' ? '800' : '600',
                                    cursor: 'pointer',
                                    boxShadow: geoViewMode === 'map' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <Globe size={13} /> Vista Mapa Logístico
                            </button>
                            <button
                                onClick={() => setGeoViewMode('grid')}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    padding: '0.3rem 0.75rem',
                                    borderRadius: '6px',
                                    border: 'none',
                                    backgroundColor: geoViewMode === 'grid' ? 'white' : 'transparent',
                                    color: geoViewMode === 'grid' ? THEME.colors.primary : THEME.colors.textSecondary,
                                    fontSize: '0.74rem',
                                    fontWeight: geoViewMode === 'grid' ? '800' : '600',
                                    cursor: 'pointer',
                                    boxShadow: geoViewMode === 'grid' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <LayoutGrid size={13} /> Vista Cuadrícula
                            </button>
                        </div>

                        <span style={{ fontSize: '0.75rem', fontWeight: '700', backgroundColor: '#F1F5F9', color: '#475569', padding: '4px 10px', borderRadius: '12px' }}>
                            {geoZones.length} Localidades Monitoreadas
                        </span>
                        <span style={{ fontSize: '0.75rem', fontWeight: '700', backgroundColor: '#EFF6FF', color: '#1E40AF', padding: '4px 10px', borderRadius: '12px', border: '1px solid #BFDBFE' }}>
                            📍 {clientPins.length} Clientes Georreferenciados (GPS)
                        </span>
                        {geoZones[0] && (
                            <span style={{ fontSize: '0.75rem', fontWeight: '800', backgroundColor: '#DCFCE7', color: '#15803D', padding: '4px 10px', borderRadius: '12px' }}>
                                Zona Líder: {geoZones[0].zone} ({geoZones[0].orderSharePct}%)
                            </span>
                        )}
                    </div>
                </div>

                {geoViewMode === 'map' ? (
                    /* ── SPLIT VIEW: MAPA LOGÍSTICO + RANKING LATERAL ── */
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '1.25rem', alignItems: 'stretch' }}>
                        
                        {/* COLUMNA 1: GOOGLE MAPS INTERACTIVO */}
                        <div style={{ position: 'relative', height: '440px', borderRadius: '12px', overflow: 'hidden', border: `1px solid ${THEME.colors.border}`, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                            <GoogleMap
                                defaultCenter={{ lat: 4.655, lng: -74.090 }}
                                defaultZoom={11.5}
                                disableDefaultUI={true}
                                zoomControl={true}
                                style={{ width: '100%', height: '100%' }}
                            >
                                <MapFocusController target={focusTarget} />

                                {/* Hub Bodega Corabastos Marker */}
                                <Marker
                                    position={{ lat: CORABASTOS_HUB.lat, lng: CORABASTOS_HUB.lng }}
                                    title="Hub Logístico Central: Bodega Corabastos FruFresco"
                                    icon={{ url: 'https://maps.google.com/mapfiles/ms/icons/purple-dot.png' }}
                                />

                                {/* Destination Client Delivery Pins (GPS Reales) */}
                                {clientPins.map(pin => {
                                    const isInst = pin.type === 'Institucional';
                                    return (
                                        <Marker
                                            key={pin.id}
                                            position={{ lat: pin.lat, lng: pin.lng }}
                                            title={`${pin.name} (${pin.type} • ${pin.zone})`}
                                            icon={{
                                                url: isInst
                                                    ? 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png'
                                                    : 'https://maps.google.com/mapfiles/ms/icons/green-dot.png'
                                            }}
                                            onClick={() => {
                                                setSelectedPin(pin);
                                                setSelectedZone(null);
                                                setFocusTarget({ lat: pin.lat, lng: pin.lng });
                                            }}
                                        />
                                    );
                                })}

                                {/* InfoWindow for Selected Individual Client Pin */}
                                {selectedPin && (
                                    <InfoWindow
                                        position={{ lat: selectedPin.lat, lng: selectedPin.lng }}
                                        onCloseClick={() => setSelectedPin(null)}
                                    >
                                        <div style={{ padding: '6px 4px', maxWidth: '240px', color: '#09090B' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', marginBottom: '4px' }}>
                                                <span style={{ fontSize: '0.67rem', fontWeight: '800', padding: '2px 6px', borderRadius: '6px', backgroundColor: selectedPin.type === 'Institucional' ? '#EFF6FF' : '#ECFDF5', color: selectedPin.type === 'Institucional' ? '#1E40AF' : '#047857' }}>
                                                    {selectedPin.type === 'Institucional' ? '🏢 Institucional' : '🏠 Hogar'}
                                                </span>
                                                <span style={{ fontSize: '0.68rem', fontWeight: '800', color: '#64748B' }}>
                                                    {selectedPin.zone}
                                                </span>
                                            </div>
                                            <div style={{ fontWeight: '900', fontSize: '0.88rem', color: THEME.colors.textMain, marginBottom: '4px', lineHeight: 1.2 }}>
                                                {selectedPin.name}
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: '#64748B', marginBottom: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {selectedPin.address}
                                            </div>
                                            <div style={{ paddingTop: '5px', borderTop: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                <div style={{ fontSize: '0.78rem', fontWeight: '800', color: THEME.colors.primary, display: 'flex', justifyContent: 'space-between' }}>
                                                    <span>Facturación:</span>
                                                    <span>{formatMoney(selectedPin.amount)}</span>
                                                </div>
                                                <div style={{ fontSize: '0.72rem', fontWeight: '700', color: '#1E40AF', display: 'flex', justifyContent: 'space-between' }}>
                                                    <span>Volumen:</span>
                                                    <span>{formatNumber(selectedPin.volumeKg, 1)} Kg</span>
                                                </div>
                                                <div style={{ fontSize: '0.7rem', color: '#64748B', display: 'flex', justifyContent: 'space-between' }}>
                                                    <span>Despachos:</span>
                                                    <span>{selectedPin.orderCount} pedidos</span>
                                                </div>
                                            </div>
                                        </div>
                                    </InfoWindow>
                                )}

                                {/* InfoWindow for Selected Zone (from sidebar) */}
                                {selectedZone && getZoneCoord(selectedZone.zone) && !selectedPin && (
                                    <InfoWindow
                                        position={getZoneCoord(selectedZone.zone)!}
                                        onCloseClick={() => setSelectedZone(null)}
                                    >
                                        <div style={{ padding: '6px 4px', maxWidth: '240px', color: '#09090B' }}>
                                            <div style={{ fontWeight: '900', fontSize: '0.92rem', color: THEME.colors.primary, marginBottom: '4px' }}>
                                                {selectedZone.zone}
                                            </div>
                                            <div style={{ fontSize: '0.84rem', fontWeight: '800', color: '#09090B', marginBottom: '3px' }}>
                                                Facturado: {formatMoney(selectedZone.salesAmount)}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: '#1E40AF', fontWeight: '700', marginBottom: '3px' }}>
                                                Volumen: {formatNumber(selectedZone.volumeKg, 1)} Kg
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: '#64748B', marginBottom: '6px' }}>
                                                {selectedZone.clientCount} cliente(s) &bull; {selectedZone.orderCount} pedido(s)
                                            </div>
                                            <div style={{ paddingTop: '5px', borderTop: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                <div style={{ fontSize: '0.74rem', fontWeight: '800', color: '#059669', display: 'flex', justifyContent: 'space-between' }}>
                                                    <span>Concentración Despachos:</span>
                                                    <span>{selectedZone.orderSharePct}%</span>
                                                </div>
                                                <div style={{ fontSize: '0.7rem', color: '#64748B', display: 'flex', justifyContent: 'space-between' }}>
                                                    <span>Participación Clientes:</span>
                                                    <span>{selectedZone.clientSharePct}%</span>
                                                </div>
                                            </div>
                                        </div>
                                    </InfoWindow>
                                )}
                            </GoogleMap>

                            {/* Floating Legend HUD over map */}
                            <div style={{ position: 'absolute', top: '10px', left: '10px', backgroundColor: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(4px)', padding: '6px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.72rem', fontWeight: '800', color: THEME.colors.textMain, pointerEvents: 'none', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#9333EA', display: 'inline-block' }} />
                                    <span>Hub Corabastos</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#2563EB', display: 'inline-block' }} />
                                    <span>🏢 Institucional ({clientPins.filter(p => p.type === 'Institucional').length})</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10B981', display: 'inline-block' }} />
                                    <span>🏠 Hogar ({clientPins.filter(p => p.type === 'Hogar').length})</span>
                                </div>
                            </div>
                        </div>

                        {/* COLUMNA 2: RANKING LOGÍSTICO Y CONCENTRACIÓN */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', maxHeight: '440px', overflowY: 'auto', paddingRight: '4px', scrollbarWidth: 'thin', scrollbarColor: '#CBD5E1 transparent' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                                <span style={{ fontSize: '0.74rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Localidades en Cobertura ({geoZones.length})
                                </span>
                                <span style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary }}>
                                    Clic en zona para enfocar mapa
                                </span>
                            </div>

                            {geoZones.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: THEME.colors.textSecondary, fontSize: '0.82rem' }}>
                                    Sin datos de georreferenciación en este periodo.
                                </div>
                            ) : (
                                geoZones.map((z, idx) => {
                                    const coord = getZoneCoord(z.zone);
                                    const isSelected = selectedZone?.zone === z.zone && !selectedPin;
                                    return (
                                        <div
                                            key={z.zone || idx}
                                            onClick={() => {
                                                setSelectedZone(z);
                                                setSelectedPin(null);
                                                if (coord) setFocusTarget(coord);
                                            }}
                                            onMouseEnter={() => {
                                                if (coord) setFocusTarget(coord);
                                                setSelectedZone(z);
                                                setSelectedPin(null);
                                            }}
                                            style={{
                                                padding: '0.75rem 0.95rem',
                                                borderRadius: '8px',
                                                backgroundColor: isSelected ? '#F0FDF4' : '#F8FAFC',
                                                borderTop: `1px solid ${isSelected ? THEME.colors.primary : '#E2E8F0'}`,
                                                borderRight: `1px solid ${isSelected ? THEME.colors.primary : '#E2E8F0'}`,
                                                borderBottom: `1px solid ${isSelected ? THEME.colors.primary : '#E2E8F0'}`,
                                                borderLeft: `4px solid ${idx === 0 ? '#10B981' : isSelected ? THEME.colors.primary : '#CBD5E1'}`,
                                                cursor: 'pointer',
                                                transition: 'all 0.15s ease',
                                                boxShadow: isSelected ? '0 2px 8px rgba(13, 122, 87, 0.12)' : 'none'
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px', gap: '8px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                                                    <div style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: idx === 0 ? '#FEF3C7' : '#E2E8F0', color: idx === 0 ? '#B45309' : '#475569', fontSize: '0.7rem', fontWeight: '900', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                        {idx + 1}
                                                    </div>
                                                    <span style={{ fontWeight: '800', color: THEME.colors.textMain, fontSize: '0.86rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {z.zone}
                                                    </span>
                                                </div>
                                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                    <span title={formatMoney(z.salesAmount)} style={{ fontWeight: '900', color: THEME.colors.primary, fontSize: '0.92rem', whiteSpace: 'nowrap' }}>
                                                        {formatCompactMoney(z.salesAmount)}
                                                    </span>
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: THEME.colors.textSecondary, marginBottom: '5px' }}>
                                                <span>
                                                    {z.clientCount} cliente(s) &bull; {z.orderCount} pedido(s)
                                                    <strong style={{ color: '#059669', marginLeft: '6px' }}>({z.orderSharePct}%)</strong>
                                                </span>
                                                {z.volumeKg > 0 && (
                                                    <span style={{ fontWeight: '700', color: '#1E40AF' }}>
                                                        {formatNumber(z.volumeKg, 1)} Kg
                                                    </span>
                                                )}
                                            </div>

                                            {/* Barra de progreso */}
                                            <div style={{ width: '100%', height: '5px', backgroundColor: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
                                                <div style={{ width: `${Math.max(4, z.percentage)}%`, height: '100%', backgroundColor: idx === 0 ? '#0D7A57' : '#10B981', borderRadius: '3px', transition: 'width 0.3s ease' }} />
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                    </div>
                ) : (
                    /* ── VISTA CUADRÍCULA / MOSAICO TRADICIONAL ── */
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1rem' }}>
                        {geoZones.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '2.5rem', color: THEME.colors.textSecondary, gridColumn: '1 / -1' }}>
                                Sin datos georreferenciados para el periodo seleccionado.
                            </div>
                        ) : (
                            geoZones.map((z, idx) => (
                                <div
                                    key={z.zone || idx}
                                    style={{
                                        backgroundColor: '#F8FAFC',
                                        borderRadius: '10px',
                                        border: '1px solid #E2E8F0',
                                        padding: '1rem',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'space-between'
                                    }}
                                >
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', gap: '8px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
                                                <div style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: idx === 0 ? '#FEF3C7' : '#E2E8F0', color: idx === 0 ? '#B45309' : '#475569', fontSize: '0.7rem', fontWeight: '800', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                    {idx + 1}
                                                </div>
                                                <span style={{ fontWeight: '800', color: THEME.colors.textMain, fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {z.zone}
                                                </span>
                                            </div>
                                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                <span title={formatMoney(z.salesAmount)} style={{ fontWeight: '900', color: THEME.colors.primary, fontSize: '0.92rem', whiteSpace: 'nowrap' }}>
                                                    {formatCompactMoney(z.salesAmount)}
                                                </span>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: THEME.colors.textSecondary, marginBottom: '8px' }}>
                                            <span>
                                                {z.clientCount} cliente(s) • {z.orderCount} pedido(s)
                                                <strong style={{ color: '#059669', marginLeft: '6px' }}>({z.orderSharePct}%)</strong>
                                            </span>
                                            {z.volumeKg > 0 && (
                                                <span style={{ fontWeight: '700', color: '#1E40AF' }}>
                                                    {formatNumber(z.volumeKg, 1)} Kg
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Progress bar */}
                                    <div style={{ width: '100%', height: '6px', backgroundColor: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
                                        <div style={{ width: `${Math.max(4, z.percentage)}%`, height: '100%', backgroundColor: idx === 0 ? '#0D7A57' : '#10B981', borderRadius: '3px' }} />
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* 4. PRODUCT INTELLIGENCE: TOP ROTATION VS SLOW MOVERS (INDICADORES 3, 4 & 5 DE IMAGEN 2) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: '1.5rem' }}>
                
                {/* PANEL A: TOP 10 PRODUCTOS MAS CONSUMIDOS (PARETO 80/20) */}
                <div style={{ backgroundColor: 'white', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm, padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Award size={18} color="#D97706" /> Top 10 Productos Más Consumidos
                            </h3>
                            <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.78rem', color: THEME.colors.textSecondary }}>
                                Ranking Pareto por volumen físico (Kg) y facturación acumulada.
                            </p>
                        </div>
                        <span style={{ fontSize: '0.72rem', fontWeight: '700', backgroundColor: '#FEF3C7', color: '#B45309', padding: '3px 8px', borderRadius: '12px' }}>
                            Pareto 80/20
                        </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1 }}>
                        {topProducts.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '3rem', color: THEME.colors.textSecondary, fontSize: '0.85rem' }}>
                                Sin datos de rotación en este periodo.
                            </div>
                        ) : (
                            topProducts.map((p, index) => (
                                <div key={p.id || index} style={{ padding: '0.65rem 0.85rem', borderRadius: '8px', backgroundColor: '#F8FAFC', border: '1px solid #F1F5F9' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: index < 3 ? '#FEF3C7' : '#E2E8F0', color: index < 3 ? '#B45309' : '#475569', fontSize: '0.7rem', fontWeight: '800', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {index + 1}
                                            </span>
                                            <span style={{ fontWeight: '800', color: THEME.colors.textMain, fontSize: '0.85rem' }}>
                                                {p.name}
                                            </span>
                                            <span style={{ fontSize: '0.68rem', color: '#64748B', backgroundColor: '#E2E8F0', padding: '1px 6px', borderRadius: '6px' }}>
                                                {p.category}
                                            </span>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <span style={{ fontWeight: '800', color: THEME.colors.primary, fontSize: '0.88rem' }}>
                                                {formatNumber(p.quantity, 1)} {p.unit}
                                            </span>
                                            <span style={{ fontSize: '0.75rem', color: '#64748B', marginLeft: '8px' }}>
                                                ({formatMoney(p.revenue)})
                                            </span>
                                        </div>
                                    </div>
                                    {/* Share visual bar */}
                                    <div style={{ width: '100%', height: '6px', backgroundColor: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
                                        <div style={{ width: `${p.sharePct}%`, height: '100%', backgroundColor: index < 3 ? '#0D7A57' : '#10B981', borderRadius: '3px' }} />
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* PANEL B: PRODUCTOS DE BAJA ROTACION (SLOW MOVERS / HUESOS) */}
                <div style={{ backgroundColor: 'white', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm, padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Clock size={18} color="#EF4444" /> Productos de Baja Rotación (Slow Movers)
                            </h3>
                            <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.78rem', color: THEME.colors.textSecondary }}>
                                SKUs activos con salida nula o mínima (&lt;5 Kg). Alerta preventiva para compras.
                            </p>
                        </div>
                        <span style={{ fontSize: '0.72rem', fontWeight: '700', backgroundColor: '#FEE2E2', color: '#B91C1C', padding: '3px 8px', borderRadius: '12px' }}>
                            Riesgo de Merma
                        </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', flex: 1, maxHeight: '420px', overflowY: 'auto' }}>
                        {slowProducts.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '3rem', color: THEME.colors.textSecondary, fontSize: '0.85rem' }}>
                                Todos los productos activos registraron una rotación adecuada.
                            </div>
                        ) : (
                            slowProducts.map((p, index) => (
                                <div key={p.id || index} style={{ padding: '0.65rem 0.85rem', borderRadius: '8px', backgroundColor: '#FFF5F5', border: '1px solid #FED7D7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontWeight: '800', color: '#9B1C1C', fontSize: '0.85rem' }}>
                                            {p.name}
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: '#742A2A', display: 'flex', gap: '8px', marginTop: '2px' }}>
                                            <span>SKU: {p.sku}</span>
                                            <span>•</span>
                                            <span>Cat: {p.category}</span>
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <span style={{ fontSize: '0.8rem', fontWeight: '900', color: p.quantity === 0 ? '#DC2626' : '#D97706' }}>
                                            {p.quantity === 0 ? '0 Salidas' : `${p.quantity} ${p.unit}`}
                                        </span>
                                        <div style={{ fontSize: '0.68rem', color: '#9B1C1C', fontWeight: '700' }}>
                                            Revisar compras
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

            </div>

            {/* 5. SUPPLY CHAIN & COSTS INTELLIGENCE: ALZAS VS BAJAS EN CENTRAL DE ABASTOS */}
            <div style={{ backgroundColor: 'white', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm, padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '800', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <TrendingUp size={20} color={THEME.colors.primary} /> Variación de Costos de Compra vs Matriz Autorizada
                        </h3>
                        <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: THEME.colors.textSecondary }}>
                            Detección temprana de variaciones de costos en Corabastos: Alzas críticas (riesgo de margen) vs Bajas (oportunidades comerciales).
                        </p>
                    </div>
                    <Link
                        href="/admin/commercial/cost-matrix"
                        style={{
                            textDecoration: 'none',
                            color: THEME.colors.primary,
                            fontSize: '0.78rem',
                            fontWeight: '800',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            backgroundColor: '#F0FDF4',
                            padding: '0.4rem 0.85rem',
                            borderRadius: '8px',
                            border: '1px solid #BBF7D0',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        Gestionar Matriz de Costos <ExternalLink size={13} />
                    </Link>
                </div>

                {/* 2-COLUMN SPLIT: ALZAS (ROJO/ÁMBAR) VS BAJAS (VERDE) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '1.5rem' }}>
                    
                    {/* COLUMNA 1: MAYORES ALZAS (RIESGO DE MARGEN) */}
                    <div style={{ backgroundColor: '#FFFBFB', borderRadius: '10px', border: '1px solid #FEE2E2', padding: '1.1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                            <span style={{ fontSize: '0.84rem', fontWeight: '800', color: '#991B1B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <ArrowUpRight size={16} color="#DC2626" /> Mayores Alzas en Central de Abastos
                            </span>
                            <span style={{ fontSize: '0.68rem', fontWeight: '800', backgroundColor: '#FEE2E2', color: '#B91C1C', padding: '2px 8px', borderRadius: '10px', border: '1px solid #FCA5A5' }}>
                                {costIncreases.length} SKUs en Alerta
                            </span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                            {costIncreases.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#94A3B8', fontSize: '0.8rem' }}>
                                    No se detectan alzas críticas sobre la matriz autorizada.
                                </div>
                            ) : (
                                costIncreases.map((ct, idx) => (
                                    <div
                                        key={ct.id || idx}
                                        style={{
                                            padding: '0.65rem 0.85rem',
                                            borderRadius: '8px',
                                            backgroundColor: 'white',
                                            borderTop: '1px solid #FED7AA',
                                            borderRight: '1px solid #FED7AA',
                                            borderBottom: '1px solid #FED7AA',
                                            borderLeft: '3.5px solid #DC2626',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                                        }}
                                    >
                                        <div style={{ minWidth: 0, flex: 1, paddingRight: '8px' }}>
                                            <div style={{ fontWeight: '800', fontSize: '0.84rem', color: '#1F2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {ct.name}
                                            </div>
                                            <div style={{ fontSize: '0.68rem', color: '#6B7280', marginTop: '1px' }}>
                                                <span>Matriz: <strong>{formatMoney(ct.matrixCost)}</strong></span>
                                                <span style={{ margin: '0 5px' }}>&bull;</span>
                                                <span>Última Compra: <strong style={{ color: '#B91C1C' }}>{formatMoney(ct.purchaseCost)}</strong></span>
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                            <span style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '2px',
                                                padding: '2px 8px',
                                                borderRadius: '12px',
                                                fontSize: '0.72rem',
                                                fontWeight: '800',
                                                backgroundColor: '#FEE2E2',
                                                color: '#B91C1C',
                                                border: '1px solid #FECACA'
                                            }}>
                                                <ArrowUpRight size={12} /> +{ct.variancePct}%
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* COLUMNA 2: MAYORES BAJAS & OPORTUNIDADES (MARGEN FAVORABLE) */}
                    <div style={{ backgroundColor: '#F0FDF4', borderRadius: '10px', border: '1px solid #BBF7D0', padding: '1.1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                            <span style={{ fontSize: '0.84rem', fontWeight: '800', color: '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <ArrowDownRight size={16} color="#16A34A" /> Mayores Bajas & Oportunidades de Compra
                            </span>
                            <span style={{ fontSize: '0.68rem', fontWeight: '800', backgroundColor: '#DCFCE7', color: '#15803D', padding: '2px 8px', borderRadius: '10px', border: '1px solid #86EFAC' }}>
                                {costDecreases.length} Oportunidades
                            </span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                            {costDecreases.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#94A3B8', fontSize: '0.8rem' }}>
                                    No se detectan bajas significativas en los precios de compra.
                                </div>
                            ) : (
                                costDecreases.map((ct, idx) => (
                                    <div
                                        key={ct.id || idx}
                                        style={{
                                            padding: '0.65rem 0.85rem',
                                            borderRadius: '8px',
                                            backgroundColor: 'white',
                                            borderTop: '1px solid #BBF7D0',
                                            borderRight: '1px solid #BBF7D0',
                                            borderBottom: '1px solid #BBF7D0',
                                            borderLeft: '3.5px solid #16A34A',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                                        }}
                                    >
                                        <div style={{ minWidth: 0, flex: 1, paddingRight: '8px' }}>
                                            <div style={{ fontWeight: '800', fontSize: '0.84rem', color: '#1F2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {ct.name}
                                            </div>
                                            <div style={{ fontSize: '0.68rem', color: '#6B7280', marginTop: '1px' }}>
                                                <span>Matriz: <strong>{formatMoney(ct.matrixCost)}</strong></span>
                                                <span style={{ margin: '0 5px' }}>&bull;</span>
                                                <span>Última Compra: <strong style={{ color: '#15803D' }}>{formatMoney(ct.purchaseCost)}</strong></span>
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                            <span style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '2px',
                                                padding: '2px 8px',
                                                borderRadius: '12px',
                                                fontSize: '0.72rem',
                                                fontWeight: '800',
                                                backgroundColor: '#DCFCE7',
                                                color: '#15803D',
                                                border: '1px solid #A7F3D0'
                                            }}>
                                                <ArrowDownRight size={12} /> {ct.variancePct}%
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                </div>
            </div>

        </div>
    );
}
