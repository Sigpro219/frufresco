'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { THEME, formatMoney, formatNumber } from '@/lib/adminTheme';

const formatCompactMoney = (num: number): string => {
    if (Math.abs(num) >= 1_000_000) {
        return `${(num / 1_000_000).toFixed(1)}M`;
    }
    if (Math.abs(num) >= 1_000) {
        return `${(num / 1_000).toFixed(0)}K`;
    }
    return `${Math.round(num)}`;
};

const formatDemandVolume = (val: number, unit: string): string => {
    if (!val || val <= 0) return `0 ${unit || 'Kg'}`;
    if (String(unit || '').toLowerCase().includes('kg') && val >= 1000) {
        return `${(val / 1000).toFixed(2)} Ton`;
    }
    return `${formatNumber(val, 1)} ${unit || 'Kg'}`;
};
import { 
    Building, 
    Building2,
    Upload, 
    Download, 
    RefreshCw, 
    TrendingUp, 
    TrendingDown, 
    CheckCircle2, 
    AlertTriangle, 
    Save, 
    Sparkles, 
    Search, 
    Calendar, 
    FileSpreadsheet,
    Zap,
    Scale,
    Layers,
    ArrowRight,
    ArrowUpRight,
    ArrowDownRight,
    Minus,
    Store,
    Info,
    Check,
    Cpu,
    Bot,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    HelpCircle,
    Users,
    CheckSquare,
    Square,
    X,
    Clock,
    Plus,
    ShieldCheck,
    MapPin,
    Handshake,
    Lock,
    RotateCcw,
    BookOpen,
    ChevronDown,
    ChevronUp
} from 'lucide-react';

export type SpecialModelId = 'nutresa' | 'colsubsidio' | 'general_quincenal' | 'general_mensual';

export interface AgreementItem {
    id: string;
    quote_item_id?: string;
    product_id?: string;
    client_code?: string | number;
    raw_name: string;
    unified_name: string;
    mapped_sku?: string; // Catálogo FruFresco SKU real
    category?: string;
    chain_name?: string; // Para Nutresa: Cadena asociada
    unit: string;
    monthly_consumption_kg: number;
    demand_volume?: number;
    demand_orders_count?: number;
    demand_revenue?: number;
    baseline_price: number; // Precio Lista Institucional Dinámica hoy
    corabastos_cost: number; // Costo estabilizado Matriz de Costos
    inst_rule_margin_pct?: number; // % Regla de Utilidad en General Institucional Dinámico (pricing_rules)
    sipsa_price?: number; // Precio SIPSA DANE real (SODA API o Excel Nutresa)
    client_proposed_price: number; // Oferta del cliente o Precio Vigente Anterior
    previous_price?: number; // Precio quincena/mes anterior (Acuerdo Anterior)
    prima_cop?: number; // Para Nutresa: Prima pactada en COP
    our_counterproposal: number; // Nuestra contrapropuesta / Nuevo Precio a Fijar
    suggested_price: number; // Sugerido inteligente IA
    is_frozen_override?: boolean; // Para Nutresa: Precio ajustado y congelado manualmente durante negociación
    status_change?: 'SUBIÓ' | 'BAJÓ' | 'IGUAL';
    iva_rate?: number;
    notes?: string;
}

export interface SpecialModelMetadata {
    id: SpecialModelId;
    name: string;
    subtitle: string;
    cycle_type: string;
    default_duration_days: number;
    master_quote_id: string | null;
    start_date: string;
    valid_until: string;
}

export interface EnrichedB2BClient {
    id: string;
    company_name: string;
    contact_name?: string;
    nit?: string;
    parent_id?: string | null;
    isMatriz: boolean;
    isSucursal: boolean;
    parentName?: string | null;
    branchCount: number;
    subscribedModels: SpecialModelId[];
    lastAppliedAt?: string | null;
}

export type SortField = 'code' | 'name' | 'sku' | 'chain' | 'consumption' | 'cost' | 'previous' | 'sipsa' | 'prima' | 'proposed' | 'suggested' | 'margin' | 'counter' | 'impact';
export type SortDirection = 'asc' | 'desc';
export type ClientModalFilterTab = 'roster' | 'selected' | 'matrices' | 'branches' | 'all';

interface DbModelRow {
    id: string;
    name?: string | null;
    subtitle?: string | null;
    cycle_type?: string | null;
    default_duration_days?: number | string | null;
    master_quote_id?: string | null;
    start_date?: string | null;
    valid_until?: string | null;
}

interface DbRosterRow {
    model_id: string;
    client_id: string;
    is_default_selected?: boolean | null;
    last_applied_at?: string | null;
}

interface DbProfileRow {
    id: string;
    company_name?: string | null;
    contact_name?: string | null;
    nit?: string | null;
    parent_id?: string | null;
    is_corporate_parent?: boolean | null;
    logistics_data?: Record<string, unknown> | null;
}

interface DbAppSettingRow {
    key: string;
    value?: string | null;
}

interface DbProductRow {
    id: string;
    name: string;
    sku?: string | null;
    accounting_id?: string | number | null;
    category?: string | null;
    unit_of_measure?: string | null;
    base_price?: number | string | null;
    iva_rate?: number | string | null;
    theoretical_shrinkage_pct?: number | string | null;
}

interface DbCostMatrixRow {
    product_id: string;
    manual_cost?: number | string | null;
}

interface DbPriceRow {
    product_id: string;
    price?: number | string | null;
}

interface DbRuleRow {
    product_id: string;
    margin_adjustment?: number | string | null;
}

interface DbQuoteItemRow {
    id: string;
    product_id: string;
    product_name: string;
    quantity?: number | string | null;
    cost_basis?: number | string | null;
    margin_percent?: number | string | null;
    unit_price?: number | string | null;
    iva_rate?: number | string | null;
    chain_name?: string | null;
}

interface SodaRow {
    producto?: string;
    alimento?: string;
    articulo?: string;
    precio_promedio?: string | number;
    precio?: string | number;
}

function normalizeSearchStr(str: string | number | null | undefined): string {
    return String(str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

const getBogotaDateStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

// Diccionario canónico de equivalencias entre catálogo FruFresco (normalizado) y pliego Excel de Grupo Nutresa (Nombre Item / DESCRIPCIÓN UNIFICADA)
const NUTRESA_ALIAS_MAP: Record<string, string[]> = {
    'aguacate': ['aguacate', 'aguacate papelillo'],
    'aguacate hass': ['aguacate hass'],
    'aguacate premium': ['aguacate', 'aguacate papelillo'],
    'aji chivato': ['aji chivato'],
    'ajo importado': ['ajos', 'ajo sucio', 'ajo'],
    'albahacon': ['albahaca'],
    'apio': ['apio'],
    'banano criollo': ['banano'],
    'cebolla cabezona blanca cero sin pelar': ['cebolla cabezona', 'cebolla cabezona blanca'],
    'cebolla cabezona roja': ['cebolla roja', 'cebolla cabezona roja'],
    'cebolla larga': ['cebolla junca', 'cebolla larga'],
    'cebolla puerro': ['cebolla puerro'],
    'cebollin verde': ['cebollin'],
    'champinon': ['champinon', 'champinones'],
    'cilantro': ['cilantro'],
    'coco pelado': ['coco natural', 'coco'],
    'cogollo europeo': ['lechuga bamby cogollo europeo', 'cogollo europeo'],
    'col crespa kale': ['lechuga kale', 'kale'],
    'espinaca': ['espinaca baby', 'espinaca'],
    'fresa mediana': ['fresa extra', 'fresas frescas', 'fresa'],
    'habichuela': ['habichuela'],
    'hierbabuena': ['hierbabuena'],
    'jengibre': ['jengibre natural', 'jengibre fresco', 'jengibre'],
    'kiwi importado': ['kiwi'],
    'laurel': ['laurel'],
    'lechuga batavia suelta': ['lechuga', 'lechuga batavia'],
    'lechuga crespa verde': ['lechuga verde crespa', 'lechuga crespa verde'],
    'lechuga rugula': ['rugula entera lechuga', 'rugula'],
    'limon tahiti': ['limon'],
    'limonaria': ['limonaria'],
    'lulo': ['lulo'],
    'manzana roja importada': ['manzana natural', 'manzana roja importada'],
    'manzana verde importada': ['manzana verde', 'manzana verde importada'],
    'maracuya': ['maracuya'],
    'melon': ['melon'],
    'mix lechuga asiatico': ['mix asiatico lechuga'],
    'naranja sweety': ['naranja natural', 'naranja sweet'],
    'naranja valencia': ['naranjas valencia', 'naranja valencia'],
    'oregano': ['oregano fresco', 'oregano'],
    'papa capira': ['papa capira'],
    'papa criolla cero': ['papa amarilla', 'papa criolla limpia'],
    'papa criolla mini': ['papa amarilla', 'papa criolla limpia'],
    'papa pastusa lavada': ['papa sabanera y pastusa', 'papa pastusa'],
    'papaya maradol': ['papaya', 'papaya maradol'],
    'papayuela': ['papayuela'],
    'patilla': ['patilla', 'sandia'],
    'pepino cohombro': ['pepino cohombro'],
    'perejil crespo': ['perejil'],
    'perejil liso': ['perejil'],
    'pimenton rojo institucional': ['pimenton'],
    'pina golden': ['pina natural', 'pina', 'pina gold'],
    'platano colisero': ['platano guineo verde', 'platano guineo'],
    'platano maduro': ['platano harton', 'platano', 'platano harton maduro'],
    'platano topocho': ['platano harton', 'platano', 'platano harton maduro'],
    'platano verde': ['platano harton', 'platano', 'platano harton maduro'],
    'raiz china': ['raices chinas'],
    'repollo blanco': ['repollo', 'repollo blanco', 'repollo blanco lenos'],
    'repollo morado': ['repollo', 'repollo blanco'],
    'romero': ['romero fresco', 'romero paq x 1 kg'],
    'tomate cherry': ['tomate cherry'],
    'tomate chonto': ['tomate chonto', 'tomate'],
    'tomate larga vida selecto rosado': ['tomate milano', 'tomate larga vida'],
    'tomillo': ['tomillo'],
    'zanahoria cero': ['zanahoria'],
    'zukini amarillo': ['zukini verdura', 'zukini'],
    'zukini verde': ['zukini verdura', 'zukini']
};

export interface NutresaDraftEntry {
    sipsa_price?: number;
    prima_cop?: number;
    unified_name?: string;
    client_proposed_price?: number;
    our_counterproposal?: number;
    is_frozen_override?: boolean;
    previous_price?: number;
}

export default function SpecialAgreementsModule({ embedded = false }: { embedded?: boolean } = {}) {
    const [selectedClient, setSelectedClient] = useState<SpecialModelId>('nutresa');
    const [activePeriod, setActivePeriod] = useState<string>('2026-10');
    const [agreementItems, setAgreementItems] = useState<AgreementItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [syncingSipsa, setSyncingSipsa] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedChainFilter, setSelectedChainFilter] = useState<string>('all');
    const [isSaving, setIsSaving] = useState(false);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [sortField, setSortField] = useState<SortField>('name');
    const [sortDir, setSortDir] = useState<SortDirection>('asc');
    const [activeHeaderTooltip, setActiveHeaderTooltip] = useState<string | null>(null);
    const [editingPriceDrafts, setEditingPriceDrafts] = useState<Record<string, string>>({});
    const [editingMarkupDrafts, setEditingMarkupDrafts] = useState<Record<string, string>>({});
    const [showNutresaGuide, setShowNutresaGuide] = useState<boolean>(true);
    const [hasNutresaDraft, setHasNutresaDraft] = useState<boolean>(false);
    const [consagrateModalMode, setConsagrateModalMode] = useState<'compact_approve' | 'full_roster'>('compact_approve');
    const [nutresaPresetDays, setNutresaPresetDays] = useState<number>(30);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Metadata de los 4 Modelos y Padrón de Clientes desde Supabase
    const [modelsMeta, setModelsMeta] = useState<Record<SpecialModelId, SpecialModelMetadata>>({
        nutresa: {
            id: 'nutresa',
            name: 'Grupo Nutresa (IRCC)',
            subtitle: 'El Corral • Beer Station • Leños & Carbón',
            cycle_type: 'corporativo_multimarca',
            default_duration_days: 30,
            master_quote_id: 'ab9c0c14-a27e-4317-9995-dfb4ba9bcb80',
            start_date: '2026-10-05',
            valid_until: '2026-10-31'
        },
        colsubsidio: {
            id: 'colsubsidio',
            name: 'Colsubsidio',
            subtitle: 'Restaurantes • Hoteles (Piscilago) • Sedes Recreativas',
            cycle_type: 'quincenal_corporativo',
            default_duration_days: 15,
            master_quote_id: '5afc3173-4ced-4635-a71f-56ef57e144f8',
            start_date: '2026-10-16',
            valid_until: '2026-10-31'
        },
        general_quincenal: {
            id: 'general_quincenal',
            name: 'Lista General Quincenal',
            subtitle: 'Hoteles, Clubes y Cadenas con fijación cada 15 días',
            cycle_type: 'quincenal_general',
            default_duration_days: 15,
            master_quote_id: 'b5a2abae-68f1-44fe-87a3-84b1817026db',
            start_date: '2026-10-16',
            valid_until: '2026-10-31'
        },
        general_mensual: {
            id: 'general_mensual',
            name: 'Lista General Mensual',
            subtitle: 'Colegios, Universidades y Empresas con fijación a 30 días',
            cycle_type: 'mensual_general',
            default_duration_days: 30,
            master_quote_id: '6572e7d6-4925-4576-8960-caca64a3c47f',
            start_date: '2026-10-01',
            valid_until: '2026-10-31'
        }
    });

    const [modelClientsMap, setModelClientsMap] = useState<Record<SpecialModelId, string[]>>({
        nutresa: [],
        colsubsidio: [],
        general_quincenal: [],
        general_mensual: []
    });
    const [allB2BClients, setAllB2BClients] = useState<EnrichedB2BClient[]>([]);

    // Estado del Modal de Consagración, Vigencia y Buscador Combinado Multi-Cliente
    const [isConsagrateModalOpen, setIsConsagrateModalOpen] = useState(false);
    const [modalStartDate, setModalStartDate] = useState('2026-10-16');
    const [modalEndDate, setModalEndDate] = useState('2026-10-31');
    const [selectedClientIdsForRun, setSelectedClientIdsForRun] = useState<string[]>([]);
    const [clientModalSearch, setClientModalSearch] = useState('');
    const [clientModalFilterTab, setClientModalFilterTab] = useState<ClientModalFilterTab>('roster');

    // Cambiar de tarjeta de modelo reseteando filtros incompatibles (Fix Hallazgo #5)
    const handleSelectModel = (modelId: SpecialModelId) => {
        setSelectedClient(modelId);
        setSelectedChainFilter('all');
        if (modelId !== 'nutresa' && (sortField === 'chain' || sortField === 'sipsa' || sortField === 'prima' || sortField === 'previous')) {
            setSortField('name');
        }
        if (modelId === 'nutresa' && (sortField === 'chain' || sortField === 'suggested')) {
            setSortField('name');
        }
    };

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDir('asc');
        }
    };

    // Cargar metadatos de los 4 modelos y el padrón completo de 519 clientes B2B al montar
    useEffect(() => {
        fetchModelsAndRoster();
    }, []);

    // Cargar ítems reales de Supabase al cambiar de modelo activo (deps[0] versionado para forzar HMR en React 19)
    useEffect(() => {
        loadDataForModel(selectedClient);
    }, [`${selectedClient}::v11_escenario_344_nutresa_sipsa_prima`, 'v11_escenario_344_nutresa_sipsa_prima']);

    const fetchModelsAndRoster = async () => {
        try {
            const [modelsRes, rosterRes, profilesRes, settingsRes] = await Promise.all([
                supabase.from('special_agreement_models').select('*'),
                supabase.from('special_agreement_model_clients').select('model_id, client_id, is_default_selected, last_applied_at'),
                supabase.from('profiles').select('id, company_name, contact_name, nit, parent_id, is_corporate_parent').eq('role', 'b2b_client').order('company_name').range(0, 999),
                supabase.from('app_settings').select('key, value').ilike('key', 'agreement_clients:%')
            ]);

            const quoteIdToModelId: Record<string, SpecialModelId> = {
                'ab9c0c14-a27e-4317-9995-dfb4ba9bcb80': 'nutresa',
                '5afc3173-4ced-4635-a71f-56ef57e144f8': 'colsubsidio',
                'b5a2abae-68f1-44fe-87a3-84b1817026db': 'general_quincenal',
                '6572e7d6-4925-4576-8960-caca64a3c47f': 'general_mensual'
            };

            const typedModels = (modelsRes.data || []) as DbModelRow[];
            if (typedModels.length > 0) {
                typedModels.forEach((m) => {
                    if (m.master_quote_id && m.id) {
                        quoteIdToModelId[m.master_quote_id] = m.id as SpecialModelId;
                    }
                });
                setModelsMeta(prev => {
                    const next = { ...prev };
                    typedModels.forEach((m) => {
                        const key = m.id as SpecialModelId;
                        if (next[key]) {
                            next[key] = {
                                id: key,
                                name: m.name || next[key].name,
                                subtitle: m.subtitle || next[key].subtitle,
                                cycle_type: m.cycle_type || next[key].cycle_type,
                                default_duration_days: Number(m.default_duration_days) || next[key].default_duration_days,
                                master_quote_id: m.master_quote_id || next[key].master_quote_id,
                                start_date: m.start_date || next[key].start_date,
                                valid_until: m.valid_until || next[key].valid_until
                            };
                        }
                    });
                    return next;
                });
            }

            const newMap: Record<SpecialModelId, string[]> = {
                nutresa: [],
                colsubsidio: [],
                general_quincenal: [],
                general_mensual: []
            };
            const clientSubs: Record<string, SpecialModelId[]> = {};
            const lastAppMap: Record<string, string> = {};

            const typedRoster = (rosterRes.data || []) as DbRosterRow[];
            typedRoster.forEach((r) => {
                const mId = r.model_id as SpecialModelId;
                if (newMap[mId] && !newMap[mId].includes(r.client_id)) {
                    newMap[mId].push(r.client_id);
                }
                if (!clientSubs[r.client_id]) clientSubs[r.client_id] = [];
                if (!clientSubs[r.client_id].includes(mId)) clientSubs[r.client_id].push(mId);
                if (r.last_applied_at) lastAppMap[r.client_id] = r.last_applied_at;
            });

            // Unificar también cualquier vinculación guardada en app_settings desde Acuerdos Comerciales (Single Source of Truth)
            const typedSettings = (settingsRes.data || []) as DbAppSettingRow[];
            typedSettings.forEach((s) => {
                const qId = String(s.key || '').replace('agreement_clients:', '');
                const mId = quoteIdToModelId[qId];
                if (mId && newMap[mId]) {
                    try {
                        const ids: string[] = JSON.parse(s.value || '[]');
                        ids.forEach(cid => {
                            if (!newMap[mId].includes(cid)) newMap[mId].push(cid);
                            if (!clientSubs[cid]) clientSubs[cid] = [];
                            if (!clientSubs[cid].includes(mId)) clientSubs[cid].push(mId);
                        });
                    } catch (parseErr) {
                        console.warn('Error parseando agreement_clients en app_settings:', parseErr);
                    }
                }
            });

            setModelClientsMap(newMap);

            // Enriquecer los 519 clientes B2B (94 Casas Matrices + 425 Sucursales) con relación Casa Matriz -> Sucursales
            const rawProfiles = (profilesRes.data || []) as DbProfileRow[];
            const branchCounts: Record<string, number> = {};
            const parentNames: Record<string, string> = {};

            rawProfiles.forEach((p) => {
                parentNames[p.id] = p.company_name || p.contact_name || 'Casa Matriz';
                if (p.parent_id) {
                    branchCounts[p.parent_id] = (branchCounts[p.parent_id] || 0) + 1;
                }
            });

            const enriched: EnrichedB2BClient[] = rawProfiles.map((p) => {
                const isSucursal = Boolean(p.parent_id);
                return {
                    id: p.id,
                    company_name: p.company_name || p.contact_name || 'Cliente sin nombre',
                    contact_name: p.contact_name,
                    nit: p.nit,
                    parent_id: p.parent_id,
                    isMatriz: !isSucursal,
                    isSucursal,
                    parentName: isSucursal && p.parent_id ? (parentNames[p.parent_id] || 'Casa Matriz') : null,
                    branchCount: !isSucursal ? (branchCounts[p.id] || 0) : 0,
                    subscribedModels: clientSubs[p.id] || [],
                    lastAppliedAt: lastAppMap[p.id] || null
                };
            });

            setAllB2BClients(enriched);
        } catch (err) {
            console.error('Error cargando modelos y padrón de clientes:', err);
        }
    };

    const saveNutresaDraftToDb = async (itemsToSave: AgreementItem[]) => {
        try {
            const payload: Record<string, NutresaDraftEntry> = {};
            itemsToSave.forEach(it => {
                const key = it.quote_item_id || it.product_id || it.id;
                payload[key] = {
                    sipsa_price: it.sipsa_price || 0,
                    prima_cop: it.prima_cop || 0,
                    unified_name: it.unified_name || '',
                    client_proposed_price: it.client_proposed_price || 0,
                    our_counterproposal: it.our_counterproposal || 0,
                    is_frozen_override: Boolean(it.is_frozen_override),
                    previous_price: it.previous_price || 0
                };
            });
            await supabase.from('app_settings').upsert({
                key: 'nutresa_negotiation_draft',
                value: JSON.stringify(payload),
                description: 'Borrador activo de negociación mensual Grupo Nutresa (SIPSA + Prima y precios congelados manualmente)'
            });
            setHasNutresaDraft(true);
        } catch (err) {
            console.warn('Error guardando borrador de negociación Nutresa:', err);
        }
    };

    const handleDiscardNutresaDraft = async () => {
        try {
            await supabase.from('app_settings').delete().eq('key', 'nutresa_negotiation_draft');
            setHasNutresaDraft(false);
            await loadDataForModel('nutresa');
            setSuccessMsg('Borrador de negociación descartado. Se restauraron los precios vigentes del último acuerdo consagrado.');
            setTimeout(() => setSuccessMsg(null), 4000);
        } catch (err) {
            console.error('Error descartando borrador Nutresa:', err);
        }
    };

    const loadDataForModel = async (modelId: SpecialModelId) => {
        setLoading(true);
        try {
            // 1. Consultar 100% desde Supabase: catálogo oficial, matriz de costos, precios, reglas de Lista Institucional Dinámica y metadatos Nutresa
            const [prodsRes, matrixRes, sipsaDictRes, instRulesRes, modelRowRes, nutresaChainsRes, nutresaMetaRes, nutresaDraftRes] = await Promise.all([
                supabase.from('products').select('id, name, sku, accounting_id, category, unit_of_measure, base_price, iva_rate, theoretical_shrinkage_pct').eq('is_active', true),
                supabase.from('commercial_cost_matrix').select('product_id, manual_cost').eq('is_active', true),
                supabase.from('pricing_model_prices').select('product_id, price').eq('model_id', 'd90a91e5-827c-473d-9d4f-3e28c7c91e15'),
                supabase.from('pricing_rules').select('product_id, margin_adjustment').eq('model_id', 'd90a91e5-827c-473d-9d4f-3e28c7c91e15'),
                supabase.from('special_agreement_models').select('*').eq('id', modelId).maybeSingle(),
                modelId === 'nutresa'
                    ? supabase.from('app_settings').select('value').eq('key', 'nutresa_sku_chains').maybeSingle()
                    : Promise.resolve({ data: null }),
                modelId === 'nutresa'
                    ? supabase.from('app_settings').select('value').eq('key', 'nutresa_sipsa_prima_meta').maybeSingle()
                    : Promise.resolve({ data: null }),
                modelId === 'nutresa'
                    ? supabase.from('app_settings').select('value').eq('key', 'nutresa_negotiation_draft').maybeSingle()
                    : Promise.resolve({ data: null })
            ]);

            let nutresaChainMap: Record<string, string> = {};
            if (nutresaChainsRes.data?.value) {
                try {
                    nutresaChainMap = JSON.parse(String(nutresaChainsRes.data.value)) as Record<string, string>;
                } catch (err) {
                    console.warn('Error parseando nutresa_sku_chains:', err);
                }
            }

            let nutresaSavedMeta: Record<string, NutresaDraftEntry> = {};
            if (nutresaMetaRes.data?.value) {
                try {
                    nutresaSavedMeta = JSON.parse(String(nutresaMetaRes.data.value)) as Record<string, NutresaDraftEntry>;
                } catch (err) {
                    console.warn('Error parseando nutresa_sipsa_prima_meta:', err);
                }
            }

            let nutresaActiveDraft: Record<string, NutresaDraftEntry> | null = null;
            if (nutresaDraftRes.data?.value) {
                try {
                    const parsedDraft = JSON.parse(String(nutresaDraftRes.data.value)) as Record<string, NutresaDraftEntry>;
                    if (parsedDraft && Object.keys(parsedDraft).length > 0) {
                        nutresaActiveDraft = parsedDraft;
                    }
                } catch (err) {
                    console.warn('Error parseando nutresa_negotiation_draft:', err);
                }
            }
            if (modelId === 'nutresa') {
                setHasNutresaDraft(Boolean(nutresaActiveDraft));
            }

            const dbProducts = (prodsRes.data || []) as DbProductRow[];
            const costMap = new Map<string, number>();
            ((matrixRes.data || []) as DbCostMatrixRow[]).forEach((m) => {
                if (Number(m.manual_cost) > 0) costMap.set(m.product_id, Number(m.manual_cost));
            });

            const generalPriceMap = new Map<string, number>();
            ((sipsaDictRes.data || []) as DbPriceRow[]).forEach((gp) => {
                if (Number(gp.price) > 0) generalPriceMap.set(gp.product_id, Number(gp.price));
            });

            const instRuleMap = new Map<string, number>();
            ((instRulesRes.data || []) as DbRuleRow[]).forEach((r) => {
                if (r.margin_adjustment !== null && r.margin_adjustment !== undefined) {
                    instRuleMap.set(r.product_id, Number(r.margin_adjustment));
                }
            });

            const prodById = new Map<string, DbProductRow>();
            const prodByNormName = new Map<string, DbProductRow>();
            dbProducts.forEach((p) => {
                prodById.set(p.id, p);
                prodByNormName.set(normalizeSearchStr(p.name), p);
            });

            const typedModelRow = modelRowRes.data as DbModelRow | null;
            const masterQuoteId = typedModelRow?.master_quote_id || modelsMeta[modelId]?.master_quote_id;

            // 2. Traer quote_items reales del Acuerdo Maestro en Supabase (Cero Mocks: Nutresa=66, Colsubsidio=252, Quincenal=388, Mensual=388)
            let dbQuoteItems: DbQuoteItemRow[] = [];
            if (masterQuoteId) {
                const { data: qItems } = await supabase
                    .from('quote_items')
                    .select('id, product_id, product_name, quantity, cost_basis, margin_percent, unit_price, iva_rate')
                    .eq('quote_id', masterQuoteId)
                    .order('product_name');
                dbQuoteItems = (qItems || []) as DbQuoteItemRow[];
            }

            // 2.1 Consultar demanda real de los clientes suscritos al modelo desde la última verificación (ciclo)
            let clientIds = modelClientsMap[modelId] || [];
            if (clientIds.length === 0) {
                const { data: directRoster } = await supabase
                    .from('special_agreement_model_clients')
                    .select('client_id')
                    .eq('model_id', modelId);
                clientIds = (directRoster || []).map(r => r.client_id);
            }

            const cycleDays = modelsMeta[modelId]?.default_duration_days || (modelId === 'general_mensual' ? 30 : 15);
            const evaluationWindowDays = Math.max(cycleDays * 2, 45);
            const cycleStartIso = new Date(Date.now() - evaluationWindowDays * 86400000).toISOString();

            const demandMap = new Map<string, { volume: number; ordersCount: number; revenue: number }>();
            if (clientIds.length > 0) {
                const { data: modelOrders } = await supabase
                    .from('orders')
                    .select('id')
                    .in('profile_id', clientIds)
                    .gte('created_at', cycleStartIso)
                    .neq('status', 'cancelled');

                const modelOrderIds = (modelOrders || []).map(o => o.id);
                if (modelOrderIds.length > 0) {
                    for (let i = 0; i < modelOrderIds.length; i += 80) {
                        const slice = modelOrderIds.slice(i, i + 80);
                        const { data: bItems } = await supabase
                            .from('order_items')
                            .select('product_id, quantity, unit_price')
                            .in('order_id', slice);

                        if (bItems) {
                            bItems.forEach(it => {
                                if (!it.product_id) return;
                                if (!demandMap.has(it.product_id)) {
                                    demandMap.set(it.product_id, { volume: 0, ordersCount: 0, revenue: 0 });
                                }
                                const rec = demandMap.get(it.product_id)!;
                                const qty = Number(it.quantity || 0);
                                const price = Number(it.unit_price || 0);
                                rec.volume += qty;
                                rec.ordersCount += 1;
                                rec.revenue += qty * price;
                            });
                        }
                    }
                }
            }

            const mappedFromDb: AgreementItem[] = dbQuoteItems.map((qi, idx) => {
                const prod = prodById.get(qi.product_id) || prodByNormName.get(normalizeSearchStr(qi.product_name));
                const currentPrice = Number(qi.unit_price) || 0;
                const realCost = (prod && costMap.get(prod.id)) || (Number(qi.cost_basis) > 0 ? Number(qi.cost_basis) : 0);

                // Regla de Utilidad Institucional específica del SKU desde pricing_rules en Supabase.
                const explicitRule = prod ? instRuleMap.get(prod.id) : undefined;
                const instRuleMargin = explicitRule !== undefined
                    ? Number(explicitRule)
                    : (realCost > 0 && currentPrice > realCost
                        ? Math.round(((currentPrice - realCost) / realCost) * 100)
                        : 0);

                // Precio vivo de Lista Institucional Dinámica (Costo Matriz * (1 + % Regla Inst.) redondeado a $50 COP)
                const instDynamicPrice = realCost > 0
                    ? Math.ceil((realCost * (1 + instRuleMargin / 100)) / 50) * 50
                    : ((prod && generalPriceMap.get(prod.id)) || currentPrice);

                const catCode = String(prod?.category || '').toUpperCase();
                const isStablePantry = catCode === 'DE' || catCode === 'AB';
                const freezeBufferPct = (modelId === 'general_quincenal' || modelId === 'colsubsidio')
                    ? (isStablePantry ? 2 : 3)
                    : (isStablePantry ? 4 : 6);

                const rawTechnicalSuggested = realCost > 0
                    ? realCost * (1 + (instRuleMargin + freezeBufferPct) / 100)
                    : currentPrice;
                const suggested = Math.ceil(rawTechnicalSuggested / 50) * 50;

                const statusChange: 'SUBIÓ' | 'BAJÓ' | 'IGUAL' = suggested > currentPrice ? 'SUBIÓ' : (suggested < currentPrice ? 'BAJÓ' : 'IGUAL');
                const resolvedProductId = qi.product_id || prod?.id || '';
                const demandRec = demandMap.get(resolvedProductId) || { volume: 0, ordersCount: 0, revenue: 0 };
                const demandVol = Math.round(demandRec.volume * 10) / 10;

                const itemKey = qi.id || resolvedProductId || `${modelId}-${idx}`;
                const savedMeta = modelId === 'nutresa' ? (nutresaSavedMeta[qi.id] || nutresaSavedMeta[resolvedProductId]) : undefined;
                const draftEntry = modelId === 'nutresa' && nutresaActiveDraft ? (nutresaActiveDraft[qi.id] || nutresaActiveDraft[resolvedProductId]) : undefined;

                const sipsaVal = draftEntry?.sipsa_price !== undefined
                    ? draftEntry.sipsa_price
                    : (savedMeta?.sipsa_price ?? 0);
                const primaVal = draftEntry?.prima_cop !== undefined
                    ? draftEntry.prima_cop
                    : (savedMeta?.prima_cop ?? 0);
                const unifiedVal = draftEntry?.unified_name !== undefined
                    ? draftEntry.unified_name
                    : (savedMeta?.unified_name ?? '');
                const prevAgreementPrice = currentPrice;
                const proposedPrice = draftEntry?.client_proposed_price && draftEntry.client_proposed_price > 0
                    ? draftEntry.client_proposed_price
                    : currentPrice;
                const counterPrice = draftEntry?.our_counterproposal && draftEntry.our_counterproposal > 0
                    ? draftEntry.our_counterproposal
                    : (currentPrice > 0 ? currentPrice : suggested);

                return {
                    id: itemKey,
                    quote_item_id: qi.id,
                    product_id: resolvedProductId,
                    client_code: prod?.accounting_id || prod?.sku || (idx + 1),
                    raw_name: qi.product_name || prod?.name || 'Producto',
                    unified_name: unifiedVal,
                    mapped_sku: prod?.sku || (prod?.accounting_id ? String(prod.accounting_id) : ''),
                    chain_name: modelId === 'nutresa'
                        ? (qi.chain_name || nutresaChainMap[resolvedProductId] || 'El Corral')
                        : undefined,
                    unit: prod?.unit_of_measure || 'KG',
                    monthly_consumption_kg: demandVol > 0 ? demandVol : (Number(qi.quantity) || 0),
                    demand_volume: demandVol,
                    demand_orders_count: demandRec.ordersCount,
                    demand_revenue: Math.round(demandRec.revenue),
                    baseline_price: instDynamicPrice,
                    corabastos_cost: realCost,
                    inst_rule_margin_pct: instRuleMargin,
                    sipsa_price: sipsaVal,
                    prima_cop: primaVal,
                    client_proposed_price: proposedPrice,
                    previous_price: prevAgreementPrice,
                    suggested_price: suggested,
                    our_counterproposal: counterPrice,
                    is_frozen_override: Boolean(draftEntry?.is_frozen_override),
                    status_change: statusChange,
                    iva_rate: Number(prod?.iva_rate ?? qi.iva_rate ?? 0)
                };
            });

            setAgreementItems(mappedFromDb);
        } catch (err) {
            console.error('Error cargando datos del modelo:', err);
        } finally {
            setLoading(false);
        }
    };

    // Sincronización SODA DANE en Vivo (datos.gov.co) — 100% datos reales sin fallbacks inventados (Cero Mocks)
    const handleSyncSipsaOnline = async () => {
        setSyncingSipsa(true);
        try {
            const sodaMap = new Map<string, number>();
            const res = await fetch('https://www.datos.gov.co/resource/fc5x-s5cf.json?$limit=500');
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    (data as SodaRow[]).forEach((row) => {
                        const name = normalizeSearchStr(row.producto || row.alimento || row.articulo || '');
                        const price = Number(row.precio_promedio || row.precio || 0);
                        if (name && price > 0) sodaMap.set(name, price);
                    });
                }
            }

            let matchedCount = 0;
            setAgreementItems(prev => prev.map(item => {
                const norm = normalizeSearchStr(item.raw_name);
                const liveSipsa = sodaMap.get(norm) || 0;
                if (liveSipsa > 0) {
                    matchedCount++;
                    const rulePct = item.inst_rule_margin_pct ?? 0;
                    const bufferPct = (selectedClient === 'general_mensual' || selectedClient === 'nutresa') ? 6 : 3;
                    const newSuggested = Math.max(
                        item.corabastos_cost * (1 + (rulePct + bufferPct) / 100),
                        liveSipsa * 1.15
                    );
                    return {
                        ...item,
                        sipsa_price: Math.round(liveSipsa),
                        suggested_price: Math.ceil(newSuggested / 50) * 50
                    };
                }
                return item;
            }));

            setSuccessMsg(
                matchedCount > 0
                    ? `API SODA DANE (datos.gov.co) consultada: ${matchedCount} productos cruzados con precio oficial mayorista.`
                    : `API SODA DANE consultada en vivo (${sodaMap.size} registros recibidos del portal datos.gov.co).`
            );
            setTimeout(() => setSuccessMsg(null), 4500);
        } catch (err) {
            console.error('Error sincronizando SIPSA:', err);
        } finally {
            setSyncingSipsa(false);
        }
    };

    // Procesar carga de Excel cruzando contra los ítems reales de Supabase en memoria (Cero Mocks)
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const XLSX = await import('xlsx');
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

                if (!jsonRows || jsonRows.length === 0) {
                    alert('El archivo no contiene filas válidas.');
                    return;
                }

                // MODO ESPECIAL GRUPO NUTRESA (IRCC): Cruza el Excel mensual ("Zona 3 - Investments Cortes") contra los 66 SKUs de Nutresa
                if (selectedClient === 'nutresa') {
                    const extractNutresaRowValues = (row: Record<string, unknown>) => {
                        let rawName = '';
                        let unifiedName = '';
                        let codItem = '';
                        let primaVal = 0;
                        let sipsaVal = 0;
                        let precioVal = 0;
                        let counterVal = 0;

                        for (const [k, v] of Object.entries(row)) {
                            const kt = k.trim();
                            if (/^(nombre\s*item|producto|descripcion)$/i.test(kt)) {
                                rawName = String(v ?? '').trim();
                            } else if (/^descripci[oó]n\s*unificada$/i.test(kt)) {
                                unifiedName = String(v ?? '').trim();
                            } else if (/^(c[oó]d\s*item|c[oó]digo|material|sku\s*frufresco)$/i.test(kt)) {
                                codItem = String(v ?? '').trim();
                            } else if (/^prima\b/i.test(kt)) {
                                primaVal = Number(v) || 0;
                            } else if (/^\$?\s*sipsa\b/i.test(kt)) {
                                sipsaVal = Number(v) || 0;
                            } else if (/^(contrapropuesta|nuevo\s*precio)/i.test(kt)) {
                                counterVal = Number(v) || 0;
                            } else if (/^(precio\b|propuesta\b|nue\s*pre)/i.test(kt)) {
                                precioVal = Number(v) || 0;
                            }
                        }

                        const computedProposed = precioVal > 0 ? precioVal : (sipsaVal + primaVal);
                        return {
                            rawName,
                            unifiedName,
                            codItem,
                            prima: Math.round(primaVal),
                            sipsa: Math.round(sipsaVal),
                            proposed: Math.round(computedProposed),
                            counter: counterVal > 0 ? Math.round(counterVal) : 0
                        };
                    };

                    const excelByNorm = new Map<string, ReturnType<typeof extractNutresaRowValues>>();
                    const excelByCode = new Map<string, ReturnType<typeof extractNutresaRowValues>>();

                    jsonRows.forEach(r => {
                        const info = extractNutresaRowValues(r);
                        const n1 = normalizeSearchStr(info.rawName);
                        const n2 = normalizeSearchStr(info.unifiedName);
                        if (n1 && !excelByNorm.has(n1)) excelByNorm.set(n1, info);
                        if (n2 && n2 !== 'no se mide' && !excelByNorm.has(n2)) excelByNorm.set(n2, info);
                        if (info.codItem && !excelByCode.has(info.codItem.toUpperCase())) {
                            excelByCode.set(info.codItem.toUpperCase(), info);
                        }
                    });

                    let matchedCount = 0;
                    const updatedItems: AgreementItem[] = agreementItems.map(item => {
                        const normItemName = normalizeSearchStr(item.raw_name);
                        const candidates = [normItemName, ...(NUTRESA_ALIAS_MAP[normItemName] || [])];
                        let matchedExcel: ReturnType<typeof extractNutresaRowValues> | undefined;

                        for (const cand of candidates) {
                            if (excelByNorm.has(cand)) {
                                matchedExcel = excelByNorm.get(cand);
                                break;
                            }
                        }
                        if (!matchedExcel && item.client_code) {
                            matchedExcel = excelByCode.get(String(item.client_code).toUpperCase());
                        }

                        if (!matchedExcel) return item;

                        matchedCount++;
                        const newProposed = matchedExcel.proposed > 0 ? matchedExcel.proposed : item.client_proposed_price;
                        const preservedPrevious = item.previous_price && item.previous_price > 0
                            ? item.previous_price
                            : item.client_proposed_price;
                        // Si el usuario ya había congelado manualmente un precio en esta sesión, lo respetamos; si viene contrapropuesta explícita o es planilla fresca, se alinea a la propuesta de Nutresa
                        const newCounter = item.is_frozen_override
                            ? item.our_counterproposal
                            : (matchedExcel.counter > 0 ? matchedExcel.counter : newProposed);

                        return {
                            ...item,
                            unified_name: matchedExcel.unifiedName || item.unified_name,
                            sipsa_price: matchedExcel.sipsa,
                            prima_cop: matchedExcel.prima,
                            previous_price: preservedPrevious,
                            client_proposed_price: newProposed,
                            our_counterproposal: newCounter,
                            status_change: newCounter > preservedPrevious ? 'SUBIÓ' : (newCounter < preservedPrevious ? 'BAJÓ' : 'IGUAL')
                        };
                    });

                    setAgreementItems(updatedItems);
                    await saveNutresaDraftToDb(updatedItems);
                    setSuccessMsg(
                        `Planilla Nutresa cargada (${wsname}): ${matchedCount} de ${updatedItems.length} SKUs cruzados con $ SIPSA + Prima y Acuerdo Anterior conservado. Ajusta cualquier precio para congelarlo antes de consagrar.`
                    );
                    setTimeout(() => setSuccessMsg(null), 6500);
                    return;
                }

                // Indexar los ítems reales actuales por SKU, código y nombre normalizado para conservar costos y metadatos reales de BD
                const existingBySku = new Map<string, AgreementItem>();
                const existingByName = new Map<string, AgreementItem>();
                agreementItems.forEach(item => {
                    if (item.mapped_sku) existingBySku.set(String(item.mapped_sku).toUpperCase(), item);
                    if (item.client_code) existingBySku.set(String(item.client_code).toUpperCase(), item);
                    existingByName.set(normalizeSearchStr(item.raw_name), item);
                });

                const parsed: AgreementItem[] = jsonRows.map((row, i): AgreementItem => {
                    const rawName = String(row['Nombre Item'] ?? row['Descripcion'] ?? row['Producto'] ?? row['PRODUCTO'] ?? '').trim();
                    const skuRaw = String(row['SKU FruFresco'] ?? row['Material'] ?? row['Código'] ?? row['Cód Item'] ?? '').trim();
                    const existing = existingBySku.get(skuRaw.toUpperCase()) || existingByName.get(normalizeSearchStr(rawName));

                    const realCost = existing?.corabastos_cost ?? (Number(row['COSTO CORABASTOS'] ?? row['Costo'] ?? 0) || 0);
                    const rulePct = existing?.inst_rule_margin_pct ?? 0;
                    const baseline = existing?.baseline_price ?? (realCost > 0 ? Math.ceil((realCost * (1 + rulePct / 100)) / 50) * 50 : 0);
                    const sipsa = Number(row['$ SIPSA Anterior'] ?? row['$ SIPSA'] ?? existing?.sipsa_price ?? 0) || 0;
                    const prima = Number(row['Prima $ COP'] ?? row['Prima $  COP '] ?? existing?.prima_cop ?? 0) || 0;
                    const proposed = Number(
                        row['PRECIO PROPUESTO CLIENTE'] ??
                        row['PRECIO VIGENTE ANTERIOR'] ??
                        row['NUE PRE'] ??
                        (prima + sipsa > 0 ? prima + sipsa : existing?.client_proposed_price) ??
                        0
                    ) || 0;
                    const suggested = existing?.suggested_price ?? (realCost > 0 ? Math.ceil((realCost * (1 + rulePct / 100)) / 50) * 50 : proposed);
                    const counter = Number(
                        row['Contrapropuesta FruFresco'] ??
                        row['CONTRAPROPUESTA FRUFRESCO'] ??
                        row['NUEVO PRECIO A FIJAR'] ??
                        row['Precio Final'] ??
                        proposed
                    ) || suggested;

                    return {
                        id: existing?.id || `${selectedClient}-upload-${i}`,
                        quote_item_id: existing?.quote_item_id,
                        product_id: existing?.product_id,
                        client_code: skuRaw || existing?.client_code || (i + 1),
                        raw_name: rawName || existing?.raw_name || `Fila ${i + 1}`,
                        unified_name: '',
                        mapped_sku: existing?.mapped_sku || skuRaw,
                        chain_name: existing?.chain_name || (row['Nombre Cadena o Compañía'] ? String(row['Nombre Cadena o Compañía']).trim() : undefined),
                        unit: existing?.unit || String(row['U.M'] ?? 'KG').trim(),
                        monthly_consumption_kg: existing?.monthly_consumption_kg || 1,
                        baseline_price: baseline,
                        corabastos_cost: realCost,
                        inst_rule_margin_pct: rulePct,
                        sipsa_price: sipsa,
                        prima_cop: prima > 0 ? prima : existing?.prima_cop,
                        client_proposed_price: proposed,
                        previous_price: existing?.previous_price ?? proposed,
                        suggested_price: suggested,
                        our_counterproposal: counter,
                        status_change: counter > proposed ? 'SUBIÓ' : (counter < proposed ? 'BAJÓ' : 'IGUAL'),
                        iva_rate: existing?.iva_rate ?? 0
                    };
                }).filter(r => Boolean(r.raw_name));

                if (parsed.length > 0) {
                    setAgreementItems(parsed);
                    setSuccessMsg(`Importadas ${parsed.length} filas cruzadas contra el catálogo de Supabase en ${modelsMeta[selectedClient].name}.`);
                    setTimeout(() => setSuccessMsg(null), 4000);
                }
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : 'Error desconocido';
                alert('Error al leer el archivo Excel: ' + message);
            }
        };
        reader.readAsBinaryString(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // Exportar contrapropuesta / lista oficial con paridad 1:1 y fórmula G+H en Nutresa
    const handleExportCounterproposal = async () => {
        if (agreementItems.length === 0) return;
        const XLSX = await import('xlsx');

        if (selectedClient === 'nutresa') {
            const exportData = agreementItems.map((item) => ({
                'Key': `IRCC_${item.client_code}`,
                'Cadena': 'IRCC',
                'Nombre Cadena o Compañía': item.chain_name || 'El Corral',
                'Cód Item': item.client_code,
                'Nombre Item': item.raw_name,
                'DESCRIPCIÓN UNIFICADA': item.unified_name || 'No se mide',
                ' Prima $  COP ': item.our_counterproposal - (item.sipsa_price || 0),
                ' $ SIPSA Anterior': item.sipsa_price || 0,
                'Precio Propuesto Nutresa': item.client_proposed_price,
                'Acuerdo Anterior': item.previous_price || 0,
                'Contrapropuesta FruFresco': item.our_counterproposal,
                'SKU FruFresco': item.mapped_sku || ''
            }));

            const ws = XLSX.utils.json_to_sheet(exportData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, activePeriod || 'Acuerdo');
            XLSX.writeFile(wb, `ACUERDO_NUTRESA_${activePeriod}.xlsx`);
        } else {
            const exportData = agreementItems.map(item => ({
                'Material': item.client_code,
                'Descripcion': item.raw_name,
                'SKU FruFresco': item.mapped_sku || '',
                'U.M': item.unit,
                'COSTO CORABASTOS': item.corabastos_cost,
                'PRECIO PROPUESTO CLIENTE': item.client_proposed_price,
                'CONTRAPROPUESTA FRUFRESCO': item.our_counterproposal,
                'ESTADO': item.our_counterproposal >= item.client_proposed_price ? 'SUBIÓ' : 'BAJÓ',
                'DIFERENCIA': item.our_counterproposal - item.client_proposed_price
            }));

            const ws = XLSX.utils.json_to_sheet(exportData);
            const wb = XLSX.utils.book_new();
            const sheetName = selectedClient === 'colsubsidio' ? 'LIST PRE INVESMTES' : modelsMeta[selectedClient].name.slice(0, 30);
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
            XLSX.writeFile(wb, `LISTA_${selectedClient.toUpperCase()}_${activePeriod}.xlsx`);
        }
    };

    // Aplicar precio sugerido a toda la contrapropuesta
    const handleApplyAllSuggested = () => {
        setEditingPriceDrafts({});
        setEditingMarkupDrafts({});
        setAgreementItems(prev => prev.map(item => ({
            ...item,
            our_counterproposal: item.suggested_price
        })));
        setSuccessMsg('Sugeridos inteligentes aplicados a todos los productos de la lista activa.');
        setTimeout(() => setSuccessMsg(null), 3000);
    };

    // Mantener / Restaurar precios del ciclo anterior
    const handleKeepPreviousPrices = () => {
        setEditingPriceDrafts({});
        setEditingMarkupDrafts({});
        setAgreementItems(prev => prev.map(item => ({
            ...item,
            our_counterproposal: item.client_proposed_price
        })));
        setSuccessMsg('Precios restaurados a los valores vigentes de la lista anterior.');
        setTimeout(() => setSuccessMsg(null), 3000);
    };

    // Abrir Modal de Consagración y Vigencia pre-cargando los clientes suscritos al modelo
    const handleOpenConsagrateModal = (mode: 'compact_approve' | 'full_roster' = 'compact_approve') => {
        const currentMeta = modelsMeta[selectedClient];
        const todayStr = getBogotaDateStr();
        const start = selectedClient === 'nutresa' ? todayStr : (currentMeta.start_date || todayStr);
        let end = currentMeta.valid_until;
        if (selectedClient === 'nutresa' || !end || end < todayStr) {
            const d = new Date(start + 'T12:00:00');
            const defaultDays = selectedClient === 'nutresa' ? 30 : (currentMeta.default_duration_days || 15);
            d.setDate(d.getDate() + defaultDays);
            end = d.toISOString().split('T')[0];
            setNutresaPresetDays(defaultDays);
        }
        setModalStartDate(start);
        setModalEndDate(end);
        setConsagrateModalMode(selectedClient === 'nutresa' ? mode : 'full_roster');

        // Pre-cargar automáticamente todos los clientes que pertenecen al padrón de este modelo
        const rosterIds = modelClientsMap[selectedClient] || [];
        setSelectedClientIdsForRun(rosterIds);
        setClientModalSearch('');
        setClientModalFilterTab('roster');
        setIsConsagrateModalOpen(true);
    };

    // Presets de Vigencia Rápida (15, 30, 60, 90 días) idénticos al modal de Cotizaciones
    const applyNutresaDaysPreset = (days: number) => {
        setNutresaPresetDays(days);
        const base = modalStartDate ? new Date(modalStartDate + 'T12:00:00') : new Date();
        base.setDate(base.getDate() + days);
        setModalEndDate(base.toISOString().split('T')[0]);
    };

    // Presets rápidos de fechas en el modal general
    const applyDatePreset = (preset: '15d' | '30d' | 'end_of_month' | 'next_fortnight') => {
        const start = new Date(modalStartDate + 'T12:00:00');
        if (preset === '15d') {
            const end = new Date(start);
            end.setDate(end.getDate() + 15);
            setModalEndDate(end.toISOString().split('T')[0]);
        } else if (preset === '30d') {
            const end = new Date(start);
            end.setDate(end.getDate() + 30);
            setModalEndDate(end.toISOString().split('T')[0]);
        } else if (preset === 'end_of_month') {
            const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
            setModalEndDate(end.toISOString().split('T')[0]);
        } else if (preset === 'next_fortnight') {
            const day = start.getDate();
            if (day <= 15) {
                const fifteenth = new Date(start.getFullYear(), start.getMonth(), 15);
                setModalEndDate(fifteenth.toISOString().split('T')[0]);
            } else {
                const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
                setModalEndDate(end.toISOString().split('T')[0]);
            }
        }
    };

    // Marcar / Desmarcar un cliente o Casa Matriz con cascada automática a sus sucursales vinculadas (Herencia de Imagen 2)
    const toggleClientSelection = (clientId: string, includeBranches?: boolean) => {
        const clientObj = allB2BClients.find(c => c.id === clientId);
        const shouldCascade = includeBranches !== undefined ? includeBranches : Boolean(clientObj?.isMatriz);
        const branchIds = shouldCascade
            ? allB2BClients.filter(c => c.parent_id === clientId).map(c => c.id)
            : [];
        const targetIds = [clientId, ...branchIds];

        setSelectedClientIdsForRun(prev => {
            const isCurrentlyChecked = prev.includes(clientId);
            if (isCurrentlyChecked) {
                return prev.filter(id => !targetIds.includes(id));
            } else {
                const merged = new Set([...prev, ...targetIds]);
                return Array.from(merged);
            }
        });
    };

    // Confirmar y ejecutar la Consagración Real en Base de Datos (Fuente Única de Verdad: quotes + quote_items + special_agreement_model_clients + app_settings + profiles)
    const handleConfirmConsagration = async () => {
        setIsSaving(true);
        try {
            const currentMeta = modelsMeta[selectedClient];
            const masterQuoteId = currentMeta.master_quote_id;
            const previousRosterIds = modelClientsMap[selectedClient] || [];

            // Expandir automáticamente las sucursales de cualquier Casa Matriz marcada para garantizar herencia 1 a N
            const expandedSet = new Set<string>(selectedClientIdsForRun);
            allB2BClients.forEach(c => {
                if (c.parent_id && expandedSet.has(c.parent_id)) {
                    expandedSet.add(c.id);
                }
            });
            const finalClientIds = Array.from(expandedSet);
            const removedClientIds = previousRosterIds.filter(cid => !expandedSet.has(cid));

            // 1. Actualizar los precios (unit_price y cost_basis) en quote_items del Acuerdo Maestro
            if (masterQuoteId) {
                const itemsWithQuoteItemId = agreementItems.filter(i => Boolean(i.quote_item_id));
                const batchSize = 50;
                for (let i = 0; i < itemsWithQuoteItemId.length; i += batchSize) {
                    const chunk = itemsWithQuoteItemId.slice(i, i + batchSize);
                    await Promise.all(chunk.map(item => {
                        const unitPrice = Number(item.our_counterproposal) || 0;
                        const costBasis = Number(item.corabastos_cost) || 0;
                        const marginPct = unitPrice > 0 ? Number((((unitPrice - costBasis) / unitPrice) * 100).toFixed(2)) : 0;
                        const rate = Number(item.iva_rate) || 0;
                        const ivaAmount = rate > 0 ? Number((unitPrice * (rate / (100 + rate))).toFixed(2)) : 0;
                        return supabase
                            .from('quote_items')
                            .update({
                                unit_price: unitPrice,
                                cost_basis: costBasis,
                                margin_percent: marginPct,
                                iva_amount: ivaAmount,
                                total_price: unitPrice
                            })
                            .eq('id', item.quote_item_id);
                    }));
                }
            }

            // 1.1 Si es Grupo Nutresa, persistir los metadatos consagrados de SIPSA + Prima y limpiar el borrador temporal
            if (selectedClient === 'nutresa') {
                const consecratedMeta: Record<string, NutresaDraftEntry> = {};
                agreementItems.forEach(it => {
                    const key = it.quote_item_id || it.product_id || it.id;
                    consecratedMeta[key] = {
                        sipsa_price: it.sipsa_price || 0,
                        prima_cop: it.prima_cop || 0,
                        unified_name: it.unified_name || '',
                        previous_price: it.previous_price || it.client_proposed_price || 0,
                        client_proposed_price: it.our_counterproposal || 0,
                        our_counterproposal: it.our_counterproposal || 0,
                        is_frozen_override: false
                    };
                });
                await supabase.from('app_settings').upsert({
                    key: 'nutresa_sipsa_prima_meta',
                    value: JSON.stringify(consecratedMeta),
                    description: 'Metadatos consagrados de SIPSA + Prima del último acuerdo oficial de Grupo Nutresa'
                });
                await supabase.from('app_settings').delete().eq('key', 'nutresa_negotiation_draft');
                setHasNutresaDraft(false);
                setAgreementItems(prev => prev.map(it => ({
                    ...it,
                    previous_price: it.our_counterproposal,
                    client_proposed_price: it.our_counterproposal,
                    is_frozen_override: false
                })));
            }

            // 2. Depurar clientes desmarcados del padrón del modelo para mantener paridad exacta
            const { error: delErr } = await supabase
                .from('special_agreement_model_clients')
                .delete()
                .eq('model_id', selectedClient);
            if (delErr) throw delErr;

            // 3. Ejecutar función RPC atómica `apply_special_agreement_to_clients` en PostgreSQL
            const { error: rpcErr } = await supabase.rpc('apply_special_agreement_to_clients', {
                p_model_id: selectedClient,
                p_start_date: modalStartDate,
                p_valid_until: modalEndDate,
                p_selected_client_ids: finalClientIds
            });

            if (rpcErr) throw rpcErr;

            // 4. Sincronizar explícitamente quotes, app_settings, depurar fotocopias individuales antiguas en todos los modelos y limpiar desvinculados (SPEC.md §7.5.6 & Escenario 237.4)
            if (masterQuoteId) {
                await supabase
                    .from('quotes')
                    .update({
                        start_date: modalStartDate,
                        valid_until: modalEndDate,
                        status: 'agreement'
                    })
                    .eq('id', masterQuoteId);

                const { error: appSetErr } = await supabase
                    .from('app_settings')
                    .upsert({
                        key: `agreement_clients:${masterQuoteId}`,
                        value: JSON.stringify(finalClientIds),
                        description: `Clientes vinculados al Acuerdo Maestro ${currentMeta.name}`
                    });
                if (appSetErr) throw appSetErr;

                if (finalClientIds.length > 0) {
                    const parentIdsToClean = allB2BClients
                        .filter(c => finalClientIds.includes(c.id) && c.parent_id)
                        .map(c => c.parent_id as string);
                    const allIdsToSupersede = Array.from(new Set([...finalClientIds, ...parentIdsToClean]));

                    await supabase
                        .from('quotes')
                        .update({ status: 'superseded' })
                        .in('client_id', allIdsToSupersede)
                        .eq('status', 'agreement')
                        .neq('id', masterQuoteId);
                }

                // Limpiar active_master_agreement_id de los clientes que fueron desmarcados hoy
                if (removedClientIds.length > 0) {
                    const { data: removedProfiles } = await supabase
                        .from('profiles')
                        .select('id, logistics_data')
                        .in('id', removedClientIds);
                    for (const rp of ((removedProfiles || []) as DbProfileRow[])) {
                        const logData = { ...(rp.logistics_data || {}) };
                        if (logData.active_master_agreement_id === masterQuoteId) {
                            delete logData.active_master_agreement_id;
                        }
                        if (logData.special_agreement_model_id === selectedClient) {
                            delete logData.special_agreement_model_id;
                        }
                        await supabase
                            .from('profiles')
                            .update({ logistics_data: logData })
                            .eq('id', rp.id);
                    }
                }
            }

            // 5. Actualizar estados locales y refrescar padrón
            setModelsMeta(prev => ({
                ...prev,
                [selectedClient]: {
                    ...prev[selectedClient],
                    start_date: modalStartDate,
                    valid_until: modalEndDate
                }
            }));

            await fetchModelsAndRoster();
            setIsConsagrateModalOpen(false);
            setSuccessMsg(
                `Fuente de Verdad actualizada: "${currentMeta.name}" (${modalStartDate} al ${modalEndDate}) aplicada en cascada a ${finalClientIds.length} clientes y sucursales.`
            );
            setTimeout(() => setSuccessMsg(null), 6000);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Error desconocido';
            console.error('Error consagrando acuerdo en Supabase:', err);
            alert('Error al guardar el acuerdo en base de datos: ' + message);
        } finally {
            setIsSaving(false);
        }
    };

    // Filtros y Ordenamiento Multidimensional de la Tabla Principal (Desglosa cadenas individuales en Nutresa)
    const chainsList = useMemo(() => {
        const set = new Set<string>();
        agreementItems.forEach(item => {
            if (item.chain_name) {
                item.chain_name.split(' • ').forEach(part => {
                    const clean = part.trim();
                    if (clean) set.add(clean);
                });
            }
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
    }, [agreementItems]);

    const filteredItems = useMemo(() => {
        const q = normalizeSearchStr(searchTerm);
        return agreementItems
            .filter(item => {
                const matchesSearch = !q ||
                    normalizeSearchStr(item.raw_name).includes(q) ||
                    normalizeSearchStr(item.unified_name).includes(q) ||
                    normalizeSearchStr(item.mapped_sku || '').includes(q) ||
                    String(item.client_code || '').toLowerCase().includes(q);
                const itemChains = item.chain_name ? item.chain_name.split(' • ').map(s => s.trim()) : [];
                const matchesChain = selectedClient !== 'nutresa' || selectedChainFilter === 'all' || itemChains.includes(selectedChainFilter);
                return matchesSearch && matchesChain;
            })
            .sort((a, b) => {
                let res = 0;
                if (sortField === 'code') {
                    res = (Number(a.client_code) || 0) - (Number(b.client_code) || 0);
                } else if (sortField === 'name') {
                    res = a.raw_name.localeCompare(b.raw_name, 'es');
                } else if (sortField === 'sku') {
                    res = (a.mapped_sku || '').localeCompare(b.mapped_sku || '', 'es');
                } else if (sortField === 'chain') {
                    res = (a.chain_name || '').localeCompare(b.chain_name || '', 'es');
                } else if (sortField === 'consumption') {
                    res = (a.demand_volume ?? a.monthly_consumption_kg ?? 0) - (b.demand_volume ?? b.monthly_consumption_kg ?? 0);
                } else if (sortField === 'cost') {
                    res = a.corabastos_cost - b.corabastos_cost;
                } else if (sortField === 'previous') {
                    res = (a.previous_price || 0) - (b.previous_price || 0);
                } else if (sortField === 'sipsa') {
                    res = (a.sipsa_price || 0) - (b.sipsa_price || 0);
                } else if (sortField === 'prima') {
                    res = (a.prima_cop || 0) - (b.prima_cop || 0);
                } else if (sortField === 'proposed') {
                    res = a.client_proposed_price - b.client_proposed_price;
                } else if (sortField === 'suggested') {
                    res = a.suggested_price - b.suggested_price;
                } else if (sortField === 'margin') {
                    const markupA = a.corabastos_cost > 0 ? ((a.our_counterproposal - a.corabastos_cost) / a.corabastos_cost) * 100 : 0;
                    const markupB = b.corabastos_cost > 0 ? ((b.our_counterproposal - b.corabastos_cost) / b.corabastos_cost) * 100 : 0;
                    res = markupA - markupB;
                } else if (sortField === 'counter') {
                    res = a.our_counterproposal - b.our_counterproposal;
                } else if (sortField === 'impact') {
                    const impactA = a.our_counterproposal - a.client_proposed_price;
                    const impactB = b.our_counterproposal - b.client_proposed_price;
                    res = impactA - impactB;
                }
                return sortDir === 'asc' ? res : -res;
            });
    }, [agreementItems, searchTerm, selectedClient, selectedChainFilter, sortField, sortDir]);

    // Métricas reales de portafolio y rentabilidad unitaria (100% datos reales de Supabase, 0% volumen mockeado)
    const validCostItems = filteredItems.filter(i => Number(i.corabastos_cost) > 0);
    const avgInstRulePct = validCostItems.length > 0
        ? validCostItems.reduce((acc, i) => acc + (Number(i.inst_rule_margin_pct) || 0), 0) / validCostItems.length
        : 0;
    const avgPrevMarkupPct = validCostItems.length > 0
        ? validCostItems.reduce((acc, i) => acc + (((i.client_proposed_price - i.corabastos_cost) / i.corabastos_cost) * 100), 0) / validCostItems.length
        : 0;
    const avgNewMarkupPct = validCostItems.length > 0
        ? validCostItems.reduce((acc, i) => acc + (((i.our_counterproposal - i.corabastos_cost) / i.corabastos_cost) * 100), 0) / validCostItems.length
        : 0;
    const avgNewGrossMarginPct = validCostItems.length > 0
        ? validCostItems.reduce((acc, i) => acc + (i.our_counterproposal > 0 ? ((i.our_counterproposal - i.corabastos_cost) / i.our_counterproposal) * 100 : 0), 0) / validCostItems.length
        : 0;
    const skusUpCount = filteredItems.filter(i => i.our_counterproposal > i.client_proposed_price).length;
    const skusDownCount = filteredItems.filter(i => i.our_counterproposal < i.client_proposed_price).length;
    const skusSameCount = filteredItems.filter(i => i.our_counterproposal === i.client_proposed_price).length;

    const totalMatricesCount = useMemo(() => allB2BClients.filter(c => c.isMatriz).length, [allB2BClients]);
    const totalBranchesCount = useMemo(() => allB2BClients.filter(c => c.isSucursal).length, [allB2BClients]);

    // Filtrado inteligente multi-token de los 519 clientes (94 Casas Matrices + 425 Sucursales) dentro del Modal de Consagración
    const filteredModalClients = useMemo(() => {
        const currentRoster = modelClientsMap[selectedClient] || [];
        const tokens = normalizeSearchStr(clientModalSearch).split(' ').filter(Boolean);

        return allB2BClients.filter(client => {
            // 1. Filtro por pestaña rápida
            if (clientModalFilterTab === 'roster' && !currentRoster.includes(client.id) && !selectedClientIdsForRun.includes(client.id)) {
                return false;
            }
            if (clientModalFilterTab === 'selected' && !selectedClientIdsForRun.includes(client.id)) {
                return false;
            }
            if (clientModalFilterTab === 'matrices' && !client.isMatriz) {
                return false;
            }
            if (clientModalFilterTab === 'branches' && !client.isSucursal) {
                return false;
            }

            // 2. Buscador Omnibox Multi-Token (coincide si todos los tokens aparecen en Razón Social, NIT, Contacto o Casa Matriz)
            if (tokens.length > 0) {
                const haystack = normalizeSearchStr(`${client.company_name} ${client.nit || ''} ${client.parentName || ''} ${client.contact_name || ''}`);
                return tokens.every(tk => haystack.includes(tk));
            }
            return true;
        });
    }, [allB2BClients, modelClientsMap, selectedClient, clientModalFilterTab, clientModalSearch, selectedClientIdsForRun]);

    const isGeneralList = selectedClient === 'general_quincenal' || selectedClient === 'general_mensual';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* SELECTOR TETRAVALENTE: LOS 4 MODELOS DE ACUERDOS ESPECIALES & LISTAS MAESTRAS */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '0.85rem'
            }}>
                {/* CARD 1: GRUPO NUTRESA */}
                <div 
                    onClick={() => handleSelectModel('nutresa')}
                    style={{
                        backgroundColor: 'white',
                        borderRadius: THEME.radius.lg,
                        border: selectedClient === 'nutresa' ? `2px solid #E10600` : `1px solid ${THEME.colors.border}`,
                        padding: '1rem 1.1rem',
                        cursor: 'pointer',
                        boxShadow: selectedClient === 'nutresa' ? '0 4px 20px rgba(225, 6, 0, 0.12)' : '0 1px 3px rgba(0,0,0,0.05)',
                        transition: 'all 0.2s ease',
                        position: 'relative',
                        overflow: 'hidden'
                    }}
                >
                    {selectedClient === 'nutresa' && (
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            right: 0,
                            backgroundColor: '#E10600',
                            color: 'white',
                            fontSize: '0.62rem',
                            fontWeight: 800,
                            padding: '2px 10px',
                            borderBottomLeftRadius: '8px',
                            letterSpacing: '0.05em'
                        }}>
                            ACTIVO
                        </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            width: '92px',
                            height: '48px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: '#FFFFFF',
                            borderRadius: '8px',
                            padding: '4px',
                            border: '1px solid #E2E8F0',
                            flexShrink: 0
                        }}>
                            <Image 
                                src="/logos/nutresa.jpg" 
                                alt="Grupo Nutresa" 
                                width={84} 
                                height={40} 
                                style={{ objectFit: 'contain', width: 'auto', height: '100%' }}
                            />
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: THEME.colors.textMain }}>
                                Grupo Nutresa (IRCC)
                            </h3>
                            <p style={{ margin: '2px 0 0 0', fontSize: '0.72rem', color: THEME.colors.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                El Corral • Beer Station • Leños
                            </p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '5px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.66rem', backgroundColor: '#FEE2E2', color: '#991B1B', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                    Acuerdo Multimarca
                                </span>
                                <span style={{ fontSize: '0.66rem', backgroundColor: '#F1F5F9', color: '#334155', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                    {modelClientsMap.nutresa?.length ?? 0} sedes
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* CARD 2: COLSUBSIDIO */}
                <div 
                    onClick={() => handleSelectModel('colsubsidio')}
                    style={{
                        backgroundColor: 'white',
                        borderRadius: THEME.radius.lg,
                        border: selectedClient === 'colsubsidio' ? `2px solid #004A97` : `1px solid ${THEME.colors.border}`,
                        padding: '1rem 1.1rem',
                        cursor: 'pointer',
                        boxShadow: selectedClient === 'colsubsidio' ? '0 4px 20px rgba(0, 74, 151, 0.12)' : '0 1px 3px rgba(0,0,0,0.05)',
                        transition: 'all 0.2s ease',
                        position: 'relative',
                        overflow: 'hidden'
                    }}
                >
                    {selectedClient === 'colsubsidio' && (
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            right: 0,
                            backgroundColor: '#004A97',
                            color: 'white',
                            fontSize: '0.62rem',
                            fontWeight: 800,
                            padding: '2px 10px',
                            borderBottomLeftRadius: '8px',
                            letterSpacing: '0.05em'
                        }}>
                            ACTIVO
                        </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            width: '92px',
                            height: '48px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: '#FFFFFF',
                            borderRadius: '8px',
                            padding: '4px',
                            border: '1px solid #E2E8F0',
                            flexShrink: 0
                        }}>
                            <Image 
                                src="/logos/colsubsidio.jpg" 
                                alt="Colsubsidio" 
                                width={84} 
                                height={40} 
                                style={{ objectFit: 'contain', width: 'auto', height: '100%' }}
                            />
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: THEME.colors.textMain }}>
                                Colsubsidio
                            </h3>
                            <p style={{ margin: '2px 0 0 0', fontSize: '0.72rem', color: THEME.colors.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                Restaurantes • Piscilago • Clubes
                            </p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '5px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.66rem', backgroundColor: '#E0F2FE', color: '#0369A1', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                    Quincenal (1Q/2Q)
                                </span>
                                <span style={{ fontSize: '0.66rem', backgroundColor: '#F1F5F9', color: '#334155', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                    {modelClientsMap.colsubsidio?.length ?? 0} sedes
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* CARD 3: LISTA GENERAL QUINCENAL (15 DÍAS) */}
                <div 
                    onClick={() => handleSelectModel('general_quincenal')}
                    style={{
                        backgroundColor: 'white',
                        borderRadius: THEME.radius.lg,
                        border: selectedClient === 'general_quincenal' ? `2px solid #0D7A57` : `1px solid ${THEME.colors.border}`,
                        padding: '1rem 1.1rem',
                        cursor: 'pointer',
                        boxShadow: selectedClient === 'general_quincenal' ? '0 4px 20px rgba(13, 122, 87, 0.14)' : '0 1px 3px rgba(0,0,0,0.05)',
                        transition: 'all 0.2s ease',
                        position: 'relative',
                        overflow: 'hidden'
                    }}
                >
                    {selectedClient === 'general_quincenal' && (
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            right: 0,
                            backgroundColor: '#0D7A57',
                            color: 'white',
                            fontSize: '0.62rem',
                            fontWeight: 800,
                            padding: '2px 10px',
                            borderBottomLeftRadius: '8px',
                            letterSpacing: '0.05em'
                        }}>
                            ACTIVO
                        </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            width: '52px',
                            height: '48px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: '#ECFDF5',
                            borderRadius: '10px',
                            border: '1px solid #A7F3D0',
                            flexShrink: 0
                        }}>
                            <Calendar size={24} color="#0D7A57" />
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: THEME.colors.textMain }}>
                                Lista General Quincenal
                            </h3>
                            <p style={{ margin: '2px 0 0 0', fontSize: '0.72rem', color: THEME.colors.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                Hoteles, Clubes y Cadenas (15 Días)
                            </p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '5px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.66rem', backgroundColor: '#DCFCE7', color: '#15803D', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                    Ciclo 15 Días
                                </span>
                                <span style={{ fontSize: '0.66rem', backgroundColor: '#F1F5F9', color: '#0F172A', padding: '2px 6px', borderRadius: '4px', fontWeight: 800 }}>
                                    {modelClientsMap.general_quincenal?.length ?? 0} clientes en padrón
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* CARD 4: LISTA GENERAL MENSUAL (30 DÍAS) */}
                <div 
                    onClick={() => handleSelectModel('general_mensual')}
                    style={{
                        backgroundColor: 'white',
                        borderRadius: THEME.radius.lg,
                        border: selectedClient === 'general_mensual' ? `2px solid #4F46E5` : `1px solid ${THEME.colors.border}`,
                        padding: '1rem 1.1rem',
                        cursor: 'pointer',
                        boxShadow: selectedClient === 'general_mensual' ? '0 4px 20px rgba(79, 70, 229, 0.14)' : '0 1px 3px rgba(0,0,0,0.05)',
                        transition: 'all 0.2s ease',
                        position: 'relative',
                        overflow: 'hidden'
                    }}
                >
                    {selectedClient === 'general_mensual' && (
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            right: 0,
                            backgroundColor: '#4F46E5',
                            color: 'white',
                            fontSize: '0.62rem',
                            fontWeight: 800,
                            padding: '2px 10px',
                            borderBottomLeftRadius: '8px',
                            letterSpacing: '0.05em'
                        }}>
                            ACTIVO
                        </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            width: '52px',
                            height: '48px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: '#EEF2FF',
                            borderRadius: '10px',
                            border: '1px solid #C7D2FE',
                            flexShrink: 0
                        }}>
                            <Layers size={24} color="#4F46E5" />
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: THEME.colors.textMain }}>
                                Lista General Mensual
                            </h3>
                            <p style={{ margin: '2px 0 0 0', fontSize: '0.72rem', color: THEME.colors.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                Colegios, Universidades y Empresas
                            </p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '5px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.66rem', backgroundColor: '#E0E7FF', color: '#4338CA', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                    Ciclo 30 Días
                                </span>
                                <span style={{ fontSize: '0.66rem', backgroundColor: '#F1F5F9', color: '#0F172A', padding: '2px 6px', borderRadius: '4px', fontWeight: 800 }}>
                                    {modelClientsMap.general_mensual?.length ?? 0} clientes en padrón
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* NOTIFICACIÓN ÉXITO */}
            {successMsg && (
                <div style={{
                    backgroundColor: '#ECFDF5',
                    border: '1px solid #10B981',
                    color: '#065F46',
                    padding: '0.75rem 1rem',
                    borderRadius: THEME.radius.md,
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    <CheckCircle2 size={16} color="#10B981" />
                    {successMsg}
                </div>
            )}

            {/* TABLERO DE INTELIGENCIA FINANCIERA DE PORTAFOLIO (100% DATOS REALES DE SUPABASE, CERO VOLUMEN MOCKEADO) */}
            <div style={{
                backgroundColor: 'white',
                borderRadius: THEME.radius.lg,
                border: `1px solid ${THEME.colors.border}`,
                padding: '1rem 1.25rem',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))',
                gap: '1rem'
            }}>
                <div>
                    <span style={{ fontSize: '0.68rem', color: THEME.colors.textSecondary, fontWeight: 700, textTransform: 'uppercase' }}>
                        Alcance del Acuerdo
                    </span>
                    <div style={{ fontSize: '1.35rem', fontWeight: 900, color: THEME.colors.textMain, marginTop: '2px' }}>
                        {formatNumber(filteredItems.length)} <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>SKUs en Lista</span>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 700 }}>
                        {modelClientsMap[selectedClient]?.length || 0} clientes suscritos en padrón
                    </span>
                </div>

                <div>
                    <span style={{ fontSize: '0.68rem', color: THEME.colors.textSecondary, fontWeight: 700, textTransform: 'uppercase' }}>
                        Regla Lista Institucional
                    </span>
                    <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#047857', marginTop: '2px' }}>
                        +{avgInstRulePct.toFixed(1)}% <span style={{ fontSize: '0.76rem', fontWeight: 600 }}>s/costo</span>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: THEME.colors.textSecondary }}>
                        Promedio real en pricing_rules
                    </span>
                </div>

                <div>
                    <span style={{ fontSize: '0.68rem', color: THEME.colors.textSecondary, fontWeight: 700, textTransform: 'uppercase' }}>
                        {isGeneralList ? 'Utilidad Lista Anterior' : 'Utilidad Propuesta Cliente'}
                    </span>
                    <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#DC2626', marginTop: '2px' }}>
                        {avgPrevMarkupPct >= 0 ? '+' : ''}{avgPrevMarkupPct.toFixed(1)}% <span style={{ fontSize: '0.76rem', fontWeight: 600 }}>s/costo</span>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: '#DC2626', fontWeight: 600 }}>
                        {isGeneralList ? 'Rentabilidad ciclo anterior' : 'Sobre oferta del cliente'}
                    </span>
                </div>

                <div>
                    <span style={{ fontSize: '0.68rem', color: THEME.colors.textSecondary, fontWeight: 700, textTransform: 'uppercase' }}>
                        {isGeneralList ? 'Utilidad Nueva Lista' : 'Utilidad Contrapropuesta'}
                    </span>
                    <div style={{ fontSize: '1.35rem', fontWeight: 900, color: THEME.colors.primary, marginTop: '2px' }}>
                        {avgNewMarkupPct >= 0 ? '+' : ''}{avgNewMarkupPct.toFixed(1)}% <span style={{ fontSize: '0.76rem', fontWeight: 600 }}>s/costo</span>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 700 }}>
                        Margen Bruto s/venta: {avgNewGrossMarginPct.toFixed(1)}%
                    </span>
                </div>

                <div style={{ borderLeft: `2px solid ${THEME.colors.border}`, paddingLeft: '1rem' }}>
                    <span style={{ fontSize: '0.68rem', color: THEME.colors.textSecondary, fontWeight: 700, textTransform: 'uppercase' }}>
                        Balance de Actualización
                    </span>
                    <div style={{ 
                        fontSize: '0.92rem', 
                        fontWeight: 800, 
                        color: THEME.colors.textMain, 
                        marginTop: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        flexWrap: 'wrap'
                    }}>
                        <span style={{ color: '#059669' }}>▲ {skusUpCount} suben</span>
                        <span style={{ color: '#D97706' }}>▼ {skusDownCount} bajan</span>
                        <span style={{ color: '#64748B' }}>• {skusSameCount} igual</span>
                    </div>
                    <span style={{ fontSize: '0.71rem', color: '#059669', fontWeight: 700, display: 'block', marginTop: '3px' }}>
                        Vigencia: {modelsMeta[selectedClient]?.start_date} al {modelsMeta[selectedClient]?.valid_until}
                    </span>
                </div>
            </div>

            {/* INSTRUCTIVO OPERATIVO EXCLUSIVO PARA EL MODO DE TRABAJO DE GRUPO NUTRESA (SIPSA + PRIMA) */}
            {selectedClient === 'nutresa' && (
                <div style={{
                    backgroundColor: '#F8FAFC',
                    borderRadius: '12px',
                    border: '1px solid #CBD5E1',
                    padding: '0.85rem 1.1rem',
                    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '8px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                backgroundColor: '#FEE2E2',
                                color: '#991B1B',
                                border: '1px solid #FECACA',
                                padding: '3px 9px',
                                borderRadius: '6px',
                                fontSize: '0.72rem',
                                fontWeight: 800
                            }}>
                                <BookOpen size={13} />
                                MODO NUTRESA (SIPSA + PRIMA)
                            </span>
                            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A' }}>
                                Instructivo del Ciclo de Negociación Mensual (3 Pasos)
                            </span>
                            {(() => {
                                const frozenCount = agreementItems.filter(i => i.is_frozen_override).length;
                                if (!hasNutresaDraft && frozenCount === 0) return null;
                                return (
                                    <span style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        backgroundColor: '#ECFDF5',
                                        color: '#065F46',
                                        border: '1px solid #A7F3D0',
                                        padding: '2px 8px',
                                        borderRadius: '999px',
                                        fontSize: '0.7rem',
                                        fontWeight: 800
                                    }}>
                                        <Lock size={11} />
                                        Negociación en borrador ({frozenCount} {frozenCount === 1 ? 'precio congelado' : 'precios congelados'})
                                    </span>
                                );
                            })()}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {hasNutresaDraft && (
                                <button
                                    type="button"
                                    onClick={handleDiscardNutresaDraft}
                                    style={{
                                        padding: '4px 10px',
                                        borderRadius: '6px',
                                        border: '1px solid #FCA5A5',
                                        backgroundColor: '#FEF2F2',
                                        color: '#B91C1C',
                                        fontSize: '0.72rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                    title="Descartar la planilla en borrador y restaurar los valores del último acuerdo consagrado"
                                >
                                    <RotateCcw size={12} />
                                    Restablecer Borrador
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setShowNutresaGuide(prev => !prev)}
                                style={{
                                    padding: '4px 9px',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    backgroundColor: '#FFFFFF',
                                    color: '#475569',
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                            >
                                {showNutresaGuide ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                {showNutresaGuide ? 'Ocultar guía' : 'Ver instructivo'}
                            </button>
                        </div>
                    </div>

                    {showNutresaGuide && (
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                            gap: '0.75rem',
                            marginTop: '0.75rem'
                        }}>
                            <div style={{
                                backgroundColor: '#FFFFFF',
                                border: '1px solid #E2E8F0',
                                borderRadius: '8px',
                                padding: '0.65rem 0.8rem'
                            }}>
                                <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#0F172A', marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ backgroundColor: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', borderRadius: '4px', padding: '1px 6px', fontSize: '0.68rem', fontWeight: 900 }}>Paso 1</span>
                                    <span>Cargar Excel Mensual de Nutresa</span>
                                </div>
                                <div style={{ fontSize: '0.71rem', color: '#475569', lineHeight: 1.45 }}>
                                    Oprime <b>Importar Excel</b> y selecciona el archivo enviado por Nutresa (ej. <i>Zona 3 - Investments Cortes.xlsx</i>). El sistema cruza los ítems, conserva el <b>Acuerdo Anterior (Mes Pasado)</b> y despliega <b>$ SIPSA</b>, <b>+ Prima</b> y <b>Propuesta Nutresa</b>.
                                </div>
                            </div>

                            <div style={{
                                backgroundColor: '#FFFFFF',
                                border: '1px solid #E2E8F0',
                                borderRadius: '8px',
                                padding: '0.65rem 0.8rem'
                            }}>
                                <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#0F172A', marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ backgroundColor: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0', borderRadius: '4px', padding: '1px 6px', fontSize: '0.68rem', fontWeight: 900 }}>Paso 2</span>
                                    <span>Ajustar y Congelar Excepciones</span>
                                </div>
                                <div style={{ fontSize: '0.71rem', color: '#475569', lineHeight: 1.45 }}>
                                    Si no estás de acuerdo con el precio de algún producto (ej. <i>Aguacate</i>), llama a Nutresa y digita el precio acordado en <b>Contrapropuesta</b> (o <b>% Utilidad</b>). Ese ítem queda marcado como <b>Congelado</b> en borrador hasta cerrar la negociación.
                                </div>
                            </div>

                            <div style={{
                                backgroundColor: '#FFFFFF',
                                border: '1px solid #E2E8F0',
                                borderRadius: '8px',
                                padding: '0.65rem 0.8rem'
                            }}>
                                <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#0F172A', marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ backgroundColor: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A', borderRadius: '4px', padding: '1px 6px', fontSize: '0.68rem', fontWeight: 900 }}>Paso 3</span>
                                    <span>Consagrar y Congelar Vigencia</span>
                                </div>
                                <div style={{ fontSize: '0.71rem', color: '#475569', lineHeight: 1.45 }}>
                                    Al cerrar la negociación, oprime <b>Consagrar Acuerdo</b>. Se abrirá el modal de aprobación para definir la vigencia (<b>00:00 h</b> a <b>23:59 h</b>) y activar oficialmente la nueva lista en las <b>{modelClientsMap.nutresa?.length || 44} sedes</b> de Nutresa.
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* BARRA DE ACCIONES Y SINCRONIZACIÓN SODA/DANE (LÍNEA 1 STICKY MAGNÉTICA) */}
            <div style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                padding: '0.4rem 0.85rem',
                minHeight: '48px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.5rem',
                position: 'sticky',
                top: embedded ? '142px' : '85px',
                zIndex: 75,
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {/* BUSCADOR */}
                    <div style={{ position: 'relative', width: '240px' }}>
                        <Search size={14} color={THEME.colors.textSecondary} style={{ position: 'absolute', left: '9px', top: '9px' }} />
                        <input 
                            type="text"
                            placeholder="Buscar SKU, código o producto..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                width: '100%',
                                height: '32px',
                                padding: '0 0.5rem 0 1.85rem',
                                border: `1px solid ${THEME.colors.border}`,
                                borderRadius: '6px',
                                fontSize: '0.8rem',
                                outline: 'none'
                            }}
                        />
                    </div>

                    {/* PÍLDORA DEL PADRÓN DE CLIENTES DEL MODELO ACTIVO */}
                    <button
                        type="button"
                        onClick={() => handleOpenConsagrateModal('full_roster')}
                        style={{
                            height: '32px',
                            padding: '0 0.65rem',
                            borderRadius: '6px',
                            border: '1px solid #CBD5E1',
                            backgroundColor: '#F8FAFC',
                            color: '#0F172A',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px'
                        }}
                        title="Ver o editar la lista de clientes/sedes aplicables a este modelo"
                    >
                        <Users size={13} color={THEME.colors.primary} />
                        <span>Padrón: {modelClientsMap[selectedClient]?.length || 0} clientes</span>
                    </button>
                </div>

                {/* BOTONES OPERATIVOS COMPACTOS */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    {/* BOTÓN APLICAR SUGERIDOS INTELIGENTES (OCULTO EN NUTRESA PORQUE SE RIGE POR SIPSA + PRIMA) */}
                    {selectedClient !== 'nutresa' && (
                        <button
                            onClick={handleApplyAllSuggested}
                            style={{
                                height: '32px',
                                padding: '0 0.65rem',
                                borderRadius: '6px',
                                border: '1px solid #F59E0B',
                                backgroundColor: '#FEF3C7',
                                color: '#B45309',
                                fontSize: '0.76rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px'
                            }}
                            title="Transferir todos los precios sugeridos por Lista Institucional + Colchón de Ciclo a la columna de fijación"
                        >
                            <Zap size={13} />
                            Aplicar Sugeridos
                        </button>
                    )}

                    {/* BOTÓN RESTAURAR PRECIOS ANTERIORES */}
                    {isGeneralList && (
                        <button
                            onClick={handleKeepPreviousPrices}
                            style={{
                                height: '32px',
                                padding: '0 0.65rem',
                                borderRadius: '6px',
                                border: '1px solid #CBD5E1',
                                backgroundColor: '#F8FAFC',
                                color: '#475569',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px'
                            }}
                            title="Restaurar todos los precios a la tarifa del ciclo anterior"
                        >
                            <span>Restaurar Anterior</span>
                        </button>
                    )}

                    {/* INPUT HIDDEN PARA EXCEL */}
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileUpload} 
                        accept=".xlsx, .xls" 
                        style={{ display: 'none' }} 
                    />

                    {/* BOTÓN IMPORTAR EXCEL NATIVO */}
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                            height: '32px',
                            padding: '0 0.65rem',
                            borderRadius: '6px',
                            border: `1px solid ${THEME.colors.border}`,
                            backgroundColor: 'white',
                            color: THEME.colors.textMain,
                            fontSize: '0.76rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px'
                        }}
                    >
                        <Upload size={13} />
                        Importar Excel
                    </button>

                    {/* BOTÓN EXPORTAR EXCEL OFICIAL */}
                    <button
                        onClick={handleExportCounterproposal}
                        style={{
                            height: '32px',
                            padding: '0 0.65rem',
                            borderRadius: '6px',
                            border: '1px solid #10B981',
                            backgroundColor: '#ECFDF5',
                            color: '#065F46',
                            fontSize: '0.76rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px'
                        }}
                    >
                        <Download size={13} />
                        Descargar .xlsx
                    </button>

                    {/* BOTÓN CONSAGRAR ACUERDO / APLICAR LISTA A CLIENTES */}
                    <button
                        onClick={() => handleOpenConsagrateModal('compact_approve')}
                        disabled={isSaving}
                        style={{
                            height: '32px',
                            padding: '0 0.9rem',
                            borderRadius: '6px',
                            border: 'none',
                            backgroundColor: THEME.colors.primary,
                            color: 'white',
                            fontSize: '0.78rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            boxShadow: '0 2px 6px rgba(13, 122, 87, 0.25)'
                        }}
                    >
                        <Save size={13} />
                        {isGeneralList ? 'Asignar y Consagrar Lista' : 'Consagrar Acuerdo'}
                    </button>
                </div>
            </div>

            {/* TABLA COMPARADORA MULTI-DIMENSIONAL (CON THEAD STICKY Y POPOVERS FLOTANTES CERO-SALTO) */}
            <div style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                border: `1px solid ${THEME.colors.border}`,
                overflow: 'visible',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
                <div style={{ width: '100%', overflow: 'visible' }}>
                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left', fontSize: '0.8rem' }}>
                        <thead>
                            <tr style={{ userSelect: 'none', fontSize: '0.72rem' }}>
                                {/* 1. CÓD */}
                                <th 
                                    onClick={() => handleSort('code')}
                                    onMouseEnter={() => setActiveHeaderTooltip('code')}
                                    onMouseLeave={() => setActiveHeaderTooltip(null)}
                                    style={{ 
                                        padding: '0.55rem 0.5rem', 
                                        fontWeight: 800, 
                                        color: sortField === 'code' ? THEME.colors.primary : THEME.colors.textSecondary, 
                                        cursor: 'pointer',
                                        position: 'sticky',
                                        top: embedded ? '190px' : '133px',
                                        zIndex: activeHeaderTooltip === 'code' ? 140 : 65,
                                        backgroundColor: activeHeaderTooltip === 'code' ? '#F1F5F9' : '#F8FAFC',
                                        borderBottom: `2px solid ${THEME.colors.border}`,
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                        <span>CÓD</span>
                                        <HelpCircle size={12} color={activeHeaderTooltip === 'code' ? THEME.colors.primary : '#94A3B8'} />
                                        {sortField === 'code' ? (sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={11} color="#94A3B8" />}
                                    </div>
                                    {activeHeaderTooltip === 'code' && (
                                        <div style={{
                                            position: 'absolute',
                                            top: 'calc(100% + 6px)',
                                            left: '4px',
                                            width: '290px',
                                            backgroundColor: '#0F172A',
                                            color: '#F8FAFC',
                                            padding: '0.7rem 0.85rem',
                                            borderRadius: '10px',
                                            border: '1px solid #334155',
                                            boxShadow: '0 12px 28px rgba(15, 23, 42, 0.35)',
                                            whiteSpace: 'normal',
                                            textAlign: 'left',
                                            fontWeight: 500,
                                            lineHeight: 1.45,
                                            pointerEvents: 'none',
                                            zIndex: 9999
                                        }}>
                                            <div style={{ color: '#34D399', fontWeight: 800, fontSize: '0.74rem', marginBottom: '4px' }}>
                                                1. CÓD (Identificador Contable / ERP)
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: '#E2E8F0' }}>
                                                Código contable interno (<code style={{ color: '#93C5FD' }}>accounting_id</code>, ej. 921, 150, 1214) o código de material del cliente para cruce directo en órdenes de compra y facturación.
                                            </div>
                                        </div>
                                    )}
                                </th>

                                {/* 2. PRODUCTO EN LISTA */}
                                <th 
                                    onClick={() => handleSort('name')}
                                    onMouseEnter={() => setActiveHeaderTooltip('name')}
                                    onMouseLeave={() => setActiveHeaderTooltip(null)}
                                    style={{ 
                                        padding: '0.55rem 0.55rem', 
                                        fontWeight: 800, 
                                        color: sortField === 'name' ? THEME.colors.primary : THEME.colors.textSecondary, 
                                        cursor: 'pointer',
                                        position: 'sticky',
                                        top: embedded ? '190px' : '133px',
                                        zIndex: activeHeaderTooltip === 'name' ? 140 : 65,
                                        backgroundColor: activeHeaderTooltip === 'name' ? '#F1F5F9' : '#F8FAFC',
                                        borderBottom: `2px solid ${THEME.colors.border}`,
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                        <span>PRODUCTO EN LISTA</span>
                                        <HelpCircle size={12} color={activeHeaderTooltip === 'name' ? THEME.colors.primary : '#94A3B8'} />
                                        {sortField === 'name' ? (sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={11} color="#94A3B8" />}
                                    </div>
                                    {activeHeaderTooltip === 'name' && (
                                        <div style={{
                                            position: 'absolute',
                                            top: 'calc(100% + 6px)',
                                            left: 0,
                                            width: '320px',
                                            backgroundColor: '#0F172A',
                                            color: '#F8FAFC',
                                            padding: '0.7rem 0.85rem',
                                            borderRadius: '10px',
                                            border: '1px solid #334155',
                                            boxShadow: '0 12px 28px rgba(15, 23, 42, 0.35)',
                                            whiteSpace: 'normal',
                                            textAlign: 'left',
                                            fontWeight: 500,
                                            lineHeight: 1.45,
                                            pointerEvents: 'none',
                                            zIndex: 9999
                                        }}>
                                            <div style={{ color: '#34D399', fontWeight: 800, fontSize: '0.74rem', marginBottom: '4px' }}>
                                                2. PRODUCTO EN LISTA (Presentación y Equivalencia SIPSA)
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: '#E2E8F0' }}>
                                                Nombre comercial de la presentación pactada en FruFresco y su unidad oficial de entrega. En Nutresa muestra debajo la descripción unificada de referencia SIPSA.
                                            </div>
                                        </div>
                                    )}
                                </th>

                                {/* 3. DEMANDA / VOLUMEN CICLO */}
                                <th 
                                    onClick={() => handleSort('consumption')}
                                    onMouseEnter={() => setActiveHeaderTooltip('consumption')}
                                    onMouseLeave={() => setActiveHeaderTooltip(null)}
                                    style={{ 
                                        padding: '0.55rem 0.5rem', 
                                        fontWeight: 800, 
                                        color: sortField === 'consumption' ? THEME.colors.primary : THEME.colors.textSecondary,
                                        cursor: 'pointer',
                                        position: 'sticky',
                                        top: embedded ? '190px' : '133px',
                                        zIndex: activeHeaderTooltip === 'consumption' ? 140 : 65,
                                        backgroundColor: activeHeaderTooltip === 'consumption' ? '#F1F5F9' : '#F8FAFC',
                                        borderBottom: `2px solid ${THEME.colors.border}`,
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                                        whiteSpace: 'nowrap',
                                        textAlign: 'right',
                                        width: '120px',
                                        maxWidth: '135px'
                                    }}
                                >
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', justifyContent: 'flex-end', width: '100%' }}>
                                        <span>VOLUMEN CICLO</span>
                                        <HelpCircle size={12} color={activeHeaderTooltip === 'consumption' ? THEME.colors.primary : '#94A3B8'} />
                                        {sortField === 'consumption' ? (sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={11} color='#94A3B8' />}
                                    </div>
                                    {activeHeaderTooltip === 'consumption' && (
                                        <div style={{
                                            position: 'absolute',
                                            top: 'calc(100% + 6px)',
                                            right: 0,
                                            width: '290px',
                                            backgroundColor: '#0F172A',
                                            color: '#F8FAFC',
                                            padding: '0.7rem 0.85rem',
                                            borderRadius: '10px',
                                            border: '1px solid #334155',
                                            boxShadow: '0 12px 28px rgba(15, 23, 42, 0.35)',
                                            whiteSpace: 'normal',
                                            textAlign: 'left',
                                            fontWeight: 500,
                                            lineHeight: 1.45,
                                            pointerEvents: 'none',
                                            zIndex: 9999
                                        }}>
                                            <div style={{ color: '#34D399', fontWeight: 800, fontSize: '0.74rem', marginBottom: '4px' }}>
                                                VOLUMEN DEMANDADO DEL MODELO
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: '#E2E8F0' }}>
                                                Demanda física real (Kg / Und) y facturación solicitada por los clientes suscritos a este modelo desde la última verificación.
                                            </div>
                                        </div>
                                    )}
                                </th>

                                {/* 4. COSTO / LISTA INST. */}
                                <th 
                                    onClick={() => handleSort('cost')}
                                    onMouseEnter={() => setActiveHeaderTooltip('cost')}
                                    onMouseLeave={() => setActiveHeaderTooltip(null)}
                                    style={{ 
                                        padding: '0.55rem 0.55rem', 
                                        fontWeight: 800, 
                                        color: sortField === 'cost' ? THEME.colors.primary : THEME.colors.textSecondary, 
                                        textAlign: 'right', 
                                        cursor: 'pointer',
                                        position: 'sticky',
                                        top: embedded ? '190px' : '133px',
                                        zIndex: activeHeaderTooltip === 'cost' ? 140 : 65,
                                        backgroundColor: activeHeaderTooltip === 'cost' ? '#F1F5F9' : '#F8FAFC',
                                        borderBottom: `2px solid ${THEME.colors.border}`,
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', justifyContent: 'flex-end', width: '100%' }}>
                                        <span>COSTO / LISTA INST.</span>
                                        <HelpCircle size={12} color={activeHeaderTooltip === 'cost' ? THEME.colors.primary : '#94A3B8'} />
                                        {sortField === 'cost' ? (sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={11} color="#94A3B8" />}
                                    </div>
                                    {activeHeaderTooltip === 'cost' && (
                                        <div style={{
                                            position: 'absolute',
                                            top: 'calc(100% + 6px)',
                                            right: 0,
                                            width: '340px',
                                            backgroundColor: '#0F172A',
                                            color: '#F8FAFC',
                                            padding: '0.75rem 0.9rem',
                                            borderRadius: '10px',
                                            border: '1px solid #334155',
                                            boxShadow: '0 12px 28px rgba(15, 23, 42, 0.35)',
                                            whiteSpace: 'normal',
                                            textAlign: 'left',
                                            fontWeight: 500,
                                            lineHeight: 1.45,
                                            pointerEvents: 'none',
                                            zIndex: 9999
                                        }}>
                                            <div style={{ color: '#34D399', fontWeight: 800, fontSize: '0.74rem', marginBottom: '4px' }}>
                                                COSTO BASE + LISTA INSTITUCIONAL (HOY)
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: '#E2E8F0', marginBottom: '5px' }}>
                                                • <b>Arriba (Costo):</b> Costo base estabilizado en Matriz de Costos.<br />
                                                • <b>Abajo (Píldora Verde):</b> Precio en Lista Institucional y su <b>% de regla integral</b>.
                                            </div>
                                            <div style={{ fontSize: '0.68rem', color: '#A7F3D0', backgroundColor: 'rgba(16, 185, 129, 0.14)', padding: '5px 7px', borderRadius: '6px' }}>
                                                Ese % ya incluye: <b>Utilidad base (~20%) + Merma real + Selección/Tamizado</b> (ej. Bulto +22%, Lavada +60%, Tamizada 40g +80%).
                                            </div>
                                        </div>
                                    )}
                                </th>

                                {/* COLUMNAS EXCLUSIVAS DEL MODO NUTRESA: ACUERDO ANTERIOR, $ SIPSA Y + PRIMA */}
                                {selectedClient === 'nutresa' && (
                                    <>
                                        {/* 5A. ACUERDO ANTERIOR (MES PASADO) */}
                                        <th
                                            onClick={() => handleSort('previous')}
                                            onMouseEnter={() => setActiveHeaderTooltip('previous')}
                                            onMouseLeave={() => setActiveHeaderTooltip(null)}
                                            style={{
                                                padding: '0.55rem 0.5rem',
                                                fontWeight: 800,
                                                color: sortField === 'previous' ? THEME.colors.primary : '#475569',
                                                textAlign: 'right',
                                                cursor: 'pointer',
                                                position: 'sticky',
                                                top: embedded ? '190px' : '133px',
                                                zIndex: activeHeaderTooltip === 'previous' ? 140 : 65,
                                                backgroundColor: activeHeaderTooltip === 'previous' ? '#F1F5F9' : '#F8FAFC',
                                                borderBottom: `2px solid ${THEME.colors.border}`,
                                                boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                                                whiteSpace: 'nowrap'
                                            }}
                                        >
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', justifyContent: 'flex-end', width: '100%' }}>
                                                <span>ACUERDO ANTERIOR</span>
                                                <HelpCircle size={12} color="#64748B" />
                                                {sortField === 'previous' ? (sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={11} color="#94A3B8" />}
                                            </div>
                                            {activeHeaderTooltip === 'previous' && (
                                                <div style={{
                                                    position: 'absolute',
                                                    top: 'calc(100% + 6px)',
                                                    right: 0,
                                                    width: '300px',
                                                    backgroundColor: '#0F172A',
                                                    color: '#F8FAFC',
                                                    padding: '0.7rem 0.85rem',
                                                    borderRadius: '10px',
                                                    border: '1px solid #334155',
                                                    boxShadow: '0 12px 28px rgba(15, 23, 42, 0.35)',
                                                    whiteSpace: 'normal',
                                                    textAlign: 'left',
                                                    fontWeight: 500,
                                                    lineHeight: 1.45,
                                                    pointerEvents: 'none',
                                                    zIndex: 9999
                                                }}>
                                                    <div style={{ color: '#34D399', fontWeight: 800, fontSize: '0.74rem', marginBottom: '4px' }}>
                                                        ACUERDO ANTERIOR (Mes Pasado)
                                                    </div>
                                                    <div style={{ fontSize: '0.72rem', color: '#E2E8F0' }}>
                                                        Precio unitario que estuvo vigente en el último acuerdo consagrado con Grupo Nutresa (mes anterior) para comparar la evolución real del SKU.
                                                    </div>
                                                </div>
                                            )}
                                        </th>

                                        {/* 5B. $ SIPSA (REFERENCIA EXCEL NUTRESA) */}
                                        <th
                                            onClick={() => handleSort('sipsa')}
                                            onMouseEnter={() => setActiveHeaderTooltip('sipsa')}
                                            onMouseLeave={() => setActiveHeaderTooltip(null)}
                                            style={{
                                                padding: '0.55rem 0.5rem',
                                                fontWeight: 800,
                                                color: sortField === 'sipsa' ? '#0369A1' : '#0284C7',
                                                textAlign: 'right',
                                                cursor: 'pointer',
                                                position: 'sticky',
                                                top: embedded ? '190px' : '133px',
                                                zIndex: activeHeaderTooltip === 'sipsa' ? 140 : 65,
                                                backgroundColor: activeHeaderTooltip === 'sipsa' ? '#E0F2FE' : '#F8FAFC',
                                                borderBottom: `2px solid ${THEME.colors.border}`,
                                                boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                                                whiteSpace: 'nowrap'
                                            }}
                                        >
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', justifyContent: 'flex-end', width: '100%' }}>
                                                <span>$ SIPSA</span>
                                                <HelpCircle size={12} color="#0284C7" />
                                                {sortField === 'sipsa' ? (sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={11} color="#94A3B8" />}
                                            </div>
                                            {activeHeaderTooltip === 'sipsa' && (
                                                <div style={{
                                                    position: 'absolute',
                                                    top: 'calc(100% + 6px)',
                                                    right: 0,
                                                    width: '300px',
                                                    backgroundColor: '#0F172A',
                                                    color: '#F8FAFC',
                                                    padding: '0.7rem 0.85rem',
                                                    borderRadius: '10px',
                                                    border: '1px solid #334155',
                                                    boxShadow: '0 12px 28px rgba(15, 23, 42, 0.35)',
                                                    whiteSpace: 'normal',
                                                    textAlign: 'left',
                                                    fontWeight: 500,
                                                    lineHeight: 1.45,
                                                    pointerEvents: 'none',
                                                    zIndex: 9999
                                                }}>
                                                    <div style={{ color: '#38BDF8', fontWeight: 800, fontSize: '0.74rem', marginBottom: '4px' }}>
                                                        $ SIPSA (Referencia Boletín DANE / Nutresa)
                                                    </div>
                                                    <div style={{ fontSize: '0.72rem', color: '#E2E8F0' }}>
                                                        Promedio oficial SIPSA reportado en el archivo mensual de Grupo Nutresa. Los ítems con tarifa plana sin medición SIPSA muestran <b>No se mide</b>.
                                                    </div>
                                                </div>
                                            )}
                                        </th>

                                        {/* 5C. + PRIMA ($ COP) */}
                                        <th
                                            onClick={() => handleSort('prima')}
                                            onMouseEnter={() => setActiveHeaderTooltip('prima')}
                                            onMouseLeave={() => setActiveHeaderTooltip(null)}
                                            style={{
                                                padding: '0.55rem 0.5rem',
                                                fontWeight: 800,
                                                color: sortField === 'prima' ? '#6D28D9' : '#7C3AED',
                                                textAlign: 'right',
                                                cursor: 'pointer',
                                                position: 'sticky',
                                                top: embedded ? '190px' : '133px',
                                                zIndex: activeHeaderTooltip === 'prima' ? 140 : 65,
                                                backgroundColor: activeHeaderTooltip === 'prima' ? '#F5F3FF' : '#F8FAFC',
                                                borderBottom: `2px solid ${THEME.colors.border}`,
                                                boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                                                whiteSpace: 'nowrap'
                                            }}
                                        >
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', justifyContent: 'flex-end', width: '100%' }}>
                                                <span>+ PRIMA</span>
                                                <HelpCircle size={12} color="#7C3AED" />
                                                {sortField === 'prima' ? (sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={11} color="#94A3B8" />}
                                            </div>
                                            {activeHeaderTooltip === 'prima' && (
                                                <div style={{
                                                    position: 'absolute',
                                                    top: 'calc(100% + 6px)',
                                                    right: 0,
                                                    width: '300px',
                                                    backgroundColor: '#0F172A',
                                                    color: '#F8FAFC',
                                                    padding: '0.7rem 0.85rem',
                                                    borderRadius: '10px',
                                                    border: '1px solid #334155',
                                                    boxShadow: '0 12px 28px rgba(15, 23, 42, 0.35)',
                                                    whiteSpace: 'normal',
                                                    textAlign: 'left',
                                                    fontWeight: 500,
                                                    lineHeight: 1.45,
                                                    pointerEvents: 'none',
                                                    zIndex: 9999
                                                }}>
                                                    <div style={{ color: '#C4B5FD', fontWeight: 800, fontSize: '0.74rem', marginBottom: '4px' }}>
                                                        + PRIMA ACORDADA ($ COP)
                                                    </div>
                                                    <div style={{ fontSize: '0.72rem', color: '#E2E8F0' }}>
                                                        Valor en pesos COP previamente pactado con Nutresa que se suma al precio de referencia SIPSA (<code style={{ color: '#93C5FD' }}>Propuesta Nutresa = $ SIPSA + Prima</code>).
                                                    </div>
                                                </div>
                                            )}
                                        </th>
                                    </>
                                )}

                                {/* 5. PRECIO ANTERIOR / PROPUESTA CLIENTE */}
                                <th 
                                    onClick={() => handleSort('proposed')}
                                    onMouseEnter={() => setActiveHeaderTooltip('proposed')}
                                    onMouseLeave={() => setActiveHeaderTooltip(null)}
                                    style={{ 
                                        padding: '0.55rem 0.55rem', 
                                        fontWeight: 800, 
                                        color: '#DC2626', 
                                        textAlign: 'right', 
                                        cursor: 'pointer',
                                        position: 'sticky',
                                        top: embedded ? '190px' : '133px',
                                        zIndex: activeHeaderTooltip === 'proposed' ? 140 : 65,
                                        backgroundColor: activeHeaderTooltip === 'proposed' ? '#FEF2F2' : '#F8FAFC',
                                        borderBottom: `2px solid ${THEME.colors.border}`,
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', justifyContent: 'flex-end', width: '100%' }}>
                                        <span>{selectedClient === 'nutresa' ? 'PROPUESTA NUTRESA' : (isGeneralList ? 'PRECIO ANTERIOR' : 'PROPUESTA CLIENTE')}</span>
                                        <HelpCircle size={12} color="#DC2626" />
                                        {sortField === 'proposed' ? (sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={11} color="#94A3B8" />}
                                    </div>
                                    {activeHeaderTooltip === 'proposed' && (
                                        <div style={{
                                            position: 'absolute',
                                            top: 'calc(100% + 6px)',
                                            right: 0,
                                            width: '320px',
                                            backgroundColor: '#0F172A',
                                            color: '#F8FAFC',
                                            padding: '0.75rem 0.9rem',
                                            borderRadius: '10px',
                                            border: '1px solid #334155',
                                            boxShadow: '0 12px 28px rgba(15, 23, 42, 0.35)',
                                            whiteSpace: 'normal',
                                            textAlign: 'left',
                                            fontWeight: 500,
                                            lineHeight: 1.45,
                                            pointerEvents: 'none',
                                            zIndex: 9999
                                        }}>
                                            <div style={{ color: '#F87171', fontWeight: 800, fontSize: '0.74rem', marginBottom: '4px' }}>
                                                {selectedClient === 'nutresa' ? 'PROPUESTA NUTRESA ($ SIPSA + Prima)' : (isGeneralList ? 'PRECIO ANTERIOR (Ciclo Previo)' : 'PROPUESTA CLIENTE (Pliego)')}
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: '#E2E8F0' }}>
                                                {selectedClient === 'nutresa'
                                                    ? 'Precio resultante del archivo enviado por Grupo Nutresa ($ SIPSA + Prima) y qué % de utilidad deja frente a nuestro costo actual.'
                                                    : (isGeneralList
                                                        ? 'Tarifa congelada que estuvo vigente en el ciclo anterior (quincena o mes pasado) y qué % de utilidad deja frente al costo actual.'
                                                        : 'Tarifa unitaria vigente o solicitada por el cliente en su pliego de negociación y qué % de utilidad representa hoy.')}
                                            </div>
                                        </div>
                                    )}
                                </th>

                                {/* 6. SUGERIDO IA (OCULTO EN NUTRESA) */}
                                {selectedClient !== 'nutresa' && (
                                    <th 
                                        onClick={() => handleSort('suggested')}
                                        onMouseEnter={() => setActiveHeaderTooltip('suggested')}
                                        onMouseLeave={() => setActiveHeaderTooltip(null)}
                                        style={{ 
                                            padding: '0.55rem 0.55rem', 
                                            fontWeight: 800, 
                                            color: '#B45309', 
                                            textAlign: 'right', 
                                            cursor: 'pointer',
                                            position: 'sticky',
                                            top: embedded ? '190px' : '133px',
                                            zIndex: activeHeaderTooltip === 'suggested' ? 140 : 65,
                                            backgroundColor: activeHeaderTooltip === 'suggested' ? '#FFFBEB' : '#F8FAFC',
                                            borderBottom: `2px solid ${THEME.colors.border}`,
                                            boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                                            whiteSpace: 'nowrap'
                                        }}
                                    >
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', justifyContent: 'flex-end', width: '100%' }}>
                                            <Zap size={12} color="#B45309" />
                                            <span>SUGERIDO IA</span>
                                            <HelpCircle size={12} color="#B45309" />
                                            {sortField === 'suggested' ? (sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={11} color="#94A3B8" />}
                                        </div>
                                        {activeHeaderTooltip === 'suggested' && (
                                            <div style={{
                                                position: 'absolute',
                                                top: 'calc(100% + 6px)',
                                                right: 0,
                                                width: '350px',
                                                backgroundColor: '#0F172A',
                                                color: '#F8FAFC',
                                                padding: '0.75rem 0.9rem',
                                                borderRadius: '10px',
                                                border: '1px solid #334155',
                                                boxShadow: '0 12px 28px rgba(15, 23, 42, 0.35)',
                                                whiteSpace: 'normal',
                                                textAlign: 'left',
                                                fontWeight: 500,
                                                lineHeight: 1.45,
                                                pointerEvents: 'none',
                                                zIndex: 9999
                                            }}>
                                                <div style={{ color: '#FBBF24', fontWeight: 800, fontSize: '0.74rem', marginBottom: '4px' }}>
                                                    SUGERIDO IA (Fórmula Simplificada sin SIPSA)
                                                </div>
                                                <div style={{ fontSize: '0.71rem', color: '#FEF3C7', backgroundColor: 'rgba(245, 158, 11, 0.16)', padding: '5px 7px', borderRadius: '6px', marginBottom: '5px', fontWeight: 700 }}>
                                                    Redondear50( Costo × (1 + % Lista Inst. + % Colchón Ciclo) )
                                                </div>
                                                <div style={{ fontSize: '0.71rem', color: '#E2E8F0' }}>
                                                    Toma tu % de Lista Institucional (que ya incluye utilidad + merma + selección) y suma solo el colchón por congelar precios (+2%/+3% en 15 días o +4%/+6% en 30 días).
                                                </div>
                                            </div>
                                        )}
                                    </th>
                                )}

                                {/* 7. % UTILIDAD */}
                                <th 
                                    onClick={() => handleSort('margin')}
                                    onMouseEnter={() => setActiveHeaderTooltip('margin')}
                                    onMouseLeave={() => setActiveHeaderTooltip(null)}
                                    style={{ 
                                        padding: '0.55rem 0.55rem', 
                                        fontWeight: 800, 
                                        color: sortField === 'margin' ? THEME.colors.primary : '#047857', 
                                        textAlign: 'right', 
                                        cursor: 'pointer',
                                        position: 'sticky',
                                        top: embedded ? '190px' : '133px',
                                        zIndex: activeHeaderTooltip === 'margin' ? 140 : 65,
                                        backgroundColor: activeHeaderTooltip === 'margin' ? '#ECFDF5' : '#F8FAFC',
                                        borderBottom: `2px solid ${THEME.colors.border}`,
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', justifyContent: 'flex-end', width: '100%' }}>
                                        <span>% UTILIDAD</span>
                                        <HelpCircle size={12} color="#047857" />
                                        {sortField === 'margin' ? (sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={11} color="#94A3B8" />}
                                    </div>
                                    {activeHeaderTooltip === 'margin' && (
                                        <div style={{
                                            position: 'absolute',
                                            top: 'calc(100% + 6px)',
                                            right: 0,
                                            width: '330px',
                                            backgroundColor: '#0F172A',
                                            color: '#F8FAFC',
                                            padding: '0.75rem 0.9rem',
                                            borderRadius: '10px',
                                            border: '1px solid #334155',
                                            boxShadow: '0 12px 28px rgba(15, 23, 42, 0.35)',
                                            whiteSpace: 'normal',
                                            textAlign: 'left',
                                            fontWeight: 500,
                                            lineHeight: 1.45,
                                            pointerEvents: 'none',
                                            zIndex: 9999
                                        }}>
                                            <div style={{ color: '#34D399', fontWeight: 800, fontSize: '0.74rem', marginBottom: '4px' }}>
                                                % UTILIDAD (Calculadora Bidireccional)
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: '#E2E8F0' }}>
                                                • <b>Caja superior (editable):</b> % de Utilidad sobre Costo = <code style={{ color: '#93C5FD' }}>(Nuevo Precio - Costo) / Costo</code>.<br />
                                                • <b>Texto inferior:</b> Margen Bruto sobre Venta y ganancia en $/unidad.<br />
                                                • Al digitar un %, recalcula automáticamente el <b>Nuevo Precio</b>.
                                            </div>
                                        </div>
                                    )}
                                </th>

                                {/* 8. NUEVO PRECIO / CONTRAPROPUESTA */}
                                <th 
                                    onClick={() => handleSort('counter')}
                                    onMouseEnter={() => setActiveHeaderTooltip('counter')}
                                    onMouseLeave={() => setActiveHeaderTooltip(null)}
                                    style={{ 
                                        padding: '0.55rem 0.55rem', 
                                        fontWeight: 800, 
                                        color: THEME.colors.primary, 
                                        textAlign: 'right', 
                                        cursor: 'pointer',
                                        position: 'sticky',
                                        top: embedded ? '190px' : '133px',
                                        zIndex: activeHeaderTooltip === 'counter' ? 140 : 65,
                                        backgroundColor: activeHeaderTooltip === 'counter' ? '#ECFDF5' : '#F8FAFC',
                                        borderBottom: `2px solid ${THEME.colors.border}`,
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', justifyContent: 'flex-end', width: '100%' }}>
                                        <span>{isGeneralList ? 'NUEVO PRECIO' : 'CONTRAPROPUESTA'}</span>
                                        <HelpCircle size={12} color={THEME.colors.primary} />
                                        {sortField === 'counter' ? (sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={11} color="#94A3B8" />}
                                    </div>
                                    {activeHeaderTooltip === 'counter' && (
                                        <div style={{
                                            position: 'absolute',
                                            top: 'calc(100% + 6px)',
                                            right: 0,
                                            width: '320px',
                                            backgroundColor: '#0F172A',
                                            color: '#F8FAFC',
                                            padding: '0.75rem 0.9rem',
                                            borderRadius: '10px',
                                            border: '1px solid #334155',
                                            boxShadow: '0 12px 28px rgba(15, 23, 42, 0.35)',
                                            whiteSpace: 'normal',
                                            textAlign: 'left',
                                            fontWeight: 500,
                                            lineHeight: 1.45,
                                            pointerEvents: 'none',
                                            zIndex: 9999
                                        }}>
                                            <div style={{ color: '#34D399', fontWeight: 800, fontSize: '0.74rem', marginBottom: '4px' }}>
                                                {isGeneralList ? 'NUEVO PRECIO A CONSAGRAR' : 'CONTRAPROPUESTA OFICIAL (CONGELABLE)'}
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: '#E2E8F0' }}>
                                                Tarifa final en pesos COP que se fijará para todos los clientes suscritos a este acuerdo. En Nutresa, cualquier ajuste manual queda <b>Congelado</b> en borrador hasta consagrar el acuerdo.
                                            </div>
                                        </div>
                                    )}
                                </th>

                                {/* 9. VARIACIÓN / GANANCIA */}
                                <th 
                                    onClick={() => handleSort('impact')}
                                    onMouseEnter={() => setActiveHeaderTooltip('impact')}
                                    onMouseLeave={() => setActiveHeaderTooltip(null)}
                                    style={{ 
                                        padding: '0.55rem 0.55rem', 
                                        fontWeight: 800, 
                                        color: sortField === 'impact' ? THEME.colors.primary : THEME.colors.textSecondary, 
                                        textAlign: 'right', 
                                        cursor: 'pointer',
                                        position: 'sticky',
                                        top: embedded ? '190px' : '133px',
                                        zIndex: activeHeaderTooltip === 'impact' ? 140 : 65,
                                        backgroundColor: activeHeaderTooltip === 'impact' ? '#F1F5F9' : '#F8FAFC',
                                        borderBottom: `2px solid ${THEME.colors.border}`,
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', justifyContent: 'flex-end', width: '100%' }}>
                                        <span>VARIACIÓN / GANANCIA</span>
                                        <HelpCircle size={12} color={activeHeaderTooltip === 'impact' ? THEME.colors.primary : '#94A3B8'} />
                                        {sortField === 'impact' ? (sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={11} color="#94A3B8" />}
                                    </div>
                                    {activeHeaderTooltip === 'impact' && (
                                        <div style={{
                                            position: 'absolute',
                                            top: 'calc(100% + 6px)',
                                            right: '4px',
                                            width: '320px',
                                            backgroundColor: '#0F172A',
                                            color: '#F8FAFC',
                                            padding: '0.75rem 0.9rem',
                                            borderRadius: '10px',
                                            border: '1px solid #334155',
                                            boxShadow: '0 12px 28px rgba(15, 23, 42, 0.35)',
                                            whiteSpace: 'normal',
                                            textAlign: 'left',
                                            fontWeight: 500,
                                            lineHeight: 1.45,
                                            pointerEvents: 'none',
                                            zIndex: 9999
                                        }}>
                                            <div style={{ color: '#34D399', fontWeight: 800, fontSize: '0.74rem', marginBottom: '4px' }}>
                                                VARIACIÓN VS PROPUESTA Y GANANCIA UNITARIA
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: '#E2E8F0' }}>
                                                • <b>Arriba:</b> Diferencia en pesos (<code style={{ color: '#93C5FD' }}>Contrapropuesta - Propuesta</code>) para sustentar el ajuste ante el cliente.<br />
                                                • <b>Abajo (Verde):</b> Ganancia bruta en pesos (<code style={{ color: '#93C5FD' }}>Contrapropuesta - Costo</code>) por cada Kg o unidad entregada.
                                            </div>
                                        </div>
                                    )}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={selectedClient === 'nutresa' ? 11 : 9} style={{ padding: '3rem', textAlign: 'center', color: THEME.colors.textSecondary, fontWeight: 600 }}>
                                        Sincronizando catálogo y precios reales con Supabase...
                                    </td>
                                </tr>
                            ) : filteredItems.length === 0 ? (
                                <tr>
                                    <td colSpan={selectedClient === 'nutresa' ? 11 : 9} style={{ padding: '3rem', textAlign: 'center', color: THEME.colors.textSecondary }}>
                                        No se encontraron productos con el criterio de búsqueda actual.
                                    </td>
                                </tr>
                            ) : filteredItems.map((item, idx) => {
                                const cost = Number(item.corabastos_cost) || 0;
                                const ruleTargetPct = item.inst_rule_margin_pct !== undefined
                                    ? item.inst_rule_margin_pct
                                    : (cost > 0 && item.baseline_price > cost
                                        ? Math.round(((item.baseline_price - cost) / cost) * 100)
                                        : 0);
                                const diffVsClient = item.our_counterproposal - item.client_proposed_price;
                                const unitProfitCop = item.our_counterproposal - cost;

                                // % Utilidad sobre Costo (Markup %, homólogo a pricing_rules) y % Margen Bruto sobre Venta
                                const currentMarkupPct = cost > 0 ? ((item.our_counterproposal - cost) / cost) * 100 : 0;
                                const currentGrossMarginPct = item.our_counterproposal > 0 ? ((item.our_counterproposal - cost) / item.our_counterproposal) * 100 : 0;
                                const prevMarkupPct = cost > 0 ? ((item.client_proposed_price - cost) / cost) * 100 : 0;
                                const lastMonthPrice = item.previous_price && item.previous_price > 0 ? item.previous_price : item.client_proposed_price;
                                const lastMonthMarkupPct = cost > 0 ? ((lastMonthPrice - cost) / cost) * 100 : 0;
                                const suggestedMarkupPct = cost > 0 ? ((item.suggested_price - cost) / cost) * 100 : 0;

                                const isHealthyMargin = currentMarkupPct >= Math.min(ruleTargetPct, 15);
                                const isPositiveMargin = unitProfitCop > 0;

                                return (
                                    <tr 
                                        key={item.id}
                                        style={{ 
                                            borderBottom: `1px solid ${THEME.colors.border}`,
                                            backgroundColor: item.is_frozen_override ? '#F0FDF4' : (idx % 2 === 0 ? 'white' : '#FAFAFA')
                                        }}
                                    >
                                        <td style={{ padding: '0.5rem 0.5rem', fontFamily: 'monospace', fontWeight: 700, color: THEME.colors.textSecondary, whiteSpace: 'nowrap' }}>
                                            {item.client_code}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.55rem' }}>
                                            <div style={{ fontWeight: 800, color: THEME.colors.textMain, fontSize: '0.82rem', lineHeight: 1.25 }}>
                                                {item.raw_name}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px', flexWrap: 'wrap' }}>
                                                <span style={{ fontSize: '0.68rem', color: THEME.colors.textSecondary, fontWeight: 600 }}>
                                                    {item.unit}
                                                    {selectedClient === 'nutresa' && item.unified_name && item.unified_name !== item.raw_name
                                                        ? ` • SIPSA: ${item.unified_name}`
                                                        : ''}
                                                </span>
                                            </div>
                                        </td>

                                        {/* COLUMNA DEMANDA / VOLUMEN CICLO */}
                                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', whiteSpace: 'nowrap', width: '120px', maxWidth: '135px' }}>
                                            <div style={{ fontWeight: 800, color: (item.demand_volume || 0) > 0 ? '#0F172A' : '#94A3B8', fontSize: '0.82rem' }}>
                                                {formatDemandVolume(item.demand_volume || 0, item.unit)}
                                            </div>
                                            <div style={{ fontSize: '0.64rem', marginTop: '2px' }}>
                                                {(item.demand_orders_count || 0) > 0 ? (
                                                    <span style={{ color: '#0369A1', fontWeight: 700 }}>
                                                        {item.demand_orders_count} ped. &bull; {formatCompactMoney(item.demand_revenue || 0)}
                                                    </span>
                                                ) : (
                                                    <span style={{ color: '#94A3B8' }}>
                                                        Sin salida ciclo
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        {/* COLUMNA COSTO MATRIZ + LISTA INSTITUCIONAL DINÁMICA */}
                                        <td style={{ padding: '0.5rem 0.55rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                            <div style={{ color: '#0F172A', fontWeight: 800, fontSize: '0.8rem' }}>
                                                Costo: {formatMoney(item.corabastos_cost)}
                                            </div>
                                            {item.baseline_price > 0 && (
                                                <div style={{
                                                    fontSize: '0.65rem',
                                                    fontWeight: 700,
                                                    color: '#047857',
                                                    backgroundColor: '#ECFDF5',
                                                    border: '1px solid #A7F3D0',
                                                    borderRadius: '4px',
                                                    padding: '1px 5px',
                                                    display: 'inline-block',
                                                    marginTop: '2px',
                                                    whiteSpace: 'nowrap'
                                                }}>
                                                    Inst: {formatMoney(item.baseline_price)} ({ruleTargetPct >= 0 ? `+${ruleTargetPct}%` : `${ruleTargetPct}%`})
                                                </div>
                                            )}
                                        </td>

                                        {/* COLUMNAS EXCLUSIVAS DE NUTRESA: ACUERDO ANTERIOR, $ SIPSA Y + PRIMA */}
                                        {selectedClient === 'nutresa' && (
                                            <>
                                                {/* ACUERDO ANTERIOR (MES PASADO) */}
                                                <td style={{ padding: '0.5rem 0.5rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                    <div style={{ fontWeight: 800, color: '#334155', fontSize: '0.8rem' }}>
                                                        {formatMoney(lastMonthPrice)}
                                                    </div>
                                                    <div style={{ fontSize: '0.63rem', color: '#64748B', fontWeight: 700, marginTop: '2px' }}>
                                                        {lastMonthMarkupPct >= 0 ? `+${lastMonthMarkupPct.toFixed(0)}%` : `${lastMonthMarkupPct.toFixed(0)}%`} s/costo
                                                    </div>
                                                </td>

                                                {/* $ SIPSA */}
                                                <td style={{ padding: '0.5rem 0.5rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                    {(item.sipsa_price || 0) > 0 ? (
                                                        <>
                                                            <div style={{ fontWeight: 800, color: '#0369A1', fontSize: '0.8rem' }}>
                                                                {formatMoney(item.sipsa_price || 0)}
                                                            </div>
                                                            <div style={{ fontSize: '0.62rem', color: '#0284C7', fontWeight: 700, marginTop: '2px' }}>
                                                                Ref. SIPSA
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <div style={{ fontWeight: 700, color: '#94A3B8', fontSize: '0.75rem' }}>
                                                                No se mide
                                                            </div>
                                                            <div style={{ fontSize: '0.61rem', color: '#94A3B8', marginTop: '2px' }}>
                                                                Tarifa fija
                                                            </div>
                                                        </>
                                                    )}
                                                </td>

                                                {/* + PRIMA ($ COP) */}
                                                <td style={{ padding: '0.5rem 0.5rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                    {(item.prima_cop || 0) > 0 ? (
                                                        <>
                                                            <div style={{ fontWeight: 800, color: '#6D28D9', fontSize: '0.8rem' }}>
                                                                +{formatMoney(item.prima_cop || 0)}
                                                            </div>
                                                            <div style={{ fontSize: '0.62rem', color: '#7C3AED', fontWeight: 700, marginTop: '2px' }}>
                                                                {(item.sipsa_price || 0) > 0 ? 'Prima s/SIPSA' : 'Valor Base'}
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <span style={{ color: '#94A3B8', fontSize: '0.74rem', fontWeight: 600 }}>—</span>
                                                    )}
                                                </td>
                                            </>
                                        )}

                                        {/* PRECIO ANTERIOR / PROPUESTA CLIENTE + % UTILIDAD */}
                                        <td style={{ padding: '0.5rem 0.55rem', textAlign: 'right', fontWeight: 800, color: '#DC2626', whiteSpace: 'nowrap' }}>
                                            <div>{formatMoney(item.client_proposed_price)}</div>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', marginTop: '2px' }}>
                                                <span style={{ fontSize: '0.64rem', color: '#64748B', fontWeight: 700 }}>
                                                    {prevMarkupPct >= 0 ? `+${prevMarkupPct.toFixed(0)}%` : `${prevMarkupPct.toFixed(0)}%`}
                                                </span>
                                                {selectedClient === 'nutresa' && item.client_proposed_price !== lastMonthPrice && (
                                                    <span style={{
                                                        fontSize: '0.58rem',
                                                        padding: '1px 4px',
                                                        borderRadius: '4px',
                                                        fontWeight: 800,
                                                        backgroundColor: item.client_proposed_price > lastMonthPrice ? '#DCFCE7' : '#FEE2E2',
                                                        color: item.client_proposed_price > lastMonthPrice ? '#166534' : '#991B1B'
                                                    }}>
                                                        {item.client_proposed_price > lastMonthPrice ? '+' : ''}{formatMoney(item.client_proposed_price - lastMonthPrice)} vs ant.
                                                    </span>
                                                )}
                                                {selectedClient !== 'nutresa' && item.status_change && (
                                                    <span style={{
                                                        fontSize: '0.58rem',
                                                        padding: '1px 4px',
                                                        borderRadius: '4px',
                                                        fontWeight: 800,
                                                        backgroundColor: item.status_change === 'SUBIÓ' ? '#FEE2E2' : (item.status_change === 'BAJÓ' ? '#DCFCE7' : '#F1F5F9'),
                                                        color: item.status_change === 'SUBIÓ' ? '#991B1B' : (item.status_change === 'BAJÓ' ? '#166534' : '#475569')
                                                    }}>
                                                        {item.status_change}
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        {/* PRECIO SUGERIDO IA + % UTILIDAD SUGERIDA (OCULTO EN NUTRESA) */}
                                        {selectedClient !== 'nutresa' && (
                                            <td style={{ padding: '0.5rem 0.55rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                <button
                                                    onClick={() => {
                                                        setEditingPriceDrafts(prev => {
                                                            const next = { ...prev };
                                                            delete next[item.id];
                                                            return next;
                                                        });
                                                        setEditingMarkupDrafts(prev => {
                                                            const next = { ...prev };
                                                            delete next[item.id];
                                                            return next;
                                                        });
                                                        setAgreementItems(prev => prev.map(p => p.id === item.id ? { ...p, our_counterproposal: item.suggested_price } : p));
                                                    }}
                                                    style={{
                                                        background: '#FEF3C7',
                                                        border: '1px solid #FCD34D',
                                                        color: '#B45309',
                                                        fontWeight: 800,
                                                        fontSize: '0.76rem',
                                                        padding: '2px 7px',
                                                        borderRadius: '4px',
                                                        cursor: 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '3px'
                                                    }}
                                                    title="Clic para fijar este precio sugerido técnico"
                                                >
                                                    <Zap size={11} color="#B45309" />
                                                    {formatMoney(item.suggested_price)}
                                                </button>
                                                <div style={{ fontSize: '0.64rem', color: '#B45309', fontWeight: 700, marginTop: '2px' }}>
                                                    +{suggestedMarkupPct.toFixed(1)}% s/costo
                                                </div>
                                            </td>
                                        )}

                                        {/* COLUMNA INTERACTIVA BIDIRECCIONAL: % UTILIDAD */}
                                        <td style={{ padding: '0.5rem 0.55rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '2px' }}>
                                                <input
                                                    type="text"
                                                    inputMode="decimal"
                                                    placeholder="0"
                                                    value={
                                                        editingMarkupDrafts[item.id] !== undefined
                                                            ? editingMarkupDrafts[item.id]
                                                            : (item.our_counterproposal === 0 ? '' : String(Number(currentMarkupPct.toFixed(1))))
                                                    }
                                                    onFocus={(e) => {
                                                        setEditingMarkupDrafts(prev => ({
                                                            ...prev,
                                                            [item.id]: item.our_counterproposal === 0 ? '' : String(Number(currentMarkupPct.toFixed(1)))
                                                        }));
                                                        e.currentTarget.select();
                                                    }}
                                                    onChange={(e) => {
                                                        const raw = e.target.value
                                                            .replace(',', '.')
                                                            .replace(/[^0-9.-]/g, '')
                                                            .replace(/^0+(?=\d)/, '');
                                                        setEditingMarkupDrafts(prev => ({ ...prev, [item.id]: raw }));
                                                        if (raw === '' || raw === '-' || raw === '.') {
                                                            if (raw === '') {
                                                                setAgreementItems(prev => prev.map(p => p.id === item.id ? { ...p, our_counterproposal: 0, is_frozen_override: selectedClient === 'nutresa' ? true : p.is_frozen_override } : p));
                                                            }
                                                            return;
                                                        }
                                                        const newMarkup = Number(raw);
                                                        if (!Number.isNaN(newMarkup)) {
                                                            const newPrice = cost > 0
                                                                ? Math.ceil((cost * (1 + newMarkup / 100)) / 50) * 50
                                                                : item.our_counterproposal;
                                                            setAgreementItems(prev => prev.map(p => p.id === item.id ? { ...p, our_counterproposal: newPrice, is_frozen_override: selectedClient === 'nutresa' ? true : p.is_frozen_override } : p));
                                                        }
                                                    }}
                                                    onBlur={() => {
                                                        setEditingMarkupDrafts(prev => {
                                                            const next = { ...prev };
                                                            delete next[item.id];
                                                            return next;
                                                        });
                                                        if (selectedClient === 'nutresa') {
                                                            saveNutresaDraftToDb(agreementItems);
                                                        }
                                                    }}
                                                    style={{
                                                        width: '60px',
                                                        padding: '0.24rem 0.3rem',
                                                        border: isHealthyMargin ? '1.5px solid #10B981' : (isPositiveMargin ? '1.5px solid #F59E0B' : '2px solid #EF4444'),
                                                        borderRadius: '6px',
                                                        fontWeight: 800,
                                                        fontSize: '0.75rem',
                                                        textAlign: 'right',
                                                        color: isHealthyMargin ? '#047857' : (isPositiveMargin ? '#B45309' : '#DC2626'),
                                                        backgroundColor: isHealthyMargin ? '#ECFDF5' : (isPositiveMargin ? '#FFFBEB' : '#FEF2F2'),
                                                        outline: 'none'
                                                    }}
                                                    title="Edita el % de Utilidad sobre Costo para recalcular automáticamente el Nuevo Precio a Fijar"
                                                />
                                                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#047857' }}>%</span>
                                            </div>
                                            <div style={{ fontSize: '0.62rem', color: '#64748B', fontWeight: 600, marginTop: '2px', whiteSpace: 'nowrap' }}>
                                                Margen: {currentGrossMarginPct.toFixed(0)}% • {unitProfitCop >= 0 ? '+' : ''}{formatMoney(unitProfitCop)}/{item.unit}
                                            </div>
                                        </td>

                                        {/* NUEVO PRECIO A FIJAR / CONTRAPROPUESTA (CON BADGE CONGELADO EN NUTRESA) */}
                                        <td style={{ padding: '0.5rem 0.55rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                            <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }}>
                                                <input 
                                                    type="text"
                                                    inputMode="numeric"
                                                    placeholder="0"
                                                    value={
                                                        editingPriceDrafts[item.id] !== undefined
                                                            ? editingPriceDrafts[item.id]
                                                            : (item.our_counterproposal === 0 ? '' : String(item.our_counterproposal))
                                                    }
                                                    onFocus={(e) => {
                                                        setEditingPriceDrafts(prev => ({
                                                            ...prev,
                                                            [item.id]: item.our_counterproposal === 0 ? '' : String(item.our_counterproposal)
                                                        }));
                                                        e.currentTarget.select();
                                                    }}
                                                    onChange={(e) => {
                                                        const raw = e.target.value
                                                            .replace(/[^0-9]/g, '')
                                                            .replace(/^0+(?=\d)/, '');
                                                        setEditingPriceDrafts(prev => ({ ...prev, [item.id]: raw }));
                                                        const val = raw === '' ? 0 : Number(raw);
                                                        setAgreementItems(prev => prev.map(p => p.id === item.id ? {
                                                            ...p,
                                                            our_counterproposal: val,
                                                            is_frozen_override: selectedClient === 'nutresa' ? (val !== p.client_proposed_price) : p.is_frozen_override
                                                        } : p));
                                                    }}
                                                    onBlur={() => {
                                                        setEditingPriceDrafts(prev => {
                                                            const next = { ...prev };
                                                            delete next[item.id];
                                                            return next;
                                                        });
                                                        if (selectedClient === 'nutresa') {
                                                            saveNutresaDraftToDb(agreementItems);
                                                        }
                                                    }}
                                                    style={{
                                                        width: '92px',
                                                        padding: '0.3rem 0.4rem',
                                                        border: item.is_frozen_override
                                                            ? '2px solid #0D7A57'
                                                            : (isHealthyMargin ? `1.5px solid ${THEME.colors.primary}` : (isPositiveMargin ? '1.5px solid #F59E0B' : '2px solid #EF4444')),
                                                        borderRadius: THEME.radius.md,
                                                        fontWeight: 800,
                                                        fontSize: '0.78rem',
                                                        textAlign: 'right',
                                                        color: isHealthyMargin ? THEME.colors.primary : (isPositiveMargin ? '#B45309' : '#DC2626'),
                                                        backgroundColor: item.is_frozen_override
                                                            ? '#ECFDF5'
                                                            : (isHealthyMargin ? '#FFFFFF' : (isPositiveMargin ? '#FFFBEB' : '#FEF2F2')),
                                                        outline: 'none'
                                                    }}
                                                />
                                                {selectedClient === 'nutresa' && item.is_frozen_override && (
                                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                        <span style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '3px',
                                                            backgroundColor: '#DCFCE7',
                                                            color: '#065F46',
                                                            border: '1px solid #86EFAC',
                                                            borderRadius: '4px',
                                                            padding: '1px 5px',
                                                            fontSize: '0.6rem',
                                                            fontWeight: 800
                                                        }}>
                                                            <Lock size={9} />
                                                            Congelado
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                const updated = agreementItems.map(p => p.id === item.id ? {
                                                                    ...p,
                                                                    our_counterproposal: p.client_proposed_price,
                                                                    is_frozen_override: false
                                                                } : p);
                                                                setAgreementItems(updated);
                                                                saveNutresaDraftToDb(updated);
                                                            }}
                                                            style={{
                                                                background: 'none',
                                                                border: 'none',
                                                                cursor: 'pointer',
                                                                color: '#64748B',
                                                                padding: 0,
                                                                display: 'inline-flex'
                                                            }}
                                                            title="Descongelar y volver a la propuesta original de Nutresa"
                                                        >
                                                            <RotateCcw size={10} />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        {/* VARIACIÓN UNITARIA VS ANTERIOR + GANANCIA BRUTA REAL POR UNIDAD */}
                                        <td style={{ 
                                            padding: '0.5rem 0.55rem', 
                                            textAlign: 'right',
                                            whiteSpace: 'nowrap'
                                        }}>
                                            <div style={{
                                                fontWeight: 800,
                                                fontSize: '0.78rem',
                                                color: diffVsClient > 0 ? '#059669' : (diffVsClient < 0 ? '#D97706' : '#64748B')
                                            }}>
                                                {diffVsClient === 0
                                                    ? '$0 (Igual)'
                                                    : `${diffVsClient > 0 ? '+' : ''}${formatMoney(diffVsClient)} / ${item.unit}`}
                                            </div>
                                            <div style={{
                                                fontSize: '0.64rem',
                                                fontWeight: 700,
                                                color: unitProfitCop >= 0 ? '#047857' : '#DC2626',
                                                marginTop: '2px',
                                                whiteSpace: 'nowrap'
                                            }}>
                                                Ganancia: {unitProfitCop >= 0 ? '+' : ''}{formatMoney(unitProfitCop)}/{item.unit}
                                            </div>
                                            {/* LINEA 3: IMPACTO EN UTILIDAD TOTAL EN PESOS SEGÚN DEMANDA */}
                                            {(item.demand_volume || 0) > 0 ? (
                                                <div style={{
                                                    marginTop: '3px',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '2px',
                                                    fontSize: '0.64rem',
                                                    fontWeight: 800,
                                                    color: (unitProfitCop * (item.demand_volume || 0)) >= 0 ? '#1E40AF' : '#DC2626',
                                                    backgroundColor: (unitProfitCop * (item.demand_volume || 0)) >= 0 ? '#EFF6FF' : '#FEF2F2',
                                                    border: `1px solid ${(unitProfitCop * (item.demand_volume || 0)) >= 0 ? '#BFDBFE' : '#FECACA'}`,
                                                    padding: '1px 5px',
                                                    borderRadius: '4px',
                                                    whiteSpace: 'nowrap'
                                                }}>
                                                    Total: {(unitProfitCop * (item.demand_volume || 0)) >= 0 ? '+' : ''}{formatCompactMoney(unitProfitCop * (item.demand_volume || 0))}
                                                </div>
                                            ) : null}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* MODAL DE CONSAGRACIÓN, VIGENCIA Y BUSCADOR COMBINADO INTELIGENTE MULTI-CLIENTE */}
            {isConsagrateModalOpen && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: 'rgba(15, 23, 42, 0.68)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 2500,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '1.25rem'
                }}>
                    {selectedClient === 'nutresa' && consagrateModalMode === 'compact_approve' ? (
                        <div style={{
                            backgroundColor: '#FFFFFF',
                            borderRadius: '20px',
                            width: '100%',
                            maxWidth: '500px',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                            overflow: 'hidden',
                            border: '1px solid #E2E8F0'
                        }}>
                            <div style={{
                                padding: '1.25rem 1.5rem 1rem',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{
                                        width: '40px',
                                        height: '40px',
                                        borderRadius: '10px',
                                        backgroundColor: '#ECFDF5',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: '#0D7A57'
                                    }}>
                                        <Handshake size={22} />
                                    </div>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0F172A' }}>
                                            Aprobar y Congelar Acuerdo de Precios
                                        </h3>
                                        <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#64748B', fontWeight: 600 }}>
                                            Modelo Especial SIPSA + Prima • {agreementItems.length} SKUs en lista
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsConsagrateModalOpen(false)}
                                    style={{
                                        border: 'none',
                                        background: 'transparent',
                                        color: '#94A3B8',
                                        cursor: 'pointer',
                                        padding: '4px'
                                    }}
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <div style={{ padding: '0 1.5rem 1.5rem' }}>
                                <div style={{
                                    backgroundColor: '#F0FDF4',
                                    border: '1px solid #BBF7D0',
                                    borderRadius: '12px',
                                    padding: '1rem 1.15rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '12px',
                                    marginBottom: '1.25rem'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <Building2 size={22} color="#16A34A" />
                                        <div>
                                            <div style={{ fontSize: '0.92rem', fontWeight: 900, color: '#14532D' }}>
                                                GRUPO NUTRESA (IRCC)
                                            </div>
                                            <div style={{ fontSize: '0.76rem', color: '#15803D', fontWeight: 600 }}>
                                                Cliente institucional formalizado ({selectedClientIdsForRun.length} sedes vinculadas). Se congelarán las tarifas vigentes.
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setConsagrateModalMode('full_roster')}
                                        style={{
                                            fontSize: '0.7rem',
                                            fontWeight: 700,
                                            color: '#15803D',
                                            backgroundColor: '#DCFCE7',
                                            border: '1px solid #86EFAC',
                                            borderRadius: '6px',
                                            padding: '4px 8px',
                                            cursor: 'pointer',
                                            whiteSpace: 'nowrap'
                                        }}
                                    >
                                        Ver padrón ({selectedClientIdsForRun.length})
                                    </button>
                                </div>

                                {agreementItems.filter(i => i.is_frozen_override).length > 0 && (
                                    <div style={{
                                        marginBottom: '1rem',
                                        padding: '8px 12px',
                                        borderRadius: '8px',
                                        backgroundColor: '#ECFDF5',
                                        border: '1px solid #A7F3D0',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        fontSize: '0.76rem',
                                        color: '#065F46',
                                        fontWeight: 600
                                    }}>
                                        <Lock size={14} color="#0D7A57" />
                                        <span>
                                            Incluye <strong>{agreementItems.filter(i => i.is_frozen_override).length} SKU(s)</strong> con precio negociado y congelado manualmente sobre la propuesta inicial de Nutresa.
                                        </span>
                                    </div>
                                )}

                                <div style={{ marginBottom: '1rem' }}>
                                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: '0.5rem' }}>
                                        Presets de Vigencia Rápida
                                    </label>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                                        {[
                                            { label: '15 días', days: 15 },
                                            { label: '1 mes', days: 30 },
                                            { label: '2 meses', days: 60 },
                                            { label: '3 meses', days: 90 }
                                        ].map((preset) => {
                                            const isSelected = nutresaPresetDays === preset.days;
                                            return (
                                                <button
                                                    key={preset.days}
                                                    type="button"
                                                    onClick={() => {
                                                        setNutresaPresetDays(preset.days);
                                                        const todayBogota = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
                                                        const baseStr = modalStartDate || todayBogota;
                                                        const [y, m, d] = baseStr.split('-').map(Number);
                                                        const dt = new Date(Date.UTC(y, m - 1, d));
                                                        dt.setUTCDate(dt.getUTCDate() + preset.days);
                                                        setModalEndDate(dt.toISOString().split('T')[0]);
                                                    }}
                                                    style={{
                                                        padding: '7px 10px',
                                                        borderRadius: '8px',
                                                        border: isSelected ? '1.5px solid #0D7A57' : '1px solid #CBD5E1',
                                                        backgroundColor: isSelected ? '#ECFDF5' : '#FFFFFF',
                                                        color: isSelected ? '#065F46' : '#334155',
                                                        fontSize: '0.78rem',
                                                        fontWeight: 700,
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    {preset.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '1rem' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                                            Fecha de Inicio
                                        </label>
                                        <input
                                            type="date"
                                            value={modalStartDate}
                                            onChange={(e) => {
                                                const newFrom = e.target.value;
                                                setModalStartDate(newFrom);
                                                if (nutresaPresetDays && newFrom) {
                                                    const [y, m, d] = newFrom.split('-').map(Number);
                                                    const dt = new Date(Date.UTC(y, m - 1, d));
                                                    dt.setUTCDate(dt.getUTCDate() + nutresaPresetDays);
                                                    setModalEndDate(dt.toISOString().split('T')[0]);
                                                }
                                            }}
                                            style={{
                                                width: '100%',
                                                padding: '9px 11px',
                                                borderRadius: '8px',
                                                border: '1px solid #CBD5E1',
                                                fontSize: '0.84rem',
                                                fontWeight: 600,
                                                color: '#0F172A'
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                                            Fecha de Vencimiento
                                        </label>
                                        <input
                                            type="date"
                                            value={modalEndDate}
                                            min={modalStartDate}
                                            onChange={(e) => {
                                                setNutresaPresetDays(0);
                                                setModalEndDate(e.target.value);
                                            }}
                                            style={{
                                                width: '100%',
                                                padding: '9px 11px',
                                                borderRadius: '8px',
                                                border: '1px solid #CBD5E1',
                                                fontSize: '0.84rem',
                                                fontWeight: 600,
                                                color: '#0F172A'
                                            }}
                                        />
                                    </div>
                                </div>

                                {(() => {
                                    const todayBogota = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
                                    const isImmediateToday = modalStartDate === todayBogota;
                                    const isFutureDate = modalStartDate > todayBogota;
                                    return (
                                        <div style={{
                                            padding: '10px 12px',
                                            borderRadius: '10px',
                                            backgroundColor: isImmediateToday ? '#ECFDF5' : isFutureDate ? '#EFF6FF' : '#FFFBEB',
                                            border: `1px solid ${isImmediateToday ? '#A7F3D0' : isFutureDate ? '#BFDBFE' : '#FDE68A'}`,
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                            gap: '10px',
                                            marginBottom: '1.25rem'
                                        }}>
                                            <Clock size={16} color={isImmediateToday ? '#059669' : isFutureDate ? '#2563EB' : '#D97706'} style={{ marginTop: '2px', flexShrink: 0 }} />
                                            <div style={{ fontSize: '0.74rem', lineHeight: 1.45, color: '#1E293B' }}>
                                                <div style={{ fontWeight: 800, color: isImmediateToday ? '#065F46' : isFutureDate ? '#1E40AF' : '#92400E', marginBottom: '2px' }}>
                                                    {isImmediateToday
                                                        ? 'Activación inmediata hoy mismo'
                                                        : isFutureDate
                                                        ? `Activación programada (${modalStartDate} a las 00:00 h)`
                                                        : `Vigencia retroactiva desde ${modalStartDate} (00:00 h)`}
                                                </div>
                                                <div style={{ color: '#475569' }}>
                                                    {isImmediateToday
                                                        ? 'Al confirmar, las tarifas entran en vigor de inmediato para todos los pedidos de hoy y rigen hasta las '
                                                        : `Las tarifas se activarán automáticamente a las 00:00 h (medianoche Bogotá) del ${modalStartDate} y regirán hasta las `}
                                                    <strong>23:59 h del {modalEndDate || 'día de vencimiento'}</strong>.
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}

                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                    <button
                                        type="button"
                                        disabled={isSaving}
                                        onClick={() => setIsConsagrateModalOpen(false)}
                                        style={{
                                            padding: '9px 16px',
                                            borderRadius: '8px',
                                            border: '1px solid #CBD5E1',
                                            backgroundColor: '#FFFFFF',
                                            color: '#334155',
                                            fontWeight: 700,
                                            fontSize: '0.82rem',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="button"
                                        disabled={isSaving || selectedClientIdsForRun.length === 0}
                                        onClick={handleConfirmConsagration}
                                        style={{
                                            padding: '9px 18px',
                                            borderRadius: '8px',
                                            border: 'none',
                                            backgroundColor: '#0D7A57',
                                            color: '#FFFFFF',
                                            fontWeight: 800,
                                            fontSize: '0.82rem',
                                            cursor: isSaving ? 'wait' : 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '7px',
                                            boxShadow: '0 4px 12px rgba(13, 122, 87, 0.25)'
                                        }}
                                    >
                                        <ShieldCheck size={16} />
                                        {isSaving ? 'Congelando Acuerdo...' : 'Confirmar y Congelar Acuerdo'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                    <div style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '16px',
                        width: '100%',
                        maxWidth: '860px',
                        maxHeight: '92vh',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)',
                        overflow: 'hidden',
                        border: '1px solid #E2E8F0'
                    }}>
                        {/* HEADER DEL MODAL */}
                        <div style={{
                            padding: '1.15rem 1.5rem',
                            borderBottom: '1px solid #E2E8F0',
                            backgroundColor: '#F8FAFC',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{
                                        backgroundColor: '#DCFCE7',
                                        color: '#15803D',
                                        padding: '3px 8px',
                                        borderRadius: '6px',
                                        fontSize: '0.7rem',
                                        fontWeight: 800,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}>
                                        <ShieldCheck size={13} /> CONSAGRACIÓN Y CASCADA SQL
                                    </span>
                                    <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: '#0F172A' }}>
                                        {modelsMeta[selectedClient].name}
                                    </h3>
                                </div>
                                <p style={{ margin: '3px 0 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                                    Configura la vigencia del acuerdo y confirma a cuáles clientes del padrón se les aplicará esta actualización de precios ({agreementItems.length} SKUs).
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsConsagrateModalOpen(false)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', padding: '6px' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* CUERPO DEL MODAL */}
                        <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.1rem', flex: 1 }}>
                            {/* PASO 1: DURACIÓN Y VIGENCIA DEL ACUERDO */}
                            <div style={{
                                backgroundColor: '#F8FAFC',
                                border: '1px solid #E2E8F0',
                                borderRadius: '12px',
                                padding: '1rem 1.15rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.75rem'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, fontSize: '0.84rem', color: '#0F172A' }}>
                                        <Calendar size={16} color={THEME.colors.primary} />
                                        <span>1. Vigencia y Duración del Ciclo de Precios</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                        <button
                                            type="button"
                                            onClick={() => applyDatePreset('15d')}
                                            style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: 'white', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', color: '#0F172A' }}
                                        >
                                            +15 Días (Quincenal)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => applyDatePreset('next_fortnight')}
                                            style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: 'white', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', color: '#0F172A' }}
                                        >
                                            Corte Quincena (Día 15 / Fin Mes)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => applyDatePreset('30d')}
                                            style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: 'white', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', color: '#0F172A' }}
                                        >
                                            +30 Días (Mensual)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => applyDatePreset('end_of_month')}
                                            style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: 'white', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', color: '#0F172A' }}
                                        >
                                            Fin de Mes Actual
                                        </button>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                                            FECHA DE INICIO VIGENCIA
                                        </label>
                                        <input
                                            type="date"
                                            value={modalStartDate}
                                            onChange={(e) => setModalStartDate(e.target.value)}
                                            style={{ width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1.5px solid #CBD5E1', fontSize: '0.84rem', fontWeight: 700 }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                                            FECHA DE VENCIMIENTO (VALID UNTIL)
                                        </label>
                                        <input
                                            type="date"
                                            value={modalEndDate}
                                            onChange={(e) => setModalEndDate(e.target.value)}
                                            style={{ width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1.5px solid #CBD5E1', fontSize: '0.84rem', fontWeight: 700 }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* PASO 2: PADRÓN DE CLIENTES APLICABLES AL MODELO + BUSCADOR COMBINADO INTELIGENTE */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, fontSize: '0.84rem', color: '#0F172A' }}>
                                        <Users size={16} color={THEME.colors.primary} />
                                        <span>2. Clientes Aplicables a este Modelo — Fuente Única de Verdad ({selectedClientIdsForRun.length} marcados para aplicar hoy)</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const visibleIds = filteredModalClients.map(c => c.id);
                                                setSelectedClientIdsForRun(prev => Array.from(new Set([...prev, ...visibleIds])));
                                            }}
                                            style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #10B981', backgroundColor: '#ECFDF5', color: '#065F46', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer' }}
                                        >
                                            + Marcar Filtrados ({filteredModalClients.length})
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedClientIdsForRun([])}
                                            style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: 'white', color: '#64748B', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}
                                        >
                                            Desmarcar Todos
                                        </button>
                                    </div>
                                </div>

                                {/* REGLA DE ORO JERÁRQUICA HEREDADA DE IMAGEN 2 */}
                                <div style={{
                                    padding: '0.55rem 0.85rem',
                                    backgroundColor: '#F5F3FF',
                                    border: '1px solid #DDD6FE',
                                    borderRadius: '8px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    fontSize: '0.75rem',
                                    color: '#5B21B6',
                                    fontWeight: 600
                                }}>
                                    <Building2 size={15} style={{ flexShrink: 0, color: '#7C3AED' }} />
                                    <span>
                                        <strong>Efecto Cascada Corporativo:</strong> Al marcar una <strong>Casa Matriz</strong> se vinculan automáticamente sus sucursales dependientes. También puedes filtrar por <strong>Sucursales ({totalBranchesCount})</strong> para inscribir o excluir sedes puntuales.
                                    </span>
                                </div>

                                {/* BANDEJA SUPERIOR DE CHIPS FIJOS (MEMORIA VISUAL PERSISTENTE) */}
                                {selectedClientIdsForRun.length > 0 && (
                                    <div style={{
                                        backgroundColor: '#F0FDF4',
                                        border: '1px solid #BBF7D0',
                                        borderRadius: '10px',
                                        padding: '0.6rem 0.85rem',
                                        maxHeight: '86px',
                                        overflowY: 'auto',
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        gap: '6px',
                                        alignItems: 'center'
                                    }}>
                                        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#166534', marginRight: '4px' }}>
                                            Marcados ({selectedClientIdsForRun.length}):
                                        </span>
                                        {selectedClientIdsForRun.slice(0, 25).map(cid => {
                                            const cObj = allB2BClients.find(x => x.id === cid);
                                            if (!cObj) return null;
                                            return (
                                                <span
                                                    key={cid}
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        backgroundColor: '#FFFFFF',
                                                        border: '1px solid #86EFAC',
                                                        color: '#14532D',
                                                        fontSize: '0.7rem',
                                                        fontWeight: 700,
                                                        padding: '2px 8px',
                                                        borderRadius: '999px'
                                                    }}
                                                >
                                                    <span style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {cObj.company_name}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleClientSelection(cid, false)}
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex', color: '#15803D' }}
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                </span>
                                            );
                                        })}
                                        {selectedClientIdsForRun.length > 25 && (
                                            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#15803D' }}>
                                                +{selectedClientIdsForRun.length - 25} más...
                                            </span>
                                        )}
                                    </div>
                                )}

                                {/* OMNIBOX INTELIGENTE + PÍLDORAS DE FILTRO (CON CASAS MATRICES Y SUCURSALES) */}
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
                                        <Search size={15} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: '#64748B' }} />
                                        <input
                                            type="text"
                                            placeholder="Buscar por Casa Matriz, Sucursal, NIT o Contacto (ej: monserrate, armadillo, club, hotel)..."
                                            value={clientModalSearch}
                                            onChange={(e) => {
                                                setClientModalSearch(e.target.value);
                                                if (e.target.value.trim().length > 0 && clientModalFilterTab === 'roster') {
                                                    setClientModalFilterTab('all');
                                                }
                                            }}
                                            style={{
                                                width: '100%',
                                                padding: '8px 30px 8px 34px',
                                                borderRadius: '8px',
                                                border: '1.5px solid #CBD5E1',
                                                fontSize: '0.82rem',
                                                outline: 'none'
                                            }}
                                        />
                                        {clientModalSearch && (
                                            <button
                                                type="button"
                                                onClick={() => setClientModalSearch('')}
                                                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}
                                            >
                                                <X size={14} />
                                            </button>
                                        )}
                                    </div>

                                    <div style={{ display: 'inline-flex', backgroundColor: '#F1F5F9', padding: '3px', borderRadius: '8px', gap: '3px', flexWrap: 'wrap' }}>
                                        {([
                                            { id: 'roster', label: `Del Modelo (${modelClientsMap[selectedClient]?.length || 0})` },
                                            { id: 'selected', label: `Marcados (${selectedClientIdsForRun.length})` },
                                            { id: 'matrices', label: `Casas Matrices (${totalMatricesCount})` },
                                            { id: 'branches', label: `Sucursales (${totalBranchesCount})` },
                                            { id: 'all', label: `Todos (${allB2BClients.length})` }
                                        ] as { id: ClientModalFilterTab; label: string }[]).map(tab => {
                                            const active = clientModalFilterTab === tab.id;
                                            return (
                                                <button
                                                    key={tab.id}
                                                    type="button"
                                                    onClick={() => setClientModalFilterTab(tab.id)}
                                                    style={{
                                                        padding: '5px 10px',
                                                        borderRadius: '6px',
                                                        border: 'none',
                                                        backgroundColor: active ? 'white' : 'transparent',
                                                        color: active ? THEME.colors.primary : '#64748B',
                                                        fontWeight: active ? 800 : 600,
                                                        fontSize: '0.73rem',
                                                        cursor: 'pointer',
                                                        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none'
                                                    }}
                                                >
                                                    {tab.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* LISTA DE CLIENTES CON CHECKBOX Y JERARQUÍA CORPORATIVA (IMAGEN 2 EN IMAGEN 1) */}
                                <div style={{
                                    maxHeight: '290px',
                                    overflowY: 'auto',
                                    border: '1.5px solid #E2E8F0',
                                    borderRadius: '10px',
                                    backgroundColor: '#FFFFFF'
                                }}>
                                    {filteredModalClients.length === 0 ? (
                                        <div style={{ padding: '2rem', textAlign: 'center', color: '#64748B', fontSize: '0.84rem' }}>
                                            No hay clientes en esta vista. Usa la pestaña <strong>"Todos ({allB2BClients.length})"</strong> o el buscador para inscribir nuevos clientes a este modelo.
                                        </div>
                                    ) : filteredModalClients.map(client => {
                                        const isChecked = selectedClientIdsForRun.includes(client.id);
                                        const isInCurrentRoster = (modelClientsMap[selectedClient] || []).includes(client.id);
                                        const otherModels = client.subscribedModels.filter(m => m !== selectedClient);

                                        return (
                                            <div
                                                key={client.id}
                                                onClick={() => toggleClientSelection(client.id)}
                                                style={{
                                                    padding: '10px 14px',
                                                    borderBottom: '1px solid #F1F5F9',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    backgroundColor: isChecked ? '#F0FDF4' : 'transparent',
                                                    gap: '10px',
                                                    transition: 'background-color 0.15s'
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                                                    {isChecked ? (
                                                        <CheckSquare size={18} color="#0D7A57" strokeWidth={2.5} style={{ flexShrink: 0 }} />
                                                    ) : (
                                                        <Square size={18} color="#94A3B8" style={{ flexShrink: 0 }} />
                                                    )}
                                                    <div style={{ minWidth: 0 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                            <span style={{ fontSize: '0.84rem', fontWeight: 800, color: '#0F172A' }}>
                                                                {client.company_name}
                                                            </span>
                                                            {client.isMatriz ? (
                                                                <span style={{ fontSize: '0.65rem', backgroundColor: '#F5F3FF', color: '#6D28D9', padding: '2px 7px', borderRadius: '999px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px', border: '1px solid #DDD6FE' }}>
                                                                    <Building2 size={11} /> Casa Matriz {client.branchCount > 0 ? `(${client.branchCount} sucursales)` : ''}
                                                                </span>
                                                            ) : (
                                                                <span style={{ fontSize: '0.65rem', backgroundColor: '#E0F2FE', color: '#0284C7', padding: '2px 7px', borderRadius: '999px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px', border: '1px solid #BAE6FD' }}>
                                                                    <MapPin size={11} /> Sucursal Específica
                                                                </span>
                                                            )}
                                                            {isInCurrentRoster && (
                                                                <span style={{ fontSize: '0.64rem', backgroundColor: '#DCFCE7', color: '#15803D', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>
                                                                    Padrón {modelsMeta[selectedClient].name}
                                                                </span>
                                                            )}
                                                            {otherModels.length > 0 && (
                                                                <span style={{ fontSize: '0.64rem', backgroundColor: '#FEF3C7', color: '#B45309', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>
                                                                    También en: {otherModels.join(', ')}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div style={{ fontSize: '0.72rem', color: '#64748B', display: 'flex', gap: '8px', marginTop: '3px', flexWrap: 'wrap', alignItems: 'center' }}>
                                                            {client.isSucursal && client.parentName && (
                                                                <span style={{ color: '#6D28D9', fontWeight: 700 }}>
                                                                    Sucursal de: {client.parentName}
                                                                </span>
                                                            )}
                                                            <span>Contacto: {client.contact_name || 'N/A'}</span>
                                                            {client.nit && <span>• NIT: {client.nit}</span>}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                                    {client.isMatriz && client.branchCount > 0 && (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                toggleClientSelection(client.id, false);
                                                            }}
                                                            style={{
                                                                padding: '3px 8px',
                                                                borderRadius: '6px',
                                                                border: '1px solid #CBD5E1',
                                                                backgroundColor: '#F8FAFC',
                                                                color: '#475569',
                                                                fontSize: '0.66rem',
                                                                fontWeight: 700,
                                                                cursor: 'pointer'
                                                            }}
                                                            title="Marcar/desmarcar únicamente la Casa Matriz sin alterar sus sucursales"
                                                        >
                                                            Solo Matriz
                                                        </button>
                                                    )}
                                                    <span style={{
                                                        fontSize: '0.68rem',
                                                        padding: '2px 8px',
                                                        borderRadius: '999px',
                                                        fontWeight: 800,
                                                        backgroundColor: isChecked ? '#DCFCE7' : '#F1F5F9',
                                                        color: isChecked ? '#15803D' : '#64748B'
                                                    }}>
                                                        {isChecked ? 'Recibe Lista' : 'Omitido hoy'}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* FOOTER DEL MODAL */}
                        <div style={{
                            padding: '1rem 1.5rem',
                            borderTop: '1px solid #E2E8F0',
                            backgroundColor: '#F8FAFC',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '10px'
                        }}>
                            <div style={{ fontSize: '0.78rem', color: '#334155', fontWeight: 600 }}>
                                Se actualizarán <strong>{agreementItems.length} SKUs</strong> y se aplicarán a <strong>{selectedClientIdsForRun.length} clientes/sucursales</strong> del <strong>{modalStartDate}</strong> al <strong>{modalEndDate}</strong>.
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button
                                    type="button"
                                    onClick={() => setIsConsagrateModalOpen(false)}
                                    style={{
                                        padding: '8px 16px',
                                        borderRadius: '8px',
                                        border: '1px solid #CBD5E1',
                                        backgroundColor: 'white',
                                        color: '#64748B',
                                        fontWeight: 800,
                                        fontSize: '0.82rem',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    disabled={isSaving || selectedClientIdsForRun.length === 0}
                                    onClick={handleConfirmConsagration}
                                    style={{
                                        padding: '8px 18px',
                                        borderRadius: '8px',
                                        border: 'none',
                                        backgroundColor: selectedClientIdsForRun.length === 0 ? '#94A3B8' : THEME.colors.primary,
                                        color: 'white',
                                        fontWeight: 800,
                                        fontSize: '0.84rem',
                                        cursor: selectedClientIdsForRun.length === 0 ? 'not-allowed' : 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        boxShadow: '0 4px 12px rgba(13, 122, 87, 0.25)'
                                    }}
                                >
                                    <Save size={15} />
                                    {isSaving ? 'Guardando en Supabase...' : `Confirmar y Aplicar a ${selectedClientIdsForRun.length} Clientes`}
                                </button>
                            </div>
                        </div>
                    </div>
                    )}
                </div>
            )}
        </div>
    );
}
