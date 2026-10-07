'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { THEME, formatMoney, formatNumber } from '@/lib/adminTheme';
import { GalleryOmnibox, matchesUniversalSearch } from '@/components/common/GalleryOmnibox';
import { 
    Search, 
    Calendar, 
    Clock, 
    AlertCircle, 
    AlertTriangle,
    CircleDot,
    CheckCircle2,
    ArrowRight,
    ArrowLeft,
    ChevronUp,
    ChevronDown,
    ChevronsUpDown,
    Filter,
    Eye, 
    RefreshCw, 
    Check, 
    X, 
    ChevronRight, 
    Building,
    Building2, 
    MapPin,
    FileText,
    Plus,
    HelpCircle,
    Info,
    UploadCloud,
    Download,
    Trash2,
    Edit3,
    History,
    Users,
    CheckSquare,
    Square,
    Save,
    Sparkles,
    Printer,
    User,
    Mail,
    Send,
    ShieldCheck,
    TrendingUp,
    TrendingDown,
    Unlock,
    Bot,
    ClipboardList,
    Sliders,
    Loader2,
    Wand2,
    Zap,
    CheckCheck,
    Layers,
    FolderTree,
    Tag,
    PackageCheck,
    ShoppingCart,
    FileSpreadsheet
} from 'lucide-react';
import { searchIncludes } from '@/lib/locationNorm';
import { useAuth } from '@/lib/authContext';
import { recordLearningMemory } from '@/lib/orders/order-parser-engine';
import { 
    generateAgreementNotificationHtml, 
    generateAgreementNotificationText, 
    AgreementNotificationEmailData, 
    AgreementEmailItem 
} from '@/lib/emailTemplates';
import { CATEGORY_MAP } from '@/lib/constants';
import Letterhead from './Letterhead';
import { printViaNewWindow } from './print';

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
    updated_at?: string;
    profiles?: {
        company_name?: string;
        contact_name?: string;
        nit?: string;
        phone?: string;
        address?: string;
        parent_id?: string | null;
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
    created_at?: string;
    products?: {
        accounting_id?: string;
        unit_of_measure?: string;
        is_active?: boolean;
        category?: string;
        sku?: string;
    };
}

export interface ExtractedExcelItem {
    accounting_id: string;
    product_name: string;
    unit_price: number;
}

export function normalizeExcelText(str: any): string {
    return String(str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function parsePriceValue(raw: any): number {
    if (typeof raw === 'number') return isNaN(raw) || !isFinite(raw) ? 0 : raw;
    if (!raw) return 0;
    
    let str = String(raw).trim();
    // Limpiar símbolos de moneda, caracteres no numéricos excepto puntos, comas y guiones
    str = str.replace(/[$€COPcop\s]/g, '');
    
    const hasComma = str.includes(',');
    const hasDot = str.includes('.');
    
    if (hasComma && hasDot) {
        const lastComma = str.lastIndexOf(',');
        const lastDot = str.lastIndexOf('.');
        if (lastComma > lastDot) {
            // Formato 12.500,50 -> miles con punto, decimal con coma
            str = str.replace(/\./g, '').replace(',', '.');
        } else {
            // Formato 12,500.50 -> miles con coma, decimal con punto
            str = str.replace(/,/g, '');
        }
    } else if (hasComma) {
        const parts = str.split(',');
        if (parts.length === 2 && parts[1].length === 3 && Number(parts[0]) > 0) {
            str = parts[0] + parts[1];
        } else {
            str = str.replace(',', '.');
        }
    } else if (hasDot) {
        const parts = str.split('.');
        if (parts.length === 2 && parts[1].length === 3 && Number(parts[0]) > 0) {
            str = parts[0] + parts[1];
        } else if (parts.length > 2) {
            str = str.replace(/\./g, '');
        }
    }
    
    const num = parseFloat(str.replace(/[^0-9.-]/g, ''));
    return isNaN(num) || !isFinite(num) ? 0 : num;
}

export function extractRowsFromExcelSheet(ws: any, XLSX: any): ExtractedExcelItem[] {
    const rawMatrix: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!rawMatrix || rawMatrix.length === 0) {
        throw new Error('El archivo Excel está vacío');
    }

    let headerRowIndex = -1;
    let idColIdx = -1;
    let nameColIdx = -1;
    let priceColIdx = -1;
    let bestScore = 0;

    const maxHeaderScan = Math.min(25, rawMatrix.length);

    for (let r = 0; r < maxHeaderScan; r++) {
        const row = rawMatrix[r];
        if (!Array.isArray(row) || row.length === 0) continue;

        let curIdIdx = -1;
        let curNameIdx = -1;
        let curPriceIdx = -1;
        let score = 0;

        row.forEach((cell, colIdx) => {
            const val = normalizeExcelText(cell);
            if (!val) return;

            // Detección de Precio
            if (/(?:precio|valor|price|acordado|tarifa|costo|neto|unitario)/i.test(val)) {
                curPriceIdx = colIdx;
                score += 10;
            }
            // Detección de Código / ID
            else if (/(?:id\s*prod|prod\s*id|accounting|cod|sku|ref|item|\bid\b)/i.test(val)) {
                curIdIdx = colIdx;
                score += 10;
            }
            // Detección de Nombre / Producto
            else if (/(?:nombre|descripci|producto|detalle|articulo)/i.test(val)) {
                curNameIdx = colIdx;
                score += 5;
            }
        });

        if (curPriceIdx !== -1 && (curIdIdx !== -1 || curNameIdx !== -1)) {
            if (score > bestScore) {
                bestScore = score;
                headerRowIndex = r;
                idColIdx = curIdIdx;
                nameColIdx = curNameIdx;
                priceColIdx = curPriceIdx;
            }
        }
    }

    // Fallback: detectar fila de datos sin encabezado si las columnas contienen números de precio
    if (headerRowIndex === -1) {
        for (let r = 0; r < Math.min(10, rawMatrix.length); r++) {
            const row = rawMatrix[r];
            if (!Array.isArray(row) || row.length < 2) continue;
            for (let c = 1; c < row.length; c++) {
                const parsed = parsePriceValue(row[c]);
                if (parsed > 0) {
                    headerRowIndex = r - 1;
                    idColIdx = 0;
                    priceColIdx = c;
                    nameColIdx = row.length > 2 && c !== 1 ? 1 : -1;
                    break;
                }
            }
            if (priceColIdx !== -1) break;
        }
    }

    if (priceColIdx === -1 || (idColIdx === -1 && nameColIdx === -1)) {
        throw new Error(
            'No se identificaron las columnas requeridas en el archivo Excel. ' +
            'Asegúrate de incluir una columna de Precio (ej. "Precio Acordado" o "Precio") ' +
            'y una columna de Código (ej. "ID Producto", "Código") o de Nombre ("Nombre del Producto").'
        );
    }

    const startRow = Math.max(0, headerRowIndex + 1);
    const parsedItems: ExtractedExcelItem[] = [];

    for (let r = startRow; r < rawMatrix.length; r++) {
        const row = rawMatrix[r];
        if (!Array.isArray(row) || row.length === 0) continue;

        const rawId = idColIdx !== -1 ? String(row[idColIdx] ?? '').trim() : '';
        const rawName = nameColIdx !== -1 ? String(row[nameColIdx] ?? '').trim() : '';
        const rawPrice = priceColIdx !== -1 ? row[priceColIdx] : '';

        const unitPrice = parsePriceValue(rawPrice);

        if (unitPrice > 0 && (rawId || rawName)) {
            parsedItems.push({
                accounting_id: rawId || rawName,
                product_name: rawName || rawId,
                unit_price: unitPrice
            });
        }
    }

    if (parsedItems.length === 0) {
        throw new Error('No se encontraron filas con datos válidos de Código/Producto y Precio mayor a cero en el archivo Excel.');
    }

    return parsedItems;
}

export const SUPPLY_JUSTIFICATION_PRESETS = [
    { label: 'Menor ingreso de fruta fresca; oferta limitada en cosecha / clima', value: 'Menor ingreso de fruta fresca; oferta limitada en cosecha.' },
    { label: 'Escasez temporal por clima; baja disponibilidad en plaza', value: 'Escasez temporal por clima; baja disponibilidad.' },
    { label: 'Pico de cosecha; abundancia de producto nacional (Baja de precio)', value: 'Pico de cosecha; abundancia de producto.' },
    { label: 'Disminución en cosechas frías; menor oferta en mercado', value: 'Disminución en cosechas frías; menor oferta en mercado.' },
    { label: 'Reducción de cosecha regional; menor abastecimiento', value: 'Reducción de cosecha regional; menor abastecimiento.' },
    { label: 'Mayor ingreso nacional; oferta estable y abundante (Baja)', value: 'Mayor ingreso nacional; abundancia de producto.' },
    { label: 'Otra justificación personalizada...', value: 'CUSTOM' }
];

export default function CommercialAgreementsModule() {
    const { user, profile } = useAuth();
    const [agreements, setAgreements] = useState<Agreement[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'warning' | 'expired'>('all');
    const [sortColumn, setSortColumn] = useState<'quote_number' | 'client_name' | 'model' | 'valid_until' | 'duration' | 'status' | 'margin'>('valid_until');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
    const [modelFilter, setModelFilter] = useState<string>('all');
    
    // Master Shared Agreements State (1 to N Cascade Architecture)
    const [sharedLinks, setSharedLinks] = useState<Record<string, string[]>>({});
    const [managingSharedAgreement, setManagingSharedAgreement] = useState<Agreement | null>(null);
    const [isLinkedClientsModalOpen, setIsLinkedClientsModalOpen] = useState(false);
    const [linkedClientsSearch, setLinkedClientsSearch] = useState('');
    const [savingLinkedClients, setSavingLinkedClients] = useState(false);
    const [editableLinkedClientIds, setEditableLinkedClientIds] = useState<string[]>([]);
    
    // Details Drawer State
    const [selectedAgreement, setSelectedAgreement] = useState<Agreement | null>(null);
    const [agreementItems, setAgreementItems] = useState<AgreementItem[]>([]);
    const [loadingItems, setLoadingItems] = useState(false);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [drawerSearchTerm, setDrawerSearchTerm] = useState('');

    const filteredAgreementItems = useMemo(() => {
        if (!drawerSearchTerm.trim()) return agreementItems;
        return agreementItems.filter(item => matchesUniversalSearch(
            item,
            drawerSearchTerm,
            it => [
                it.product_name || '',
                (it.products?.accounting_id || '').toString(),
                it.products?.category || '',
                it.products?.unit_of_measure || '',
                it.products?.sku || ''
            ],
            it => it.products?.accounting_id || it.product_id
        ));
    }, [agreementItems, drawerSearchTerm]);

    // In-situ price editing in drawer
    const [editingItemId, setEditingItemId] = useState<string | null>(null);
    const [editingPriceValue, setEditingPriceValue] = useState<string>('');
    const [editingJustification, setEditingJustification] = useState<string>('');
    const [itemJustifications, setItemJustifications] = useState<Record<string, string>>({});
    const [savingPriceItemId, setSavingPriceItemId] = useState<string | null>(null);
    const [agreementAuditLogs, setAgreementAuditLogs] = useState<Record<string, any[]>>({});
    const [hoveredAuditItemId, setHoveredAuditItemId] = useState<string | null>(null);
    const [latestAgreementLog, setLatestAgreementLog] = useState<any | null>(null);
    const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);
    const printAgreementDocRef = useRef<HTMLDivElement>(null);

    // Partial Batch Adjustment Modal State (Adendas Cosecha/Consumo)
    const [isPartialBatchModalOpen, setIsPartialBatchModalOpen] = useState(false);
    const [partialBatchSearch, setPartialBatchSearch] = useState('');
    const [partialBatchItems, setPartialBatchItems] = useState<Array<{
        itemId: string;
        productId: string;
        name: string;
        unit: string;
        costBasis: number;
        oldPrice: number;
        newPrice: string;
        justification: string;
    }>>([]);
    const [isSavingPartialBatch, setIsSavingPartialBatch] = useState(false);
    const [bulkJustification, setBulkJustification] = useState('');
    const [isMiniImportOpen, setIsMiniImportOpen] = useState(false);
    const [pasteText, setPasteText] = useState('');
    
    // HITL Email Dispatch Modal State
    const [isEmailModalOpen, setIsEmailModalOpen] = useState<boolean>(false);
    const [emailModalMode, setEmailModalMode] = useState<'NEW_AGREEMENT' | 'PRICE_UPDATE_DIFF'>('PRICE_UPDATE_DIFF');
    const [emailRecipients, setEmailRecipients] = useState<Array<{ email: string; label: string; selected: boolean }>>([]);
    const [isAuthorizedChecked, setIsAuthorizedChecked] = useState<boolean>(true);
    const [isSendingEmail, setIsSendingEmail] = useState<boolean>(false);

    // In-Drawer Add Product Modal State
    const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);
    const [addProductSearch, setAddProductSearch] = useState('');
    const [addProductResults, setAddProductResults] = useState<any[]>([]);
    const [selectedAddProduct, setSelectedAddProduct] = useState<any>(null);
    const [newProductPrice, setNewProductPrice] = useState('');
    const [isSavingNewProduct, setIsSavingNewProduct] = useState(false);
    const [isSearchingProductsToAdd, setIsSearchingProductsToAdd] = useState(false);

    // Master Institutional Template State
    const [masterTemplate, setMasterTemplate] = useState<{
        id: string;
        model_snapshot_name: string;
        created_at: string;
        subtotal_amount: number;
        total_amount: number;
        items: any[];
    } | null>(null);
    const [loadingMasterTemplate, setLoadingMasterTemplate] = useState(false);
    const [isUploadMasterModalOpen, setIsUploadMasterModalOpen] = useState(false);
    const [masterUploadedItems, setMasterUploadedItems] = useState<{ accounting_id: string; unit_price: number; product_name?: string }[]>([]);
    const [masterExcelPreviewData, setMasterExcelPreviewData] = useState<{
        items: Array<{
            accounting_id: string;
            product_name: string;
            unit_price: number;
            matched_product: any | null;
            cost_basis: number;
            margin_percent: number;
            iva_rate: number;
            is_inactive?: boolean;
        }>;
        matchedCount: number;
        unmatchedCount: number;
        inactiveCount?: number;
        avgMargin: number;
        totalSubtotal: number;
    } | null>(null);
    const [masterParsedFile, setMasterParsedFile] = useState<File | null>(null);
    const [masterParsing, setMasterParsing] = useState(false);
    const [masterSaving, setMasterSaving] = useState(false);
    const [masterModelName, setMasterModelName] = useState('');
    const [confirmApplyMasterTarget, setConfirmApplyMasterTarget] = useState<Agreement | null>(null);
    const [isApplyingMasterToAgreement, setIsApplyingMasterToAgreement] = useState<string | null>(null);

    // Renewal Modal State
    const [renewTarget, setRenewTarget] = useState<Agreement | null>(null);
    const [newExpiryDate, setNewExpiryDate] = useState('');
    const [renewing, setRenewing] = useState(false);

    // Create Modal State
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [createStep, setCreateStep] = useState<1 | 2 | 3>(1);
    const [b2bClients, setB2bClients] = useState<any[]>([]);
    const [selectedClientId, setSelectedClientId] = useState('');
    const [isMultiClientMode, setIsMultiClientMode] = useState(false);
    const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
    const [agreementName, setAgreementName] = useState('');
    const [isNameManuallyEdited, setIsNameManuallyEdited] = useState(false);
    const [clientSearchQuery, setClientSearchQuery] = useState('');
    const [clientTypeFilter, setClientTypeFilter] = useState<'all' | 'matriz' | 'sucursal'>('all');
    const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
    const [focusedOptionIndex, setFocusedOptionIndex] = useState(0);
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [durationValue, setDurationValue] = useState<number | string>(2);
    const [durationUnit, setDurationUnit] = useState<string>('weeks');
    const [uploadedItems, setUploadedItems] = useState<{ accounting_id: string; unit_price: number; product_name?: string }[]>([]);
    const [excelPreviewData, setExcelPreviewData] = useState<{
        items: Array<{
            accounting_id: string;
            client_product_name?: string;
            product_name: string;
            unit?: string;
            unit_price: number;
            matched_product: any | null;
            cost_basis: number;
            margin_percent: number;
            iva_rate: number;
            confidence?: 'high' | 'medium' | 'low' | 'unmatched';
            is_inactive?: boolean;
        }>;
        matchedCount: number;
        unmatchedCount: number;
        inactiveCount: number;
        avgMargin: number;
        totalSubtotal: number;
    } | null>(null);
    const [excelPreviewSearch, setExcelPreviewSearch] = useState('');
    const [excelPreviewFilter, setExcelPreviewFilter] = useState<'all' | 'matched' | 'unmatched' | 'inactive'>('all');
    const [parsedFile, setParsedFile] = useState<File | null>(null);
    const [parsing, setParsing] = useState(false);
    const [savingAgreement, setSavingAgreement] = useState(false);
    const [isKpiCollapsed, setIsKpiCollapsed] = useState(false);
    const [isMainKpiCollapsed, setIsMainKpiCollapsed] = useState(false);

    // AI Ingestion & Reconciliation Workbench State
    const [digestMode, setDigestMode] = useState<'ai' | 'standard'>('ai');
    const [isDigestingWithAI, setIsDigestingWithAI] = useState(false);
    const [digestingStatusText, setDigestingStatusText] = useState('');
    const [catalogProducts, setCatalogProducts] = useState<any[]>([]);
    const [activeCellSearchRowIdx, setActiveCellSearchRowIdx] = useState<number | null>(null);
    const [activeCellSearchQuery, setActiveCellSearchQuery] = useState('');
    const [focusedCellOptionIdx, setFocusedCellOptionIdx] = useState(0);

    // Quick Product In-Situ Modal State
    const [isQuickProductModalOpen, setIsQuickProductModalOpen] = useState(false);
    const [quickProductRowIdx, setQuickProductRowIdx] = useState<number | null>(null);
    const [quickProductName, setQuickProductName] = useState('');
    const [quickProductUnit, setQuickProductUnit] = useState('Kg');
    const [quickProductCategory, setQuickProductCategory] = useState('FR');
    const [quickProductCostBasis, setQuickProductCostBasis] = useState('');
    const [quickProductIvaRate, setQuickProductIvaRate] = useState(0);
    const [isCreatingQuickProduct, setIsCreatingQuickProduct] = useState(false);

    // Edit Modal State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingAgreement, setEditingAgreement] = useState<Agreement | null>(null);
    const [editStartDate, setEditStartDate] = useState('');
    const [editDurationValue, setEditDurationValue] = useState<number | string>(2);
    const [editDurationUnit, setEditDurationUnit] = useState<string>('weeks');
    const [editUploadedItems, setEditUploadedItems] = useState<{ accounting_id: string; unit_price: number; product_name?: string }[]>([]);
    const [editExcelPreviewData, setEditExcelPreviewData] = useState<{
        items: Array<{
            accounting_id: string;
            product_name: string;
            unit_price: number;
            matched_product?: any;
            cost_basis?: number;
            margin_percent?: number;
            iva_rate?: number;
            is_inactive?: boolean;
        }>;
        matchedCount: number;
        unmatchedCount: number;
        inactiveCount: number;
        avgMargin: number;
        totalSubtotal: number;
    } | null>(null);
    const [editExcelPreviewSearch, setEditExcelPreviewSearch] = useState('');
    const [editExcelPreviewFilter, setEditExcelPreviewFilter] = useState<'all' | 'matched' | 'unmatched' | 'inactive'>('all');
    const [editParsedFile, setEditParsedFile] = useState<File | null>(null);
    const [editParsing, setEditParsing] = useState(false);
    const [editSaving, setEditSaving] = useState(false);
    const [editStep, setEditStep] = useState<number>(1);
    const [editConfirmationChecked, setEditConfirmationChecked] = useState(false);
    const [isEditKpiCollapsed, setIsEditKpiCollapsed] = useState(false);

    // Drawer Inactive SKUs Auto-activation State
    const [activatingDrawerSkus, setActivatingDrawerSkus] = useState(false);

    // Notification State
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' | 'info' } | null>(null);

    const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };

    const fetchAgreements = async () => {
        setLoading(true);
        try {
            // Fetch quotes where status is 'agreement' and join profiles
            const { data, error } = await supabase
                .from('quotes')
                .select('*, profiles:client_id (company_name, contact_name, nit, phone, address, parent_id), items:quote_items(margin_percent)')
                .eq('status', 'agreement')
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Also load shared agreement links from app_settings
            const { data: linkSettings } = await supabase
                .from('app_settings')
                .select('key, value')
                .ilike('key', 'agreement_clients:%');

            const linksMap: Record<string, string[]> = {};
            if (linkSettings) {
                linkSettings.forEach(s => {
                    const quoteId = s.key.replace('agreement_clients:', '');
                    try {
                        linksMap[quoteId] = JSON.parse(s.value || '[]');
                    } catch (e) {
                        linksMap[quoteId] = [];
                    }
                });
            }
            setSharedLinks(linksMap);
            setAgreements(data || []);
        } catch (err: any) {
            console.error('Error fetching agreements:', err);
            showToast('Error al cargar acuerdos: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenManageLinkedClients = (agreement: Agreement) => {
        setManagingSharedAgreement(agreement);
        setEditableLinkedClientIds(sharedLinks[agreement.id] || []);
        setLinkedClientsSearch('');
        setIsLinkedClientsModalOpen(true);
    };

    const handleSaveLinkedClients = async () => {
        if (!managingSharedAgreement) return;
        setSavingLinkedClients(true);
        try {
            const quoteId = managingSharedAgreement.id;
            const newIds = editableLinkedClientIds;
            
            // 1. Update app_settings
            await supabase
                .from('app_settings')
                .upsert({
                    key: `agreement_clients:${quoteId}`,
                    value: JSON.stringify(newIds),
                    description: `Clientes vinculados a la lista maestra ${managingSharedAgreement.model_snapshot_name || managingSharedAgreement.client_name}`
                });

            // 2. Update local state
            setSharedLinks(prev => ({
                ...prev,
                [quoteId]: newIds
            }));

            // 3. Update profiles active_master_agreement_id in background
            for (const cId of newIds) {
                const client = b2bClients.find(c => c.id === cId);
                const logData = (client as any)?.logistics_data || {};
                await supabase
                    .from('profiles')
                    .update({
                        logistics_data: {
                            ...logData,
                            active_master_agreement_id: quoteId
                        }
                    })
                    .eq('id', cId);
            }

            // 4. Audit log
            await supabase.from('audit_logs').insert({
                user_id: user?.id || null,
                action: 'UPDATE_shared_agreement_clients',
                details: `Actualizadas vinculaciones de la lista maestra "${managingSharedAgreement.model_snapshot_name || managingSharedAgreement.client_name}": ${newIds.length} clientes/sucursales asociados.`
            });

            showToast(`Vinculaciones guardadas con éxito (${newIds.length} clientes/sucursales asociados en cascada)`, 'success');
            setIsLinkedClientsModalOpen(false);
        } catch (err: any) {
            console.error('Error saving linked clients:', err);
            showToast('Error al guardar vinculaciones: ' + err.message, 'error');
        } finally {
            setSavingLinkedClients(false);
        }
    };

    const fetchB2bClients = async () => {
        try {
            // Fetch all b2b_client profiles to compute branch relations and support both Casas Matrices and specific Sucursales
            const { data, error } = await supabase
                .from('profiles')
                .select('id, company_name, contact_name, nit, parent_id, is_corporate_parent, address, phone')
                .eq('role', 'b2b_client')
                .order('company_name');

            if (error) throw error;

            const allProfiles = data || [];
            
            // Map branch counts for each parent_id and parent company names
            const branchCounts: Record<string, number> = {};
            const parentNameMap: Record<string, string> = {};
            allProfiles.forEach(p => {
                parentNameMap[p.id] = p.company_name || p.contact_name || 'Casa Matriz';
                if (p.parent_id) {
                    branchCounts[p.parent_id] = (branchCounts[p.parent_id] || 0) + 1;
                }
            });

            // Enrich all B2B clients: both Casas Matrices and Sucursales
            const enrichedClients = allProfiles.map(p => {
                const isSucursal = Boolean(p.parent_id);
                const isMatriz = !isSucursal;
                return {
                    ...p,
                    isMatriz,
                    isSucursal,
                    parentName: isSucursal ? (parentNameMap[p.parent_id] || 'Casa Matriz') : null,
                    branchCount: isMatriz ? (branchCounts[p.id] || 0) : 0
                };
            });

            setB2bClients(enrichedClients);
        } catch (err: any) {
            console.error('Error fetching B2B clients:', err);
        }
    };

    const fetchAllProductsMap = async (): Promise<Record<string, any>> => {
        const productMap: Record<string, any> = {};

        // 1. Fetch official active costs from commercial_cost_matrix
        const { data: costMatrixData, error: matrixErr } = await supabase
            .from('commercial_cost_matrix')
            .select('product_id, manual_cost')
            .eq('is_active', true);

        if (matrixErr) {
            console.error('Error fetching commercial_cost_matrix:', matrixErr);
        }

        const costMatrixMap: Record<string, number> = {};
        (costMatrixData || []).forEach(r => {
            if (r.manual_cost !== null && r.manual_cost !== undefined && Number(r.manual_cost) > 0) {
                costMatrixMap[r.product_id] = Number(r.manual_cost);
            }
        });

        // 1.1 Fallback to recent purchases for SKUs not yet configured in matrix
        const { data: recentPurchases } = await supabase
            .from('purchases')
            .select('product_id, unit_price')
            .gt('unit_price', 0)
            .order('created_at', { ascending: false })
            .limit(2000);

        const purchaseFallbackMap: Record<string, number> = {};
        (recentPurchases || []).forEach(pur => {
            if (!purchaseFallbackMap[pur.product_id] && pur.unit_price > 0) {
                purchaseFallbackMap[pur.product_id] = Number(pur.unit_price);
            }
        });

        // 2. Fetch full product catalogue with pagination
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
            const from = page * pageSize;
            const to = from + pageSize - 1;
            const { data, error } = await supabase
                .from('products')
                .select('id, name, accounting_id, iva_rate, unit_of_measure, sku, is_active')
                .range(from, to);

            if (error) {
                console.error('Error fetching paginated products:', error);
                throw error;
            }

            if (data && data.length > 0) {
                data.forEach(p => {
                    // Use official Costo Base FruFresco from commercial_cost_matrix or purchases fallback
                    const officialCost = costMatrixMap[p.id] || purchaseFallbackMap[p.id] || 0;
                    p.cost_basis = officialCost;
                    productMap[p.id] = p;
                    if (p.accounting_id) {
                        const accId = String(p.accounting_id).trim();
                        productMap[accId] = p;
                        productMap[accId.toLowerCase()] = p;
                    }
                    if (p.sku) {
                        const sku = String(p.sku).trim();
                        productMap[sku] = p;
                        productMap[sku.toLowerCase()] = p;
                    }
                    if (p.name) {
                        const normName = normalizeExcelText(p.name);
                        if (normName) {
                            productMap[normName] = p;
                        }
                    }
                });
                if (data.length < pageSize) {
                    hasMore = false;
                } else {
                    page++;
                }
            } else {
                hasMore = false;
            }
        }
        return productMap;
    };

    const findProductInMap = (productMap: Record<string, any>, rawId?: string, rawName?: string): any => {
        const idKey = String(rawId || '').trim();
        if (idKey) {
            if (productMap[idKey]) return productMap[idKey];
            if (productMap[idKey.toLowerCase()]) return productMap[idKey.toLowerCase()];
            const normId = normalizeExcelText(idKey);
            if (normId && productMap[normId]) return productMap[normId];
        }
        if (rawName) {
            const normName = normalizeExcelText(rawName);
            if (normName && productMap[normName]) return productMap[normName];
        }
        return null;
    };

    // Date / Time formatting matching the ERP photograph:
    // Header format: 05/sep/2026 - 10:13 a.m.
    // Table format:  05/sep/2026 10:13 a.m.
    const formatAuditDateTime = (dateStr?: string | null): string => {
        if (!dateStr) return '---';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '---';
        const day = String(d.getDate()).padStart(2, '0');
        const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
        const month = months[d.getMonth()];
        const year = d.getFullYear();
        let hours = d.getHours();
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'p.m.' : 'a.m.';
        hours = hours % 12;
        hours = hours ? hours : 12;
        return `${day}/${month}/${year} ${hours}:${minutes} ${ampm}`;
    };

    const formatHeaderDateTime = (dateStr?: string | null): string => {
        if (!dateStr) return '---';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '---';
        const day = String(d.getDate()).padStart(2, '0');
        const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
        const month = months[d.getMonth()];
        const year = d.getFullYear();
        let hours = d.getHours();
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'p.m.' : 'a.m.';
        hours = hours % 12;
        hours = hours ? hours : 12;
        return `${day}/${month}/${year} - ${hours}:${minutes} ${ampm}`;
    };

    const getCurrentCollaboratorName = (): string => {
        return profile?.contact_name || 
               (user?.user_metadata as any)?.full_name || 
               (user?.user_metadata as any)?.name || 
               (profile as any)?.company_name || 
               user?.email?.split('@')[0] || 
               'Julissa Arévalo Ramirez';
    };

    const getItemAuditInfo = (item: AgreementItem) => {
        const itemLogs = agreementAuditLogs[item.id] || [];
        if (itemLogs.length > 0) {
            const latest = itemLogs[0];
            const dateStr = latest.created_at || (latest.details && latest.details.changed_at);
            const author = latest.collaborator_name || latest.collaborator_id || getCurrentCollaboratorName();
            return {
                formatted: formatAuditDateTime(dateStr),
                author: author,
                isModified: true,
                rawDate: dateStr
            };
        }
        
        // Ítems no modificados individualmente: conservan la fecha y autor original de la lista
        const dateStr = item.created_at || selectedAgreement?.created_at || selectedAgreement?.start_date;
        const initialAuthor = (selectedAgreement as any)?.created_by_name || 
                              (selectedAgreement as any)?.author || 
                              'Julissa Arévalo Ramirez';
        return {
            formatted: formatAuditDateTime(dateStr),
            author: initialAuthor,
            isModified: false,
            rawDate: dateStr
        };
    };

    const getLastUpdateInfo = () => {
        if (!selectedAgreement) return { author: 'Julissa Arévalo Ramirez', formatted: '---' };

        if (latestAgreementLog) {
            const dateStr = latestAgreementLog.created_at || (latestAgreementLog.details && latestAgreementLog.details.changed_at);
            const author = latestAgreementLog.collaborator_name || getCurrentCollaboratorName();
            return {
                author: author,
                formatted: formatHeaderDateTime(dateStr)
            };
        }

        let newestItemLog: any = null;
        Object.values(agreementAuditLogs).forEach(logs => {
            if (logs && logs.length > 0) {
                const first = logs[0];
                if (!newestItemLog || new Date(first.created_at) > new Date(newestItemLog.created_at)) {
                    newestItemLog = first;
                }
            }
        });

        if (newestItemLog) {
            const dateStr = newestItemLog.created_at || (newestItemLog.details && newestItemLog.details.changed_at);
            const author = newestItemLog.collaborator_name || getCurrentCollaboratorName();
            return {
                author: author,
                formatted: formatHeaderDateTime(dateStr)
            };
        }

        const dateStr = selectedAgreement.updated_at || selectedAgreement.created_at || selectedAgreement.start_date;
        const author = 'Julissa Arévalo Ramirez';
        return {
            author: author,
            formatted: formatHeaderDateTime(dateStr)
        };
    };

    const fetchAgreementAuditLogs = async (quoteId: string) => {
        try {
            let logsData: any[] = [];
            const { data, error } = await supabase
                .from('audit_logs')
                .select('*')
                .filter('details->>quote_id', 'eq', quoteId)
                .order('created_at', { ascending: false });

            if (!error && data && data.length > 0) {
                logsData = data;
            } else {
                const { data: allCommLogs } = await supabase
                    .from('audit_logs')
                    .select('*')
                    .eq('module', 'COMMERCIAL')
                    .order('created_at', { ascending: false })
                    .limit(200);

                if (allCommLogs) {
                    logsData = allCommLogs.filter(log => {
                        const d = log.details;
                        return d && (d.quote_id === quoteId || d.quoteId === quoteId);
                    });
                }
            }

            const map: Record<string, any[]> = {};
            let newestLog: any = null;
            logsData.forEach(log => {
                if (!newestLog) newestLog = log;
                const d = log.details;
                if (d) {
                    const itemId = d.quote_item_id || d.itemId;
                    if (itemId) {
                        if (!map[itemId]) map[itemId] = [];
                        map[itemId].push(log);
                    }
                }
            });
            setAgreementAuditLogs(map);
            if (newestLog) {
                setLatestAgreementLog(newestLog);
            }
        } catch (err) {
            console.warn('Failed to load audit logs:', err);
        }
    };

    const fetchMasterTemplate = async () => {
        setLoadingMasterTemplate(true);
        try {
            const res = await fetch('/api/commercial/master-template');
            if (res.ok) {
                const json = await res.json();
                if (json.template) {
                    setMasterTemplate({
                        ...json.template,
                        items: json.items || []
                    });
                } else {
                    setMasterTemplate(null);
                }
            }
        } catch (err) {
            console.warn('Error loading master template:', err);
        } finally {
            setLoadingMasterTemplate(false);
        }
    };

    const fetchCatalogProducts = async () => {
        try {
            const allProducts: any[] = [];
            let page = 0;
            const pageSize = 1000;
            let hasMore = true;

            while (hasMore) {
                const from = page * pageSize;
                const to = from + pageSize - 1;
                const { data, error } = await supabase
                    .from('products')
                    .select('id, name, accounting_id, sku, unit_of_measure, is_active, iva_rate')
                    .range(from, to)
                    .order('name');

                if (error) throw error;
                if (data && data.length > 0) {
                    allProducts.push(...data);
                    if (data.length < pageSize) {
                        hasMore = false;
                    } else {
                        page++;
                    }
                } else {
                    hasMore = false;
                }
            }
            setCatalogProducts(allProducts);
        } catch (err) {
            console.warn('Error fetching catalog products for autocomplete:', err);
        }
    };

    useEffect(() => {
        fetchAgreements();
        fetchB2bClients();
        fetchMasterTemplate();
        fetchCatalogProducts();
    }, []);

    const computeDefaultAgreementName = (clientObj?: any, isMulti?: boolean, startD?: string) => {
        const dStr = startD || startDate || new Date().toISOString().split('T')[0];
        const parts = dStr.split('-');
        const dateTag = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0].slice(-2)}` : dStr;
        if (isMulti) {
            const monthNames = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
            const mIdx = parts.length === 3 ? parseInt(parts[1], 10) - 1 : new Date().getMonth();
            const yStr = parts.length === 3 ? parts[0] : String(new Date().getFullYear());
            const monthName = monthNames[mIdx] || 'OCTUBRE';
            return `MENSUAL GENERAL - ${monthName} ${yStr}`;
        }
        if (clientObj?.company_name) {
            return `${clientObj.company_name} - ${dateTag}`;
        }
        return `Acuerdo Comercial - ${dateTag}`;
    };

    const handleOpenCreateModal = () => {
        const today = new Date().toISOString().split('T')[0];
        setStartDate(today);
        setDurationValue(2);
        setDurationUnit('weeks');
        setSelectedClientId('');
        setSelectedClientIds([]);
        setIsMultiClientMode(false);
        setClientTypeFilter('all');
        setClientSearchQuery('');
        setUploadedItems([]);
        setExcelPreviewData(null);
        setParsedFile(null);
        setIsNameManuallyEdited(false);
        setAgreementName(computeDefaultAgreementName(undefined, false, today));
        setCreateStep(1);
        setIsCreateModalOpen(true);
    };

    const handleApplyMasterToCreateFlow = () => {
        if (!masterTemplate || !masterTemplate.items || masterTemplate.items.length === 0) {
            showToast('No hay productos cargados en el Modelo Institucional General', 'error');
            return;
        }

        const items = masterTemplate.items;
        const mappedUploadedItems = items.map((it: any) => ({
            accounting_id: it.products?.accounting_id || it.product_id,
            unit_price: Number(it.unit_price) || 0,
            product_name: it.product_name
        }));

        let subtotal = 0;
        let totalTax = 0;
        let totalMargin = 0;

        const previewItems = items.map((it: any) => {
            const price = Number(it.unit_price) || 0;
            const cost = Number(it.cost_basis) || 0;
            const margin = Number(it.margin_percent) || 0;
            const iva = Number(it.iva_rate) || 0;
            const isInactive = it.products?.is_active === false;
            subtotal += price;
            totalTax += price * (iva / 100);
            totalMargin += margin;

            return {
                accounting_id: it.products?.accounting_id || 'N/A',
                product_name: it.product_name,
                unit_price: price,
                matched_product: it.products || { name: it.product_name, accounting_id: it.products?.accounting_id },
                cost_basis: cost,
                margin_percent: margin,
                iva_rate: iva,
                is_inactive: isInactive
            };
        });

        const inactiveCount = previewItems.filter(it => it.is_inactive).length;
        const avgMargin = previewItems.length > 0 ? Math.round((totalMargin / previewItems.length) * 100) / 100 : 0;

        setUploadedItems(mappedUploadedItems);
        setExcelPreviewData({
            items: previewItems,
            matchedCount: previewItems.length,
            unmatchedCount: 0,
            inactiveCount: inactiveCount,
            avgMargin: avgMargin,
            totalSubtotal: subtotal
        });

        showToast(`Precios del Modelo Institucional General (${previewItems.length} SKUs) cargados con éxito`, 'success');
    };

    const handleApplyOpenConsumptionToCreateFlow = async () => {
        try {
            setParsing(true);
            const { data: costMatrixData } = await supabase
                .from('commercial_cost_matrix')
                .select('product_id, manual_cost')
                .eq('is_active', true);
            const costMap: Record<string, number> = {};
            (costMatrixData || []).forEach((c: any) => {
                if (c.manual_cost) costMap[c.product_id] = Number(c.manual_cost);
            });

            const { data: allProds, error } = await supabase
                .from('products')
                .select('id, name, accounting_id, sku, unit_of_measure, is_active, iva_rate')
                .order('name');

            if (error || !allProds || allProds.length === 0) {
                showToast('No se pudieron cargar los productos del catálogo', 'error');
                return;
            }

            const mappedUploadedItems = allProds.map(p => ({
                accounting_id: p.accounting_id ? String(p.accounting_id) : p.sku || p.id,
                unit_price: 0,
                product_name: p.name
            }));

            const previewItems = allProds.map(p => ({
                accounting_id: p.accounting_id ? String(p.accounting_id) : p.sku || 'N/A',
                client_product_name: p.name,
                product_name: p.name,
                unit: p.unit_of_measure || 'Kg',
                unit_price: 0,
                matched_product: p,
                cost_basis: costMap[p.id] || 0,
                margin_percent: 0,
                iva_rate: Number(p.iva_rate) || 0,
                confidence: 'high' as const,
                is_inactive: p.is_active === false
            }));

            const inactiveCount = previewItems.filter(it => it.is_inactive).length;

            setUploadedItems(mappedUploadedItems);
            setExcelPreviewData({
                items: previewItems,
                matchedCount: previewItems.length,
                unmatchedCount: 0,
                inactiveCount: inactiveCount,
                avgMargin: 0,
                totalSubtotal: 0
            });

            // Asignar nombre sugerido canónico si no ha sido editado
            const clientObj = b2bClients.find(c => c.id === selectedClientId);
            const today = startDate || new Date().toISOString().split('T')[0];
            const parts = today.split('-');
            const dateTag = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0].slice(-2)}` : today;
            const clientName = isMultiClientMode ? 'Multicliente' : (clientObj?.company_name || 'Cliente');
            setAgreementName(`[CONSUMO ABIERTO] ${clientName} - ${dateTag}`);

            showToast(`Lista Abierta a Consumo generada (${previewItems.length} SKUs a $0 COP)`, 'success');
        } catch (err: any) {
            console.error('Error generating open consumption template:', err);
            showToast('Error al generar lista abierta a consumo: ' + err.message, 'error');
        } finally {
            setParsing(false);
        }
    };

    const handleApplyMasterToAgreement = async (agreement: Agreement) => {
        setIsApplyingMasterToAgreement(agreement.id);
        try {
            const author = user?.email || (profile as any)?.company_name || 'Comercial FruFresco';
            const res = await fetch('/api/commercial/master-template/apply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    quote_id: agreement.id,
                    author
                })
            });

            const json = await res.json();
            if (!res.ok) {
                throw new Error(json.error || 'Error al aplicar modelo institucional general');
            }

            showToast(`Precios del Modelo General aplicados a ${agreement.profiles?.company_name || agreement.client_name}`, 'success');
            setConfirmApplyMasterTarget(null);
            
            // Refresh items in drawer and table
            await handleViewPrices(agreement);
            await fetchAgreements();
        } catch (err: any) {
            console.error('Error applying master template:', err);
            showToast('Error: ' + err.message, 'error');
        } finally {
            setIsApplyingMasterToAgreement(null);
        }
    };

    const handleMasterFileDrop = async (file: File) => {
        setMasterParsedFile(file);
        setMasterParsing(true);

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const bstr = evt.target?.result;
                const XLSX = await import('xlsx');
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];

                const parsedItems = extractRowsFromExcelSheet(ws, XLSX);
                const productMap = await fetchAllProductsMap();

                const previewItems: any[] = [];
                let matchedCount = 0;
                let unmatchedCount = 0;
                let inactiveCount = 0;
                let totalMargin = 0;
                let subtotal = 0;

                parsedItems.forEach(item => {
                    const dbProduct = findProductInMap(productMap, item.accounting_id, item.product_name);
                    if (dbProduct) {
                        matchedCount++;
                        const isInactive = dbProduct.is_active === false;
                        if (isInactive) inactiveCount++;
                        const costBasis = dbProduct.cost_basis || 0;
                        const margin = item.unit_price > 0 ? Math.round(((item.unit_price - costBasis) / item.unit_price) * 10000) / 100 : 0;
                        const ivaRate = dbProduct.iva_rate || 0;
                        totalMargin += margin;
                        subtotal += item.unit_price;

                        previewItems.push({
                            accounting_id: dbProduct.accounting_id || item.accounting_id,
                            product_name: dbProduct.name || item.product_name,
                            unit_price: item.unit_price,
                            matched_product: dbProduct,
                            cost_basis: costBasis,
                            margin_percent: margin,
                            iva_rate: ivaRate,
                            product_id: dbProduct.id,
                            is_inactive: isInactive
                        });
                    } else {
                        unmatchedCount++;
                        previewItems.push({
                            accounting_id: item.accounting_id,
                            product_name: item.product_name || 'Producto no encontrado en catálogo',
                            unit_price: item.unit_price,
                            matched_product: null,
                            cost_basis: 0,
                            margin_percent: 0,
                            iva_rate: 0
                        });
                    }
                });

                const avgMargin = matchedCount > 0 ? Math.round((totalMargin / matchedCount) * 100) / 100 : 0;

                setMasterUploadedItems(parsedItems);
                setMasterExcelPreviewData({
                    items: previewItems,
                    matchedCount,
                    unmatchedCount,
                    inactiveCount,
                    avgMargin,
                    totalSubtotal: subtotal
                });
                if (inactiveCount > 0) {
                    showToast(`Excel procesado: ${matchedCount} reconocidos (${inactiveCount} inactivos en catálogo)`, 'warning');
                } else {
                    showToast(`Excel procesado: ${matchedCount} productos cruzados con el catálogo`, 'success');
                }
            } catch (err: any) {
                console.error('Error parsing master excel:', err);
                showToast(err.message || 'Error al leer Excel', 'error');
            } finally {
                setMasterParsing(false);
            }
        };
        reader.readAsBinaryString(file);
    };

    const handleSaveMasterTemplate = async () => {
        if (!masterExcelPreviewData || masterExcelPreviewData.matchedCount === 0) {
            showToast('No hay productos válidos para guardar en el Modelo General', 'error');
            return;
        }

        setMasterSaving(true);
        try {
            // Poka-Yoke: Alert and offer auto-activation if inactive SKUs exist
            const inactiveItems = masterExcelPreviewData.items
                .filter(it => it.matched_product && it.is_inactive);

            if (inactiveItems.length > 0) {
                const confirmMsg = `ATENCIÓN COMERCIAL:\n\nSe detectaron ${inactiveItems.length} producto(s) inactivo(s) en el catálogo en este Modelo General:\n${inactiveItems.slice(0, 5).map(p => `• ${p.product_name}`).join('\n')}${inactiveItems.length > 5 ? `\n... y ${inactiveItems.length - 5} más` : ''}\n\n¿Deseas ACTIVARLOS AUTOMÁTICAMENTE en el catálogo para que puedan ser vendidos y seleccionados en la toma de pedidos?\n\n- [Aceptar]: Activar productos y guardar modelo.\n- [Cancelar]: Volver para revisar la lista.`;
                
                const shouldActivate = window.confirm(confirmMsg);
                if (!shouldActivate) {
                    setMasterSaving(false);
                    return;
                }

                const inactiveIds = Array.from(new Set(inactiveItems.map(p => (p as any).product_id || p.matched_product.id)));
                const { error: actErr } = await supabase
                    .from('products')
                    .update({ is_active: true })
                    .in('id', inactiveIds);

                if (actErr) {
                    console.error('Error auto-activando productos en master template:', actErr);
                    showToast('Advertencia: No se pudieron activar algunos productos', 'warning');
                } else {
                    showToast(`${inactiveIds.length} producto(s) reactivado(s) exitosamente en catálogo`, 'success');
                }
            }

            const validItems = masterExcelPreviewData.items
                .filter(it => it.matched_product && (it as any).product_id)
                .map(it => ({
                    product_id: (it as any).product_id,
                    product_name: it.product_name,
                    unit_price: it.unit_price,
                    cost_basis: it.cost_basis,
                    margin_percent: it.margin_percent,
                    iva_rate: it.iva_rate
                }));

            const author = user?.email || (profile as any)?.company_name || 'Comercial FruFresco';
            const res = await fetch('/api/commercial/master-template', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: masterModelName || `Institucional General - ${new Date().toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '-')}`,
                    items: validItems,
                    author
                })
            });

            const json = await res.json();
            if (!res.ok) {
                throw new Error(json.error || 'Error al guardar el Modelo General');
            }

            showToast(`Modelo Institucional General guardado con éxito (${validItems.length} SKUs)`, 'success');
            setIsUploadMasterModalOpen(false);
            setMasterExcelPreviewData(null);
            setMasterUploadedItems([]);
            setMasterParsedFile(null);
            await fetchMasterTemplate();
        } catch (err: any) {
            console.error('Error saving master template:', err);
            showToast('Error al guardar modelo general: ' + err.message, 'error');
        } finally {
            setMasterSaving(false);
        }
    };

    const handleViewPrices = async (agreement: Agreement) => {
        setSelectedAgreement(agreement);
        setIsDrawerOpen(true);
        setLoadingItems(true);
        setEditingItemId(null);
        setEditingPriceValue('');
        try {
            const { data, error } = await supabase
                .from('quote_items')
                .select('*, products:product_id (accounting_id, unit_of_measure, is_active, category)')
                .eq('quote_id', agreement.id);

            if (error) throw error;
            setAgreementItems(data || []);
            fetchAgreementAuditLogs(agreement.id);
        } catch (err: any) {
            console.error('Error fetching agreement items:', err);
            showToast('Error al cargar lista de precios: ' + err.message, 'error');
        } finally {
            setLoadingItems(false);
        }
    };

    const handleAutoActivateDrawerInactive = async () => {
        const inactiveItems = agreementItems.filter(it => it.products?.is_active === false);
        if (inactiveItems.length === 0) return;

        const confirm = window.confirm(`ATENCIÓN COMERCIAL:\n\nSe detectaron ${inactiveItems.length} producto(s) inactivo(s) en este acuerdo:\n${inactiveItems.slice(0, 5).map(p => `• ${p.product_name}`).join('\n')}${inactiveItems.length > 5 ? `\n... y ${inactiveItems.length - 5} más` : ''}\n\n¿Deseas REACTIVARLOS en el catálogo maestro para que puedan ser seleccionados en la toma de pedidos?`);
        if (!confirm) return;

        setActivatingDrawerSkus(true);
        try {
            const productIds = Array.from(new Set(inactiveItems.map(it => it.product_id)));
            const { error } = await supabase
                .from('products')
                .update({ is_active: true })
                .in('id', productIds);

            if (error) throw error;

            showToast(`${productIds.length} producto(s) reactivado(s) en el catálogo correctamente`, 'success');

            setAgreementItems(prev => prev.map(it => {
                if (productIds.includes(it.product_id)) {
                    return {
                        ...it,
                        products: {
                            ...it.products,
                            is_active: true
                        }
                    };
                }
                return it;
            }));
        } catch (err: any) {
            console.error('Error reactivando productos:', err);
            showToast('Error al reactivar productos: ' + err.message, 'error');
        } finally {
            setActivatingDrawerSkus(false);
        }
    };

    const handleSaveSinglePrice = async (item: AgreementItem) => {
        const newPrice = Number(editingPriceValue);
        if (!newPrice || isNaN(newPrice) || newPrice <= 0) {
            showToast('El precio debe ser un valor numérico mayor a 0', 'error');
            return;
        }

        if (newPrice === item.unit_price) {
            setEditingItemId(null);
            return;
        }

        if (!selectedAgreement) return;

        setSavingPriceItemId(item.id);
        try {
            const costBasis = Number(item.cost_basis) || 0;
            const newMarginPercent = newPrice > 0 ? Math.round(((newPrice - costBasis) / newPrice) * 10000) / 100 : 0;
            const ivaRate = Number(item.iva_rate) || 0;
            const newIvaAmount = newPrice * (ivaRate / 100);
            const newTotalPrice = newPrice + newIvaAmount;

            // 1. Update quote_items in Supabase
            const { error: itemErr } = await supabase
                .from('quote_items')
                .update({
                    unit_price: newPrice,
                    margin_percent: newMarginPercent,
                    iva_amount: newIvaAmount,
                    total_price: newTotalPrice
                })
                .eq('id', item.id);

            if (itemErr) throw itemErr;

            // 2. Recalculate quote totals without modifying dates or agreement validity
            const oldPrice = item.unit_price;
            const priceDiff = newPrice - oldPrice;
            const ivaDiff = newIvaAmount - (item.iva_amount || 0);

            const newSubtotal = Math.max(0, (selectedAgreement.subtotal_amount || 0) + priceDiff);
            const newTotalTax = Math.max(0, (selectedAgreement.total_tax_amount || 0) + ivaDiff);
            const newTotal = newSubtotal + newTotalTax;

            const { error: quoteErr } = await supabase
                .from('quotes')
                .update({
                    subtotal_amount: newSubtotal,
                    total_tax_amount: newTotalTax,
                    total_amount: newTotal
                })
                .eq('id', selectedAgreement.id);

            if (quoteErr) console.warn('Could not update quote totals:', quoteErr);

            // 3. Register audit trail in audit_logs
            const collaboratorName = user?.email || (profile as any)?.company_name || 'Comercial FruFresco';
            const collaboratorId = user?.id || null;
            const effectiveJustification = editingJustification.trim() || 'Ajuste periódico de cosecha / mercado';

            try {
                await supabase.from('audit_logs').insert({
                    action: 'UPDATE_quote_item_price',
                    module: 'COMMERCIAL',
                    collaborator_id: collaboratorId,
                    collaborator_name: collaboratorName,
                    details: {
                        quote_id: selectedAgreement.id,
                        quote_item_id: item.id,
                        product_id: item.product_id,
                        product_name: item.product_name,
                        old_price: oldPrice,
                        new_price: newPrice,
                        old_margin: item.margin_percent,
                        new_margin: newMarginPercent,
                        cost_basis: costBasis,
                        justification: effectiveJustification,
                        changed_at: new Date().toISOString()
                    }
                });
            } catch (auditErr) {
                console.warn('Audit log insert warning:', auditErr);
            }

            // Save justification in memory
            setItemJustifications(prev => ({ ...prev, [item.id]: effectiveJustification }));

            // 4. Update local state
            setAgreementItems(prev => prev.map(it => it.id === item.id ? {
                ...it,
                unit_price: newPrice,
                margin_percent: newMarginPercent,
                iva_amount: newIvaAmount,
                total_price: newTotalPrice
            } : it));

            setSelectedAgreement(prev => prev ? {
                ...prev,
                subtotal_amount: newSubtotal,
                total_tax_amount: newTotalTax,
                total_amount: newTotal
            } : null);

            fetchAgreements();
            await fetchAgreementAuditLogs(selectedAgreement.id);

            showToast(`Precio actualizado para ${item.product_name}: $${formatNumber(newPrice)}`, 'success');
            setEditingItemId(null);
            setEditingJustification('');
        } catch (err: any) {
            console.error('Error saving single price:', err);
            showToast('Error al actualizar precio: ' + err.message, 'error');
        } finally {
            setSavingPriceItemId(null);
        }
    };

    const handleOpenPartialBatchModal = () => {
        if (!selectedAgreement) return;
        
        // Build items for batch modal
        const initialBatch = agreementItems.map(it => {
            const logs = agreementAuditLogs[it.id];
            const hasLogs = logs && logs.length > 0;
            const oldestLog = hasLogs ? logs[logs.length - 1] : null;
            const latestLog = hasLogs ? logs[0] : null;
            const oldP = oldestLog?.details?.old_price || it.unit_price;
            const just = itemJustifications[it.id] || latestLog?.details?.justification || '';

            return {
                itemId: it.id,
                productId: it.product_id,
                name: it.product_name,
                unit: it.products?.unit_of_measure || 'Kg',
                costBasis: Number(it.cost_basis) || 0,
                oldPrice: oldP,
                newPrice: String(it.unit_price),
                justification: just
            };
        });

        setPartialBatchItems(initialBatch);
        setPartialBatchSearch('');
        setIsPartialBatchModalOpen(true);
    };

    const handleSavePartialBatch = async () => {
        if (!selectedAgreement) return;
        setIsSavingPartialBatch(true);
        try {
            const modified = partialBatchItems.filter(p => {
                const num = Number(p.newPrice);
                return num > 0 && num !== p.oldPrice;
            });

            if (modified.length === 0) {
                showToast('No se detectaron variaciones de precio en este lote.', 'warning');
                setIsPartialBatchModalOpen(false);
                return;
            }

            const collaboratorName = user?.email || (profile as any)?.company_name || 'Comercial FruFresco';
            const collaboratorId = user?.id || null;
            let subtotalDelta = 0;

            for (const mod of modified) {
                const newPriceNum = Number(mod.newPrice);
                const costBasis = mod.costBasis;
                const newMarginPercent = newPriceNum > 0 ? Math.round(((newPriceNum - costBasis) / newPriceNum) * 10000) / 100 : 0;
                const diff = newPriceNum - mod.oldPrice;
                subtotalDelta += diff;

                await supabase.from('quote_items').update({
                    unit_price: newPriceNum,
                    margin_percent: newMarginPercent,
                    total_price: newPriceNum
                }).eq('id', mod.itemId);

                const just = mod.justification.trim() || 'Ajuste periódico de cosecha / abastecimiento';
                setItemJustifications(prev => ({ ...prev, [mod.itemId]: just }));

                await supabase.from('audit_logs').insert({
                    action: 'UPDATE_quote_item_price',
                    module: 'COMMERCIAL',
                    collaborator_id: collaboratorId,
                    collaborator_name: collaboratorName,
                    details: {
                        quote_id: selectedAgreement.id,
                        quote_item_id: mod.itemId,
                        product_id: mod.productId,
                        product_name: mod.name,
                        old_price: mod.oldPrice,
                        new_price: newPriceNum,
                        old_margin: 0,
                        new_margin: newMarginPercent,
                        cost_basis: costBasis,
                        justification: just,
                        changed_at: new Date().toISOString()
                    }
                });
            }

            const updatedSubtotal = Math.max(0, (selectedAgreement.subtotal_amount || 0) + subtotalDelta);
            await supabase.from('quotes').update({
                subtotal_amount: updatedSubtotal,
                total_amount: updatedSubtotal + (selectedAgreement.total_tax_amount || 0)
            }).eq('id', selectedAgreement.id);

            showToast(`Adenda parcial aplicada: ${modified.length} productos actualizados`, 'success');
            setIsPartialBatchModalOpen(false);
            
            await handleViewPrices(selectedAgreement);
            await fetchAgreements();

            handleOpenNotificationModal('PRICE_UPDATE_DIFF');
        } catch (err: any) {
            console.error('Error saving partial batch:', err);
            showToast('Error al guardar adenda: ' + err.message, 'error');
        } finally {
            setIsSavingPartialBatch(false);
        }
    };

    const handleApplyBulkJustification = (justificationToApply?: string) => {
        const targetJust = (justificationToApply ?? bulkJustification).trim();
        if (!targetJust) {
            showToast('Selecciona o escribe una justificación para aplicar.', 'warning');
            return;
        }
        const modifiedCount = partialBatchItems.filter(p => Number(p.newPrice) > 0 && Number(p.newPrice) !== p.oldPrice).length;
        if (modifiedCount === 0) {
            showToast('Modifica primero los precios de los productos para asignarles la justificación.', 'warning');
            return;
        }
        setPartialBatchItems(prev => prev.map(p => {
            const isMod = Number(p.newPrice) > 0 && Number(p.newPrice) !== p.oldPrice;
            return isMod ? { ...p, justification: targetJust } : p;
        }));
        showToast(`Justificación aplicada a ${modifiedCount} productos modificados`, 'success');
    };

    const handleMiniExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const XLSX = await import('xlsx');
            const buffer = await file.arrayBuffer();
            const wb = XLSX.read(buffer, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rawRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
            
            if (!rawRows || rawRows.length === 0) {
                showToast('El archivo Excel está vacío.', 'warning');
                return;
            }

            let updatedCount = 0;
            setPartialBatchItems(prev => {
                const next = [...prev];
                for (const row of rawRows) {
                    if (!Array.isArray(row) || row.length === 0) continue;
                    let foundPrice: number | null = null;
                    let foundNameOrId: string = '';
                    let foundJustification: string = '';

                    for (let c = 0; c < row.length; c++) {
                        const cellVal = row[c];
                        const num = parsePriceValue(cellVal);
                        if (num > 0 && foundPrice === null && (typeof cellVal === 'number' || (typeof cellVal === 'string' && /[\d]/.test(cellVal) && !isNaN(num) && num > 100))) {
                            foundPrice = num;
                        } else if (typeof cellVal === 'string' && cellVal.trim().length > 1) {
                            if (!foundNameOrId) {
                                foundNameOrId = cellVal.trim();
                            } else if (!foundJustification && cellVal.length > 5) {
                                foundJustification = cellVal.trim();
                            }
                        }
                    }

                    if (foundPrice && foundPrice > 0 && foundNameOrId) {
                        const normSearch = normalizeExcelText(foundNameOrId);
                        const matchIdx = next.findIndex(p => {
                            const normPName = normalizeExcelText(p.name);
                            return normPName === normSearch || normPName.includes(normSearch) || normSearch.includes(normPName);
                        });

                        if (matchIdx !== -1) {
                            next[matchIdx] = {
                                ...next[matchIdx],
                                newPrice: String(foundPrice),
                                justification: foundJustification || next[matchIdx].justification || (bulkJustification || 'Ajuste de cosecha / abastecimiento')
                            };
                            updatedCount++;
                        }
                    }
                }
                return next;
            });

            if (updatedCount > 0) {
                showToast(`${updatedCount} productos emparejados y actualizados desde el Excel`, 'success');
                setIsMiniImportOpen(false);
            } else {
                showToast('No se encontraron coincidencias de productos en el archivo de novedades.', 'warning');
            }
        } catch (err: any) {
            console.error('Error parsing mini excel:', err);
            showToast('Error al procesar archivo: ' + err.message, 'error');
        } finally {
            e.target.value = '';
        }
    };

    const handlePasteRowsFromClipboard = (text: string) => {
        if (!text.trim()) {
            showToast('Pega texto con productos y precios primero.', 'warning');
            return;
        }
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        let updatedCount = 0;

        setPartialBatchItems(prev => {
            const next = [...prev];
            for (const line of lines) {
                const tokens = line.split(/[\t;|,]+/).map(t => t.trim()).filter(Boolean);
                if (tokens.length < 2) continue;

                let nameOrId = tokens[0];
                let price = parsePriceValue(tokens[1]);
                let just = tokens[2] || '';

                if (price === 0 && parsePriceValue(tokens[0]) > 0) {
                    price = parsePriceValue(tokens[0]);
                    nameOrId = tokens[1];
                }

                if (price > 0 && nameOrId) {
                    const normSearch = normalizeExcelText(nameOrId);
                    const matchIdx = next.findIndex(p => {
                        const normPName = normalizeExcelText(p.name);
                        return normPName === normSearch || normPName.includes(normSearch) || normSearch.includes(normPName);
                    });

                    if (matchIdx !== -1) {
                        next[matchIdx] = {
                            ...next[matchIdx],
                            newPrice: String(price),
                            justification: just || next[matchIdx].justification || (bulkJustification || 'Ajuste de cosecha / abastecimiento')
                        };
                        updatedCount++;
                    }
                }
            }
            return next;
        });

        if (updatedCount > 0) {
            showToast(`${updatedCount} productos actualizados desde el portapapeles`, 'success');
            setPasteText('');
            setIsMiniImportOpen(false);
        } else {
            showToast('No se identificaron coincidencias en el texto pegado.', 'warning');
        }
    };

    const handleOpenNotificationModal = (forcedMode?: 'NEW_AGREEMENT' | 'PRICE_UPDATE_DIFF') => {
        if (!selectedAgreement) return;

        const clientProfile = selectedAgreement.profiles;
        const mainEmail = (selectedAgreement as any).client_email || (clientProfile as any)?.email || '';
        const additionalEmails = (clientProfile as any)?.additional_billing_emails || [];
        
        const initialRecipients: Array<{ email: string; label: string; selected: boolean }> = [];
        if (mainEmail) {
            initialRecipients.push({
                email: mainEmail,
                label: `Receptor Principal (${selectedAgreement.client_name})`,
                selected: true
            });
        }
        if (Array.isArray(additionalEmails)) {
            additionalEmails.forEach((em: string) => {
                if (em && em !== mainEmail && !initialRecipients.some(r => r.email === em)) {
                    initialRecipients.push({
                        email: em,
                        label: 'Facturación / Economato',
                        selected: true
                    });
                }
            });
        }

        const hasModifiedLogs = Object.keys(agreementAuditLogs).length > 0;
        const mode = forcedMode || (hasModifiedLogs ? 'PRICE_UPDATE_DIFF' : 'NEW_AGREEMENT');
        
        setEmailModalMode(mode);
        setEmailRecipients(initialRecipients.length > 0 ? initialRecipients : [
            { email: 'pedidos@frufresco.com', label: 'Copia Administrativa', selected: true }
        ]);
        setIsAuthorizedChecked(true);
        setIsEmailModalOpen(true);
    };

    const handleDispatchAgreementEmail = async () => {
        if (!selectedAgreement) return;
        if (!isAuthorizedChecked) {
            showToast('Debe autorizar expresamente el despacho de la notificación.', 'warning');
            return;
        }

        const selectedEmails = emailRecipients.filter(r => r.selected && r.email).map(r => r.email.trim());
        if (selectedEmails.length === 0) {
            showToast('Seleccione al menos un destinatario de correo.', 'warning');
            return;
        }

        setIsSendingEmail(true);
        try {
            const isDiff = emailModalMode === 'PRICE_UPDATE_DIFF';
            
            let emailItems: AgreementEmailItem[] = [];
            if (isDiff) {
                agreementItems.forEach(item => {
                    const logs = agreementAuditLogs[item.id];
                    if (logs && logs.length > 0) {
                        const oldestLog = logs[logs.length - 1];
                        const latestLog = logs[0];
                        const oldPrice = oldestLog?.details?.old_price || item.unit_price;
                        const justification = itemJustifications[item.id] || latestLog?.details?.justification || 'Ajuste periódico de cosecha / mercado';
                        const rawCat = item.products?.category || '';
                        const catName = CATEGORY_MAP[rawCat] || rawCat || 'Portafolio General';
                        emailItems.push({
                            name: item.product_name,
                            unit: item.products?.unit_of_measure || 'Kg',
                            price: item.unit_price,
                            oldPrice: oldPrice,
                            isModified: true,
                            priceDiff: item.unit_price - oldPrice,
                            justification: justification,
                            category: catName
                        });
                    }
                });

                if (emailItems.length === 0) {
                    emailItems = agreementItems.slice(0, 10).map(it => {
                        const rawCat = it.products?.category || '';
                        const catName = CATEGORY_MAP[rawCat] || rawCat || 'Portafolio General';
                        return {
                            name: it.product_name,
                            unit: it.products?.unit_of_measure || 'Kg',
                            price: it.unit_price,
                            oldPrice: it.unit_price,
                            isModified: true,
                            justification: itemJustifications[it.id] || 'Ajuste periódico de cosecha / mercado',
                            category: catName
                        };
                    });
                }
            } else {
                emailItems = agreementItems.map(it => {
                    const rawCat = it.products?.category || '';
                    const catName = CATEGORY_MAP[rawCat] || rawCat || 'Portafolio General';
                    return {
                        name: it.product_name,
                        unit: it.products?.unit_of_measure || 'Kg',
                        price: it.unit_price,
                        category: catName
                    };
                });
            }

            const authorName = user?.email || (profile as any)?.company_name || 'Comercial FruFresco';
            const payload: AgreementNotificationEmailData = {
                mode: emailModalMode,
                agreement_name: selectedAgreement.model_snapshot_name || 'Acuerdo Comercial FruFresco',
                agreement_code: `ACU-${selectedAgreement.quote_number || selectedAgreement.id.slice(0, 6)}`,
                client_name: selectedAgreement.client_name,
                client_nit: selectedAgreement.profiles?.nit,
                valid_from: selectedAgreement.start_date ? new Date(selectedAgreement.start_date).toLocaleDateString('es-CO') : 'Inmediata',
                valid_until: selectedAgreement.valid_until ? new Date(selectedAgreement.valid_until).toLocaleDateString('es-CO') : 'Indefinida',
                items: emailItems,
                responsible_agent: authorName,
                modified_at: new Date().toLocaleDateString('es-CO') + ' ' + new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
            };

            const htmlContent = generateAgreementNotificationHtml(payload);
            const textContent = generateAgreementNotificationText(payload);
            const subject = isDiff
                ? `Actualización de Precios • ${selectedAgreement.client_name} (${payload.agreement_code})`
                : `Nuevo Acuerdo Comercial de Precios • ${selectedAgreement.client_name} (${payload.agreement_code})`;

            for (const email of selectedEmails) {
                const { error: mailErr } = await supabase.from('mail').insert({
                    to_email: email,
                    subject: subject,
                    message: { html: htmlContent, text: textContent },
                    template: { name: isDiff ? 'agreement_price_diff' : 'agreement_new', data: payload },
                    status: 'pending',
                    inbox_type: 'commercial'
                });

                if (mailErr) console.warn('Error encolando mail para ' + email, mailErr);
            }

            try {
                fetch('/api/mail/process', { method: 'POST' }).catch(() => {});
            } catch (e) {}

            showToast(`Notificación formal despachada con éxito a ${selectedEmails.length} destinatario(s)!`, 'success');
            setIsEmailModalOpen(false);
        } catch (err: any) {
            console.error('Error dispatching agreement email:', err);
            showToast('Error al despachar el correo: ' + err.message, 'error');
        } finally {
            setIsSendingEmail(false);
        }
    };

    const handleOpenAddProductModal = () => {
        setSelectedAddProduct(null);
        setAddProductSearch('');
        setAddProductResults([]);
        setNewProductPrice('');
        setIsAddProductModalOpen(true);
    };

    const handleSearchProductsToAdd = async (query: string) => {
        setAddProductSearch(query);
        if (!query || query.trim().length < 2) {
            setAddProductResults([]);
            return;
        }
        setIsSearchingProductsToAdd(true);
        try {
            const cleanQ = query.trim();
            const isNumeric = /^\d+$/.test(cleanQ);

            let dbQuery = supabase
                .from('products')
                .select('id, name, sku, accounting_id, unit_of_measure, iva_rate, is_active')
                .limit(25);

            if (isNumeric) {
                dbQuery = dbQuery.or(`name.ilike.%${cleanQ}%,accounting_id.eq.${cleanQ}`);
            } else {
                dbQuery = dbQuery.ilike('name', `%${cleanQ}%`);
            }

            const { data, error } = await dbQuery;
            if (error) throw error;

            if (data && data.length > 0) {
                const productIds = data.map(p => p.id);
                const { data: costs } = await supabase
                    .from('commercial_cost_matrix')
                    .select('product_id, manual_cost')
                    .in('product_id', productIds)
                    .eq('is_active', true);

                const costMap: Record<string, number> = {};
                (costs || []).forEach(c => {
                    if (c.manual_cost && Number(c.manual_cost) > 0) {
                        costMap[c.product_id] = Number(c.manual_cost);
                    }
                });

                const enriched = data.map(p => ({
                    ...p,
                    cost_basis: costMap[p.id] || 0
                }));
                setAddProductResults(enriched);
            } else {
                setAddProductResults([]);
            }
        } catch (err: any) {
            console.error('Error searching products to add:', err);
        } finally {
            setIsSearchingProductsToAdd(false);
        }
    };

    const handleSelectProductToAdd = (product: any) => {
        setSelectedAddProduct(product);
        const existing = agreementItems.find(it => it.product_id === product.id);
        if (existing) {
            setNewProductPrice(String(existing.unit_price || ''));
        } else {
            const suggested = Number(product.cost_basis) || '';
            setNewProductPrice(suggested ? String(suggested) : '');
        }
    };

    const handleSaveProductToAgreement = async () => {
        if (!selectedAddProduct || !selectedAgreement) return;
        const priceNum = Number(newProductPrice);
        if (!priceNum || isNaN(priceNum) || priceNum <= 0) {
            showToast('El precio acordado debe ser mayor a $0', 'error');
            return;
        }

        setIsSavingNewProduct(true);
        try {
            const costBasis = Number(selectedAddProduct.cost_basis) || 0;
            const marginPercent = priceNum > 0 ? Math.round(((priceNum - costBasis) / priceNum) * 10000) / 100 : 0;
            const ivaRate = Number(selectedAddProduct.iva_rate) || 0;
            const ivaAmount = priceNum * (ivaRate / 100);
            const totalPrice = priceNum + ivaAmount;

            const existingItem = agreementItems.find(it => it.product_id === selectedAddProduct.id);

            if (existingItem) {
                const { error: updErr } = await supabase
                    .from('quote_items')
                    .update({
                        unit_price: priceNum,
                        cost_basis: costBasis,
                        margin_percent: marginPercent,
                        iva_rate: ivaRate,
                        iva_amount: ivaAmount,
                        total_price: totalPrice
                    })
                    .eq('id', existingItem.id);

                if (updErr) throw updErr;

                setAgreementItems(prev => prev.map(it => it.id === existingItem.id ? {
                    ...it,
                    unit_price: priceNum,
                    cost_basis: costBasis,
                    margin_percent: marginPercent,
                    iva_rate: ivaRate,
                    iva_amount: ivaAmount,
                    total_price: totalPrice
                } : it));

                showToast(`Precio actualizado para "${selectedAddProduct.name}" en el acuerdo`, 'success');
            } else {
                const { data: inserted, error: insErr } = await supabase
                    .from('quote_items')
                    .insert({
                        quote_id: selectedAgreement.id,
                        product_id: selectedAddProduct.id,
                        product_name: selectedAddProduct.name,
                        quantity: 1,
                        cost_basis: costBasis,
                        margin_percent: marginPercent,
                        unit_price: priceNum,
                        iva_rate: ivaRate,
                        iva_amount: ivaAmount,
                        total_price: totalPrice
                    })
                    .select('*, products:product_id (accounting_id, unit_of_measure, is_active, category)')
                    .single();

                if (insErr) throw insErr;

                if (inserted) {
                    setAgreementItems(prev => [inserted, ...prev]);
                }

                showToast(`"${selectedAddProduct.name}" agregado al acuerdo comercial con éxito`, 'success');
            }

            // Recalculate quote totals
            const { data: allItems } = await supabase
                .from('quote_items')
                .select('unit_price, iva_amount, total_price')
                .eq('quote_id', selectedAgreement.id);

            const newSubtotal = (allItems || []).reduce((acc, it) => acc + (Number(it.unit_price) || 0), 0);
            const newTotalTax = (allItems || []).reduce((acc, it) => acc + (Number(it.iva_amount) || 0), 0);
            const newTotal = newSubtotal + newTotalTax;

            await supabase
                .from('quotes')
                .update({
                    subtotal_amount: newSubtotal,
                    total_tax_amount: newTotalTax,
                    total_amount: newTotal
                })
                .eq('id', selectedAgreement.id);

            setSelectedAgreement(prev => prev ? {
                ...prev,
                subtotal_amount: newSubtotal,
                total_tax_amount: newTotalTax,
                total_amount: newTotal
            } : null);

            fetchAgreements();
            fetchAgreementAuditLogs(selectedAgreement.id);

            // Audit log
            const collaboratorName = user?.email || (profile as any)?.company_name || 'Comercial FruFresco';
            const collaboratorId = user?.id || null;
            try {
                await supabase.from('audit_logs').insert({
                    action: existingItem ? 'UPDATE_quote_item_price' : 'INSERT_quote_item',
                    module: 'COMMERCIAL',
                    collaborator_id: collaboratorId,
                    collaborator_name: collaboratorName,
                    details: {
                        quote_id: selectedAgreement.id,
                        product_id: selectedAddProduct.id,
                        product_name: selectedAddProduct.name,
                        unit_price: priceNum,
                        cost_basis: costBasis,
                        margin_percent: marginPercent
                    }
                });
            } catch (aErr) {
                console.warn('Audit error:', aErr);
            }

            setIsAddProductModalOpen(false);
            setSelectedAddProduct(null);
            setAddProductSearch('');
            setAddProductResults([]);
            setNewProductPrice('');
        } catch (err: any) {
            console.error('Error adding product to agreement:', err);
            showToast('Error al agregar producto al acuerdo: ' + err.message, 'error');
        } finally {
            setIsSavingNewProduct(false);
        }
    };

    const downloadTemplate = async () => {
        try {
            const rows = [
                {
                    'ID Producto (Cod. Contable)': '',
                    'Nombre del Producto': '',
                    'Precio Acordado': ''
                }
            ];
            
            const XLSX = await import('xlsx');
            const worksheet = XLSX.utils.json_to_sheet(rows);
            
            // Adjust column widths for readability
            worksheet['!cols'] = [
                { wch: 28 }, // ID Producto (Cod. Contable)
                { wch: 35 }, // Nombre del Producto
                { wch: 18 }  // Precio Acordado
            ];

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Plantilla Precios B2B');
            XLSX.writeFile(workbook, 'Plantilla_Acuerdo_Comercial.xlsx');
            showToast('Plantilla limpia descargada con éxito', 'success');
        } catch (err: any) {
            console.error('Error generating template:', err);
            showToast('Error al descargar plantilla: ' + err.message, 'error');
        }
    };

    const handleExportAgreementExcel = async () => {
        if (!selectedAgreement || agreementItems.length === 0) {
            showToast('No hay productos cargados en este acuerdo para exportar', 'warning');
            return;
        }
        try {
            const XLSX = await import('xlsx');
            
            // 1. Agrupar por categoría
            const groups: Record<string, AgreementItem[]> = {};
            agreementItems.forEach(item => {
                const rawCat = item.products?.category || '';
                const catName = CATEGORY_MAP[rawCat] || rawCat || 'Portafolio General';
                if (!groups[catName]) groups[catName] = [];
                groups[catName].push(item);
            });

            // 2. Ordenar categorías alfabéticamente (A-Z)
            const sortedCategories = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

            const rows: any[] = [];
            const clientName = selectedAgreement.profiles?.company_name || selectedAgreement.client_name || 'Cliente';
            const refCode = formatAgreementNumber(selectedAgreement.quote_number, selectedAgreement.created_at);
            const validFrom = selectedAgreement.start_date ? new Date(selectedAgreement.start_date.includes('T') ? selectedAgreement.start_date : selectedAgreement.start_date + 'T12:00:00').toLocaleDateString('es-CO') : 'Inmediata';
            const validUntil = selectedAgreement.valid_until ? new Date(selectedAgreement.valid_until.includes('T') ? selectedAgreement.valid_until : selectedAgreement.valid_until + 'T12:00:00').toLocaleDateString('es-CO') : 'Indefinida';

            sortedCategories.forEach(catName => {
                const catItems = [...groups[catName]].sort((a, b) => (a.product_name || '').localeCompare(b.product_name || '', 'es', { sensitivity: 'base' }));
                
                catItems.forEach(it => {
                    rows.push({
                        'Categoría': catName.toUpperCase(),
                        'Código Contable': it.products?.accounting_id || '---',
                        'Producto / Insumo': it.product_name,
                        'Presentación': it.products?.unit_of_measure || 'Kg',
                        'Precio Pactado (COP)': it.unit_price,
                        'Tarifa IVA (%)': it.iva_rate || 0,
                        'Cliente': clientName,
                        'NIT / CC': selectedAgreement.profiles?.nit || 'N/A',
                        'Referencia': refCode,
                        'Vigencia Desde': validFrom,
                        'Vigencia Hasta': validUntil
                    });
                });
            });

            const worksheet = XLSX.utils.json_to_sheet(rows);
            
            // Adjust column widths for clean readability
            worksheet['!cols'] = [
                { wch: 18 }, // Categoría
                { wch: 18 }, // Código Contable
                { wch: 38 }, // Producto / Insumo
                { wch: 15 }, // Presentación
                { wch: 22 }, // Precio Pactado (COP)
                { wch: 15 }, // Tarifa IVA (%)
                { wch: 35 }, // Cliente
                { wch: 18 }, // NIT / CC
                { wch: 20 }, // Referencia
                { wch: 16 }, // Vigencia Desde
                { wch: 16 }  // Vigencia Hasta
            ];

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Propuesta de Precios');
            
            const cleanClient = clientName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
            const cleanRef = refCode.replace(/\s+/g, '_');
            const fileName = `Propuesta_Precios_${cleanRef}_${cleanClient}.xlsx`;
            
            XLSX.writeFile(workbook, fileName);
            showToast('Lista de precios exportada a Excel (.xlsx) con éxito', 'success');
        } catch (err: any) {
            console.error('Error exportando Excel de propuesta:', err);
            showToast('Error al exportar a Excel: ' + err.message, 'error');
        }
    };

    const handleDigestAgreementFile = async (file: File) => {
        if (!file) return;
        setParsedFile(file);
        setParsing(true);
        setIsDigestingWithAI(true);
        setDigestingStatusText(
            digestMode === 'ai' || file.name.toLowerCase().endsWith('.pdf')
                ? 'Gemini 3.8 Flash analizando archivo, interpretando precios y cruzando con catálogo maestro...'
                : 'Procesando archivo de tarifas y pre-validando catálogo...'
        );

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('mode', digestMode);
            if (selectedClientId) {
                formData.append('clientProfileId', selectedClientId);
            }

            const res = await fetch('/api/commercial/digest-agreement-file', {
                method: 'POST',
                body: formData
            });

            const result = await res.json();
            if (!res.ok) {
                throw new Error(result.error || 'Error al procesar el archivo con el motor comercial');
            }

            if (!result.items || result.items.length === 0) {
                throw new Error('No se identificaron productos con precio mayor a cero en el archivo.');
            }

            setExcelPreviewData({
                items: result.items,
                matchedCount: result.stats.matchedCount,
                unmatchedCount: result.stats.unmatchedCount,
                inactiveCount: result.stats.inactiveCount,
                avgMargin: result.stats.avgMargin,
                totalSubtotal: result.stats.totalSubtotal
            });

            setUploadedItems(result.items.map((it: any) => ({
                accounting_id: it.accounting_id,
                product_name: it.product_name,
                unit_price: it.unit_price
            })));

            if (result.validityStart && (!startDate || startDate === new Date().toISOString().split('T')[0])) {
                setStartDate(result.validityStart);
            }

            if (result.stats.unmatchedCount > 0) {
                showToast(`Archivo procesado (${result.modelUsed || 'IA'}): ${result.stats.matchedCount} reconocidos, ${result.stats.unmatchedCount} pendientes de asignar`, 'warning');
            } else {
                showToast(`Archivo interpretado con éxito (${result.modelUsed || 'IA'}): ${result.stats.matchedCount} productos cruzados al 100%`, 'success');
            }
        } catch (err: any) {
            console.error('[CommercialAgreementsModule] Error digesting file:', err);
            showToast(err.message || 'Error al procesar archivo', 'error');
            setParsedFile(null);
            setUploadedItems([]);
            setExcelPreviewData(null);
        } finally {
            setParsing(false);
            setIsDigestingWithAI(false);
            setDigestingStatusText('');
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        handleDigestAgreementFile(file);
    };

    const handleAssignProductToRow = (rowIdx: number, product: any) => {
        if (!excelPreviewData) return;
        const currentItem = excelPreviewData.items[rowIdx];
        const costBasis = product.cost_basis || 0;
        const margin = currentItem.unit_price > 0
            ? Math.round(((currentItem.unit_price - costBasis) / currentItem.unit_price) * 10000) / 100
            : 0;

        const newItems = [...excelPreviewData.items];
        newItems[rowIdx] = {
            ...currentItem,
            accounting_id: product.accounting_id ? String(product.accounting_id) : (product.sku || ''),
            product_name: product.name,
            matched_product: product,
            cost_basis: costBasis,
            margin_percent: margin,
            iva_rate: product.iva_rate || 0,
            confidence: 'high',
            is_inactive: product.is_active === false
        };

        const matchedCount = newItems.filter(it => Boolean(it.matched_product)).length;
        const unmatchedCount = newItems.length - matchedCount;
        const inactiveCount = newItems.filter(it => it.matched_product && it.is_inactive).length;
        const totalMarginSum = newItems.filter(it => Boolean(it.matched_product)).reduce((acc, it) => acc + it.margin_percent, 0);
        const avgMargin = matchedCount > 0 ? Math.round((totalMarginSum / matchedCount) * 10) / 10 : 0;
        const totalSubtotal = newItems.reduce((acc, it) => acc + it.unit_price, 0);

        setExcelPreviewData({
            items: newItems,
            matchedCount,
            unmatchedCount,
            inactiveCount,
            avgMargin,
            totalSubtotal
        });

        setUploadedItems(newItems.map(it => ({
            accounting_id: it.accounting_id,
            product_name: it.product_name,
            unit_price: it.unit_price
        })));

        if (selectedClientId && currentItem.client_product_name) {
            recordLearningMemory(supabase, selectedClientId, currentItem.client_product_name, product.id, product.unit_of_measure);
        }

        setActiveCellSearchRowIdx(null);
        setActiveCellSearchQuery('');
        showToast(`Asignado: ${product.name}`, 'success');
    };

    const handleDiscardRow = (rowIdx: number) => {
        if (!excelPreviewData) return;
        const newItems = excelPreviewData.items.filter((_, idx) => idx !== rowIdx);
        const matchedCount = newItems.filter(it => Boolean(it.matched_product)).length;
        const unmatchedCount = newItems.length - matchedCount;
        const inactiveCount = newItems.filter(it => it.matched_product && it.is_inactive).length;
        const totalMarginSum = newItems.filter(it => Boolean(it.matched_product)).reduce((acc, it) => acc + it.margin_percent, 0);
        const avgMargin = matchedCount > 0 ? Math.round((totalMarginSum / matchedCount) * 10) / 10 : 0;
        const totalSubtotal = newItems.reduce((acc, it) => acc + it.unit_price, 0);

        setExcelPreviewData({
            items: newItems,
            matchedCount,
            unmatchedCount,
            inactiveCount,
            avgMargin,
            totalSubtotal
        });

        setUploadedItems(newItems.map(it => ({
            accounting_id: it.accounting_id,
            product_name: it.product_name,
            unit_price: it.unit_price
        })));

        showToast('Fila descartada de la lista', 'info');
    };

    const handleOpenQuickProductModal = (rowIdx: number) => {
        if (!excelPreviewData) return;
        const item = excelPreviewData.items[rowIdx];
        setQuickProductRowIdx(rowIdx);
        setQuickProductName(item.client_product_name || item.product_name || '');
        setQuickProductUnit(item.unit || 'Kg');
        setQuickProductCostBasis(item.cost_basis ? String(item.cost_basis) : '');
        setQuickProductIvaRate(0);

        const n = (item.client_product_name || '').toLowerCase();
        if (/papa|cebolla|tomate|lechuga|zanahoria|brocoli|apio|espinaca|cilantro|perejil|pimenton|pepino|aguacate/i.test(n)) {
            setQuickProductCategory('VE');
        } else if (/queso|leche|crema|mantequilla|yogurt|cuajada/i.test(n)) {
            setQuickProductCategory('LA');
        } else if (/arroz|aceite|azucar|harina|sal|frijol|lenteja|garbanzo/i.test(n)) {
            setQuickProductCategory('AB');
        } else if (/pollo|carne|res|cerdo|pescado|lomo|pechuga/i.test(n)) {
            setQuickProductCategory('CA');
        } else {
            setQuickProductCategory('FR');
        }

        setIsQuickProductModalOpen(true);
    };

    const handleSaveQuickProduct = async () => {
        if (!quickProductName.trim()) {
            showToast('El nombre del producto es obligatorio', 'error');
            return;
        }
        setIsCreatingQuickProduct(true);
        try {
            const rawCost = parsePriceValue(quickProductCostBasis);

            const { data: maxIdData } = await supabase
                .from('products')
                .select('accounting_id')
                .order('accounting_id', { ascending: false })
                .limit(1);

            const nextAccId = maxIdData && maxIdData[0]?.accounting_id ? Number(maxIdData[0].accounting_id) + 1 : 9000;
            const cleanSku = `${quickProductCategory}-${String(nextAccId).padStart(5, '0')}`;

            const { data: newProd, error: createErr } = await supabase
                .from('products')
                .insert({
                    name: quickProductName.trim(),
                    sku: cleanSku,
                    accounting_id: nextAccId,
                    category: quickProductCategory,
                    unit_of_measure: quickProductUnit || 'Kg',
                    base_price: 0,
                    iva_rate: quickProductIvaRate,
                    is_active: true,
                    show_on_web: true,
                    weight_kg: quickProductUnit.toLowerCase() === 'kg' ? 1 : 0.5
                })
                .select()
                .single();

            if (createErr) throw createErr;

            if (rawCost > 0) {
                await supabase.from('commercial_cost_matrix').upsert({
                    product_id: newProd.id,
                    manual_cost: rawCost,
                    is_active: true
                }, { onConflict: 'product_id' } as any).catch((e: any) => console.warn('Cost matrix notice:', e));
            }

            newProd.cost_basis = rawCost;
            setCatalogProducts(prev => [newProd, ...prev]);

            if (quickProductRowIdx !== null) {
                handleAssignProductToRow(quickProductRowIdx, newProd);
            }

            setIsQuickProductModalOpen(false);
            showToast(`Producto "${newProd.name}" creado y vinculado exitosamente`, 'success');
        } catch (err: any) {
            console.error('Error creating quick product:', err);
            showToast('Error al crear producto: ' + err.message, 'error');
        } finally {
            setIsCreatingQuickProduct(false);
        }
    };

    const handleCreateAgreementSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isMultiClientMode) {
            if (selectedClientIds.length === 0) {
                showToast('Por favor, selecciona al menos una Casa Matriz en la lista', 'error');
                return;
            }
        } else {
            if (!selectedClientId) {
                showToast('Por favor, selecciona un cliente institucional', 'error');
                return;
            }
        }

        if (!excelPreviewData || excelPreviewData.items.length === 0) {
            showToast('Por favor, carga un archivo con precios', 'error');
            return;
        }

        if (excelPreviewData.unmatchedCount > 0) {
            showToast(`Tienes ${excelPreviewData.unmatchedCount} ítem(s) sin coincidencia. Debes asignarlos con el buscador, crearlos o descartarlos antes de activar.`, 'error');
            return;
        }

        setSavingAgreement(true);
        try {
            const targetClients = isMultiClientMode 
                ? b2bClients.filter(c => selectedClientIds.includes(c.id))
                : [b2bClients.find(c => c.id === selectedClientId)].filter(Boolean);

            if (targetClients.length === 0) throw new Error('No se encontraron clientes seleccionados');
            
            const numDuration = Math.max(1, Number(durationValue) || 1);
            const expiry = new Date(startDate + 'T12:00:00');
            if (durationUnit === 'days') {
                expiry.setDate(expiry.getDate() + numDuration);
            } else if (durationUnit === 'weeks') {
                expiry.setDate(expiry.getDate() + numDuration * 7);
            } else if (durationUnit === 'months') {
                expiry.setMonth(expiry.getMonth() + numDuration);
            } else if (durationUnit === 'years') {
                expiry.setFullYear(expiry.getFullYear() + numDuration);
            }
            const calculatedValidUntil = expiry.toISOString();
            
            // Calculate negotiated totals dynamically with actual product IVA rates
            const itemsTemplate: any[] = [];
            const inactiveProducts: any[] = [];
            let subtotal = 0;
            let totalTax = 0;
            
            excelPreviewData.items.forEach(item => {
                const dbProduct = item.matched_product;
                if (dbProduct) {
                    if (dbProduct.is_active === false || item.is_inactive) {
                        inactiveProducts.push(dbProduct);
                    }
                    const basePrice = item.cost_basis || dbProduct.cost_basis || 0;
                    const negotiatedPrice = item.unit_price;
                    const marginPercent = item.margin_percent !== undefined ? item.margin_percent : (negotiatedPrice > 0 ? Math.round(((negotiatedPrice - basePrice) / negotiatedPrice) * 10000) / 100 : 0);
                    
                    const ivaRate = item.iva_rate !== undefined ? item.iva_rate : (dbProduct.iva_rate || 0);
                    const ivaAmount = negotiatedPrice * (ivaRate / 100);
                    
                    subtotal += negotiatedPrice;
                    totalTax += ivaAmount;
                    
                    itemsTemplate.push({
                        product_id: dbProduct.id,
                        product_name: dbProduct.name,
                        quantity: 1,
                        cost_basis: basePrice,
                        margin_percent: marginPercent,
                        unit_price: negotiatedPrice,
                        iva_rate: ivaRate,
                        iva_amount: ivaAmount,
                        total_price: negotiatedPrice + ivaAmount
                    });
                }
            });

            // Poka-Yoke: Alerta y Auto-Activación de SKUs inactivos
            if (inactiveProducts.length > 0) {
                const confirmMsg = `ATENCIÓN COMERCIAL:\n\nSe detectaron ${inactiveProducts.length} producto(s) inactivo(s) en el catálogo para este acuerdo:\n${inactiveProducts.slice(0, 5).map(p => `• ${p.name}`).join('\n')}${inactiveProducts.length > 5 ? `\n... y ${inactiveProducts.length - 5} más` : ''}\n\n¿Deseas ACTIVARLOS AUTOMÁTICAMENTE en el catálogo para que puedan ser vendidos y seleccionados en la toma de pedidos?\n\n- [Aceptar]: Activar productos y crear acuerdo.\n- [Cancelar]: Volver para revisar la lista.`;
                
                const shouldActivate = window.confirm(confirmMsg);
                if (!shouldActivate) {
                    setSavingAgreement(false);
                    return;
                }

                const inactiveIds = Array.from(new Set(inactiveProducts.map(p => p.id)));
                const { error: actErr } = await supabase
                    .from('products')
                    .update({ is_active: true })
                    .in('id', inactiveIds);

                if (actErr) {
                    console.error('Error auto-activando productos en creación:', actErr);
                    showToast('Advertencia: No se pudieron activar algunos productos automáticamente', 'warning');
                } else {
                    showToast(`${inactiveIds.length} producto(s) reactivado(s) exitosamente en catálogo`, 'success');
                }
            }
            
            const total = subtotal + totalTax;
            const [y, m, d] = startDate.split('-');
            const dateSuffix = `${d || '01'}-${m || '01'}-${(y || '26').slice(-2)}`;

            if (isMultiClientMode) {
                // SINGLE MASTER SHARED AGREEMENT (1 to N Cascade Architecture)
                const masterName = agreementName.trim() || computeDefaultAgreementName(undefined, true, startDate);

                const { data: newQuote, error: insertQErr } = await supabase
                    .from('quotes')
                    .insert({
                        client_id: null, // Shared Master List
                        client_name: masterName,
                        model_id: 'd90a91e5-827c-473d-9d4f-3e28c7c91e15', // General Institucional
                        model_snapshot_name: masterName,
                        status: 'agreement',
                        start_date: startDate ? new Date(startDate).toISOString() : new Date().toISOString(),
                        valid_until: calculatedValidUntil,
                        version: 1,
                        subtotal_amount: subtotal,
                        total_tax_amount: totalTax,
                        total_amount: total
                    })
                    .select()
                    .single();

                if (insertQErr) throw insertQErr;

                if (itemsTemplate.length > 0) {
                    const finalItemsToInsert = itemsTemplate.map(item => ({
                        ...item,
                        quote_id: newQuote.id
                    }));
                    const batchSize = 100;
                    for (let i = 0; i < finalItemsToInsert.length; i += batchSize) {
                        const batch = finalItemsToInsert.slice(i, i + batchSize);
                        const { error: insertItemsErr } = await supabase
                            .from('quote_items')
                            .insert(batch);
                        if (insertItemsErr) throw insertItemsErr;
                    }
                }

                // Persist linked client IDs into app_settings
                await supabase
                    .from('app_settings')
                    .upsert({
                        key: `agreement_clients:${newQuote.id}`,
                        value: JSON.stringify(selectedClientIds),
                        description: `Clientes vinculados a la lista maestra ${masterName}`
                    });

                // Update profiles active_master_agreement_id in background
                for (const cId of selectedClientIds) {
                    const client = b2bClients.find(c => c.id === cId);
                    const logData = (client as any)?.logistics_data || {};
                    await supabase
                        .from('profiles')
                        .update({
                            logistics_data: {
                                ...logData,
                                active_master_agreement_id: newQuote.id
                            }
                        })
                        .eq('id', cId);
                }

                await supabase.from('audit_logs').insert({
                    user_id: user?.id || null,
                    action: 'CREATE_shared_master_agreement',
                    details: `Lista Maestra "${masterName}" creada con ${itemsTemplate.length} productos y ${selectedClientIds.length} clientes vinculados en cascada.`
                });

                showToast(`Lista Maestra "${masterName}" activada exitosamente con efecto cascada para ${selectedClientIds.length} clientes (${itemsTemplate.length} SKUs)!`, 'success');
            } else {
                // Modo Individual (1 cliente)
                for (const client of targetClients) {
                    // Expire any existing active agreement for this client to preserve history
                    const { data: existing, error: existErr } = await supabase
                        .from('quotes')
                        .select('id')
                        .eq('client_id', client.id)
                        .eq('status', 'agreement');
                        
                    if (existErr) throw existErr;
                    
                    if (existing && existing.length > 0) {
                        const quoteIds = existing.map(q => q.id);
                        const yesterday = new Date();
                        yesterday.setDate(yesterday.getDate() - 1);
                        await supabase.from('quotes')
                            .update({ 
                                status: 'expired', 
                                valid_until: yesterday.toISOString().split('T')[0] 
                            })
                            .in('id', quoteIds);
                    }

                    const clientAgreementName = isNameManuallyEdited && agreementName.trim()
                        ? `${agreementName.trim()} (${client.company_name})`
                        : (agreementName.trim() || `${client.company_name || client.contact_name} - ${dateSuffix}`);

                    const { data: newQuote, error: insertQErr } = await supabase
                        .from('quotes')
                        .insert({
                            client_id: client.id,
                            client_name: client.company_name || client.contact_name,
                            model_id: 'd90a91e5-827c-473d-9d4f-3e28c7c91e15', // General Institucional
                            model_snapshot_name: clientAgreementName,
                            status: 'agreement',
                            start_date: startDate ? new Date(startDate).toISOString() : new Date().toISOString(),
                            valid_until: calculatedValidUntil,
                            version: 1,
                            subtotal_amount: subtotal,
                            total_tax_amount: totalTax,
                            total_amount: total
                        })
                        .select()
                        .single();
                         
                    if (insertQErr) throw insertQErr;
                    
                    if (itemsTemplate.length > 0) {
                        const finalItemsToInsert = itemsTemplate.map(item => ({
                            ...item,
                            quote_id: newQuote.id
                        }));
                        const batchSize = 100;
                        for (let i = 0; i < finalItemsToInsert.length; i += batchSize) {
                            const batch = finalItemsToInsert.slice(i, i + batchSize);
                            const { error: insertItemsErr } = await supabase
                                .from('quote_items')
                                .insert(batch);
                            if (insertItemsErr) throw insertItemsErr;
                        }
                    }
                }
                showToast(`Acuerdo comercial activado con éxito para ${targetClients[0]?.company_name || 'el cliente'} (${itemsTemplate.length} productos asociados)!`, 'success');
            }
            setIsCreateModalOpen(false);
            
            // Reset modal states
            setSelectedClientId('');
            setIsMultiClientMode(false);
            setSelectedClientIds([]);
            setAgreementName('');
            setIsNameManuallyEdited(false);
            setStartDate(new Date().toISOString().split('T')[0]);
            setDurationValue(2);
            setDurationUnit('weeks');
            setParsedFile(null);
            setUploadedItems([]);
            setExcelPreviewData(null);
            
            fetchAgreements();
        } catch (err: any) {
            console.error(err);
            showToast('Error al crear acuerdo: ' + err.message, 'error');
        } finally {
            setSavingAgreement(false);
        }
    };

    const handleOpenEdit = (agreement: Agreement) => {
        setEditingAgreement(agreement);
        const start = agreement.start_date ? agreement.start_date.split('T')[0] : agreement.created_at.split('T')[0];
        setEditStartDate(start);
        
        let val = 14;
        let unit = 'days';
        if (agreement.start_date && agreement.valid_until) {
            const startDateObj = new Date(agreement.start_date + 'T12:00:00');
            const validUntilObj = new Date(agreement.valid_until + 'T12:00:00');
            const diffTime = Math.abs(validUntilObj.getTime() - startDateObj.getTime());
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays > 0) {
                if (diffDays % 365 === 0) {
                    val = diffDays / 365;
                    unit = 'years';
                } else if (diffDays % 30 === 0) {
                    val = diffDays / 30;
                    unit = 'months';
                } else if (diffDays % 7 === 0) {
                    val = diffDays / 7;
                    unit = 'weeks';
                } else {
                    val = diffDays;
                    unit = 'days';
                }
            }
        }
        
        setEditDurationValue(val);
        setEditDurationUnit(unit);
        setEditParsedFile(null);
        setEditUploadedItems([]);
        setEditExcelPreviewData(null);
        setEditExcelPreviewSearch('');
        setEditExcelPreviewFilter('all');
        setEditStep(1);
        setEditConfirmationChecked(false);
        setIsEditModalOpen(true);
    };

    const handleEditFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        setEditParsedFile(file);
        setEditParsing(true);
        
        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const bstr = evt.target?.result;
                const XLSX = await import('xlsx');
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                
                const parsedItems = extractRowsFromExcelSheet(ws, XLSX);

                // Real-time matching against full paginated products catalogue
                const productMap = await fetchAllProductsMap();

                let matchCount = 0;
                let unmatchedCount = 0;
                let inactiveCount = 0;
                let totalMarginSum = 0;
                let totalSubtotal = 0;

                const enrichedItems = parsedItems.map(item => {
                    const matched = findProductInMap(productMap, item.accounting_id, item.product_name);
                    if (matched) {
                        matchCount++;
                        const isInactive = matched.is_active === false;
                        if (isInactive) inactiveCount++;
                        const costBasis = matched.cost_basis || 0;
                        const marginPercent = item.unit_price > 0 ? Math.round(((item.unit_price - costBasis) / item.unit_price) * 10000) / 100 : 0;
                        totalMarginSum += marginPercent;
                        totalSubtotal += item.unit_price;

                        return {
                            accounting_id: matched.accounting_id || item.accounting_id,
                            product_name: matched.name || item.product_name,
                            unit_price: item.unit_price,
                            matched_product: matched,
                            cost_basis: costBasis,
                            margin_percent: marginPercent,
                            iva_rate: matched.iva_rate || 0,
                            is_inactive: isInactive
                        };
                    } else {
                        unmatchedCount++;
                        return {
                            accounting_id: item.accounting_id,
                            product_name: item.product_name || 'No identificado',
                            unit_price: item.unit_price,
                            matched_product: null,
                            cost_basis: 0,
                            margin_percent: 0,
                            iva_rate: 0
                        };
                    }
                });

                const avgMargin = matchCount > 0 ? totalMarginSum / matchCount : 0;

                setEditUploadedItems(parsedItems);
                setEditExcelPreviewData({
                    items: enrichedItems,
                    matchedCount: matchCount,
                    unmatchedCount: unmatchedCount,
                    inactiveCount: inactiveCount,
                    avgMargin: Math.round(avgMargin * 10) / 10,
                    totalSubtotal
                });

                if (inactiveCount > 0) {
                    showToast(`Excel procesado: ${matchCount} reconocidos (${inactiveCount} inactivos en catálogo), ${unmatchedCount} no reconocidos`, 'warning');
                } else {
                    showToast(`Excel procesado: ${matchCount} reconocidos, ${unmatchedCount} no reconocidos`, matchCount > 0 ? 'success' : 'error');
                }
            } catch (err: any) {
                console.error(err);
                showToast(err.message || 'Error al leer Excel', 'error');
                setEditParsedFile(null);
                setEditUploadedItems([]);
                setEditExcelPreviewData(null);
            } finally {
                setEditParsing(false);
            }
        };
        reader.readAsBinaryString(file);
    };

    const handleEditSubmit = async () => {
        if (!editingAgreement) return;
        
        setEditSaving(true);
        try {
            const numEditDuration = Math.max(1, Number(editDurationValue) || 1);
            const expiry = new Date(editStartDate + 'T12:00:00');
            if (editDurationUnit === 'days') {
                expiry.setDate(expiry.getDate() + numEditDuration);
            } else if (editDurationUnit === 'weeks') {
                expiry.setDate(expiry.getDate() + numEditDuration * 7);
            } else if (editDurationUnit === 'months') {
                expiry.setMonth(expiry.getMonth() + numEditDuration);
            } else if (editDurationUnit === 'years') {
                expiry.setFullYear(expiry.getFullYear() + numEditDuration);
            }
            const calculatedValidUntil = expiry.toISOString();
            
            const defaultUpdatedName = editingAgreement.model_snapshot_name || `${editingAgreement.profiles?.company_name || editingAgreement.client_name || 'Acuerdo'} - ${editStartDate.split('-').reverse().join('-')}`;
            // 1. Update the quote record itself
            const { error: updateErr } = await supabase
                .from('quotes')
                .update({
                    start_date: editStartDate ? new Date(editStartDate).toISOString() : new Date().toISOString(),
                    valid_until: calculatedValidUntil,
                    model_snapshot_name: defaultUpdatedName
                })
                .eq('id', editingAgreement.id);
                
            if (updateErr) throw updateErr;
            
            // 2. If new excel file uploaded, replace items
            if (editUploadedItems.length > 0) {
                // Query full database catalogue with pagination
                const productMap = await fetchAllProductsMap();

                // Poka-Yoke: Check for inactive SKUs
                const inactiveProducts: any[] = [];
                editUploadedItems.forEach(item => {
                    const dbProduct = findProductInMap(productMap, item.accounting_id, item.product_name) || productMap[String(item.accounting_id)];
                    if (dbProduct && dbProduct.is_active === false) {
                        inactiveProducts.push(dbProduct);
                    }
                });

                if (inactiveProducts.length > 0) {
                    const confirmMsg = `ATENCIÓN COMERCIAL:\n\nSe detectaron ${inactiveProducts.length} producto(s) inactivo(s) en el catálogo dentro de este acuerdo:\n${inactiveProducts.slice(0, 5).map(p => `• ${p.name}`).join('\n')}${inactiveProducts.length > 5 ? `\n... y ${inactiveProducts.length - 5} más` : ''}\n\n¿Deseas ACTIVARLOS AUTOMÁTICAMENTE en el catálogo para que puedan ser vendidos y seleccionados en la toma de pedidos?\n\n- [Aceptar]: Activar productos y actualizar acuerdo.\n- [Cancelar]: Volver para revisar la lista.`;
                    
                    const shouldActivate = window.confirm(confirmMsg);
                    if (!shouldActivate) {
                        setEditSaving(false);
                        return;
                    }

                    const inactiveIds = Array.from(new Set(inactiveProducts.map(p => p.id)));
                    const { error: actErr } = await supabase
                        .from('products')
                        .update({ is_active: true })
                        .in('id', inactiveIds);

                    if (actErr) {
                        console.error('Error auto-activando productos en edición:', actErr);
                        showToast('Advertencia: No se pudieron activar algunos productos automáticamente', 'warning');
                    } else {
                        showToast(`${inactiveIds.length} producto(s) reactivado(s) exitosamente en catálogo`, 'success');
                    }
                }
                
                // Delete old items for this specific active agreement being updated
                const { error: deleteErr } = await supabase
                    .from('quote_items')
                    .delete()
                    .eq('quote_id', editingAgreement.id);
                    
                if (deleteErr) throw deleteErr;
                
                // Insert new items
                const itemsToInsert: any[] = [];
                let matchCount = 0;
                let subtotal = 0;
                let totalTax = 0;
                
                editUploadedItems.forEach(item => {
                    const dbProduct = findProductInMap(productMap, item.accounting_id, item.product_name) || productMap[String(item.accounting_id)];
                    if (dbProduct) {
                        matchCount++;
                        const basePrice = dbProduct.cost_basis || 0;
                        const negotiatedPrice = item.unit_price;
                        const marginPercent = negotiatedPrice > 0 ? Math.round(((negotiatedPrice - basePrice) / negotiatedPrice) * 10000) / 100 : 0;
                        
                        const ivaRate = dbProduct.iva_rate || 0;
                        const ivaAmount = negotiatedPrice * (ivaRate / 100);
                        
                        subtotal += negotiatedPrice;
                        totalTax += ivaAmount;
                        
                        itemsToInsert.push({
                            quote_id: editingAgreement.id,
                            product_id: dbProduct.id,
                            product_name: dbProduct.name,
                            quantity: 1,
                            cost_basis: basePrice,
                            margin_percent: marginPercent,
                            unit_price: negotiatedPrice,
                            iva_rate: ivaRate,
                            iva_amount: ivaAmount,
                            total_price: negotiatedPrice + ivaAmount
                        });
                    }
                });
                
                const total = subtotal + totalTax;
                
                if (itemsToInsert.length > 0) {
                    const { error: itemsErr } = await supabase
                        .from('quote_items')
                        .insert(itemsToInsert);
                    if (itemsErr) throw itemsErr;
                    
                    // Update header totals in quotes table to match the new item totals
                    const { error: updateQuoteTotalsErr } = await supabase
                        .from('quotes')
                        .update({
                            subtotal_amount: subtotal,
                            total_tax_amount: totalTax,
                            total_amount: total
                        })
                        .eq('id', editingAgreement.id);
                        
                    if (updateQuoteTotalsErr) throw updateQuoteTotalsErr;
                }
                
                showToast(`Acuerdo modificado con éxito. Se actualizaron ${matchCount} precios de productos.`, 'success');
            } else {
                showToast(`Acuerdo modificado con éxito. Fechas actualizadas.`, 'success');
            }
            
            setIsEditModalOpen(false);
            fetchAgreements();
        } catch (err: any) {
            console.error(err);
            showToast('Error al modificar acuerdo: ' + err.message, 'error');
        } finally {
            setEditSaving(false);
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
        if (!validUntil) return { label: 'Vigente', color: '#0D7A57', bgColor: '#EAEFEA', type: 'active' as const };
        
        // Normalizar fecha de expiración para evitar desfases de huso horario
        const cleanDateStr = String(validUntil).split('T')[0];
        const parts = cleanDateStr.split('-').map(Number);
        const expiry = parts.length === 3 && !parts.some(isNaN)
            ? new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999)
            : new Date(validUntil);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const diffTime = expiry.getTime() - today.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            return { label: 'Vencido', color: '#DC2626', bgColor: '#FEF2F2', type: 'expired' as const, diffDays };
        } else if (diffDays <= 5) {
            const label = diffDays === 0 ? 'Por vencer (hoy)' : diffDays === 1 ? 'Por vencer (1 día)' : `Por vencer (${diffDays} días)`;
            return { label, color: '#92400E', bgColor: '#FEF3C7', type: 'warning' as const, diffDays };
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

    const formatAgreementNumber = (seq: number, dateStr?: string) => {
        const date = dateStr ? new Date(dateStr) : new Date();
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const paddedSeq = String(seq).padStart(4, '0');
        return `ACI ${day}${month} ${paddedSeq}`;
    };

    const filteredB2bClients = b2bClients.filter(c => {
        // Multi-client mode (General Institutional): strictly Casas Matrices / Root clients
        if (isMultiClientMode) {
            if (c.parent_id) return false;
        } else {
            // Individual client mode: filter by type if selected
            if (clientTypeFilter === 'matriz' && c.parent_id) return false;
            if (clientTypeFilter === 'sucursal' && !c.parent_id) return false;
        }

        if (!clientSearchQuery.trim()) return true;
        const query = clientSearchQuery.toLowerCase().trim();
        
        const matchesName = c.company_name?.toLowerCase().includes(query);
        const matchesContact = c.contact_name?.toLowerCase().includes(query);
        const matchesNit = String(c.nit || '').toLowerCase().includes(query);
        const matchesParent = c.parentName?.toLowerCase().includes(query);
        return Boolean(matchesName || matchesContact || matchesNit || matchesParent);
    });

    const toggleSort = (col: typeof sortColumn) => {
        if (sortColumn === col) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(col);
            setSortDirection('desc');
        }
    };

    // Filter and Sort logic
    const filteredAgreements = agreements
        .filter(agreement => {
            const matchSearch = searchIncludes(agreement.client_name, searchTerm) || 
                                searchIncludes(agreement.profiles?.company_name, searchTerm) ||
                                searchIncludes(agreement.model_snapshot_name, searchTerm) ||
                                searchIncludes(agreement.quote_number, searchTerm);
            
            if (!matchSearch) return false;

            if (statusFilter !== 'all') {
                const statusInfo = getAgreementStatus(agreement.valid_until);
                if (statusInfo.type !== statusFilter) return false;
            }

            if (modelFilter !== 'all') {
                const modelName = agreement.model_snapshot_name || 'Personalizado';
                if (modelName !== modelFilter) return false;
            }

            return true;
        })
        .sort((a, b) => {
            let valA: any = 0;
            let valB: any = 0;

            if (sortColumn === 'quote_number') {
                valA = a.quote_number || 0;
                valB = b.quote_number || 0;
            } else if (sortColumn === 'client_name') {
                valA = (a.profiles?.company_name || a.client_name || '').toLowerCase();
                valB = (b.profiles?.company_name || b.client_name || '').toLowerCase();
            } else if (sortColumn === 'model') {
                valA = (a.model_snapshot_name || 'Personalizado').toLowerCase();
                valB = (b.model_snapshot_name || 'Personalizado').toLowerCase();
            } else if (sortColumn === 'valid_until') {
                valA = new Date(a.valid_until || 0).getTime();
                valB = new Date(b.valid_until || 0).getTime();
            } else if (sortColumn === 'duration') {
                valA = new Date(a.valid_until || 0).getTime() - new Date(a.start_date || a.created_at).getTime();
                valB = new Date(b.valid_until || 0).getTime() - new Date(b.start_date || b.created_at).getTime();
            } else if (sortColumn === 'status') {
                valA = getAgreementStatus(a.valid_until).label;
                valB = getAgreementStatus(b.valid_until).label;
            } else if (sortColumn === 'margin') {
                const itemsA = (a as any).items || (a as any).quote_items || [];
                const marginA = itemsA.length > 0 ? itemsA.reduce((s: number, i: any) => s + (i.margin_percent || 0), 0) / itemsA.length : 0;
                const itemsB = (b as any).items || (b as any).quote_items || [];
                const marginB = itemsB.length > 0 ? itemsB.reduce((s: number, i: any) => s + (i.margin_percent || 0), 0) / itemsB.length : 0;
                valA = marginA;
                valB = marginB;
            }

            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });

    const activeCount = agreements.filter(a => getAgreementStatus(a.valid_until).type === 'active').length;
    const warningCount = agreements.filter(a => getAgreementStatus(a.valid_until).type === 'warning').length;
    const expiredCount = agreements.filter(a => getAgreementStatus(a.valid_until).type === 'expired').length;

    const totalMargin = agreementItems.reduce((sum, item) => sum + (item.margin_percent || 0), 0);
    const averageMargin = agreementItems.length > 0 ? totalMargin / agreementItems.length : 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontFamily: THEME.typography.fontFamilySecondary }}>
            
            {/* STAT CARDS SECTION (Collapsible) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.74rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Métricas de Acuerdos y Contratos
                    </span>
                    <button
                        type="button"
                        onClick={() => setIsMainKpiCollapsed(!isMainKpiCollapsed)}
                        style={{
                            backgroundColor: isMainKpiCollapsed ? '#E0F2FE' : '#F1F5F9',
                            border: `1px solid ${isMainKpiCollapsed ? '#BAE6FD' : '#CBD5E1'}`,
                            borderRadius: '6px',
                            padding: '4px 10px',
                            color: isMainKpiCollapsed ? '#0369A1' : '#475569',
                            fontSize: '0.74rem',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        {isMainKpiCollapsed ? (
                            <><ChevronDown size={14} /> Mostrar Tarjetas de Métricas</>
                        ) : (
                            <><ChevronUp size={14} /> Colapsar Tarjetas para más espacio</>
                        )}
                    </button>
                </div>

                {!isMainKpiCollapsed ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                        <LocalKPICard 
                            title="Acuerdos Vigentes" 
                            value={activeCount} 
                            icon={<FileText size={18} strokeWidth={1.5} />} 
                            color="#EAEFEA" 
                            textColor="#0D7A57" 
                            subtitle="Contratos con precios congelados" 
                        />
                        <LocalKPICard 
                            title="Próximos a Vencer" 
                            value={warningCount} 
                            icon={<Clock size={18} strokeWidth={1.5} />} 
                            color="#FFF9E6" 
                            textColor="#D97706" 
                            subtitle="Expira en 5 días o menos" 
                        />
                        <LocalKPICard 
                            title="Acuerdos Vencidos" 
                            value={expiredCount} 
                            icon={<AlertCircle size={18} strokeWidth={1.5} />} 
                            color="#FEE2E2" 
                            textColor="#EF4444" 
                            subtitle="Precios inactivos" 
                        />
                    </div>
                ) : (
                    <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between',
                        padding: '8px 16px', 
                        backgroundColor: '#FFFFFF', 
                        borderRadius: '8px', 
                        border: '1px solid #E2E8F0',
                        fontSize: '0.8rem',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                            <span style={{ color: '#0D7A57', fontWeight: 'bold' }}>
                                <CircleDot size={12} color="#10B981" /> <strong>{activeCount}</strong> Acuerdos Vigentes
                            </span>
                            <span style={{ color: '#D97706', fontWeight: 'bold' }}>
                                <CircleDot size={12} color="#F59E0B" /> <strong>{warningCount}</strong> Próximos a Vencer
                            </span>
                            <span style={{ color: expiredCount > 0 ? '#EF4444' : '#64748B', fontWeight: 'bold' }}>
                                <CircleDot size={12} color="#EF4444" /> <strong>{expiredCount}</strong> Vencidos
                            </span>
                        </div>
                        <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
                            Vista compacta activada
                        </span>
                    </div>
                )}
            </div>

            {/* UNIFIED CONTAINER: CONTROLS & AGREEMENTS TABLE */}
            <div style={{ 
                backgroundColor: 'white', 
                borderRadius: THEME.radius.lg, 
                minHeight: '380px',
                boxShadow: THEME.shadow.sm, 
                border: `1px solid ${THEME.colors.border}`, 
                position: 'relative'
            }}>
                {/* TOP TOOLBAR CONTROLS (STICKY) */}
                <div style={{ 
                    padding: '0.85rem 1.25rem', 
                    borderBottom: `1px solid #E2E8F0`, 
                    backgroundColor: 'rgba(255, 255, 255, 0.98)',
                    backdropFilter: 'blur(16px)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '1.25rem',
                    flexWrap: 'wrap',
                    position: 'sticky',
                    top: '85px',
                    zIndex: 90,
                    borderTopLeftRadius: THEME.radius.lg,
                    borderTopRightRadius: THEME.radius.lg,
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.03)'
                }}>
                    <div style={{ position: 'relative', flex: 1, minWidth: '280px' }}>
                        <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: THEME.colors.textSecondary, pointerEvents: 'none' }} />
                        <input 
                            type="text" 
                            placeholder="Buscar por cliente o código de acuerdo..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                width: '100%',
                                padding: searchTerm ? '0.65rem 2.4rem 0.65rem 2.5rem' : '0.65rem 0.65rem 0.65rem 2.5rem',
                                borderRadius: THEME.radius.md,
                                border: `1px solid ${THEME.colors.border}`,
                                fontSize: '0.85rem',
                                outline: 'none',
                                fontFamily: THEME.typography.fontFamilySecondary,
                                transition: 'border-color 0.15s, box-shadow 0.15s'
                            }}
                            onFocus={e => {
                                e.target.style.borderColor = THEME.colors.primary;
                                e.target.style.boxShadow = `0 0 0 3px ${THEME.colors.primaryLight}`;
                            }}
                            onBlur={e => {
                                e.target.style.borderColor = THEME.colors.border;
                                e.target.style.boxShadow = 'none';
                            }}
                        />
                        {searchTerm && (
                            <button
                                type="button"
                                onClick={() => setSearchTerm('')}
                                style={{
                                    position: 'absolute',
                                    right: '10px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: '#94A3B8',
                                    padding: '4px',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'color 0.15s, background-color 0.15s'
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.color = '#334155';
                                    e.currentTarget.style.backgroundColor = '#F1F5F9';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.color = '#94A3B8';
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                }}
                                title="Limpiar búsqueda"
                            >
                                <X size={15} />
                            </button>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                        {(['all', 'active', 'warning', 'expired'] as const).map(f => {
                            const isActive = statusFilter === f;
                            return (
                                <button
                                    key={f}
                                    onClick={() => setStatusFilter(f)}
                                    style={{
                                        padding: '0.45rem 1.1rem',
                                        border: 'none',
                                        borderRadius: '8px',
                                        background: isActive ? THEME.colors.primary : 'transparent',
                                        color: isActive ? 'white' : '#4E6157',
                                        fontWeight: isActive ? '700' : '500',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                        fontSize: '0.8rem',
                                        boxShadow: isActive ? '0 4px 12px rgba(13, 122, 87, 0.25)' : 'none'
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!isActive) {
                                            e.currentTarget.style.backgroundColor = THEME.colors.primaryLight;
                                            e.currentTarget.style.color = THEME.colors.textMain;
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!isActive) {
                                            e.currentTarget.style.backgroundColor = 'transparent';
                                            e.currentTarget.style.color = '#4E6157';
                                        }
                                    }}
                                >
                                    {f === 'all' && 'Todos'}
                                    {f === 'active' && 'Vigentes'}
                                    {f === 'warning' && 'Por Vencer'}
                                    {f === 'expired' && 'Vencidos'}
                                </button>
                            );
                        })}
                        <button
                            onClick={handleOpenCreateModal}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = THEME.colors.primaryHover}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = THEME.colors.primary}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '0.45rem 1.1rem',
                                borderRadius: '8px',
                                backgroundColor: THEME.colors.primary,
                                color: 'white',
                                border: 'none',
                                fontSize: '0.8rem',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                marginLeft: '6px',
                                boxShadow: '0 4px 12px rgba(13, 122, 87, 0.2)'
                            }}
                        >
                            <Plus size={14} /> Nuevo Acuerdo
                        </button>
                    </div>
                </div>

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
                    <div>
                        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left' }}>
                            <thead style={{ position: 'sticky', top: '148px', zIndex: 40 }}>
                                <tr style={{ backgroundColor: '#F9FAFB' }}>
                                    {/* CÓDIGO */}
                                    <th 
                                        onClick={() => toggleSort('quote_number')}
                                        style={{ 
                                            padding: '0.65rem 0.85rem', 
                                            position: 'sticky', 
                                            top: '148px', 
                                            zIndex: 40, 
                                            backgroundColor: '#F9FAFB', 
                                            borderBottom: '2px solid #E2E8F0', 
                                            borderTopLeftRadius: '12px', 
                                            boxShadow: '0 4px 6px -2px rgba(0, 0, 0, 0.05)', 
                                            cursor: 'pointer', 
                                            userSelect: 'none', 
                                            transition: 'background 0.15s',
                                            ...THEME.typography.tableHeader 
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F1F5F9'}
                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#F9FAFB'}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span>Código</span>
                                            {sortColumn === 'quote_number' ? (
                                                sortDirection === 'asc' ? <ChevronUp size={14} color={THEME.colors.primary} /> : <ChevronDown size={14} color={THEME.colors.primary} />
                                            ) : (
                                                <ChevronsUpDown size={12} color="#94A3B8" />
                                            )}
                                        </div>
                                    </th>

                                    {/* CLIENTE B2B */}
                                    <th 
                                        onClick={() => toggleSort('client_name')}
                                        style={{ 
                                            padding: '0.65rem 0.85rem', 
                                            position: 'sticky', 
                                            top: '148px', 
                                            zIndex: 40, 
                                            backgroundColor: '#F9FAFB', 
                                            borderBottom: '2px solid #E2E8F0', 
                                            boxShadow: '0 4px 6px -2px rgba(0, 0, 0, 0.05)', 
                                            cursor: 'pointer', 
                                            userSelect: 'none', 
                                            transition: 'background 0.15s',
                                            ...THEME.typography.tableHeader 
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F1F5F9'}
                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#F9FAFB'}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span>Cliente B2B</span>
                                            {sortColumn === 'client_name' ? (
                                                sortDirection === 'asc' ? <ChevronUp size={14} color={THEME.colors.primary} /> : <ChevronDown size={14} color={THEME.colors.primary} />
                                            ) : (
                                                <ChevronsUpDown size={12} color="#94A3B8" />
                                            )}
                                        </div>
                                    </th>

                                    {/* VIGENCIA */}
                                    <th 
                                        onClick={() => toggleSort('valid_until')}
                                        style={{ 
                                            padding: '0.65rem 0.85rem', 
                                            position: 'sticky', 
                                            top: '148px', 
                                            zIndex: 40, 
                                            backgroundColor: '#F9FAFB', 
                                            borderBottom: '2px solid #E2E8F0', 
                                            boxShadow: '0 4px 6px -2px rgba(0, 0, 0, 0.05)', 
                                            cursor: 'pointer', 
                                            userSelect: 'none', 
                                            transition: 'background 0.15s',
                                            ...THEME.typography.tableHeader 
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F1F5F9'}
                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#F9FAFB'}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span>Vigencia</span>
                                            {sortColumn === 'valid_until' ? (
                                                sortDirection === 'asc' ? <ChevronUp size={14} color={THEME.colors.primary} /> : <ChevronDown size={14} color={THEME.colors.primary} />
                                            ) : (
                                                <ChevronsUpDown size={12} color="#94A3B8" />
                                            )}
                                        </div>
                                    </th>

                                    {/* DURACIÓN */}
                                    <th 
                                        onClick={() => toggleSort('duration')}
                                        style={{ 
                                            padding: '0.65rem 0.85rem', 
                                            position: 'sticky', 
                                            top: '148px', 
                                            zIndex: 40, 
                                            backgroundColor: '#F9FAFB', 
                                            borderBottom: '2px solid #E2E8F0', 
                                            boxShadow: '0 4px 6px -2px rgba(0, 0, 0, 0.05)', 
                                            cursor: 'pointer', 
                                            userSelect: 'none', 
                                            transition: 'background 0.15s',
                                            ...THEME.typography.tableHeader 
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F1F5F9'}
                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#F9FAFB'}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span>Duración</span>
                                            {sortColumn === 'duration' ? (
                                                sortDirection === 'asc' ? <ChevronUp size={14} color={THEME.colors.primary} /> : <ChevronDown size={14} color={THEME.colors.primary} />
                                            ) : (
                                                <ChevronsUpDown size={12} color="#94A3B8" />
                                            )}
                                        </div>
                                    </th>

                                    {/* ESTADO */}
                                    <th 
                                        onClick={() => toggleSort('status')}
                                        style={{ 
                                            padding: '0.65rem 0.85rem', 
                                            position: 'sticky', 
                                            top: '148px', 
                                            zIndex: 40, 
                                            backgroundColor: '#F9FAFB', 
                                            borderBottom: '2px solid #E2E8F0', 
                                            boxShadow: '0 4px 6px -2px rgba(0, 0, 0, 0.05)', 
                                            cursor: 'pointer', 
                                            userSelect: 'none', 
                                            transition: 'background 0.15s',
                                            ...THEME.typography.tableHeader 
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F1F5F9'}
                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#F9FAFB'}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span>Estado</span>
                                            {sortColumn === 'status' ? (
                                                sortDirection === 'asc' ? <ChevronUp size={14} color={THEME.colors.primary} /> : <ChevronDown size={14} color={THEME.colors.primary} />
                                            ) : (
                                                <ChevronsUpDown size={12} color="#94A3B8" />
                                            )}
                                        </div>
                                    </th>

                                    {/* MARGEN PROMEDIO */}
                                    <th 
                                        onClick={() => toggleSort('margin')}
                                        style={{ 
                                            padding: '0.65rem 0.85rem', 
                                            position: 'sticky', 
                                            top: '148px', 
                                            zIndex: 40, 
                                            backgroundColor: '#F9FAFB', 
                                            borderBottom: '2px solid #E2E8F0', 
                                            boxShadow: '0 4px 6px -2px rgba(0, 0, 0, 0.05)', 
                                            textAlign: 'center', 
                                            cursor: 'pointer', 
                                            userSelect: 'none', 
                                            transition: 'background 0.15s',
                                            ...THEME.typography.tableHeader 
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F1F5F9'}
                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#F9FAFB'}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                            <span>Margen Promedio</span>
                                            {sortColumn === 'margin' ? (
                                                sortDirection === 'asc' ? <ChevronUp size={14} color={THEME.colors.primary} /> : <ChevronDown size={14} color={THEME.colors.primary} />
                                            ) : (
                                                <ChevronsUpDown size={12} color="#94A3B8" />
                                            )}
                                        </div>
                                    </th>

                                    {/* ACCIONES */}
                                    <th style={{ 
                                        padding: '0.65rem 1rem', 
                                        position: 'sticky', 
                                        top: '148px', 
                                        zIndex: 40, 
                                        backgroundColor: '#F9FAFB', 
                                        borderBottom: '2px solid #E2E8F0', 
                                        borderTopRightRadius: '12px', 
                                        boxShadow: '0 4px 6px -2px rgba(0, 0, 0, 0.05)', 
                                        textAlign: 'right', 
                                        whiteSpace: 'nowrap',
                                        ...THEME.typography.tableHeader 
                                    }}>
                                        Acciones
                                    </th>
                                </tr>
                            </thead>
                        <tbody>
                            {filteredAgreements.map(agreement => {
                                const status = getAgreementStatus(agreement.valid_until);
                                return (
                                    <tr 
                                        key={agreement.id} 
                                        style={{ borderBottom: `1px solid ${THEME.colors.border}`, transition: 'background 0.2s' }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F8FAF9'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                    >
                                        <td style={{ padding: '0.75rem 1.25rem', whiteSpace: 'nowrap' }}>
                                            <span style={{ 
                                                fontFamily: 'monospace', 
                                                fontSize: '0.75rem', 
                                                backgroundColor: '#F1F5F9', 
                                                padding: '4px 8px', 
                                                borderRadius: '6px', 
                                                fontWeight: 'bold', 
                                                color: '#475569',
                                                border: '1px solid #E2E8F0'
                                            }}>
                                                {formatAgreementNumber(agreement.quote_number, agreement.created_at)}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.75rem 1.25rem' }}>
                                            {(() => {
                                                const isSharedMaster = !agreement.client_id || (sharedLinks[agreement.id] && sharedLinks[agreement.id].length > 0);
                                                const linkedClientIds = sharedLinks[agreement.id] || [];
                                                
                                                if (isSharedMaster) {
                                                    return (
                                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                                            <div style={{ width: '28px', height: '28px', borderRadius: '8px', backgroundColor: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0D7A57', flexShrink: 0, marginTop: '2px' }}>
                                                                <Zap size={16} />
                                                            </div>
                                                            <div>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                                    <span style={{ fontWeight: '800', color: THEME.colors.textMain, fontSize: '0.92rem' }}>
                                                                        {agreement.model_snapshot_name || agreement.client_name || 'Lista Maestra Institucional'}
                                                                    </span>
                                                                    <span style={{ 
                                                                        fontSize: '0.68rem', 
                                                                        backgroundColor: '#ECFDF5', 
                                                                        color: '#047857', 
                                                                        border: '1px solid #A7F3D0', 
                                                                        padding: '1px 8px', 
                                                                        borderRadius: '4px', 
                                                                        fontWeight: '800' 
                                                                    }}>
                                                                        ⚡ Lista Maestra Compartida
                                                                    </span>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleOpenManageLinkedClients(agreement)}
                                                                        style={{
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            gap: '5px',
                                                                            padding: '2px 10px',
                                                                            borderRadius: '12px',
                                                                            backgroundColor: '#E0F2FE',
                                                                            color: '#0369A1',
                                                                            border: '1px solid #BAE6FD',
                                                                            fontSize: '0.72rem',
                                                                            fontWeight: 'bold',
                                                                            cursor: 'pointer',
                                                                            transition: 'all 0.15s'
                                                                        }}
                                                                        title="Ver y gestionar clientes/sucursales vinculados"
                                                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#BAE6FD'}
                                                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#E0F2FE'}
                                                                    >
                                                                        <Users size={12} />
                                                                        <span>{linkedClientIds.length} {linkedClientIds.length === 1 ? 'Sede' : 'Sedes'} Vinculadas</span>
                                                                    </button>
                                                                </div>
                                                                <div style={{ fontSize: '0.7rem', color: '#0D7A57', marginTop: '2px', fontWeight: '500' }}>
                                                                    Efecto cascada activo: cualquier cambio en esta lista impacta a los clientes vinculados en tiempo real.
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                }

                                                return (
                                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                                        <Building2 size={16} color="#94A3B8" style={{ marginTop: '2px', flexShrink: 0 }} />
                                                        <div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                                <span style={{ fontWeight: 'bold', color: THEME.colors.textMain }}>
                                                                    {agreement.profiles?.company_name || agreement.client_name}
                                                                </span>
                                                                {(() => {
                                                                    const badgeName = agreement.model_snapshot_name || `${agreement.profiles?.company_name || agreement.client_name || 'Acuerdo'} - ${agreement.created_at ? new Date(agreement.created_at).toLocaleDateString('es-CO') : ''}`;
                                                                    return (
                                                                        <span style={{ 
                                                                            fontSize: '0.68rem', 
                                                                            backgroundColor: '#ECFDF5', 
                                                                            color: '#047857', 
                                                                            border: '1px solid #A7F3D0', 
                                                                            padding: '1px 6px', 
                                                                            borderRadius: '4px', 
                                                                            fontWeight: '600' 
                                                                        }}>
                                                                            {badgeName}
                                                                        </span>
                                                                    );
                                                                })()}
                                                                {(agreement.model_snapshot_name?.includes('[CONSUMO ABIERTO]') || agreement.subtotal_amount === 0) && (
                                                                    <span style={{ 
                                                                        fontSize: '0.66rem', 
                                                                        backgroundColor: '#F5F3FF', 
                                                                        color: '#6D28D9', 
                                                                        border: '1px solid #C4B5FD', 
                                                                        padding: '1px 6px', 
                                                                        borderRadius: '4px', 
                                                                        fontWeight: '800' 
                                                                    }}>
                                                                        Consumo Abierto ($0)
                                                                    </span>
                                                                )}
                                                                {agreement.profiles?.parent_id ? (
                                                                    <span style={{ 
                                                                        fontSize: '0.66rem', 
                                                                        backgroundColor: '#EFF6FF', 
                                                                        color: '#0284C7', 
                                                                        border: '1px solid #BAE6FD', 
                                                                        padding: '1px 6px', 
                                                                        borderRadius: '4px', 
                                                                        fontWeight: '700' 
                                                                    }}>
                                                                        <MapPin size={11} style={{ verticalAlign: 'middle', marginRight: '3px', display: 'inline' }} /> Sucursal
                                                                    </span>
                                                                ) : (
                                                                    <span style={{ 
                                                                        fontSize: '0.66rem', 
                                                                        backgroundColor: '#F5F3FF', 
                                                                        color: '#6D28D9', 
                                                                        border: '1px solid #DDD6FE', 
                                                                        padding: '1px 6px', 
                                                                        borderRadius: '4px', 
                                                                        fontWeight: '700' 
                                                                    }}>
                                                                        <Building2 size={11} style={{ verticalAlign: 'middle', marginRight: '3px', display: 'inline' }} /> Matriz
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {agreement.profiles?.parent_id ? (
                                                                <div style={{ fontSize: '0.7rem', color: '#0369A1', marginTop: '2px', fontWeight: '500' }}>
                                                                    Sucursal de: <strong>{b2bClients.find(c => c.id === agreement.profiles?.parent_id)?.company_name || 'Casa Matriz'}</strong> {agreement.profiles?.nit ? `• NIT: ${agreement.profiles.nit}` : ''}
                                                                </div>
                                                            ) : agreement.profiles?.nit ? (
                                                                <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '2px' }}>
                                                                    NIT: {agreement.profiles.nit}
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                        <td style={{ padding: '0.75rem 1.25rem', whiteSpace: 'nowrap' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                <div style={{ fontSize: '0.8rem', color: THEME.colors.textMain }}>
                                                    <span style={{ color: '#94A3B8', fontSize: '0.7rem', marginRight: '4px' }}>INICIA:</span>
                                                    <strong>{agreement.start_date ? new Date(agreement.start_date).toLocaleDateString('es-CO') : '---'}</strong>
                                                </div>
                                                <div style={{ fontSize: '0.8rem', color: THEME.colors.textSecondary }}>
                                                    <span style={{ color: '#94A3B8', fontSize: '0.7rem', marginRight: '4px' }}>VENCE:</span>
                                                    <strong>{agreement.valid_until ? new Date(agreement.valid_until).toLocaleDateString('es-CO') : '---'}</strong>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.75rem 1.25rem', whiteSpace: 'nowrap' }}>
                                            <span style={{ 
                                                fontSize: '0.75rem', 
                                                backgroundColor: '#F3F4F6', 
                                                padding: '3px 8px', 
                                                borderRadius: '12px', 
                                                color: '#374151',
                                                fontWeight: '500'
                                            }}>
                                                {getDurationText(agreement.start_date, agreement.valid_until)}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.75rem 1.25rem' }}>
                                            <span style={{ 
                                                backgroundColor: status.bgColor, 
                                                color: status.color, 
                                                padding: '4px 10px', 
                                                borderRadius: '6px', 
                                                fontSize: '0.75rem', 
                                                fontWeight: '800',
                                                whiteSpace: 'nowrap',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '5px',
                                                border: status.type === 'warning' ? '1.5px solid #F59E0B' : status.type === 'expired' ? '1px solid #FCA5A5' : '1px solid #A7F3D0',
                                                boxShadow: status.type === 'warning' ? '0 2px 6px rgba(245, 158, 11, 0.25)' : 'none'
                                            }}>
                                                {status.type === 'warning' && <AlertTriangle size={13} color="#D97706" />}
                                                {status.type === 'expired' && <AlertCircle size={13} color="#DC2626" />}
                                                {status.type === 'active' && <Check size={13} color="#059669" />}
                                                {status.label}
                                            </span>
                                        </td>
                                        
                                        {/* CLEAN MARGEN PROMEDIO */}
                                        <td style={{ padding: '0.75rem 1.25rem', textAlign: 'center' }}>
                                            {(() => {
                                                const rowItems = (agreement as any).items || (agreement as any).quote_items || [];
                                                const totalRowMargin = rowItems.reduce((sum: number, item: any) => sum + (item.margin_percent || 0), 0);
                                                const rowAvgMargin = rowItems.length > 0 ? totalRowMargin / rowItems.length : 0;
                                                return (
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                                                        <span style={{ 
                                                            padding: '3px 8px',
                                                            borderRadius: '6px',
                                                            fontWeight: '800',
                                                            fontSize: '0.82rem',
                                                            backgroundColor: rowAvgMargin >= 50 ? '#ECFDF5' : rowAvgMargin >= 20 ? '#FFFBEB' : '#FEF2F2',
                                                            color: rowAvgMargin >= 50 ? '#059669' : rowAvgMargin >= 20 ? '#D97706' : '#DC2626',
                                                            border: `1px solid ${rowAvgMargin >= 50 ? '#A7F3D0' : rowAvgMargin >= 20 ? '#FDE68A' : '#FECACA'}`
                                                        }}>
                                                            {(Math.round(rowAvgMargin * 10) / 10).toFixed(1)}%
                                                        </span>
                                                        <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: '500' }}>
                                                            {rowItems.length} {rowItems.length === 1 ? 'prod' : 'productos'}
                                                        </span>
                                                    </div>
                                                );
                                            })()}
                                        </td>

                                        {/* ORGANIZED ACCIONES - CLEAN GROUPED ACTIONS */}
                                        <td style={{ padding: '0.75rem 1.25rem', textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'nowrap' }}>
                                                <button
                                                    onClick={() => handleViewPrices(agreement)}
                                                    title="Ver lista completa de precios acordados"
                                                    style={{
                                                        padding: '0.45rem 0.9rem',
                                                        border: `1px solid #BBF7D0`,
                                                        borderRadius: '8px',
                                                        backgroundColor: '#F0FDF4',
                                                        color: '#0D7A57',
                                                        cursor: 'pointer',
                                                        fontSize: '0.8rem',
                                                        fontWeight: 'bold',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        transition: 'all 0.15s',
                                                        boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.backgroundColor = '#DCFCE7';
                                                        e.currentTarget.style.borderColor = '#86EFAC';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.backgroundColor = '#F0FDF4';
                                                        e.currentTarget.style.borderColor = '#BBF7D0';
                                                    }}
                                                >
                                                    <Eye size={14} strokeWidth={2} /> Precios
                                                </button>
                                                
                                                <div style={{ display: 'flex', gap: '4px', backgroundColor: '#F8FAFC', padding: '3px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                                    <button
                                                        onClick={() => handleOpenEdit(agreement)}
                                                        title="Modificar acuerdo comercial"
                                                        style={{
                                                            padding: '6px 8px',
                                                            border: 'none',
                                                            borderRadius: '6px',
                                                            backgroundColor: 'transparent',
                                                            cursor: 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            color: '#64748B',
                                                            transition: 'all 0.15s'
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            e.currentTarget.style.backgroundColor = 'white';
                                                            e.currentTarget.style.color = '#1E293B';
                                                            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            e.currentTarget.style.backgroundColor = 'transparent';
                                                            e.currentTarget.style.color = '#64748B';
                                                            e.currentTarget.style.boxShadow = 'none';
                                                        }}
                                                    >
                                                        <Edit3 size={14} strokeWidth={1.8} />
                                                    </button>
                                                    
                                                    <button
                                                        onClick={() => handleOpenRenew(agreement)}
                                                        title="Renovar vigencia del acuerdo"
                                                        style={{
                                                            padding: '6px 8px',
                                                            border: 'none',
                                                            borderRadius: '6px',
                                                            backgroundColor: 'transparent',
                                                            cursor: 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            color: '#64748B',
                                                            transition: 'all 0.15s'
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            e.currentTarget.style.backgroundColor = 'white';
                                                            e.currentTarget.style.color = '#D97706';
                                                            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            e.currentTarget.style.backgroundColor = 'transparent';
                                                            e.currentTarget.style.color = '#64748B';
                                                            e.currentTarget.style.boxShadow = 'none';
                                                        }}
                                                    >
                                                        <Clock size={14} strokeWidth={1.8} />
                                                    </button>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* DETAIL DRAWER / SLIDE-OVER */}
            {isDrawerOpen && selectedAgreement && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{ 
                        backgroundColor: 'white', 
                        width: '100%', 
                        maxWidth: '1100px', 
                        height: '100%', 
                        boxShadow: '-10px 0 25px rgba(0,0,0,0.1)', 
                        display: 'flex', 
                        flexDirection: 'column',
                        animation: 'slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}>
                        {/* Drawer Header (Fixed top of drawer) */}
                        <div style={{ padding: '0.85rem 1.5rem', borderBottom: `1px solid ${THEME.colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, backgroundColor: '#FFFFFF' }}>
                            <div>
                                <div style={{ fontSize: '0.68rem', color: THEME.colors.textSecondary, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    Lista de Precios Congelados ({formatAgreementNumber(selectedAgreement.quote_number, selectedAgreement.created_at)})
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px', flexWrap: 'wrap' }}>
                                    <h2 style={{ margin: 0, fontWeight: '900', color: THEME.colors.textMain, fontSize: '1.15rem' }}>
                                        {selectedAgreement.profiles?.company_name || selectedAgreement.client_name}
                                    </h2>
                                    {(() => {
                                        const badgeName = selectedAgreement.model_snapshot_name || `${selectedAgreement.profiles?.company_name || selectedAgreement.client_name || 'Acuerdo'} - ${selectedAgreement.created_at ? new Date(selectedAgreement.created_at).toLocaleDateString('es-CO') : ''}`;
                                        return (
                                            <span style={{ 
                                                fontSize: '0.72rem', 
                                                backgroundColor: '#F1F5F9', 
                                                color: '#334155', 
                                                border: '1px solid #CBD5E1', 
                                                padding: '2px 8px', 
                                                borderRadius: '6px', 
                                                fontWeight: '600' 
                                            }}>
                                                {badgeName}
                                            </span>
                                        );
                                    })()}
                                    {selectedAgreement.profiles?.parent_id ? (
                                        <span style={{ 
                                            fontSize: '0.72rem', 
                                            backgroundColor: '#EFF6FF', 
                                            color: '#1D4ED8', 
                                            border: '1px solid #BFDBFE', 
                                            padding: '2px 8px', 
                                            borderRadius: '6px', 
                                            fontWeight: '700',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '3px'
                                        }}>
                                            <Building size={12} /> Sucursal
                                        </span>
                                    ) : (
                                        <span style={{ 
                                            fontSize: '0.72rem', 
                                            backgroundColor: '#F5F3FF', 
                                            color: '#6D28D9', 
                                            border: '1px solid #DDD6FE', 
                                            padding: '2px 8px', 
                                            borderRadius: '6px', 
                                            fontWeight: '700',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '3px'
                                        }}>
                                            <Building2 size={12} /> Matriz
                                        </span>
                                    )}
                                    {(selectedAgreement.model_snapshot_name?.includes('[CONSUMO ABIERTO]') || selectedAgreement.subtotal_amount === 0) && (
                                        <span style={{ 
                                            fontSize: '0.72rem', 
                                            backgroundColor: '#F5F3FF', 
                                            color: '#6D28D9', 
                                            border: '1px solid #C4B5FD', 
                                            padding: '2px 8px', 
                                            borderRadius: '6px', 
                                            fontWeight: '800' 
                                        }}>
                                            Consumo Abierto ($0)
                                        </span>
                                    )}
                                    {(() => {
                                        const lastUpdate = getLastUpdateInfo();
                                        return (
                                            <span style={{ 
                                                fontSize: '0.72rem', 
                                                color: '#64748B',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                marginLeft: '4px'
                                            }}>
                                                • Editado por <strong style={{ color: '#0F172A' }}>{lastUpdate.author}</strong> ({lastUpdate.formatted})
                                            </span>
                                        );
                                    })()}
                                </div>
                            </div>
                            <button 
                                onClick={() => setIsDrawerOpen(false)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Top Fixed Control Area: KPIs + Slim Alert Lines + Toolbar */}
                        <div style={{ flexShrink: 0, backgroundColor: '#FFFFFF', borderBottom: `1px solid ${THEME.colors.border}`, zIndex: 40 }}>
                            {/* Compact KPI Strip */}
                            <div style={{ 
                                padding: '0.45rem 1.5rem', 
                                backgroundColor: '#F8FAFC', 
                                borderBottom: `1px solid #E2E8F0`, 
                                display: 'flex', 
                                gap: '1.75rem', 
                                alignItems: 'center', 
                                flexWrap: 'wrap'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <span style={{ fontSize: '0.68rem', color: THEME.colors.textSecondary, fontWeight: '700' }}>VIGENCIA:</span>
                                    <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#1E293B' }}>
                                        {selectedAgreement.start_date ? new Date(selectedAgreement.start_date).toLocaleDateString() : 'N/A'} al {selectedAgreement.valid_until ? new Date(selectedAgreement.valid_until).toLocaleDateString() : 'Indefinida'}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <span style={{ fontSize: '0.68rem', color: THEME.colors.textSecondary, fontWeight: '700' }}>ESTADO:</span>
                                    <span style={{ 
                                        backgroundColor: getAgreementStatus(selectedAgreement.valid_until).bgColor, 
                                        color: getAgreementStatus(selectedAgreement.valid_until).color, 
                                        padding: '1px 6px', 
                                        borderRadius: '4px', 
                                        fontSize: '0.7rem', 
                                        fontWeight: '800' 
                                    }}>
                                        {getAgreementStatus(selectedAgreement.valid_until).label}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <span style={{ fontSize: '0.68rem', color: THEME.colors.textSecondary, fontWeight: '700' }}>PRODUCTOS:</span>
                                    <span style={{ fontSize: '0.78rem', fontWeight: '800', color: THEME.colors.primary }}>
                                        {loadingItems ? '...' : `${agreementItems.length} SKUs`}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <span style={{ fontSize: '0.68rem', color: THEME.colors.textSecondary, fontWeight: '700' }}>MARGEN PROM:</span>
                                    <span style={{ 
                                        fontSize: '0.78rem', 
                                        fontWeight: '800',
                                        color: averageMargin >= 50 ? '#059669' : averageMargin >= 20 ? '#D97706' : '#DC2626' 
                                    }}>
                                        {loadingItems ? '...' : `${(Math.round(averageMargin * 10) / 10).toFixed(1)}%`}
                                    </span>
                                </div>
                            </div>

                            {/* Ultra-Slim Amber Warning Line: Inactive SKUs */}
                            {(() => {
                                const inactiveList = agreementItems.filter(it => it.products?.is_active === false);
                                if (inactiveList.length === 0) return null;
                                return (
                                    <div style={{
                                        minHeight: '26px',
                                        padding: '2px 1.5rem',
                                        backgroundColor: '#FFFBEB',
                                        borderBottom: '1px solid #FDE68A',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        fontSize: '0.72rem',
                                        color: '#92400E'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <AlertTriangle size={12} color="#D97706" />
                                            <span><strong>{inactiveList.length} SKUs inactivos</strong> en catálogo maestro (no podrán pedirse)</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleAutoActivateDrawerInactive}
                                            disabled={activatingDrawerSkus}
                                            style={{
                                                backgroundColor: '#D97706',
                                                color: 'white',
                                                border: 'none',
                                                padding: '2px 8px',
                                                borderRadius: '4px',
                                                fontSize: '0.7rem',
                                                fontWeight: '700',
                                                cursor: activatingDrawerSkus ? 'not-allowed' : 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                            title="Reactivar automáticamente todos los productos inactivos de este acuerdo en el catálogo maestro"
                                        >
                                            <CheckCircle2 size={11} /> {activatingDrawerSkus ? 'Reactivando...' : 'Reactivar en Catálogo'}
                                        </button>
                                    </div>
                                );
                            })()}

                            {/* Ultra-Slim Green Notice Line: Modified/Adenda Items */}
                            {(() => {
                                const modifiedLogsCount = Object.keys(agreementAuditLogs).length;
                                if (modifiedLogsCount === 0) return null;
                                return (
                                    <div style={{
                                        minHeight: '26px',
                                        padding: '2px 1.5rem',
                                        backgroundColor: '#F0FDF4',
                                        borderBottom: '1px solid #BBF7D0',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        fontSize: '0.72rem',
                                        color: '#166534'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <Sparkles size={12} color="#16A34A" />
                                            <span><strong>{modifiedLogsCount} productos</strong> con novedades/adendas registradas en este acuerdo</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleOpenPartialBatchModal}
                                            style={{
                                                backgroundColor: '#16A34A',
                                                color: 'white',
                                                border: 'none',
                                                padding: '2px 8px',
                                                borderRadius: '4px',
                                                fontSize: '0.7rem',
                                                fontWeight: '700',
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                            title="Abrir asistente de modificación parcial de precios"
                                        >
                                            <ClipboardList size={11} /> Ajuste Masivo
                                        </button>
                                    </div>
                                );
                            })()}

                            {/* Docked Gallery Toolbar with Omnibox + Buttons */}
                            <div style={{
                                padding: '0.5rem 1.5rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '10px',
                                flexWrap: 'wrap'
                            }}>
                                {/* Superbuscador Omnibox */}
                                <GalleryOmnibox
                                    value={drawerSearchTerm}
                                    onChange={setDrawerSearchTerm}
                                    placeholder="Buscar producto, código contable (#ID), categoría o U.M...."
                                    filteredCount={filteredAgreementItems.length}
                                    totalCount={agreementItems.length}
                                    style={{ flex: '1 1 240px', maxWidth: '360px' }}
                                />

                                {/* Botonera de Acciones de Cabecera */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                    {masterTemplate && (
                                        <button
                                            type="button"
                                            onClick={() => setConfirmApplyMasterTarget(selectedAgreement)}
                                            disabled={isApplyingMasterToAgreement === selectedAgreement.id}
                                            style={{
                                                padding: '0.4rem 0.7rem',
                                                borderRadius: '6px',
                                                backgroundColor: '#F0FDF4',
                                                color: '#166534',
                                                border: '1px solid #86EFAC',
                                                fontSize: '0.74rem',
                                                fontWeight: '700',
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '5px',
                                                whiteSpace: 'nowrap'
                                            }}
                                            title="Sincronizar y cargar los precios del Modelo Institucional General a este acuerdo"
                                        >
                                            <Sparkles size={13} color="#16A34A" />
                                            {isApplyingMasterToAgreement === selectedAgreement.id ? 'Aplicando...' : 'Cargar Modelo General'}
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => setIsPrintModalOpen(true)}
                                        style={{
                                            padding: '0.4rem 0.7rem',
                                            borderRadius: '6px',
                                            backgroundColor: '#F8FAFC',
                                            color: '#334155',
                                            border: '1px solid #CBD5E1',
                                            fontSize: '0.74rem',
                                            fontWeight: '700',
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                            whiteSpace: 'nowrap'
                                        }}
                                        title="Abrir vista de impresión y exportación"
                                    >
                                        <Printer size={13} color="#475569" />
                                        Vista Imprimible
                                    </button>
                                    {(() => {
                                        const modifiedLogsCount = Object.keys(agreementAuditLogs).length;
                                        return (
                                            <button
                                                type="button"
                                                onClick={() => handleOpenNotificationModal(modifiedLogsCount > 0 ? 'PRICE_UPDATE_DIFF' : 'NEW_AGREEMENT')}
                                                style={{
                                                    padding: '0.4rem 0.7rem',
                                                    borderRadius: '6px',
                                                    backgroundColor: modifiedLogsCount > 0 ? '#FEF3C7' : '#EFF6FF',
                                                    color: modifiedLogsCount > 0 ? '#92400E' : '#1D4ED8',
                                                    border: modifiedLogsCount > 0 ? '1px solid #FCD34D' : '1px solid #93C5FD',
                                                    fontSize: '0.74rem',
                                                    fontWeight: '700',
                                                    cursor: 'pointer',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '5px',
                                                    whiteSpace: 'nowrap'
                                                }}
                                                title="Notificar formalmente por correo electrónico"
                                            >
                                                <Mail size={13} color={modifiedLogsCount > 0 ? '#D97706' : '#2563EB'} />
                                                {modifiedLogsCount > 0 ? `Notificar Novedades (${modifiedLogsCount})` : 'Notificar por Correo'}
                                            </button>
                                        );
                                    })()}
                                    <button
                                        type="button"
                                        onClick={handleOpenPartialBatchModal}
                                        style={{
                                            padding: '0.4rem 0.7rem',
                                            borderRadius: '6px',
                                            backgroundColor: '#F0FDF4',
                                            color: '#166534',
                                            border: '1px solid #86EFAC',
                                            fontSize: '0.74rem',
                                            fontWeight: '700',
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                            whiteSpace: 'nowrap'
                                        }}
                                        title="Abrir asistente de modificación parcial de precios"
                                    >
                                        <ClipboardList size={13} color="#16A34A" />
                                        Adenda / Ajuste Parcial
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleOpenAddProductModal}
                                        style={{
                                            padding: '0.4rem 0.8rem',
                                            borderRadius: '6px',
                                            backgroundColor: THEME.colors.primary,
                                            color: 'white',
                                            border: 'none',
                                            fontSize: '0.74rem',
                                            fontWeight: '800',
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                            whiteSpace: 'nowrap',
                                            boxShadow: '0 2px 4px rgba(13, 122, 87, 0.25)'
                                        }}
                                        title="Agregar un nuevo producto al acuerdo comercial"
                                    >
                                        <Plus size={14} />
                                        Agregar Producto
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Dedicated Scrollable Table Container */}
                        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '0 1.5rem 1.5rem 1.5rem' }}>
                            {loadingItems ? (
                                <div style={{ padding: '4rem', textAlign: 'center', color: THEME.colors.textSecondary, fontWeight: 'bold' }}>Cargando lista de precios...</div>
                            ) : agreementItems.length === 0 ? (
                                <div style={{ padding: '4rem', textAlign: 'center', color: THEME.colors.textSecondary }}>No hay ítems registrados en este acuerdo comercial.</div>
                            ) : (
                                (() => {
                                    const filtered = filteredAgreementItems;

                                    if (filtered.length === 0) {
                                        return (
                                            <div style={{ padding: '3rem 1rem', textAlign: 'center', color: THEME.colors.textSecondary }}>
                                                <Search size={24} color="#94A3B8" style={{ margin: '0 auto 8px', display: 'block' }} />
                                                <p style={{ fontWeight: 'bold', margin: '0 0 4px' }}>Sin coincidencias</p>
                                                <p style={{ fontSize: '0.8rem', margin: 0 }}>No se encontró ningún producto para "{drawerSearchTerm}"</p>
                                            </div>
                                        );
                                    }

                                    return (
                                        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left' }}>
                                            <thead style={{ position: 'sticky', top: 0, zIndex: 30 }}>
                                                <tr style={{ backgroundColor: '#F8FAFC' }}>
                                                    <th style={{ position: 'sticky', top: 0, zIndex: 30, padding: '0.65rem 0.5rem', ...THEME.typography.tableHeader, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>Cod. Contable</th>
                                                    <th style={{ position: 'sticky', top: 0, zIndex: 30, padding: '0.65rem 0.5rem', ...THEME.typography.tableHeader, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>Producto</th>
                                                    <th style={{ position: 'sticky', top: 0, zIndex: 30, padding: '0.65rem 0.5rem', ...THEME.typography.tableHeader, textAlign: 'center', backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>U.M.</th>
                                                    <th style={{ position: 'sticky', top: 0, zIndex: 30, padding: '0.65rem 0.5rem', ...THEME.typography.tableHeader, textAlign: 'right', backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>Costo Base</th>
                                                    <th style={{ position: 'sticky', top: 0, zIndex: 30, padding: '0.65rem 0.5rem', ...THEME.typography.tableHeader, textAlign: 'right', backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>Precio Acordado</th>
                                                    <th style={{ position: 'sticky', top: 0, zIndex: 30, padding: '0.65rem 0.5rem', ...THEME.typography.tableHeader, textAlign: 'center', backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>IVA</th>
                                                    <th style={{ position: 'sticky', top: 0, zIndex: 30, padding: '0.65rem 0.5rem', ...THEME.typography.tableHeader, textAlign: 'center', backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>Margen</th>
                                                    <th style={{ position: 'sticky', top: 0, zIndex: 30, padding: '0.65rem 0.5rem', ...THEME.typography.tableHeader, textAlign: 'center', backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>Fecha / Hora</th>
                                                    <th style={{ position: 'sticky', top: 0, zIndex: 30, padding: '0.65rem 0.5rem', ...THEME.typography.tableHeader, textAlign: 'left', backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>Usuario</th>
                                                    <th style={{ position: 'sticky', top: 0, zIndex: 30, padding: '0.65rem 0.5rem', ...THEME.typography.tableHeader, textAlign: 'center', width: '90px', backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>Acciones</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filtered.map(item => {
                                                    const isEditingThis = editingItemId === item.id;
                                                    const itemLogs = agreementAuditLogs[item.id] || [];
                                                    const hasAuditLogs = itemLogs.length > 0;
                                                    const cost = Number(item.cost_basis) || 0;
                                                    const currentEditNum = Number(editingPriceValue);
                                                    const activeDisplayMargin = isEditingThis 
                                                        ? (currentEditNum > 0 ? Math.round(((currentEditNum - cost) / currentEditNum) * 1000) / 10 : 0)
                                                        : (Math.round(item.margin_percent * 10) / 10);

                                                    return (
                                                        <tr 
                                                            key={item.id} 
                                                            style={{ 
                                                                borderBottom: `1px solid ${THEME.colors.border}`,
                                                                backgroundColor: isEditingThis ? '#F0FDF4' : 'transparent',
                                                                transition: 'background-color 0.15s'
                                                            }}
                                                        >
                                                            <td style={{ padding: '0.75rem 0.5rem', color: THEME.colors.textSecondary, fontWeight: '500', fontSize: '0.85rem' }}>
                                                                {item.products?.accounting_id || '---'}
                                                            </td>
                                                            <td style={{ padding: '0.75rem 0.5rem', fontWeight: 'bold', color: THEME.colors.textMain, fontSize: '0.85rem' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                                    <span>{item.product_name}</span>
                                                                    {item.products?.is_active === false && (
                                                                        <span 
                                                                            title="Este producto está INACTIVO en el catálogo maestro y no puede ser seleccionado al montar pedidos."
                                                                            style={{ 
                                                                                display: 'inline-flex', 
                                                                                alignItems: 'center', 
                                                                                gap: '3px', 
                                                                                backgroundColor: '#FEF2F2', 
                                                                                color: '#DC2626', 
                                                                                border: '1px solid #FECACA', 
                                                                                padding: '1px 5px', 
                                                                                borderRadius: '4px', 
                                                                                fontSize: '0.68rem', 
                                                                                fontWeight: '700'
                                                                            }}
                                                                        >
                                                                            <AlertTriangle size={11} /> Inactivo en Catálogo
                                                                        </span>
                                                                    )}
                                                                    {hasAuditLogs && (
                                                                        <div 
                                                                            style={{ position: 'relative', display: 'inline-flex' }}
                                                                            onMouseEnter={() => setHoveredAuditItemId(item.id)}
                                                                            onMouseLeave={() => setHoveredAuditItemId(null)}
                                                                        >
                                                                            <span 
                                                                                title="Historial de modificaciones de precio"
                                                                                style={{ 
                                                                                    display: 'inline-flex', 
                                                                                    alignItems: 'center', 
                                                                                    gap: '3px', 
                                                                                    backgroundColor: '#ECFDF5', 
                                                                                    color: '#047857', 
                                                                                    border: '1px solid #A7F3D0', 
                                                                                    padding: '1px 5px', 
                                                                                    borderRadius: '4px', 
                                                                                    fontSize: '0.68rem', 
                                                                                    fontWeight: '700',
                                                                                    cursor: 'pointer'
                                                                                }}
                                                                            >
                                                                                <History size={11} /> {itemLogs.length}
                                                                            </span>
                                                                            {hoveredAuditItemId === item.id && (
                                                                                <div style={{
                                                                                    position: 'absolute',
                                                                                    left: 0,
                                                                                    bottom: '100%',
                                                                                    marginBottom: '6px',
                                                                                    backgroundColor: '#1E293B',
                                                                                    color: 'white',
                                                                                    borderRadius: '8px',
                                                                                    padding: '8px 12px',
                                                                                    fontSize: '0.72rem',
                                                                                    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.4)',
                                                                                    zIndex: 2000,
                                                                                    width: '260px',
                                                                                    textAlign: 'left',
                                                                                    pointerEvents: 'none'
                                                                                }}>
                                                                                    <div style={{ fontWeight: 'bold', borderBottom: '1px solid #334155', paddingBottom: '4px', marginBottom: '4px', color: '#38BDF8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                        <History size={12} /> Trazabilidad de Precios
                                                                                    </div>
                                                                                    {itemLogs.slice(0, 3).map((log, idx) => {
                                                                                        const d = log.details || {};
                                                                                        const dateStr = log.created_at ? new Date(log.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
                                                                                        const author = log.collaborator_name || 'Comercial';
                                                                                        return (
                                                                                            <div key={log.id || idx} style={{ marginBottom: '4px', lineHeight: 1.3 }}>
                                                                                                <div style={{ color: '#94A3B8', fontSize: '0.65rem' }}>{dateStr} • {author}</div>
                                                                                                <div>
                                                                                                    <span style={{ textDecoration: 'line-through', color: '#FDA4AF' }}>${formatNumber(d.old_price)}</span>
                                                                                                    {' → '}
                                                                                                    <span style={{ color: '#4ADE80', fontWeight: 'bold' }}>${formatNumber(d.new_price)}</span>
                                                                                                </div>
                                                                                            </div>
                                                                                        );
                                                                                    })}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: THEME.colors.textSecondary, fontSize: '0.85rem' }}>
                                                                {item.products?.unit_of_measure || 'Kg'}
                                                            </td>
                                                            <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: '#64748B', fontSize: '0.85rem' }}>
                                                                {formatMoney(item.cost_basis)}
                                                            </td>
                                                            <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 'bold', color: THEME.colors.primary, fontSize: '0.85rem' }}>
                                                                {isEditingThis ? (
                                                                    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                            <span style={{ fontSize: '0.75rem', color: '#64748B' }}>$</span>
                                                                            <input 
                                                                                type="number" 
                                                                                autoFocus
                                                                                min="1"
                                                                                step="1"
                                                                                value={editingPriceValue} 
                                                                                onChange={(e) => setEditingPriceValue(e.target.value)}
                                                                                onKeyDown={(e) => {
                                                                                    if (e.key === 'Enter') handleSaveSinglePrice(item);
                                                                                    if (e.key === 'Escape') setEditingItemId(null);
                                                                                }}
                                                                                style={{ 
                                                                                    width: '95px', 
                                                                                    padding: '4px 6px', 
                                                                                    borderRadius: '6px', 
                                                                                    border: `2px solid ${THEME.colors.primary}`, 
                                                                                    fontSize: '0.85rem', 
                                                                                    fontWeight: 'bold', 
                                                                                    textAlign: 'right',
                                                                                    color: THEME.colors.textMain,
                                                                                    outline: 'none',
                                                                                    backgroundColor: 'white'
                                                                                }} 
                                                                            />
                                                                        </div>
                                                                        <select
                                                                            value={editingJustification}
                                                                            onChange={(e) => setEditingJustification(e.target.value)}
                                                                            style={{
                                                                                fontSize: '0.68rem',
                                                                                padding: '2px 4px',
                                                                                borderRadius: '4px',
                                                                                border: '1px solid #CBD5E1',
                                                                                maxWidth: '170px',
                                                                                color: '#334155',
                                                                                backgroundColor: '#F8FAFC'
                                                                            }}
                                                                            title="Justificación de variación de precio por cosecha/abastecimiento"
                                                                        >
                                                                            <option value="">-- Motivo (Opcional) --</option>
                                                                            {SUPPLY_JUSTIFICATION_PRESETS.map((preset, pIdx) => (
                                                                                <option key={pIdx} value={preset.value === 'CUSTOM' ? '' : preset.value}>{preset.label}</option>
                                                                            ))}
                                                                        </select>
                                                                    </div>
                                                                ) : (
                                                                    formatMoney(item.unit_price)
                                                                )}
                                                            </td>
                                                            <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: '#64748B', fontSize: '0.85rem' }}>
                                                                {item.iva_rate}%
                                                            </td>
                                                            <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: activeDisplayMargin >= 50 ? '#059669' : activeDisplayMargin >= 20 ? '#D97706' : '#DC2626', fontWeight: 'bold', fontSize: '0.85rem' }}>
                                                                {activeDisplayMargin}%
                                                            </td>
                                                            {/* Columna Fecha / Hora idéntica a la fotografía */}
                                                            <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                                                                {(() => {
                                                                    const itemAudit = getItemAuditInfo(item);
                                                                    return (
                                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                                                            <span style={{ 
                                                                                color: itemAudit.isModified ? '#0284C7' : '#475569', 
                                                                                fontWeight: itemAudit.isModified ? '700' : '500',
                                                                                backgroundColor: itemAudit.isModified ? '#F0F9FF' : 'transparent',
                                                                                padding: itemAudit.isModified ? '2px 6px' : '0',
                                                                                borderRadius: '4px',
                                                                                border: itemAudit.isModified ? '1px solid #BAE6FD' : 'none'
                                                                            }}>
                                                                                {itemAudit.formatted}
                                                                            </span>
                                                                            {itemAudit.isModified && (
                                                                                <span style={{ fontSize: '0.65rem', color: '#0369A1', fontWeight: '800' }}>
                                                                                    <Edit3 size={10} style={{ verticalAlign: 'middle', marginRight: '3px', display: 'inline' }} /> Modificado
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })()}
                                                            </td>
                                                            {/* Columna Usuario idéntica a la fotografía */}
                                                            <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                                                                {(() => {
                                                                    const itemAudit = getItemAuditInfo(item);
                                                                    return (
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                            <User size={13} color="#64748B" />
                                                                            <span style={{ fontWeight: '600', color: THEME.colors.textMain }}>
                                                                                {itemAudit.author}
                                                                            </span>
                                                                        </div>
                                                                    );
                                                                })()}
                                                            </td>
                                                            <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                                {isEditingThis ? (
                                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                                                        <button
                                                                            type="button"
                                                                            title="Guardar nuevo precio"
                                                                            disabled={savingPriceItemId === item.id}
                                                                            onClick={() => handleSaveSinglePrice(item)}
                                                                            style={{
                                                                                backgroundColor: THEME.colors.primary,
                                                                                color: 'white',
                                                                                border: 'none',
                                                                                borderRadius: '6px',
                                                                                padding: '5px 8px',
                                                                                cursor: 'pointer',
                                                                                display: 'flex',
                                                                                alignItems: 'center',
                                                                                boxShadow: '0 2px 4px rgba(13, 122, 87, 0.2)'
                                                                            }}
                                                                        >
                                                                            {savingPriceItemId === item.id ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            title="Cancelar"
                                                                            disabled={savingPriceItemId === item.id}
                                                                            onClick={() => setEditingItemId(null)}
                                                                            style={{
                                                                                backgroundColor: '#F1F5F9',
                                                                                color: '#64748B',
                                                                                border: '1px solid #CBD5E1',
                                                                                borderRadius: '6px',
                                                                                padding: '5px 7px',
                                                                                cursor: 'pointer',
                                                                                display: 'flex',
                                                                                alignItems: 'center'
                                                                            }}
                                                                        >
                                                                            <X size={13} />
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <button
                                                                        type="button"
                                                                        title="Editar precio sin cambiar vigencia"
                                                                        onClick={() => {
                                                                            setEditingItemId(item.id);
                                                                            setEditingPriceValue(String(item.unit_price));
                                                                            const latestLog = agreementAuditLogs[item.id]?.[0];
                                                                            setEditingJustification(itemJustifications[item.id] || latestLog?.details?.justification || '');
                                                                        }}
                                                                        style={{
                                                                            backgroundColor: 'transparent',
                                                                            color: '#64748B',
                                                                            border: '1px solid #E2E8F0',
                                                                            borderRadius: '6px',
                                                                            padding: '4px 8px',
                                                                            cursor: 'pointer',
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            gap: '4px',
                                                                            fontSize: '0.75rem',
                                                                            fontWeight: '500',
                                                                            transition: 'all 0.15s'
                                                                        }}
                                                                        onMouseEnter={e => {
                                                                            e.currentTarget.style.color = THEME.colors.primary;
                                                                            e.currentTarget.style.borderColor = THEME.colors.primary;
                                                                            e.currentTarget.style.backgroundColor = THEME.colors.primaryLight;
                                                                        }}
                                                                        onMouseLeave={e => {
                                                                            e.currentTarget.style.color = '#64748B';
                                                                            e.currentTarget.style.borderColor = '#E2E8F0';
                                                                            e.currentTarget.style.backgroundColor = 'transparent';
                                                                        }}
                                                                    >
                                                                        <Edit3 size={12} /> Editar
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    );
                                })()
                            )}
                        </div>

                        {/* Drawer Footer */}
                        <div style={{ padding: '1rem 1.5rem', borderTop: `1px solid ${THEME.colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F9FAFB' }}>
                            <div style={{ fontSize: '0.8rem', color: '#64748B' }}>
                                Total productos configurados: <strong style={{ color: '#0F172A' }}>{agreementItems.length}</strong>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <button
                                    type="button"
                                    onClick={handleOpenAddProductModal}
                                    style={{
                                        padding: '0.65rem 1.25rem',
                                        borderRadius: THEME.radius.md,
                                        border: 'none',
                                        backgroundColor: THEME.colors.primary,
                                        color: 'white',
                                        cursor: 'pointer',
                                        fontWeight: 'bold',
                                        fontSize: '0.85rem',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        boxShadow: '0 2px 6px rgba(13, 122, 87, 0.3)',
                                        transition: 'all 0.15s ease'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = THEME.colors.primaryHover}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = THEME.colors.primary}
                                >
                                    <Plus size={16} />
                                    Agregar Producto al Acuerdo
                                </button>
                                <button 
                                    onClick={() => setIsDrawerOpen(false)}
                                    style={{
                                        padding: '0.65rem 1.25rem',
                                        borderRadius: THEME.radius.md,
                                        border: `1px solid ${THEME.colors.borderActive}`,
                                        backgroundColor: 'white',
                                        color: THEME.colors.textSecondary,
                                        cursor: 'pointer',
                                        fontWeight: 'bold',
                                        fontSize: '0.85rem',
                                        transition: 'all 0.15s ease'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F1F5F9'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'white'}
                                >
                                    Cerrar Lista
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL PARA AGREGAR PRODUCTO AL ACUERDO COMERCIAL */}
            {isAddProductModalOpen && selectedAgreement && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: 'rgba(15, 23, 42, 0.65)',
                    backdropFilter: 'blur(3px)',
                    zIndex: 2600,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: '1rem'
                }}>
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '16px',
                        width: '100%',
                        maxWidth: '560px',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        border: '1px solid #E2E8F0',
                        animation: 'fadeIn 0.2s ease-out'
                    }}>
                        {/* Header */}
                        <div style={{
                            padding: '1.2rem 1.5rem',
                            borderBottom: '1px solid #E2E8F0',
                            backgroundColor: '#F8FAFC',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Plus size={20} color={THEME.colors.primary} />
                                    Agregar Producto al Acuerdo
                                </h3>
                                <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                                    {selectedAgreement.client_name || selectedAgreement.model_snapshot_name || 'Acuerdo Comercial'}
                                </p>
                            </div>
                            <button
                                onClick={() => setIsAddProductModalOpen(false)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '4px' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Body */}
                        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                            {/* Search Product */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                                    1. Buscar Producto en Catálogo
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <Search size={16} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                                    <input
                                        type="text"
                                        placeholder="Escribe nombre o código contable del producto..."
                                        value={addProductSearch}
                                        onChange={(e) => handleSearchProductsToAdd(e.target.value)}
                                        autoFocus
                                        style={{
                                            width: '100%',
                                            padding: '0.65rem 2rem 0.65rem 2.2rem',
                                            borderRadius: '8px',
                                            border: '1.5px solid #CBD5E1',
                                            fontSize: '0.85rem',
                                            outline: 'none'
                                        }}
                                    />
                                    {isSearchingProductsToAdd && (
                                        <RefreshCw size={14} className="animate-spin" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: THEME.colors.primary }} />
                                    )}
                                </div>

                                {/* Results Dropdown / List */}
                                {addProductResults.length > 0 && !selectedAddProduct && (
                                    <div style={{
                                        marginTop: '6px',
                                        maxHeight: '180px',
                                        overflowY: 'auto',
                                        backgroundColor: 'white',
                                        border: '1.5px solid #E2E8F0',
                                        borderRadius: '8px',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
                                    }}>
                                        {addProductResults.map(p => {
                                            const alreadyInAgreement = agreementItems.some(it => it.product_id === p.id);
                                            return (
                                                <div
                                                    key={p.id}
                                                    onClick={() => handleSelectProductToAdd(p)}
                                                    style={{
                                                        padding: '8px 12px',
                                                        borderBottom: '1px solid #F1F5F9',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        backgroundColor: 'white',
                                                        transition: 'background-color 0.1s'
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'white'}
                                                >
                                                    <div>
                                                        <div style={{ fontWeight: '700', fontSize: '0.85rem', color: '#0F172A' }}>
                                                            {p.name}
                                                        </div>
                                                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                                            Cód: {p.accounting_id || 'S/C'} • U.M: {p.unit_of_measure || 'Kg'} • Costo Base: ${formatNumber(p.cost_basis || 0)}
                                                        </div>
                                                    </div>
                                                    {alreadyInAgreement && (
                                                        <span style={{ fontSize: '0.68rem', backgroundColor: '#FEF3C7', color: '#92400E', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                                                            En acuerdo
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Selected Product Card */}
                            {selectedAddProduct && (
                                <div style={{
                                    backgroundColor: '#F8FAFC',
                                    border: '1.5px solid #CBD5E1',
                                    borderRadius: '10px',
                                    padding: '1rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.8rem'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <span style={{ fontSize: '0.7rem', fontWeight: '800', color: THEME.colors.primary, backgroundColor: THEME.colors.primaryLight, padding: '2px 6px', borderRadius: '4px' }}>
                                                PRODUCTO SELECCIONADO
                                            </span>
                                            <h4 style={{ margin: '4px 0 2px', fontSize: '1rem', fontWeight: '800', color: '#0F172A' }}>
                                                {selectedAddProduct.name}
                                            </h4>
                                            <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                                                Cód. Contable: <strong>{selectedAddProduct.accounting_id || 'S/C'}</strong> • U.M: <strong>{selectedAddProduct.unit_of_measure || 'Kg'}</strong>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedAddProduct(null)}
                                            style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold', textDecoration: 'underline' }}
                                        >
                                            Cambiar
                                        </button>
                                    </div>

                                    {/* Price & Margin Calculation Grid */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '4px' }}>
                                        <div style={{ backgroundColor: 'white', padding: '0.75rem', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                            <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: '600' }}>Costo Base Referencia</div>
                                            <div style={{ fontSize: '1rem', fontWeight: '800', color: '#334155', marginTop: '2px' }}>
                                                ${formatNumber(selectedAddProduct.cost_basis || 0)}
                                            </div>
                                        </div>

                                        <div style={{ backgroundColor: 'white', padding: '0.75rem', borderRadius: '8px', border: '1.5px solid #0D7A57' }}>
                                            <label style={{ display: 'block', fontSize: '0.72rem', color: THEME.colors.primary, fontWeight: '800' }}>
                                                * Precio Acordado ($)
                                            </label>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                                <span style={{ fontWeight: '800', color: '#64748B' }}>$</span>
                                                <input
                                                    type="number"
                                                    step="any"
                                                    placeholder="Ej: 4500"
                                                    value={newProductPrice}
                                                    onChange={(e) => setNewProductPrice(e.target.value)}
                                                    autoFocus
                                                    style={{
                                                        width: '100%',
                                                        border: 'none',
                                                        outline: 'none',
                                                        fontSize: '1.1rem',
                                                        fontWeight: '900',
                                                        color: '#0F172A'
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Margin Live Indicator */}
                                    {(() => {
                                        const cost = Number(selectedAddProduct.cost_basis) || 0;
                                        const price = Number(newProductPrice) || 0;
                                        if (price <= 0) return null;
                                        const margin = Math.round(((price - cost) / price) * 1000) / 10;
                                        const isNeg = margin < 0;
                                        const isLow = margin >= 0 && margin < 10;
                                        return (
                                            <div style={{
                                                padding: '6px 10px',
                                                borderRadius: '6px',
                                                backgroundColor: isNeg ? '#FEE2E2' : isLow ? '#FEF3C7' : '#DCFCE7',
                                                color: isNeg ? '#991B1B' : isLow ? '#92400E' : '#166534',
                                                fontSize: '0.75rem',
                                                fontWeight: '700',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center'
                                            }}>
                                                <span>Margen Estimado:</span>
                                                <span style={{ fontSize: '0.85rem', fontWeight: '900' }}>{margin}%</span>
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div style={{
                            padding: '1rem 1.5rem',
                            borderTop: '1px solid #E2E8F0',
                            backgroundColor: '#F8FAFC',
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: '10px'
                        }}>
                            <button
                                type="button"
                                onClick={() => setIsAddProductModalOpen(false)}
                                style={{
                                    padding: '0.6rem 1.2rem',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1',
                                    backgroundColor: 'white',
                                    color: '#475569',
                                    fontWeight: '700',
                                    fontSize: '0.82rem',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                disabled={!selectedAddProduct || !newProductPrice || Number(newProductPrice) <= 0 || isSavingNewProduct}
                                onClick={handleSaveProductToAgreement}
                                style={{
                                    padding: '0.6rem 1.4rem',
                                    borderRadius: '8px',
                                    border: 'none',
                                    backgroundColor: (!selectedAddProduct || !newProductPrice || Number(newProductPrice) <= 0 || isSavingNewProduct) ? '#94A3B8' : THEME.colors.primary,
                                    color: 'white',
                                    fontWeight: '800',
                                    fontSize: '0.85rem',
                                    cursor: (!selectedAddProduct || !newProductPrice || Number(newProductPrice) <= 0 || isSavingNewProduct) ? 'not-allowed' : 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: '0 2px 6px rgba(13, 122, 87, 0.3)'
                                }}
                            >
                                {isSavingNewProduct ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                                Guardar en Acuerdo
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL HITL DE VALIDACIÓN Y DESPACHO DE NOTIFICACIÓN DE PRECIOS POR CORREO */}
            {isEmailModalOpen && selectedAgreement && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: 'rgba(15, 23, 42, 0.75)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 2600,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: '1.25rem',
                    overflowY: 'auto'
                }}>
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '16px',
                        width: '100%',
                        maxWidth: '820px',
                        maxHeight: '92vh',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
                        border: '1px solid #E2E8F0'
                    }}>
                        {/* Header */}
                        <div style={{
                            backgroundColor: '#0F172A',
                            color: 'white',
                            padding: '1.2rem 1.5rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            borderBottom: '1px solid #1E293B'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{
                                    width: '36px',
                                    height: '36px',
                                    borderRadius: '10px',
                                    backgroundColor: 'rgba(16, 185, 129, 0.2)',
                                    border: '1px solid rgba(16, 185, 129, 0.4)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#34D399'
                                }}>
                                    <Mail size={18} />
                                </div>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900, color: 'white' }}>
                                            Despacho Asistido de Notificación al Cliente
                                        </h2>
                                        <span style={{
                                            fontSize: '0.65rem',
                                            fontWeight: 800,
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.5px',
                                            padding: '2px 8px',
                                            borderRadius: '100px',
                                            backgroundColor: emailModalMode === 'PRICE_UPDATE_DIFF' ? '#FEF3C7' : '#DCFCE7',
                                            color: emailModalMode === 'PRICE_UPDATE_DIFF' ? '#92400E' : '#166534',
                                            border: '1px solid currentColor'
                                        }}>
                                            {emailModalMode === 'PRICE_UPDATE_DIFF' ? 'EVT-09: Diff de Precios' : 'EVT-08: Nuevo Acuerdo'}
                                        </span>
                                    </div>
                                    <p style={{ margin: '2px 0 0', fontSize: '0.74rem', color: '#94A3B8' }}>
                                        Validación previa obligatoria (Human-in-the-Loop) antes de despachar el correo transaccional.
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsEmailModalOpen(false)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '4px' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Body */}
                        <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.2rem', backgroundColor: '#F8FAFC' }}>
                            
                            {/* 1. Audit Trail Banner */}
                            <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '1rem', border: '1px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                                    <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <History size={13} color="#15803D" />
                                        Trazabilidad Forense & Auditoría
                                    </span>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <button
                                            type="button"
                                            onClick={() => setEmailModalMode(emailModalMode === 'PRICE_UPDATE_DIFF' ? 'NEW_AGREEMENT' : 'PRICE_UPDATE_DIFF')}
                                            style={{
                                                fontSize: '0.7rem',
                                                fontWeight: 'bold',
                                                padding: '2px 8px',
                                                borderRadius: '6px',
                                                border: '1px solid #CBD5E1',
                                                backgroundColor: '#F1F5F9',
                                                color: '#334155',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Cambiar Modo a: {emailModalMode === 'PRICE_UPDATE_DIFF' ? 'Lista Completa (Nuevo Acuerdo)' : 'Solo Modificados (Diff)'}
                                        </button>
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', fontSize: '0.75rem' }}>
                                    <div style={{ backgroundColor: '#F8FAFC', padding: '0.6rem', borderRadius: '8px', border: '1px solid #F1F5F9' }}>
                                        <span style={{ color: '#94A3B8', display: 'block', fontSize: '0.7rem' }}>Cliente / Razón Social:</span>
                                        <strong style={{ color: '#0F172A' }}>{selectedAgreement.client_name}</strong>
                                    </div>
                                    <div style={{ backgroundColor: '#F8FAFC', padding: '0.6rem', borderRadius: '8px', border: '1px solid #F1F5F9' }}>
                                        <span style={{ color: '#94A3B8', display: 'block', fontSize: '0.7rem' }}>Vigencia Contractual:</span>
                                        <strong style={{ color: '#0F172A' }}>
                                            {selectedAgreement.start_date ? new Date(selectedAgreement.start_date).toLocaleDateString('es-CO') : 'Inmediata'} al {selectedAgreement.valid_until ? new Date(selectedAgreement.valid_until).toLocaleDateString('es-CO') : 'Indefinida'}
                                        </strong>
                                    </div>
                                    <div style={{ backgroundColor: '#F8FAFC', padding: '0.6rem', borderRadius: '8px', border: '1px solid #F1F5F9' }}>
                                        <span style={{ color: '#94A3B8', display: 'block', fontSize: '0.7rem' }}>Asesor Comercial:</span>
                                        <strong style={{ color: '#0F172A' }}>{user?.email || (profile as any)?.company_name || 'Comercial FruFresco'}</strong>
                                    </div>
                                </div>
                            </div>

                            {/* 2. Destinatarios */}
                            <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '1rem', border: '1px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                                <label style={{ fontSize: '0.72rem', fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '0.5rem' }}>
                                    Destinatarios Seleccionados para el Despacho:
                                </label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.78rem' }}>
                                    {emailRecipients.map((rec, idx) => (
                                        <label key={idx} style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '0.6rem 0.85rem',
                                            borderRadius: '8px',
                                            border: rec.selected ? '1.5px solid #86EFAC' : '1px solid #E2E8F0',
                                            backgroundColor: rec.selected ? '#F0FDF4' : '#FFFFFF',
                                            cursor: 'pointer'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={rec.selected}
                                                    onChange={(e) => {
                                                        const checked = e.target.checked;
                                                        setEmailRecipients(prev => prev.map((r, i) => i === idx ? { ...r, selected: checked } : r));
                                                    }}
                                                    style={{ width: '16px', height: '16px', accentColor: '#16A34A', cursor: 'pointer' }}
                                                />
                                                <strong style={{ color: '#0F172A' }}>{rec.email}</strong>
                                                <span style={{ color: '#64748B', fontSize: '0.72rem' }}>({rec.label})</span>
                                            </div>
                                            <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', color: rec.selected ? '#166534' : '#94A3B8' }}>
                                                {rec.selected ? '✓ Incluido' : 'Omitido'}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* 3. Previsualización de la Tabla de Precios */}
                            <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '1rem', border: '1px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                    <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        {emailModalMode === 'PRICE_UPDATE_DIFF' ? 'Tabla Comparativa Diff a Despachar (Sin SKU):' : 'Catálogo Completo a Despachar (Sin SKU):'}
                                    </span>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#166534', backgroundColor: '#DCFCE7', padding: '2px 6px', borderRadius: '4px' }}>
                                        ✓ Membrete Remisión Sincronizado
                                    </span>
                                </div>
                                <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden', maxHeight: '220px', overflowY: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem', textAlign: 'left' }}>
                                        <thead style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 800 }}>
                                            <tr>
                                                <th style={{ padding: '8px 12px' }}>Producto</th>
                                                {emailModalMode === 'PRICE_UPDATE_DIFF' ? (
                                                    <>
                                                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Antes</th>
                                                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Nuevo Precio</th>
                                                        <th style={{ padding: '8px 12px', textAlign: 'center' }}>Variación</th>
                                                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>Justificación Abastecimiento</th>
                                                    </>
                                                ) : (
                                                    <>
                                                        <th style={{ padding: '8px 10px', textAlign: 'center' }}>Presentación</th>
                                                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>Precio Pactado</th>
                                                    </>
                                                )}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(() => {
                                                const diffItems = agreementItems.filter(it => {
                                                    const logs = agreementAuditLogs[it.id];
                                                    return logs && logs.length > 0;
                                                });
                                                const itemsToRender = emailModalMode === 'PRICE_UPDATE_DIFF' 
                                                    ? (diffItems.length > 0 ? diffItems : agreementItems.slice(0, 15))
                                                    : agreementItems.slice(0, 40);

                                                return itemsToRender.map((item, idx) => {
                                                    const logs = agreementAuditLogs[item.id];
                                                    const hasLog = logs && logs.length > 0;
                                                    const oldPrice = hasLog ? logs[logs.length - 1]?.details?.old_price || item.unit_price : item.unit_price;
                                                    const diff = item.unit_price - oldPrice;
                                                    const rowBg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAF9';
                                                    const currentJust = itemJustifications[item.id] ?? (logs && logs[0]?.details?.justification) ?? '';

                                                    return (
                                                        <tr key={item.id} style={{ backgroundColor: hasLog ? '#FEF9C3' : rowBg, borderBottom: '1px solid #F1F5F9' }}>
                                                            <td style={{ padding: '8px 12px', fontWeight: 600, color: '#1E293B' }}>
                                                                {item.product_name}
                                                            </td>
                                                            {emailModalMode === 'PRICE_UPDATE_DIFF' ? (
                                                                <>
                                                                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#94A3B8', textDecoration: 'line-through', fontVariantNumeric: 'tabular-nums' }}>
                                                                        ${formatNumber(oldPrice)}
                                                                    </td>
                                                                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: '#0D7A57', fontVariantNumeric: 'tabular-nums' }}>
                                                                        ${formatNumber(item.unit_price)}
                                                                    </td>
                                                                    <td style={{ padding: '8px 12px', textAlign: 'center', fontVariantNumeric: 'tabular-nums', fontWeight: 'bold' }}>
                                                                        <span style={{
                                                                            padding: '2px 8px',
                                                                            borderRadius: '100px',
                                                                            fontSize: '0.68rem',
                                                                            backgroundColor: diff > 0 ? '#FEE2E2' : (diff < 0 ? '#DCFCE7' : '#F1F5F9'),
                                                                            color: diff > 0 ? '#991B1B' : (diff < 0 ? '#166534' : '#64748B'),
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            gap: '3px'
                                                                        }}>
                                                                            {diff > 0 ? (
                                                                                <>
                                                                                    <TrendingUp size={11} strokeWidth={2.5} /> Sube +${formatNumber(diff)}
                                                                                </>
                                                                            ) : (diff < 0 ? (
                                                                                <>
                                                                                    <TrendingDown size={11} strokeWidth={2.5} /> Baja -${formatNumber(Math.abs(diff))}
                                                                                </>
                                                                            ) : 'Sin cambio')}
                                                                        </span>
                                                                    </td>
                                                                    <td style={{ padding: '6px 10px' }}>
                                                                        <input
                                                                            type="text"
                                                                            value={currentJust}
                                                                            onChange={(e) => {
                                                                                const val = e.target.value;
                                                                                setItemJustifications(prev => ({ ...prev, [item.id]: val }));
                                                                            }}
                                                                            placeholder="Ej. Clima / lluvias, oferta limitada..."
                                                                            style={{
                                                                                width: '100%',
                                                                                padding: '4px 8px',
                                                                                fontSize: '0.74rem',
                                                                                borderRadius: '6px',
                                                                                border: '1px solid #CBD5E1',
                                                                                backgroundColor: 'white',
                                                                                color: '#334155'
                                                                            }}
                                                                        />
                                                                    </td>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <td style={{ padding: '8px 10px', textAlign: 'center', color: '#64748B' }}>
                                                                        {item.products?.unit_of_measure || 'Kg'}
                                                                    </td>
                                                                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: '#0D7A57', fontVariantNumeric: 'tabular-nums' }}>
                                                                        ${formatNumber(item.unit_price)} COP
                                                                    </td>
                                                                </>
                                                            )}
                                                        </tr>
                                                    );
                                                });
                                            })()}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* 4. Checkbox de Autorización Explícita */}
                            <div style={{
                                backgroundColor: '#F0FDF4',
                                border: '1.5px solid #86EFAC',
                                borderRadius: '12px',
                                padding: '0.85rem 1rem',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '10px'
                            }}>
                                <input
                                    type="checkbox"
                                    id="auth-agreement-dispatch"
                                    checked={isAuthorizedChecked}
                                    onChange={(e) => setIsAuthorizedChecked(e.target.checked)}
                                    style={{ width: '18px', height: '18px', accentColor: '#16A34A', marginTop: '2px', cursor: 'pointer' }}
                                />
                                <label htmlFor="auth-agreement-dispatch" style={{ fontSize: '0.78rem', color: '#14532D', cursor: 'pointer' }}>
                                    <strong style={{ display: 'block', fontSize: '0.82rem', color: '#064E3B' }}>
                                        Autorizo el despacho formal de esta notificación por correo electrónico.
                                    </strong>
                                    He validado que las tarifas y vigencias reflejan fielmente las condiciones comerciales pactadas con el cliente.
                                </label>
                            </div>

                        </div>

                        {/* Footer Actions */}
                        <div style={{
                            padding: '1rem 1.5rem',
                            backgroundColor: 'white',
                            borderTop: '1px solid #E2E8F0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <button
                                type="button"
                                onClick={() => setIsEmailModalOpen(false)}
                                style={{
                                    padding: '0.55rem 1rem',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1',
                                    backgroundColor: '#F8FAFC',
                                    color: '#475569',
                                    fontSize: '0.78rem',
                                    fontWeight: 'bold',
                                    cursor: 'pointer'
                                }}
                            >
                                Guardar Sin Notificar
                            </button>

                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    type="button"
                                    onClick={() => setIsEmailModalOpen(false)}
                                    style={{
                                        padding: '0.55rem 1rem',
                                        borderRadius: '8px',
                                        border: 'none',
                                        backgroundColor: 'transparent',
                                        color: '#64748B',
                                        fontSize: '0.78rem',
                                        fontWeight: 'bold',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    disabled={!isAuthorizedChecked || isSendingEmail}
                                    onClick={handleDispatchAgreementEmail}
                                    style={{
                                        padding: '0.55rem 1.3rem',
                                        borderRadius: '8px',
                                        border: 'none',
                                        backgroundColor: (!isAuthorizedChecked || isSendingEmail) ? '#94A3B8' : '#16A34A',
                                        color: 'white',
                                        fontSize: '0.82rem',
                                        fontWeight: 800,
                                        cursor: (!isAuthorizedChecked || isSendingEmail) ? 'not-allowed' : 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        boxShadow: '0 2px 4px rgba(22, 163, 74, 0.25)'
                                    }}
                                >
                                    {isSendingEmail ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                                    Aprobar y Despachar Notificación
                                </button>
                            </div>
                        </div>

                    </div>
                </div>
            )}

            {/* MODAL VISTA IMPRIMIBLE / DOCUMENTO OFICIAL DE LISTA DE PRECIOS • PROPUESTA COMERCIAL */}
            {isPrintModalOpen && selectedAgreement && (
                <div style={{ 
                    position: 'fixed', 
                    inset: 0, 
                    backgroundColor: 'rgba(0,0,0,0.65)', 
                    zIndex: 2500, 
                    display: 'flex', 
                    justifyContent: 'center', 
                    alignItems: 'center', 
                    padding: '1.5rem', 
                    overflowY: 'auto' 
                }}>
                    <div style={{ 
                        backgroundColor: 'white', 
                        borderRadius: '16px', 
                        width: '100%', 
                        maxWidth: '960px', 
                        maxHeight: '94vh', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)', 
                        overflow: 'hidden' 
                    }}>
                        {/* Barra Superior de Control (No Imprimible) */}
                        <div className="no-print" style={{ 
                            padding: '1rem 1.5rem', 
                            borderBottom: '1px solid #E2E8F0', 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center', 
                            backgroundColor: '#0F172A',
                            color: 'white'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Printer size={18} color="#10B981" />
                                <div>
                                    <span style={{ fontWeight: '800', fontSize: '0.95rem', color: '#FFFFFF', display: 'block' }}>
                                        Documento Oficial de Propuesta Comercial & Lista de Precios
                                    </span>
                                    <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
                                        Estándar Hoja Membreteada Oficial • Ordenado por Categoría (A-Z)
                                    </span>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <button
                                    type="button"
                                    onClick={handleExportAgreementExcel}
                                    style={{
                                        padding: '0.55rem 1.15rem',
                                        backgroundColor: '#1E293B',
                                        color: '#FFFFFF',
                                        border: '1px solid #334155',
                                        borderRadius: '8px',
                                        fontWeight: '800',
                                        fontSize: '0.82rem',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                        transition: 'all 0.2s'
                                    }}
                                    title="Descargar matriz de precios organizada por categoría en formato Excel (.xlsx)"
                                >
                                    <FileSpreadsheet size={15} color="#34D399" /> Descargar Excel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (printAgreementDocRef.current && selectedAgreement) {
                                            const refCode = formatAgreementNumber(selectedAgreement.quote_number, selectedAgreement.created_at);
                                            printViaNewWindow({
                                                element: printAgreementDocRef.current,
                                                title: `Propuesta_Precios_${refCode}_${(selectedAgreement.profiles?.company_name || selectedAgreement.client_name || '').replace(/[^a-zA-Z0-9_-]/g, '_')}`,
                                                paperSize: 'letter',
                                                orientation: 'portrait',
                                                margin: '1.0cm 1.2cm'
                                            });
                                        }
                                    }}
                                    style={{
                                        padding: '0.55rem 1.2rem',
                                        backgroundColor: '#10B981',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '8px',
                                        fontWeight: '800',
                                        fontSize: '0.82rem',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        boxShadow: '0 2px 4px rgba(16, 185, 129, 0.3)'
                                    }}
                                >
                                    <Printer size={15} /> Imprimir / Guardar PDF
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsPrintModalOpen(false)}
                                    style={{
                                        padding: '0.55rem 1rem',
                                        backgroundColor: 'rgba(255,255,255,0.1)',
                                        color: '#E2E8F0',
                                        border: '1px solid rgba(255,255,255,0.2)',
                                        borderRadius: '8px',
                                        fontWeight: '600',
                                        fontSize: '0.82rem',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                >
                                    <X size={15} /> Cerrar
                                </button>
                            </div>
                        </div>

                        {/* Área Imprimible del Documento */}
                        <div style={{ 
                            flex: 1, 
                            overflowY: 'auto', 
                            padding: '2rem', 
                            backgroundColor: '#F8FAFC' 
                        }}>
                            <div ref={printAgreementDocRef} style={{ backgroundColor: '#FFFFFF', padding: '0.5rem', borderRadius: '8px' }}>
                                {(() => {
                                    // 1. Agrupar productos por categoría
                                    const groups: Record<string, { categoryName: string; items: AgreementItem[] }> = {};
                                    (agreementItems || []).forEach(item => {
                                        const rawCat = item.products?.category || '';
                                        const catName = CATEGORY_MAP[rawCat] || rawCat || 'Portafolio General';
                                        if (!groups[catName]) {
                                            groups[catName] = { categoryName: catName, items: [] };
                                        }
                                        groups[catName].items.push(item);
                                    });

                                    // 2. Ordenar categorías alfabéticamente (A-Z)
                                    const sortedCategories = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

                                    const formattedDate = selectedAgreement.created_at
                                        ? new Date(selectedAgreement.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })
                                        : new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });

                                    const refNumber = formatAgreementNumber(selectedAgreement.quote_number, selectedAgreement.created_at);

                                    const validFromStr = selectedAgreement.start_date
                                        ? new Date(selectedAgreement.start_date.includes('T') ? selectedAgreement.start_date : selectedAgreement.start_date + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
                                        : 'Inmediata';

                                    const validUntilStr = selectedAgreement.valid_until
                                        ? new Date(selectedAgreement.valid_until.includes('T') ? selectedAgreement.valid_until : selectedAgreement.valid_until + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
                                        : 'Indefinida (Sujeta a Renovación)';

                                    return (
                                        <Letterhead
                                            title="PROPUESTA COMERCIAL DE PRECIOS"
                                            subtitle={selectedAgreement.model_snapshot_name || 'Convenio Institucional B2B • FruFresco'}
                                            date={formattedDate}
                                            reference={refNumber}
                                            badge="ACUERDO VIGENTE"
                                            badgeVariant="emerald"
                                            showWatermark={false}
                                        >
                                            {/* 1. FICHA CONTRACTUAL DEL CLIENTE & VIGENCIA */}
                                            <div style={{
                                                display: 'grid',
                                                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                                                gap: '0.85rem',
                                                backgroundColor: '#F8FAFC',
                                                padding: '0.9rem 1.15rem',
                                                borderRadius: '10px',
                                                border: '1px solid #E2E8F0',
                                                marginBottom: '1.25rem'
                                            }}>
                                                <div>
                                                    <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '5px', letterSpacing: '0.04em' }}>
                                                        <Building2 size={12} color="#0D7A57" /> Cliente Institucional
                                                    </span>
                                                    <div style={{ fontSize: '0.90rem', fontWeight: '800', color: '#0F172A', marginTop: '3px', letterSpacing: '-0.01em' }}>
                                                        {selectedAgreement.profiles?.company_name || selectedAgreement.client_name || 'Cliente Registrado'}
                                                    </div>
                                                    {selectedAgreement.profiles?.nit && (
                                                        <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: '600', marginTop: '2px' }}>
                                                            NIT: <span style={{ color: '#0F172A', fontFamily: 'monospace' }}>{selectedAgreement.profiles.nit}</span>
                                                        </div>
                                                    )}
                                                    {selectedAgreement.profiles?.address && (
                                                        <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '1px' }}>
                                                            Sede: {selectedAgreement.profiles.address}
                                                        </div>
                                                    )}
                                                </div>

                                                <div>
                                                    <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '5px', letterSpacing: '0.04em' }}>
                                                        <Calendar size={12} color="#0D7A57" /> Vigencia Pactada
                                                    </span>
                                                    <div style={{ fontSize: '0.84rem', fontWeight: '800', color: '#0F172A', marginTop: '3px' }}>
                                                        {validFromStr} al {validUntilStr}
                                                    </div>
                                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#047857', fontWeight: '700', fontSize: '0.68rem', marginTop: '2px' }}>
                                                        <ShieldCheck size={12} color="#10B981" /> Tarifa Institucional Garantizada
                                                    </div>
                                                </div>

                                                <div>
                                                    <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '5px', letterSpacing: '0.04em' }}>
                                                        <FileText size={12} color="#0D7A57" /> Portafolio Formalizado
                                                    </span>
                                                    <div style={{ fontSize: '0.84rem', fontWeight: '800', color: '#0D7A57', marginTop: '3px' }}>
                                                        {agreementItems.length} Productos Negociados
                                                    </div>
                                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#64748B', fontWeight: '600', fontSize: '0.68rem', marginTop: '2px' }}>
                                                        <CheckCircle2 size={12} color="#0D7A57" /> {sortedCategories.length} Categorías (A-Z)
                                                    </div>
                                                </div>
                                            </div>

                                            {/* 2. TABLAS POR CATEGORÍA EN ORDEN ALFABÉTICO (A-Z) Y PRODUCTOS (A-Z) */}
                                            {sortedCategories.map((catName, groupIdx) => {
                                                const catItems = [...groups[catName].items].sort((a, b) => 
                                                    (a.product_name || '').localeCompare(b.product_name || '', 'es', { sensitivity: 'base' })
                                                );

                                                return (
                                                    <div key={catName || groupIdx} style={{ marginBottom: '1.25rem', pageBreakInside: 'avoid' }}>
                                                        {/* Category Header Ribbon (Skin 1 Precision Slate & Emerald accent) */}
                                                        <div style={{
                                                            backgroundColor: '#F8FAFC',
                                                            border: '1px solid #E2E8F0',
                                                            borderLeft: '4px solid #0D7A57',
                                                            padding: '6px 12px',
                                                            borderRadius: '6px 6px 0 0',
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center'
                                                        }}>
                                                            <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                <Layers size={13} color="#0D7A57" />
                                                                <span>CATEGORÍA: {catName.toUpperCase()}</span>
                                                            </span>
                                                            <span style={{ 
                                                                fontSize: '0.60rem', 
                                                                backgroundColor: '#ECFDF5', 
                                                                color: '#065F46', 
                                                                border: '1px solid #A7F3D0', 
                                                                padding: '2px 8px', 
                                                                borderRadius: '100px', 
                                                                fontWeight: '800', 
                                                                letterSpacing: '0.04em',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '4px'
                                                            }}>
                                                                <Tag size={10} color="#059669" /> {catItems.length} {catItems.length === 1 ? 'ÍTEM' : 'ÍTEMS'} • A-Z
                                                            </span>
                                                        </div>

                                                        <table style={{
                                                            width: '100%',
                                                            borderCollapse: 'collapse',
                                                            border: '1px solid #E2E8F0',
                                                            borderTop: 'none',
                                                            borderRadius: '0 0 6px 6px',
                                                            overflow: 'hidden',
                                                            fontSize: '0.70rem'
                                                        }}>
                                                            <thead>
                                                                <tr style={{ backgroundColor: '#FFFFFF', borderBottom: '1.5px solid #CBD5E1', color: '#475569', fontSize: '0.62rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                                    <th style={{ padding: '4px 6px', textAlign: 'center', width: '9%' }}>Cód.</th>
                                                                    <th style={{ padding: '4px 8px', textAlign: 'left', width: '47%' }}>Producto / Insumo</th>
                                                                    <th style={{ padding: '4px 6px', textAlign: 'center', width: '14%' }}>Presentación</th>
                                                                    <th style={{ padding: '4px 8px', textAlign: 'right', width: '20%' }}>Precio Pactado (COP)</th>
                                                                    <th style={{ padding: '4px 6px', textAlign: 'center', width: '10%' }}>IVA</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {catItems.map((it, idx) => {
                                                                    const rowBg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
                                                                    const pCode = it.products?.accounting_id || '---';
                                                                    const pUnit = it.products?.unit_of_measure || 'Kg';
                                                                    const pPrice = `$${formatNumber(it.unit_price)}`;
                                                                    const pIva = `${it.iva_rate || 0}%`;

                                                                    return (
                                                                        <tr key={it.id || idx} style={{ backgroundColor: rowBg, borderBottom: '1px solid #F1F5F9' }}>
                                                                            <td style={{ padding: '4px 6px', textAlign: 'center', fontWeight: '700', color: '#64748B', fontFamily: 'monospace', fontSize: '0.66rem' }}>
                                                                                {pCode}
                                                                            </td>
                                                                            <td style={{ padding: '4px 8px', textAlign: 'left', fontWeight: '700', color: '#0F172A' }}>
                                                                                {it.product_name}
                                                                            </td>
                                                                            <td style={{ padding: '4px 6px', textAlign: 'center', color: '#475569', fontWeight: '600' }}>
                                                                                {pUnit}
                                                                            </td>
                                                                            <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: '800', color: '#0D7A57', fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }}>
                                                                                {pPrice}
                                                                            </td>
                                                                            <td style={{ padding: '4px 6px', textAlign: 'center', color: '#64748B', fontSize: '0.66rem' }}>
                                                                                {pIva}
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                );
                                            })}

                                            {/* 3. CONDICIONES COMERCIALES DE SERVICIO */}
                                            <div style={{
                                                backgroundColor: '#F8FAFC',
                                                padding: '0.85rem 1rem',
                                                borderRadius: '8px',
                                                border: '1px solid #E2E8F0',
                                                fontSize: '0.68rem',
                                                color: '#64748B',
                                                lineHeight: '1.45',
                                                marginTop: '1rem',
                                                pageBreakInside: 'avoid'
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontWeight: '800', color: '#0F172A', marginBottom: '4px', textTransform: 'uppercase', fontSize: '0.68rem', letterSpacing: '0.04em' }}>
                                                    <Info size={12} color="#0D7A57" /> Condiciones Comerciales & Compromiso de Suministro
                                                </div>
                                                <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                                                    <li>Los precios pactados en la presente propuesta aplican a todas las órdenes generadas dentro del Portal B2B FruFresco.</li>
                                                    <li>Horario de corte oficial: pedidos radicados antes de las 5:00 PM aplican para entrega garantizada al día siguiente en franja matutina.</li>
                                                    <li>Inspección de calidad rigurosa en plataforma agro-logística bajo protocolos de inocuidad, frescura y calibración de báscula digital.</li>
                                                </ul>
                                            </div>

                                            {/* 4. CASILLAS FORMALES DE FIRMA */}
                                            <div style={{
                                                marginTop: '2.5rem',
                                                paddingTop: '1.25rem',
                                                borderTop: '1px solid #CBD5E1',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                gap: '2.5rem',
                                                pageBreakInside: 'avoid'
                                            }}>
                                                <div style={{ flex: 1, textAlign: 'center' }}>
                                                    <div style={{ height: '35px', borderBottom: '1px dashed #94A3B8', marginBottom: '6px' }}></div>
                                                    <div style={{ fontSize: '0.78rem', fontWeight: '800', color: '#0F172A' }}>Investments Cortés S.A.S.</div>
                                                    <div style={{ fontSize: '0.68rem', color: '#64748B' }}>Dirección Comercial & Operaciones FruFresco</div>
                                                </div>

                                                <div style={{ flex: 1, textAlign: 'center' }}>
                                                    <div style={{ height: '35px', borderBottom: '1px dashed #94A3B8', marginBottom: '6px' }}></div>
                                                    <div style={{ fontSize: '0.78rem', fontWeight: '800', color: '#0F172A' }}>
                                                        {selectedAgreement.profiles?.company_name || selectedAgreement.client_name || 'Cliente Institucional'}
                                                    </div>
                                                    <div style={{ fontSize: '0.68rem', color: '#64748B' }}>Aceptación de Propuesta / Representación de Compras</div>
                                                </div>
                                            </div>
                                        </Letterhead>
                                    );
                                })()}
                            </div>
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

            {/* CREATE AGREEMENT MODAL - WIDE 3-STEP SEQUENTIAL WIZARD */}
            {isCreateModalOpen && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)', padding: '1rem' }}>
                    <form 
                        onSubmit={handleCreateAgreementSubmit}
                        style={{ 
                            backgroundColor: 'white', 
                            borderRadius: THEME.radius.lg, 
                            width: '96vw', 
                            maxWidth: '1600px', 
                            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)', 
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                            height: '92vh',
                            maxHeight: '94vh'
                        }}
                    >
                        {/* Modal Header */}
                        <div style={{ padding: '1.25rem 2rem', borderBottom: `1px solid ${THEME.colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAF9' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: THEME.colors.primaryLight, display: 'flex', alignItems: 'center', justifyContent: 'center', color: THEME.colors.primary }}>
                                    <FileText size={20} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontWeight: '900', color: THEME.colors.textMain, fontSize: '1.15rem' }}>Crear Acuerdo Comercial Institucional</h3>
                                    <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: THEME.colors.textSecondary }}>Parametrización secuencial con validación de catálogo y márgenes en tiempo real</p>
                                </div>
                            </div>
                            <button 
                                type="button" 
                                onClick={() => {
                                    setIsCreateModalOpen(false);
                                    setSelectedClientId('');
                                    setIsMultiClientMode(false);
                                    setSelectedClientIds([]);
                                    setAgreementName('');
                                    setIsNameManuallyEdited(false);
                                    setParsedFile(null);
                                    setUploadedItems([]);
                                    setExcelPreviewData(null);
                                    setCreateStep(1);
                                }} 
                                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#64748B' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Stepper Navigation Bar */}
                        <div style={{ display: 'flex', borderBottom: `1px solid ${THEME.colors.border}`, backgroundColor: '#FFFFFF' }}>
                            {[
                                { step: 1, label: '1. Cliente Institucional', desc: 'Selección y verificación' },
                                { step: 2, label: '2. Vigencia & Nomenclatura', desc: 'Plazo y nombre del acuerdo' },
                                { step: 3, label: '3. Carga de Precios', desc: 'Excel y pre-validación' }
                            ].map(s => {
                                const isActive = createStep === s.step;
                                const isPassed = createStep > s.step;
                                const hasClientSelection = isMultiClientMode ? selectedClientIds.length > 0 : !!selectedClientId;
                                const canClick = s.step < createStep || (s.step === 2 && hasClientSelection) || (s.step === 3 && hasClientSelection);

                                return (
                                    <div 
                                        key={s.step}
                                        onClick={() => {
                                            if (canClick) {
                                                if (s.step === 2 && (!isNameManuallyEdited || !agreementName)) {
                                                    const c = b2bClients.find(cl => cl.id === selectedClientId);
                                                    setAgreementName(computeDefaultAgreementName(c, isMultiClientMode, startDate));
                                                }
                                                setCreateStep(s.step as 1 | 2 | 3);
                                            }
                                        }}
                                        style={{
                                            flex: 1,
                                            padding: '0.9rem 1.25rem',
                                            alignItems: 'center',
                                            gap: '12px',
                                            borderBottom: isActive ? `3px solid ${THEME.colors.primary}` : '3px solid transparent',
                                            backgroundColor: isActive ? '#F0FDF4' : 'transparent',
                                            cursor: canClick ? 'pointer' : 'not-allowed',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        <div style={{
                                            width: '28px',
                                            height: '28px',
                                            borderRadius: '50%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '0.8rem',
                                            fontWeight: 'bold',
                                            backgroundColor: isPassed ? THEME.colors.primary : isActive ? THEME.colors.primary : '#E2E8F0',
                                            color: (isPassed || isActive) ? 'white' : '#64748B'
                                        }}>
                                            {isPassed ? <Check size={14} strokeWidth={3} /> : s.step}
                                        </div>
                                        <div style={{ textAlign: 'left' }}>
                                            <div style={{ fontSize: '0.82rem', fontWeight: isActive ? '700' : '600', color: isActive ? THEME.colors.primary : THEME.colors.textMain }}>
                                                {s.label}
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary }}>
                                                {s.desc}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Modal Body */}
                        <div style={{ padding: '0 2rem 1.75rem 2rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', flex: 1 }}>
                            
                            {/* ================= STEP 1: CLIENT SELECTION (CASAS MATRICES ONLY) ================= */}
                            {createStep === 1 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingTop: '1.5rem' }}>
                                    <div style={{ backgroundColor: '#F8FAFC', padding: '1rem 1.25rem', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                                        <h4 style={{ margin: '0 0 4px', fontSize: '0.95rem', color: THEME.colors.textMain, fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Building2 size={18} color="#0D7A57" /> Paso 1: Selección de Cliente(s) Institucional(es)
                                        </h4>
                                        <p style={{ margin: 0, fontSize: '0.8rem', color: THEME.colors.textSecondary, lineHeight: '1.4' }}>
                                            Los acuerdos comerciales se definen a nivel de <strong>Casa Matriz</strong> y aplican automáticamente a todas sus sucursales vinculadas.
                                        </p>
                                    </div>

                                    {/* MODE TOGGLE: INDIVIDUAL VS MASIVO */}
                                    <div style={{ display: 'flex', gap: '8px', padding: '4px', backgroundColor: '#F1F5F9', borderRadius: '10px' }}>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsMultiClientMode(false);
                                                if (!isNameManuallyEdited) {
                                                    const c = b2bClients.find(cl => cl.id === selectedClientId);
                                                    setAgreementName(computeDefaultAgreementName(c, false, startDate));
                                                }
                                            }}
                                            style={{
                                                flex: 1,
                                                padding: '9px 14px',
                                                borderRadius: '8px',
                                                border: 'none',
                                                fontSize: '0.82rem',
                                                fontWeight: 'bold',
                                                cursor: 'pointer',
                                                backgroundColor: !isMultiClientMode ? '#FFFFFF' : 'transparent',
                                                color: !isMultiClientMode ? THEME.colors.primary : '#64748B',
                                                boxShadow: !isMultiClientMode ? '0 2px 4px rgba(0,0,0,0.06)' : 'none',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '6px',
                                                transition: 'all 0.15s'
                                            }}
                                        >
                                            <Building2 size={16} /> Cliente Individual
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsMultiClientMode(true);
                                                if (!isNameManuallyEdited) {
                                                    setAgreementName(computeDefaultAgreementName(undefined, true, startDate));
                                                }
                                            }}
                                            style={{
                                                flex: 1,
                                                padding: '9px 14px',
                                                borderRadius: '8px',
                                                border: 'none',
                                                fontSize: '0.82rem',
                                                fontWeight: 'bold',
                                                cursor: 'pointer',
                                                backgroundColor: isMultiClientMode ? '#FFFFFF' : 'transparent',
                                                color: isMultiClientMode ? THEME.colors.primary : '#64748B',
                                                boxShadow: isMultiClientMode ? '0 2px 4px rgba(0,0,0,0.06)' : 'none',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '6px',
                                                transition: 'all 0.15s'
                                            }}
                                        >
                                            <Users size={16} /> Lista Maestra Compartida (Efecto Cascada)
                                        </button>
                                    </div>

                                    {/* --- MODO MASIVO: CHECKBOXES --- */}
                                    {isMultiClientMode ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            <div style={{ 
                                                backgroundColor: '#F0FDF4', 
                                                border: '1.5px solid #86EFAC', 
                                                borderRadius: '10px', 
                                                padding: '0.85rem 1rem', 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                gap: '10px' 
                                            }}>
                                                <Sparkles size={20} color="#16A34A" style={{ flexShrink: 0 }} />
                                                <div style={{ fontSize: '0.8rem', color: '#166534', lineHeight: '1.4' }}>
                                                    <strong>Modelo de Fuente Única (Efecto Cascada):</strong> Se creará <strong>1 sola lista maestra</strong> central. Cualquier actualización posterior de precios se reflejará instantáneamente en todas las Casas Matrices y sucursales vinculadas, eliminando reprocesos e inconsistencias.
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: THEME.colors.textSecondary, textTransform: 'uppercase' }}>
                                                    Casas Matrices y Clientes Vinculados a esta Lista Maestra:
                                                </label>
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const allIds = filteredB2bClients.map(c => c.id);
                                                            setSelectedClientIds(allIds);
                                                        }}
                                                        style={{ background: 'none', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '3px 8px', fontSize: '0.72rem', fontWeight: 'bold', color: THEME.colors.primary, cursor: 'pointer' }}
                                                    >
                                                        Seleccionar Todas ({filteredB2bClients.length})
                                                    </button>
                                                    {selectedClientIds.length > 0 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setSelectedClientIds([])}
                                                            style={{ background: 'none', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '3px 8px', fontSize: '0.72rem', fontWeight: 'bold', color: '#64748B', cursor: 'pointer' }}
                                                        >
                                                            Deseleccionar
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Buscador Rápido */}
                                            <div style={{ position: 'relative' }}>
                                                <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                                                <input 
                                                    type="text"
                                                    placeholder="Filtrar Casas Matrices por nombre o NIT..."
                                                    value={clientSearchQuery}
                                                    onChange={(e) => setClientSearchQuery(e.target.value)}
                                                    style={{
                                                        width: '100%',
                                                        padding: '10px 38px 10px 42px',
                                                        borderRadius: '10px',
                                                        border: `1.5px solid #CBD5E1`,
                                                        fontSize: '0.85rem',
                                                        fontWeight: '600',
                                                        outline: 'none'
                                                    }}
                                                />
                                            </div>

                                            {/* Lista de Clientes con Checkbox */}
                                            <div style={{
                                                maxHeight: '260px',
                                                overflowY: 'auto',
                                                border: '1.5px solid #E2E8F0',
                                                borderRadius: '10px',
                                                backgroundColor: '#FFFFFF',
                                                display: 'flex',
                                                flexDirection: 'column'
                                            }}>
                                                {filteredB2bClients.length === 0 ? (
                                                    <div style={{ padding: '2rem', textAlign: 'center', color: '#64748B', fontSize: '0.85rem' }}>
                                                        No se encontraron Casas Matrices con "{clientSearchQuery}"
                                                    </div>
                                                ) : (
                                                    filteredB2bClients.map(c => {
                                                        const isChecked = selectedClientIds.includes(c.id);
                                                        return (
                                                            <div
                                                                key={c.id}
                                                                onClick={() => {
                                                                    setSelectedClientIds(prev => 
                                                                        prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id]
                                                                    );
                                                                }}
                                                                style={{
                                                                    padding: '10px 14px',
                                                                    borderBottom: '1px solid #F1F5F9',
                                                                    cursor: 'pointer',
                                                                    display: 'flex',
                                                                    justifyContent: 'space-between',
                                                                    alignItems: 'center',
                                                                    backgroundColor: isChecked ? '#F0FDF4' : 'transparent',
                                                                    transition: 'background 0.15s'
                                                                }}
                                                            >
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                    {isChecked ? (
                                                                        <CheckSquare size={18} color="#0D7A57" strokeWidth={2.5} />
                                                                    ) : (
                                                                        <Square size={18} color="#94A3B8" />
                                                                    )}
                                                                    <div>
                                                                        <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#1E293B' }}>
                                                                            {c.company_name}
                                                                        </div>
                                                                        <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                                                                            {c.nit && <span>NIT: {c.nit} </span>}
                                                                            {c.branchCount > 0 && <span>• {c.branchCount} {c.branchCount === 1 ? 'sucursal' : 'sucursales'}</span>}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                {isChecked && (
                                                                    <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: '12px', backgroundColor: '#DCFCE7', color: '#15803D', fontWeight: 'bold' }}>
                                                                        Seleccionada
                                                                    </span>
                                                                )}
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>

                                            {/* Badge Resumen de Selección */}
                                            <div style={{ 
                                                padding: '8px 14px', 
                                                borderRadius: '8px', 
                                                backgroundColor: selectedClientIds.length > 0 ? '#F0FDF4' : '#FFFBEB', 
                                                border: `1px solid ${selectedClientIds.length > 0 ? '#BBF7D0' : '#FDE68A'}`,
                                                fontSize: '0.78rem',
                                                fontWeight: '600',
                                                color: selectedClientIds.length > 0 ? '#15803D' : '#92400E',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between'
                                            }}>
                                                <span>
                                                    {selectedClientIds.length > 0 
                                                        ? `✓ ${selectedClientIds.length} Casas Matrices seleccionadas para la lista Institucional General` 
                                                        : 'Selecciona al menos una Casa Matriz para continuar'}
                                                </span>
                                                {selectedClientIds.length > 0 && (
                                                    <span style={{ fontSize: '0.72rem', color: '#0D7A57', fontWeight: 'bold' }}>
                                                        Aplica a {selectedClientIds.reduce((sum, id) => {
                                                            const c = b2bClients.find(cl => cl.id === id);
                                                            return sum + (c?.branchCount || 0);
                                                        }, 0)} sucursales derivadas
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        /* --- MODO INDIVIDUAL --- */
                                        !selectedClientId ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: THEME.colors.textSecondary, textTransform: 'uppercase' }}>
                                                        Buscar Casa Matriz o Sucursal Específica:
                                                    </label>
                                                    {/* Filter Pills */}
                                                    <div style={{ display: 'flex', gap: '6px' }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => setClientTypeFilter('all')}
                                                            style={{
                                                                padding: '3px 10px',
                                                                borderRadius: '14px',
                                                                fontSize: '0.72rem',
                                                                fontWeight: 'bold',
                                                                border: clientTypeFilter === 'all' ? '1.5px solid #0D7A57' : '1px solid #CBD5E1',
                                                                backgroundColor: clientTypeFilter === 'all' ? '#EAEFEA' : '#FFFFFF',
                                                                color: clientTypeFilter === 'all' ? '#0D7A57' : '#64748B',
                                                                cursor: 'pointer',
                                                                transition: 'all 0.15s'
                                                            }}
                                                        >
                                                            Todos ({b2bClients.length})
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setClientTypeFilter('matriz')}
                                                            style={{
                                                                padding: '3px 10px',
                                                                borderRadius: '14px',
                                                                fontSize: '0.72rem',
                                                                fontWeight: 'bold',
                                                                border: clientTypeFilter === 'matriz' ? '1.5px solid #6D28D9' : '1px solid #CBD5E1',
                                                                backgroundColor: clientTypeFilter === 'matriz' ? '#F5F3FF' : '#FFFFFF',
                                                                color: clientTypeFilter === 'matriz' ? '#6D28D9' : '#64748B',
                                                                cursor: 'pointer',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '4px',
                                                                transition: 'all 0.15s'
                                                            }}
                                                        >
                                                            <Building2 size={12} /> Casas Matrices ({b2bClients.filter(c => !c.parent_id).length})
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setClientTypeFilter('sucursal')}
                                                            style={{
                                                                padding: '3px 10px',
                                                                borderRadius: '14px',
                                                                fontSize: '0.72rem',
                                                                fontWeight: 'bold',
                                                                border: clientTypeFilter === 'sucursal' ? '1.5px solid #0284C7' : '1px solid #CBD5E1',
                                                                backgroundColor: clientTypeFilter === 'sucursal' ? '#E0F2FE' : '#FFFFFF',
                                                                color: clientTypeFilter === 'sucursal' ? '#0284C7' : '#64748B',
                                                                cursor: 'pointer',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '4px',
                                                                transition: 'all 0.15s'
                                                            }}
                                                        >
                                                            <MapPin size={12} /> Sucursales ({b2bClients.filter(c => Boolean(c.parent_id)).length})
                                                        </button>
                                                    </div>
                                                </div>
                                                
                                                <div style={{ position: 'relative' }}>
                                                    <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                                                    <input 
                                                        type="text"
                                                        autoFocus
                                                        placeholder="Escribe para buscar... ej: Restaurantes Wok, Wok Familia, Lao Kao, ECCI, Aldimark..."
                                                        value={clientSearchQuery}
                                                        onChange={(e) => setClientSearchQuery(e.target.value)}
                                                        style={{
                                                            width: '100%',
                                                            padding: '12px 38px 12px 42px',
                                                            borderRadius: '10px',
                                                            border: `1.5px solid ${clientSearchQuery ? THEME.colors.primary : '#CBD5E1'}`,
                                                            fontSize: '0.9rem',
                                                            fontWeight: '600',
                                                            color: THEME.colors.textMain,
                                                            outline: 'none',
                                                            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                                                        }}
                                                    />
                                                    {clientSearchQuery && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setClientSearchQuery('')}
                                                            style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: '4px' }}
                                                        >
                                                            <X size={16} />
                                                        </button>
                                                    )}
                                                </div>

                                                {/* Live List of Clients & Branches */}
                                                <div style={{
                                                    maxHeight: '280px',
                                                    overflowY: 'auto',
                                                    border: '1.5px solid #E2E8F0',
                                                    borderRadius: '10px',
                                                    backgroundColor: '#FFFFFF',
                                                    display: 'flex',
                                                    flexDirection: 'column'
                                                }}>
                                                    {filteredB2bClients.length === 0 ? (
                                                        <div style={{ padding: '2.5rem 1.5rem', textAlign: 'center', color: '#64748B' }}>
                                                            <Building2 size={32} style={{ margin: '0 auto 8px auto', color: '#CBD5E1' }} />
                                                            <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#475569' }}>
                                                                No se encontraron clientes ni sucursales con "{clientSearchQuery}"
                                                            </div>
                                                            <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: '4px' }}>
                                                                Intenta cambiar los filtros de tipo o buscar por nombre o NIT.
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        filteredB2bClients.map((c) => {
                                                            const isSucursal = Boolean(c.parent_id);
                                                            return (
                                                                <div
                                                                    key={c.id}
                                                                    onClick={() => {
                                                                        setSelectedClientId(c.id);
                                                                        setClientSearchQuery('');
                                                                        if (!isNameManuallyEdited) {
                                                                            setAgreementName(computeDefaultAgreementName(c, false, startDate));
                                                                        }
                                                                    }}
                                                                    style={{
                                                                        padding: '12px 16px',
                                                                        borderBottom: '1px solid #F1F5F9',
                                                                        cursor: 'pointer',
                                                                        display: 'flex',
                                                                        justifyContent: 'space-between',
                                                                        alignItems: 'center',
                                                                        transition: 'all 0.15s ease'
                                                                    }}
                                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isSucursal ? '#F0F9FF' : '#F0FDF4'}
                                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                                >
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                                        <div style={{ 
                                                                            width: '36px', 
                                                                            height: '36px', 
                                                                            borderRadius: '8px', 
                                                                            backgroundColor: isSucursal ? '#E0F2FE' : '#F5F3FF', 
                                                                            display: 'flex', 
                                                                            alignItems: 'center', 
                                                                            justifyContent: 'center', 
                                                                            color: isSucursal ? '#0284C7' : '#6D28D9', 
                                                                            flexShrink: 0 
                                                                        }}>
                                                                            {isSucursal ? <MapPin size={18} /> : <Building2 size={18} />}
                                                                        </div>
                                                                        <div>
                                                                            <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#1E293B' }}>
                                                                                {c.company_name}
                                                                            </div>
                                                                            <div style={{ fontSize: '0.75rem', color: '#64748B', display: 'flex', gap: '8px', marginTop: '2px', alignItems: 'center', flexWrap: 'wrap' }}>
                                                                                {isSucursal && (
                                                                                    <span style={{ color: '#0369A1', fontWeight: '600' }}>
                                                                                        Sucursal de: <strong>{c.parentName}</strong>
                                                                                    </span>
                                                                                )}
                                                                                {c.nit && <span>NIT: <strong>{c.nit}</strong></span>}
                                                                                {c.contact_name && c.contact_name !== c.company_name && !isSucursal && <span>• Contacto: {c.contact_name}</span>}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                        {isSucursal ? (
                                                                            <span style={{ fontSize: '0.7rem', padding: '3px 9px', borderRadius: '20px', backgroundColor: '#E0F2FE', color: '#0284C7', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px', border: '1px solid #BAE6FD' }}>
                                                                                <MapPin size={12} /> Sucursal Específica
                                                                            </span>
                                                                        ) : (
                                                                            <span style={{ fontSize: '0.7rem', padding: '3px 9px', borderRadius: '20px', backgroundColor: '#F5F3FF', color: '#6D28D9', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px', border: '1px solid #DDD6FE' }}>
                                                                                <Building2 size={12} /> Casa Matriz {c.branchCount > 0 ? `(${c.branchCount} ${c.branchCount === 1 ? 'sucursal' : 'sucursales'})` : ''}
                                                                            </span>
                                                                        )}
                                                                        <ChevronRight size={16} color="#94A3B8" />
                                                                    </div>
                                                                </div>
                                                            );
                                                        })
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            /* Selected Client Card (Matriz or Sucursal) */
                                            (() => {
                                                const selectedClient = b2bClients.find(c => c.id === selectedClientId);
                                                const isSucursal = Boolean(selectedClient?.parent_id);
                                                return (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                                        <div style={{
                                                            backgroundColor: isSucursal ? '#F0F9FF' : '#F0FDF4',
                                                            border: `2px solid ${isSucursal ? '#0284C7' : '#0D7A57'}`,
                                                            borderRadius: '12px',
                                                            padding: '1.25rem 1.5rem',
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center',
                                                            gap: '1rem',
                                                            boxShadow: isSucursal ? '0 4px 12px rgba(2, 132, 199, 0.08)' : '0 4px 12px rgba(13, 122, 87, 0.08)'
                                                        }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                                                <div style={{ 
                                                                    width: '48px', 
                                                                    height: '48px', 
                                                                    borderRadius: '12px', 
                                                                    backgroundColor: isSucursal ? '#BAE6FD' : '#DCFCE7', 
                                                                    display: 'flex', 
                                                                    alignItems: 'center', 
                                                                    justifyContent: 'center', 
                                                                    color: isSucursal ? '#0369A1' : '#0D7A57', 
                                                                    flexShrink: 0 
                                                                }}>
                                                                    {isSucursal ? <MapPin size={24} strokeWidth={2.2} /> : <Building2 size={24} strokeWidth={2.2} />}
                                                                </div>
                                                                <div>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                        <span style={{ 
                                                                            fontSize: '0.7rem', 
                                                                            color: isSucursal ? '#0369A1' : '#15803D', 
                                                                            fontWeight: 'bold', 
                                                                            textTransform: 'uppercase', 
                                                                            letterSpacing: '0.03em', 
                                                                            display: 'inline-flex', 
                                                                            alignItems: 'center', 
                                                                            gap: '4px' 
                                                                        }}>
                                                                            {isSucursal ? (
                                                                                <><MapPin size={13} strokeWidth={2.5} /> SUCURSAL ESPECÍFICA CON PRECIOS DEDICADOS</>
                                                                            ) : (
                                                                                <><Check size={13} strokeWidth={2.5} /> CASA MATRIZ VERIFICADA</>
                                                                            )}
                                                                        </span>
                                                                        {!isSucursal && selectedClient?.branchCount !== undefined && selectedClient.branchCount > 0 && (
                                                                            <span style={{ fontSize: '0.65rem', backgroundColor: '#DCFCE7', color: '#166534', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' }}>
                                                                                {selectedClient.branchCount} {selectedClient.branchCount === 1 ? 'sucursal vinculada' : 'sucursales vinculadas'}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div style={{ fontSize: '1.05rem', fontWeight: '900', color: isSucursal ? '#0C4A6E' : '#064E3B', marginTop: '2px' }}>
                                                                        {selectedClient?.company_name || 'Cliente B2B'}
                                                                    </div>
                                                                    <div style={{ fontSize: '0.8rem', color: isSucursal ? '#0284C7' : '#047857', marginTop: '2px' }}>
                                                                        {isSucursal ? (
                                                                            <span>🏢 Dependiente de Casa Matriz: <strong>{selectedClient.parentName}</strong> {selectedClient?.nit ? `• NIT: ${selectedClient.nit}` : ''}</span>
                                                                        ) : (
                                                                            <span>{selectedClient?.nit ? `NIT: ${selectedClient.nit}` : ''} {selectedClient?.phone ? `• Tel: ${selectedClient.phone}` : ''}</span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setSelectedClientId('');
                                                                    setClientSearchQuery('');
                                                                }}
                                                                style={{
                                                                    padding: '8px 14px',
                                                                    borderRadius: '8px',
                                                                    border: '1.5px solid #CBD5E1',
                                                                    backgroundColor: '#FFFFFF',
                                                                    color: '#475569',
                                                                    fontSize: '0.8rem',
                                                                    fontWeight: 'bold',
                                                                    cursor: 'pointer',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '6px'
                                                                }}
                                                            >
                                                                <RefreshCw size={13} /> Cambiar de Cliente
                                                            </button>
                                                        </div>

                                                        {/* Contextual Notice for Specific Branch Agreement */}
                                                        {isSucursal && (
                                                            <div style={{
                                                                backgroundColor: '#EFF6FF',
                                                                border: '1px solid #BFDBFE',
                                                                borderRadius: '10px',
                                                                padding: '0.9rem 1.25rem',
                                                                display: 'flex',
                                                                gap: '10px',
                                                                alignItems: 'flex-start'
                                                            }}>
                                                                <Info size={18} color="#2563EB" style={{ flexShrink: 0, marginTop: '2px' }} />
                                                                <div style={{ fontSize: '0.82rem', color: '#1E40AF', lineHeight: '1.4' }}>
                                                                    <strong>Acuerdo Exclusivo de Sucursal:</strong> Los productos y precios acordados que cargues en este formulario aplicarán <strong>única y exclusivamente</strong> a los pedidos de <strong>{selectedClient?.company_name}</strong>. Esta tarifa tendrá prioridad y anulará automáticamente cualquier acuerdo general de la Casa Matriz ({selectedClient?.parentName}).
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* ACTIVE AGREEMENT STATUS OR SUCCESS CONFIRMATION */}
                                                        {(() => {
                                                            const activeAgreement = agreements.find(a => 
                                                                a.client_id === selectedClientId && 
                                                                getAgreementStatus(a.valid_until).type !== 'expired'
                                                            );

                                                            if (activeAgreement) {
                                                                const itemsCount = (activeAgreement as any).items?.length || (activeAgreement as any).quote_items?.length || 0;
                                                                const rawStartDate = activeAgreement.start_date || activeAgreement.created_at;
                                                                const startDateFormatted = rawStartDate 
                                                                    ? new Date(rawStartDate.includes('T') ? rawStartDate : rawStartDate + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
                                                                    : 'Inicial';

                                                                const validUntilFormatted = activeAgreement.valid_until 
                                                                    ? new Date(activeAgreement.valid_until.includes('T') ? activeAgreement.valid_until : activeAgreement.valid_until + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
                                                                    : 'Indefinida (Sin fecha límite)';

                                                                return (
                                                                    <div style={{ 
                                                                        backgroundColor: '#FFFBEB', 
                                                                        border: '1.5px solid #FCD34D', 
                                                                        borderRadius: '12px', 
                                                                        padding: '1.25rem', 
                                                                        display: 'flex', 
                                                                        gap: '14px', 
                                                                        alignItems: 'flex-start',
                                                                        boxShadow: '0 2px 8px rgba(217, 119, 6, 0.08)'
                                                                    }}>
                                                                        <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                                            <AlertTriangle size={22} color="#D97706" />
                                                                        </div>
                                                                        <div style={{ flex: 1 }}>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                                                <strong style={{ color: '#92400E', fontSize: '0.95rem' }}>
                                                                                    Advertencia: {isSucursal ? 'Esta Sucursal' : 'Esta Casa Matriz'} ya tiene un Acuerdo Comercial Vigente
                                                                                </strong>
                                                                                <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', backgroundColor: '#FEF3C7', padding: '2px 6px', borderRadius: '4px', color: '#B45309', fontWeight: 'bold', border: '1px solid #FDE68A' }}>
                                                                                    {formatAgreementNumber(activeAgreement.quote_number, activeAgreement.created_at)}
                                                                                </span>
                                                                            </div>
                                                                            <p style={{ margin: '6px 0 0', color: '#78350F', fontSize: '0.82rem', lineHeight: '1.4' }}>
                                                                                Actualmente tiene tarifas congeladas válidas desde el <strong>{startDateFormatted}</strong> hasta el <strong>{validUntilFormatted}</strong> ({itemsCount} productos registrados).
                                                                            </p>
                                                                            <div style={{ marginTop: '8px', padding: '6px 10px', backgroundColor: 'rgba(245, 158, 11, 0.12)', borderRadius: '6px', fontSize: '0.75rem', color: '#92400E', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                                <Info size={14} style={{ flexShrink: 0 }} />
                                                                                <span>Si continúas creando este nuevo acuerdo, el anterior pasará automáticamente a estado <strong>Vencido / Sustituido</strong>.</span>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            } else {
                                                                return (
                                                                    <div style={{ 
                                                                        backgroundColor: isSucursal ? '#F0F9FF' : '#F0FDF4', 
                                                                        border: `1px solid ${isSucursal ? '#BAE6FD' : '#BBF7D0'}`, 
                                                                        borderRadius: '10px', 
                                                                        padding: '0.9rem 1.25rem', 
                                                                        display: 'flex', 
                                                                        gap: '10px', 
                                                                        alignItems: 'center' 
                                                                    }}>
                                                                        <CheckCircle2 size={18} color={isSucursal ? '#0284C7' : '#16A34A'} />
                                                                        <span style={{ fontSize: '0.82rem', color: isSucursal ? '#0369A1' : '#166534', fontWeight: '600' }}>
                                                                            {isSucursal ? 'Sucursal específica' : 'Casa Matriz'} sin acuerdos comerciales vigentes previos. Lista para configurar vigencia y precios.
                                                                        </span>
                                                                    </div>
                                                                );
                                                            }
                                                        })()}
                                                    </div>
                                                );
                                            })()
                                        )
                                    )}
                                </div>
                            )}

                            {/* ================= STEP 2: DATES, DURATION & AGREEMENT NAME ================= */}
                            {createStep === 2 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingTop: '1.5rem' }}>
                                    <div style={{ backgroundColor: '#F8FAFC', padding: '1rem 1.25rem', borderRadius: '10px', border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        {(() => {
                                            const selectedClient = b2bClients.find(c => c.id === selectedClientId);
                                            const isSucursal = Boolean(selectedClient?.parent_id);
                                            return (
                                                <div>
                                                    <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 'bold', textTransform: 'uppercase' }}>
                                                        {isMultiClientMode ? 'Modo de Asignación Masiva:' : isSucursal ? 'Sucursal Seleccionada:' : 'Casa Matriz Seleccionada:'}
                                                    </span>
                                                    <div style={{ fontSize: '1rem', fontWeight: 'bold', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                        {isMultiClientMode ? (
                                                            <>
                                                                <span style={{ color: THEME.colors.primary, display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                                    <Users size={18} /> Acuerdo Institucional General
                                                                </span>
                                                                <span style={{ fontSize: '0.75rem', backgroundColor: '#E0F2FE', color: '#0369A1', padding: '2px 8px', borderRadius: '12px' }}>
                                                                    {selectedClientIds.length} Casas Matrices seleccionadas
                                                                </span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                {isSucursal ? (
                                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#0284C7' }}>
                                                                        <MapPin size={18} /> {selectedClient?.company_name || 'Sucursal B2B'}
                                                                    </span>
                                                                ) : (
                                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                        <Building2 size={18} /> {selectedClient?.company_name || 'Cliente B2B'}
                                                                    </span>
                                                                )}
                                                                {isSucursal && (
                                                                    <span style={{ fontSize: '0.75rem', backgroundColor: '#E0F2FE', color: '#0369A1', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold', border: '1px solid #BAE6FD' }}>
                                                                        Sucursal de {selectedClient?.parentName}
                                                                    </span>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                        <button 
                                            type="button" 
                                            onClick={() => setCreateStep(1)}
                                            style={{ background: 'none', border: '1px solid #CBD5E1', padding: '5px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                        >
                                            <RefreshCw size={12} /> {isMultiClientMode ? 'Modificar Clientes' : 'Cambiar Cliente'}
                                        </button>
                                    </div>

                                    {/* NOMENCLATURA AUTOMÁTICA Y EDITABLE */}
                                    <div style={{ marginTop: '2px' }}>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: THEME.colors.textSecondary, marginBottom: '6px', textTransform: 'uppercase' }}>
                                            {isMultiClientMode ? 'Nombre Maestro de la Lista / Convenio:' : 'Nombre del Acuerdo Comercial (Identificador Oficial):'}
                                        </label>
                                        <div style={{ position: 'relative' }}>
                                            <input 
                                                type="text" 
                                                required
                                                value={agreementName} 
                                                onChange={(e) => {
                                                    setIsNameManuallyEdited(true);
                                                    setAgreementName(e.target.value);
                                                }}
                                                placeholder={computeDefaultAgreementName()}
                                                style={{ 
                                                    width: '100%', 
                                                    padding: '12px 14px', 
                                                    borderRadius: '10px', 
                                                    border: `1.5px solid ${THEME.colors.border}`,
                                                    fontSize: '0.9rem',
                                                    fontWeight: 'bold',
                                                    color: THEME.colors.textMain
                                                }}
                                            />
                                            <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.7rem', color: '#94A3B8', pointerEvents: 'none' }}>
                                                Editable
                                            </span>
                                        </div>
                                        <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: '#64748B' }}>
                                            {isMultiClientMode 
                                                ? 'Identificador único central (Ej. MENSUAL GENERAL - OCTUBRE 2026). Todos los clientes y sucursales seleccionados compartirán esta lista en tiempo real.' 
                                                : 'Nomenclatura sugerida: [Nombre Comercial del Cliente] - DD-MM-AA. Visible en el tablero principal, órdenes y documentos.'}
                                        </p>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '1.5rem', marginTop: '4px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: THEME.colors.textSecondary, marginBottom: '6px', textTransform: 'uppercase' }}>
                                                Fecha de Inicio del Acuerdo:
                                            </label>
                                            <input 
                                                type="date" 
                                                required
                                                value={startDate} 
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setStartDate(val);
                                                    if (!isNameManuallyEdited) {
                                                        const c = b2bClients.find(cl => cl.id === selectedClientId);
                                                        setAgreementName(computeDefaultAgreementName(c, isMultiClientMode, val));
                                                    }
                                                }}
                                                style={{ 
                                                    width: '100%', 
                                                    padding: '12px', 
                                                    borderRadius: '10px', 
                                                    border: `1.5px solid ${THEME.colors.border}`,
                                                    fontSize: '0.9rem',
                                                    fontWeight: 'bold',
                                                    color: THEME.colors.textMain
                                                }}
                                            />
                                            {/* Quick Start Date Presets */}
                                            <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const now = new Date();
                                                        const y = now.getFullYear();
                                                        const m = String(now.getMonth() + 1).padStart(2, '0');
                                                        const dStr = `${y}-${m}-01`;
                                                        setStartDate(dStr);
                                                        if (!isNameManuallyEdited) {
                                                            const c = b2bClients.find(cl => cl.id === selectedClientId);
                                                            setAgreementName(computeDefaultAgreementName(c, isMultiClientMode, dStr));
                                                        }
                                                    }}
                                                    style={{ padding: '3px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: '#F8FAFC', fontSize: '0.72rem', color: '#334155', fontWeight: 'bold', cursor: 'pointer' }}
                                                >
                                                    📅 1 del Mes Actual
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const todayStr = new Date().toISOString().split('T')[0];
                                                        setStartDate(todayStr);
                                                        if (!isNameManuallyEdited) {
                                                            const c = b2bClients.find(cl => cl.id === selectedClientId);
                                                            setAgreementName(computeDefaultAgreementName(c, isMultiClientMode, todayStr));
                                                        }
                                                    }}
                                                    style={{ padding: '3px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: '#F8FAFC', fontSize: '0.72rem', color: '#334155', fontWeight: 'bold', cursor: 'pointer' }}
                                                >
                                                    📅 Hoy
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const now = new Date();
                                                        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                                                        const y = nextMonth.getFullYear();
                                                        const m = String(nextMonth.getMonth() + 1).padStart(2, '0');
                                                        const dStr = `${y}-${m}-01`;
                                                        setStartDate(dStr);
                                                        if (!isNameManuallyEdited) {
                                                            const c = b2bClients.find(cl => cl.id === selectedClientId);
                                                            setAgreementName(computeDefaultAgreementName(c, isMultiClientMode, dStr));
                                                        }
                                                    }}
                                                    style={{ padding: '3px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', backgroundColor: '#F8FAFC', fontSize: '0.72rem', color: '#334155', fontWeight: 'bold', cursor: 'pointer' }}
                                                >
                                                    📅 1 del Próximo Mes
                                                </button>
                                            </div>
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: THEME.colors.textSecondary, marginBottom: '6px', textTransform: 'uppercase' }}>
                                                Duración de Tarifas Congeladas:
                                            </label>
                                            <div style={{ display: 'flex', gap: '10px' }}>
                                                <input 
                                                    type="number"
                                                    min="1"
                                                    required
                                                    value={durationValue}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        if (val === '') {
                                                            setDurationValue('');
                                                        } else {
                                                            const parsed = parseInt(val, 10);
                                                            setDurationValue(isNaN(parsed) ? '' : Math.max(1, parsed));
                                                        }
                                                    }}
                                                    onBlur={() => {
                                                        if (!durationValue || Number(durationValue) < 1) {
                                                            setDurationValue(1);
                                                        }
                                                    }}
                                                    style={{ 
                                                        width: '100px', 
                                                        padding: '12px', 
                                                        borderRadius: '10px', 
                                                        border: `1.5px solid ${THEME.colors.border}`,
                                                        fontSize: '0.95rem',
                                                        fontWeight: 'bold',
                                                        textAlign: 'center',
                                                        color: THEME.colors.textMain
                                                    }}
                                                />
                                                <select
                                                    value={durationUnit}
                                                    onChange={(e) => setDurationUnit(e.target.value)}
                                                    style={{
                                                        flex: 1,
                                                        padding: '12px',
                                                        borderRadius: '10px',
                                                        border: `1.5px solid ${THEME.colors.border}`,
                                                        fontSize: '0.9rem',
                                                        fontWeight: 'bold',
                                                        color: THEME.colors.textMain,
                                                        backgroundColor: 'white'
                                                    }}
                                                >
                                                    <option value="days">Días</option>
                                                    <option value="weeks">Semanas</option>
                                                    <option value="months">Meses</option>
                                                    <option value="years">Años</option>
                                                </select>
                                            </div>
                                            {/* Quick Duration Presets */}
                                            <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => { setDurationValue(1); setDurationUnit('months'); }}
                                                    style={{ padding: '3px 8px', borderRadius: '6px', border: Number(durationValue) === 1 && durationUnit === 'months' ? '1.5px solid #0D7A57' : '1px solid #CBD5E1', backgroundColor: Number(durationValue) === 1 && durationUnit === 'months' ? '#ECFDF5' : '#F8FAFC', fontSize: '0.72rem', color: Number(durationValue) === 1 && durationUnit === 'months' ? '#065F46' : '#334155', fontWeight: 'bold', cursor: 'pointer' }}
                                                >
                                                    ⚡ 1 Mes (Mensual)
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => { setDurationValue(15); setDurationUnit('days'); }}
                                                    style={{ padding: '3px 8px', borderRadius: '6px', border: Number(durationValue) === 15 && durationUnit === 'days' ? '1.5px solid #0D7A57' : '1px solid #CBD5E1', backgroundColor: Number(durationValue) === 15 && durationUnit === 'days' ? '#ECFDF5' : '#F8FAFC', fontSize: '0.72rem', color: Number(durationValue) === 15 && durationUnit === 'days' ? '#065F46' : '#334155', fontWeight: 'bold', cursor: 'pointer' }}
                                                >
                                                    15 Días (Quincenal)
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => { setDurationValue(8); setDurationUnit('days'); }}
                                                    style={{ padding: '3px 8px', borderRadius: '6px', border: Number(durationValue) === 8 && durationUnit === 'days' ? '1.5px solid #0D7A57' : '1px solid #CBD5E1', backgroundColor: Number(durationValue) === 8 && durationUnit === 'days' ? '#ECFDF5' : '#F8FAFC', fontSize: '0.72rem', color: Number(durationValue) === 8 && durationUnit === 'days' ? '#065F46' : '#334155', fontWeight: 'bold', cursor: 'pointer' }}
                                                >
                                                    8 Días (Semanal)
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => { setDurationValue(3); setDurationUnit('months'); }}
                                                    style={{ padding: '3px 8px', borderRadius: '6px', border: Number(durationValue) === 3 && durationUnit === 'months' ? '1.5px solid #0D7A57' : '1px solid #CBD5E1', backgroundColor: Number(durationValue) === 3 && durationUnit === 'months' ? '#ECFDF5' : '#F8FAFC', fontSize: '0.72rem', color: Number(durationValue) === 3 && durationUnit === 'months' ? '#065F46' : '#334155', fontWeight: 'bold', cursor: 'pointer' }}
                                                >
                                                    3 Meses (Trimestral)
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {(() => {
                                        const numDuration = Math.max(1, Number(durationValue) || 1);
                                        const expiry = new Date(startDate + 'T12:00:00');
                                        if (durationUnit === 'days') {
                                            expiry.setDate(expiry.getDate() + numDuration);
                                        } else if (durationUnit === 'weeks') {
                                            expiry.setDate(expiry.getDate() + numDuration * 7);
                                        } else if (durationUnit === 'months') {
                                            expiry.setMonth(expiry.getMonth() + numDuration);
                                        } else if (durationUnit === 'years') {
                                            expiry.setFullYear(expiry.getFullYear() + numDuration);
                                        }
                                        const formattedExpiry = expiry.toLocaleDateString('es-CO', {
                                            weekday: 'long',
                                            day: 'numeric',
                                            month: 'long',
                                            year: 'numeric'
                                        });
                                        const formattedStart = new Date(startDate + 'T12:00:00').toLocaleDateString('es-CO', {
                                            day: 'numeric',
                                            month: 'long',
                                            year: 'numeric'
                                        });
                                        return (
                                            <div style={{ 
                                                marginTop: '6px', 
                                                padding: '14px 18px', 
                                                backgroundColor: '#EFF6FF', 
                                                border: '1.5px solid #BFDBFE', 
                                                borderRadius: '10px',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '8px'
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <Calendar size={22} color="#2563EB" style={{ flexShrink: 0 }} />
                                                    <div style={{ flex: 1 }}>
                                                        <span style={{ fontSize: '0.72rem', color: '#1E40AF', fontWeight: 'bold', display: 'block', textTransform: 'uppercase' }}>
                                                            {isMultiClientMode ? 'Vigencia Unificada de la Lista Maestra:' : 'Vigencia Calculada:'}
                                                        </span>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '2px' }}>
                                                            <span style={{ fontSize: '0.85rem', color: '#334155' }}>Desde: <strong>{formattedStart}</strong></span>
                                                            <span style={{ fontSize: '0.85rem', color: '#64748B' }}>➔</span>
                                                            <strong style={{ color: '#1E3A8A', fontSize: '0.95rem', textTransform: 'capitalize' }}>
                                                                Vence el {formattedExpiry}
                                                            </strong>
                                                        </div>
                                                    </div>
                                                </div>
                                                {isMultiClientMode && (
                                                    <div style={{ 
                                                        padding: '6px 10px', 
                                                        backgroundColor: 'rgba(255, 255, 255, 0.7)', 
                                                        borderRadius: '6px', 
                                                        border: '1px solid #DBEAFE', 
                                                        fontSize: '0.75rem', 
                                                        color: '#1E40AF' 
                                                    }}>
                                                        ⚡ <strong>Efecto Cascada Simultáneo:</strong> Esta vigencia rige idénticamente para todas las Casas Matrices y sucursales vinculadas. Al llegar la fecha de vencimiento, expirará en simultáneo para todas las sedes asociadas.
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}

                            {/* ================= STEP 3: AI DIGESTOR & INTERACTIVE RECONCILIATION WORKBENCH ================= */}
                            {createStep === 3 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingTop: '1.5rem' }}>
                                    {/* Action bar, Mode Switcher and instructions */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <h4 style={{ margin: 0, fontSize: '0.95rem', color: THEME.colors.textMain, fontWeight: '800' }}>
                                                    Paso 3: Mesa de Reconciliación & Ingesta Inteligente
                                                </h4>
                                                <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: '12px', backgroundColor: '#DCFCE7', color: '#166534', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                    <Sparkles size={11} color="#16A34A" /> IA Gemini 3.8 Flash
                                                </span>
                                            </div>
                                            <p style={{ margin: '3px 0 0', fontSize: '0.75rem', color: THEME.colors.textSecondary }}>
                                                Carga listas de precios aprobadas en Excel, CSV o PDF. El sistema cruzará descripciones con el catálogo maestro y te permitirá reconciliar en caliente.
                                            </p>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                            {/* Mode Switcher Pill */}
                                            <div style={{ display: 'inline-flex', backgroundColor: '#F1F5F9', padding: '3px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => setDigestMode('ai')}
                                                    style={{
                                                        padding: '5px 12px',
                                                        borderRadius: '8px',
                                                        border: 'none',
                                                        fontSize: '0.74rem',
                                                        fontWeight: 'bold',
                                                        cursor: 'pointer',
                                                        backgroundColor: digestMode === 'ai' ? '#0D7A57' : 'transparent',
                                                        color: digestMode === 'ai' ? 'white' : '#64748B',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        transition: 'all 0.15s ease'
                                                    }}
                                                >
                                                    <Sparkles size={13} /> Asistente IA Gemini
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setDigestMode('standard')}
                                                    style={{
                                                        padding: '5px 12px',
                                                        borderRadius: '8px',
                                                        border: 'none',
                                                        fontSize: '0.74rem',
                                                        fontWeight: 'bold',
                                                        cursor: 'pointer',
                                                        backgroundColor: digestMode === 'standard' ? '#0D7A57' : 'transparent',
                                                        color: digestMode === 'standard' ? 'white' : '#64748B',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        transition: 'all 0.15s ease'
                                                    }}
                                                >
                                                    <FileText size={13} /> Directo Excel
                                                </button>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={downloadTemplate}
                                                style={{
                                                    padding: '0.45rem 0.85rem',
                                                    borderRadius: '8px',
                                                    border: `1.5px solid ${THEME.colors.primary}`,
                                                    backgroundColor: THEME.colors.primaryLight,
                                                    color: THEME.colors.primary,
                                                    fontSize: '0.76rem',
                                                    fontWeight: 'bold',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '5px'
                                                }}
                                            >
                                                <Download size={13} /> Plantilla Oficial (.xlsx)
                                            </button>
                                        </div>
                                    </div>

                                    {/* Cargar Precios del Modelo Institucional General */}
                                    {masterTemplate && masterTemplate.items && masterTemplate.items.length > 0 && (
                                        <div style={{
                                            background: 'linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)',
                                            border: '1.5px solid #86EFAC',
                                            borderRadius: '12px',
                                            padding: '12px 16px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: '16px',
                                            boxShadow: '0 2px 8px rgba(22, 101, 52, 0.08)'
                                        }}>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', color: '#166534', fontSize: '0.88rem' }}>
                                                    <Sparkles size={16} color="#16A34A" />
                                                    Modelo Institucional General Activo ({masterTemplate.items.length} SKUs)
                                                </div>
                                                <p style={{ margin: '3px 0 0', fontSize: '0.75rem', color: '#15803D' }}>
                                                    {masterTemplate.model_snapshot_name || 'Lista Base Institucional'}. Carga estos precios con 1 clic manteniendo las fechas individuales de este cliente.
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleApplyMasterToCreateFlow}
                                                style={{
                                                    padding: '8px 14px',
                                                    backgroundColor: '#16A34A',
                                                    color: 'white',
                                                    borderRadius: '8px',
                                                    border: 'none',
                                                    fontWeight: 'bold',
                                                    fontSize: '0.78rem',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '5px',
                                                    whiteSpace: 'nowrap',
                                                    boxShadow: '0 3px 10px rgba(22, 163, 74, 0.22)'
                                                }}
                                            >
                                                <Sparkles size={13} />
                                                Cargar Precios Modelo Base
                                            </button>
                                        </div>
                                    )}

                                    {/* Cargar Lista Genérica Abierta a Consumo ($0 COP) */}
                                    <div style={{
                                        background: 'linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%)',
                                        border: '1.5px solid #C4B5FD',
                                        borderRadius: '12px',
                                        padding: '12px 16px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '16px',
                                        boxShadow: '0 2px 8px rgba(109, 40, 217, 0.08)'
                                    }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', color: '#5B21B6', fontSize: '0.88rem' }}>
                                                <ShoppingCart size={16} color="#7C3AED" />
                                                Lista Genérica Abierta a Consumo (Precio $0 COP)
                                            </div>
                                            <p style={{ margin: '3px 0 0', fontSize: '0.75rem', color: '#6D28D9' }}>
                                                Carga todo el catálogo activo a $0 COP. Permite ingresar pedidos sin acuerdo fijo, despachar con remisión física y liquidar a precio costo vigente en facturación.
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleApplyOpenConsumptionToCreateFlow}
                                            style={{
                                                padding: '8px 14px',
                                                backgroundColor: '#7C3AED',
                                                color: 'white',
                                                borderRadius: '8px',
                                                border: 'none',
                                                fontWeight: 'bold',
                                                fontSize: '0.78rem',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '5px',
                                                whiteSpace: 'nowrap',
                                                boxShadow: '0 3px 10px rgba(124, 58, 237, 0.25)'
                                            }}
                                        >
                                            <ShoppingCart size={13} />
                                            Cargar Todo el Catálogo a $0
                                        </button>
                                    </div>

                                    {/* Polymorphic Drag-drop or File Input */}
                                    <div style={{
                                        border: `2px dashed ${isDigestingWithAI ? '#2563EB' : parsedFile ? THEME.colors.primary : '#CBD5E1'}`,
                                        backgroundColor: isDigestingWithAI ? '#EFF6FF' : parsedFile ? '#F0FDF4' : '#F8FAFC',
                                        borderRadius: '12px',
                                        padding: isDigestingWithAI ? '1.5rem' : parsedFile ? '1rem 1.5rem' : '1.5rem',
                                        textAlign: 'center',
                                        cursor: isDigestingWithAI ? 'wait' : 'pointer',
                                        position: 'relative',
                                        transition: 'all 0.2s ease'
                                    }}>
                                        <input 
                                            type="file" 
                                            accept=".xlsx, .xls, .csv, .pdf"
                                            disabled={isDigestingWithAI || parsing}
                                            onChange={handleFileUpload}
                                            style={{
                                                position: 'absolute',
                                                inset: 0,
                                                opacity: 0,
                                                cursor: isDigestingWithAI ? 'wait' : 'pointer'
                                            }}
                                        />

                                        {isDigestingWithAI ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                                <Loader2 size={32} className="animate-spin" style={{ color: '#2563EB' }} />
                                                <div style={{ fontSize: '0.92rem', fontWeight: '800', color: '#1E3A8A' }}>
                                                    {digestingStatusText || 'Analizando documento con IA Gemini 3.8 Flash...'}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: '#3B82F6' }}>
                                                    Extrayendo productos, unidades y cruzando semánticamente contra el catálogo maestro de FruFresco...
                                                </div>
                                            </div>
                                        ) : parsedFile ? (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ textAlign: 'left' }}>
                                                    <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <FileText size={16} color={THEME.colors.primary} /> {parsedFile.name}
                                                    </div>
                                                    <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, marginTop: '2px' }}>
                                                        Tamaño: {Math.round(parsedFile.size / 1024)} KB — Haz clic o arrastra otro archivo (.xlsx, .csv, .pdf) para reemplazarlo
                                                    </div>
                                                </div>
                                                <span style={{ fontSize: '0.75rem', padding: '4px 10px', borderRadius: '20px', backgroundColor: '#DCFCE7', color: '#166534', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                    <Check size={13} strokeWidth={2.5} /> Archivo Analizado con Éxito
                                                </span>
                                            </div>
                                        ) : (
                                            <div>
                                                <UploadCloud size={32} style={{ color: '#94A3B8', margin: '0 auto 6px auto' }} />
                                                <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: THEME.colors.textMain }}>
                                                    Arrastra y suelta tu archivo de lista de precios aquí (Excel, CSV o PDF)
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, marginTop: '4px' }}>
                                                    Formatos compatibles: <strong>.xlsx, .xls, .csv, .pdf</strong> — El motor de IA interpretará automáticamente la estructura y los precios.
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* PREVIEW & INTERACTIVE RECONCILIATION WORKBENCH */}
                                    {excelPreviewData && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '4px' }}>
                                            {/* Header with Collapsible Toggle */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontSize: '0.78rem', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                    Mesa de Reconciliación & Pre-Validación ({excelPreviewData.items.length} ítems)
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => setIsKpiCollapsed(!isKpiCollapsed)}
                                                    style={{
                                                        backgroundColor: isKpiCollapsed ? '#E0F2FE' : '#F1F5F9',
                                                        border: `1px solid ${isKpiCollapsed ? '#BAE6FD' : '#CBD5E1'}`,
                                                        borderRadius: '6px',
                                                        padding: '4px 10px',
                                                        color: isKpiCollapsed ? '#0369A1' : '#475569',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 'bold',
                                                        cursor: 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        transition: 'all 0.15s ease'
                                                    }}
                                                >
                                                    {isKpiCollapsed ? (
                                                        <><ChevronDown size={14} /> Mostrar Métricas Detalladas</>
                                                    ) : (
                                                        <><ChevronUp size={14} /> Colapsar para más espacio</>
                                                    )}
                                                </button>
                                            </div>

                                            {/* Poka-Yoke Alert Banner for Unmatched Items */}
                                            {excelPreviewData.unmatchedCount > 0 && (
                                                <div style={{
                                                    padding: '10px 14px',
                                                    backgroundColor: '#FEF2F2',
                                                    border: '1.5px solid #FCA5A5',
                                                    borderRadius: '8px',
                                                    fontSize: '0.78rem',
                                                    color: '#991B1B',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    gap: '12px'
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <AlertCircle size={20} color="#DC2626" style={{ flexShrink: 0 }} />
                                                        <div>
                                                            <strong>Poka-Yoke Activo ({excelPreviewData.unmatchedCount} productos sin coincidencia):</strong> Para activar este acuerdo comercial es obligatorio asignar cada ítem con el buscador, crearlo con <em>[+ Crear]</em> o descartar la fila si no corresponde a un producto.
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => setExcelPreviewFilter('unmatched')}
                                                        style={{
                                                            padding: '4px 10px',
                                                            backgroundColor: '#DC2626',
                                                            color: 'white',
                                                            border: 'none',
                                                            borderRadius: '6px',
                                                            fontSize: '0.72rem',
                                                            fontWeight: 'bold',
                                                            cursor: 'pointer',
                                                            whiteSpace: 'nowrap'
                                                        }}
                                                    >
                                                        Ver Pendientes ({excelPreviewData.unmatchedCount})
                                                    </button>
                                                </div>
                                            )}

                                            {/* Poka-Yoke Alert Banner for Inactive SKUs */}
                                            {excelPreviewData.inactiveCount > 0 && (
                                                <div style={{
                                                    padding: '8px 14px',
                                                    backgroundColor: '#FFFBEB',
                                                    border: '1.5px solid #FDE68A',
                                                    borderRadius: '8px',
                                                    fontSize: '0.78rem',
                                                    color: '#92400E',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '10px'
                                                }}>
                                                    <AlertTriangle size={18} color="#D97706" style={{ flexShrink: 0 }} />
                                                    <div>
                                                        <strong>Alerta ({excelPreviewData.inactiveCount} SKUs inactivos en catálogo):</strong> Estos productos coinciden pero están desactivados en bodega. Al activar el acuerdo, se te solicitará confirmación para reactivarlos automáticamente.
                                                    </div>
                                                </div>
                                            )}

                                            {/* KPI Section: Full Cards OR Compact Summary Strip */}
                                            {!isKpiCollapsed ? (
                                                <div style={{ display: 'grid', gridTemplateColumns: excelPreviewData.inactiveCount > 0 ? 'repeat(5, 1fr)' : 'repeat(4, 1fr)', gap: '10px' }}>
                                                    <div style={{ backgroundColor: '#F8FAFC', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                                        <span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 'bold', textTransform: 'uppercase' }}>Total Ítems</span>
                                                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: THEME.colors.textMain, marginTop: '2px' }}>
                                                            {excelPreviewData.items.length}
                                                        </div>
                                                    </div>
                                                    <div style={{ backgroundColor: '#F0FDF4', padding: '10px 14px', borderRadius: '8px', border: '1px solid #BBF7D0' }}>
                                                        <span style={{ fontSize: '0.68rem', color: '#166534', fontWeight: 'bold', textTransform: 'uppercase' }}>Reconocidos (OK)</span>
                                                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#16A34A', marginTop: '2px' }}>
                                                            {excelPreviewData.matchedCount}
                                                        </div>
                                                    </div>
                                                    {excelPreviewData.inactiveCount > 0 && (
                                                        <div style={{ backgroundColor: '#FFFBEB', padding: '10px 14px', borderRadius: '8px', border: '1px solid #FDE68A' }}>
                                                            <span style={{ fontSize: '0.68rem', color: '#B45309', fontWeight: 'bold', textTransform: 'uppercase' }}>Inactivos Catálogo</span>
                                                            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#D97706', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <AlertTriangle size={15} /> {excelPreviewData.inactiveCount}
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div style={{ backgroundColor: excelPreviewData.unmatchedCount > 0 ? '#FEF2F2' : '#F8FAFC', padding: '10px 14px', borderRadius: '8px', border: `1px solid ${excelPreviewData.unmatchedCount > 0 ? '#FECACA' : '#E2E8F0'}` }}>
                                                        <span style={{ fontSize: '0.68rem', color: excelPreviewData.unmatchedCount > 0 ? '#991B1B' : '#64748B', fontWeight: 'bold', textTransform: 'uppercase' }}>Sin Coincidencia</span>
                                                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: excelPreviewData.unmatchedCount > 0 ? '#DC2626' : '#64748B', marginTop: '2px' }}>
                                                            {excelPreviewData.unmatchedCount}
                                                        </div>
                                                    </div>
                                                    <div style={{ backgroundColor: '#EFF6FF', padding: '10px 14px', borderRadius: '8px', border: '1px solid #BFDBFE' }}>
                                                        <span style={{ fontSize: '0.68rem', color: '#1E40AF', fontWeight: 'bold', textTransform: 'uppercase' }}>Margen Promedio</span>
                                                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: excelPreviewData.avgMargin >= 20 ? '#059669' : excelPreviewData.avgMargin >= 12 ? '#D97706' : '#DC2626', marginTop: '2px' }}>
                                                            {excelPreviewData.avgMargin}%
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div style={{ 
                                                    display: 'flex', 
                                                    alignItems: 'center', 
                                                    justifyContent: 'space-between',
                                                    padding: '8px 14px', 
                                                    backgroundColor: '#F8FAFC', 
                                                    borderRadius: '8px', 
                                                    border: '1px solid #E2E8F0',
                                                    fontSize: '0.8rem'
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                                        <span><strong>{excelPreviewData.items.length}</strong> Filas</span>
                                                        <span style={{ color: '#166534', fontWeight: 'bold' }}>{excelPreviewData.matchedCount} En Catálogo</span>
                                                        {excelPreviewData.inactiveCount > 0 && (
                                                            <span style={{ color: '#D97706', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <AlertTriangle size={13} color="#D97706" /> {excelPreviewData.inactiveCount} Inactivos
                                                            </span>
                                                        )}
                                                        {excelPreviewData.unmatchedCount > 0 ? (
                                                            <span style={{ color: '#DC2626', fontWeight: 'bold' }}><AlertTriangle size={13} color="#DC2626" /> {excelPreviewData.unmatchedCount} Sin Coincidencia</span>
                                                        ) : (
                                                            <span style={{ color: '#64748B' }}>0 Sin coincidencia</span>
                                                        )}
                                                        <span>Margen Prom.: <strong style={{ color: excelPreviewData.avgMargin >= 20 ? '#059669' : excelPreviewData.avgMargin >= 12 ? '#D97706' : '#DC2626' }}>{excelPreviewData.avgMargin}%</strong></span>
                                                    </div>
                                                    <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                                        (Vista compacta activada)
                                                    </span>
                                                </div>
                                            )}

                                            {/* Preview Search & Filter toolbar - Sticky Docked Line 1 */}
                                            <div style={{ 
                                                display: 'flex', 
                                                justifyContent: 'space-between', 
                                                alignItems: 'center', 
                                                gap: '12px', 
                                                backgroundColor: '#FFFFFF', 
                                                padding: '8px 12px', 
                                                borderRadius: '8px 8px 0 0', 
                                                border: '1px solid #CBD5E1',
                                                borderBottom: 'none',
                                                position: 'sticky',
                                                top: 0,
                                                zIndex: 40,
                                                minHeight: '48px',
                                                boxSizing: 'border-box',
                                                boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
                                            }}>
                                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                    {(['all', 'matched', 'unmatched', 'inactive'] as const).map(flt => {
                                                        if (flt === 'inactive' && (!excelPreviewData.inactiveCount || excelPreviewData.inactiveCount === 0)) return null;
                                                        return (
                                                            <button
                                                                key={flt}
                                                                type="button"
                                                                onClick={() => setExcelPreviewFilter(flt)}
                                                                style={{
                                                                    padding: '5px 12px',
                                                                    borderRadius: '6px',
                                                                    border: 'none',
                                                                    fontSize: '0.75rem',
                                                                    fontWeight: 'bold',
                                                                    cursor: 'pointer',
                                                                    backgroundColor: excelPreviewFilter === flt ? (flt === 'unmatched' ? '#DC2626' : flt === 'inactive' ? '#D97706' : THEME.colors.primary) : '#E2E8F0',
                                                                    color: excelPreviewFilter === flt ? 'white' : '#475569',
                                                                    transition: 'all 0.15s ease'
                                                                }}
                                                            >
                                                                {flt === 'all' && `Todos (${excelPreviewData.items.length})`}
                                                                {flt === 'matched' && `Reconocidos (${excelPreviewData.matchedCount})`}
                                                                {flt === 'unmatched' && `Sin Coincidencia (${excelPreviewData.unmatchedCount})`}
                                                                {flt === 'inactive' && `Inactivos (${excelPreviewData.inactiveCount})`}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                                
                                                <GalleryOmnibox
                                                    value={excelPreviewSearch}
                                                    onChange={setExcelPreviewSearch}
                                                    placeholder="Buscar producto, #ID contable, SKU o coincidencia..."
                                                    filteredCount={excelPreviewData.items.filter(item => {
                                                        if (excelPreviewFilter === 'matched' && !item.matched_product) return false;
                                                        if (excelPreviewFilter === 'unmatched' && item.matched_product) return false;
                                                        if (excelPreviewFilter === 'inactive' && (!item.matched_product || !item.is_inactive)) return false;
                                                        if (!excelPreviewSearch.trim()) return true;
                                                        return matchesUniversalSearch(
                                                            [
                                                                item.accounting_id,
                                                                item.client_product_name,
                                                                item.product_name,
                                                                item.matched_product?.name,
                                                                item.matched_product?.accounting_id,
                                                                item.matched_product?.sku,
                                                                item.unit
                                                            ],
                                                            excelPreviewSearch
                                                        );
                                                    }).length}
                                                    totalCount={excelPreviewData.items.length}
                                                    style={{ flex: '1 1 300px', maxWidth: '420px' }}
                                                />
                                            </div>

                                            {/* Preview Table with Expanded Height and In-Cell Predictive Reconciliation (Orders Module UX Parity) */}
                                            <div style={{ 
                                                border: '1px solid #CBD5E1', 
                                                borderRadius: '0 0 8px 8px',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                                                position: 'relative',
                                                backgroundColor: '#FFFFFF',
                                                overflow: 'visible'
                                            }}>
                                                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left', fontSize: '0.8rem' }}>
                                                    <thead style={{ position: 'sticky', top: '48px', zIndex: 30 }}>
                                                        <tr style={{ backgroundColor: '#F8FAFC' }}>
                                                            <th style={{ position: 'sticky', top: '48px', zIndex: 30, padding: '10px 12px', fontWeight: 'bold', color: '#475569', backgroundColor: '#F8FAFC', borderBottom: '2px solid #CBD5E1', width: '50px' }}>#</th>
                                                            <th style={{ position: 'sticky', top: '48px', zIndex: 30, padding: '10px 12px', fontWeight: 'bold', color: '#475569', backgroundColor: '#F8FAFC', borderBottom: '2px solid #CBD5E1', width: '28%' }}>Producto en Documento</th>
                                                            <th style={{ position: 'sticky', top: '48px', zIndex: 30, padding: '10px 12px', fontWeight: 'bold', color: '#475569', backgroundColor: '#F8FAFC', borderBottom: '2px solid #CBD5E1', width: '36%' }}>Match Catálogo Maestro (Buscador Predictivo)</th>
                                                            <th style={{ position: 'sticky', top: '48px', zIndex: 30, padding: '10px 12px', fontWeight: 'bold', color: '#475569', textAlign: 'right', backgroundColor: '#F8FAFC', borderBottom: '2px solid #CBD5E1', width: '12%' }}>Costo Base</th>
                                                            <th style={{ position: 'sticky', top: '48px', zIndex: 30, padding: '10px 12px', fontWeight: 'bold', color: '#475569', textAlign: 'right', backgroundColor: '#F8FAFC', borderBottom: '2px solid #CBD5E1', width: '12%' }}>Precio Acordado</th>
                                                            <th style={{ position: 'sticky', top: '48px', zIndex: 30, padding: '10px 12px', fontWeight: 'bold', color: '#475569', textAlign: 'center', backgroundColor: '#F8FAFC', borderBottom: '2px solid #CBD5E1', width: '10%' }}>Margen %</th>
                                                            <th style={{ position: 'sticky', top: '48px', zIndex: 30, padding: '10px 12px', fontWeight: 'bold', color: '#475569', textAlign: 'center', backgroundColor: '#F8FAFC', borderBottom: '2px solid #CBD5E1', width: '60px' }}>Acción</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {excelPreviewData.items
                                                            .filter(item => {
                                                                if (excelPreviewFilter === 'matched' && !item.matched_product) return false;
                                                                if (excelPreviewFilter === 'unmatched' && item.matched_product) return false;
                                                                if (excelPreviewFilter === 'inactive' && (!item.matched_product || !item.is_inactive)) return false;
                                                                if (!excelPreviewSearch.trim()) return true;
                                                                return matchesUniversalSearch(
                                                                    [
                                                                        item.accounting_id,
                                                                        item.client_product_name,
                                                                        item.product_name,
                                                                        item.matched_product?.name,
                                                                        item.matched_product?.accounting_id,
                                                                        item.matched_product?.sku,
                                                                        item.unit
                                                                    ],
                                                                    excelPreviewSearch
                                                                );
                                                            })
                                                            .map((item, rowIdx) => {
                                                                const isMatched = Boolean(item.matched_product);
                                                                const isSearchingInCell = activeCellSearchRowIdx === rowIdx;
                                                                const currentQuery = isSearchingInCell ? activeCellSearchQuery : (item.client_product_name || item.product_name);
                                                                const searchCandidates = catalogProducts
                                                                    .filter(p => {
                                                                        if (!currentQuery.trim()) return true;
                                                                        return matchesUniversalSearch(
                                                                            [
                                                                                p.accounting_id,
                                                                                p.sku,
                                                                                p.name,
                                                                                p.category,
                                                                                p.unit_of_measure
                                                                            ],
                                                                            currentQuery
                                                                        );
                                                                    })
                                                                    .slice(0, 15);

                                                                return (
                                                                    <tr 
                                                                        key={rowIdx} 
                                                                        style={{ 
                                                                            borderBottom: '1px solid #F1F5F9', 
                                                                            backgroundColor: isSearchingInCell ? '#FFFFFF' : (!isMatched ? '#FEF3C7' : item.is_inactive ? '#FFFBEB' : rowIdx % 2 === 0 ? 'white' : '#FAFAFA'),
                                                                            borderLeft: !isMatched ? '4px solid #F59E0B' : '4px solid transparent',
                                                                            transition: 'all 0.15s ease'
                                                                        }}
                                                                    >
                                                                        {/* Row index & accounting ID */}
                                                                        <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 'bold', color: '#64748B', fontSize: '0.74rem' }}>
                                                                            {rowIdx + 1}
                                                                        </td>

                                                                        {/* Client product name in document */}
                                                                        <td style={{ padding: '8px 10px', color: '#1E293B' }}>
                                                                            <div style={{ fontWeight: '700', fontSize: '0.82rem' }}>
                                                                                {item.client_product_name || item.product_name}
                                                                            </div>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                                                                <span style={{ fontSize: '0.66rem', backgroundColor: '#F1F5F9', color: '#475569', padding: '1px 5px', borderRadius: '4px', fontWeight: 'bold' }}>
                                                                                    {item.unit || 'Kg'}
                                                                                </span>
                                                                                {item.accounting_id && (
                                                                                    <span style={{ fontSize: '0.66rem', color: '#94A3B8', fontFamily: 'monospace' }}>
                                                                                        Doc ID: {item.accounting_id}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </td>

                                                                        {/* Match in master catalog / In-cell predictive search */}
                                                                        <td style={{ padding: '6px 10px', position: 'relative' }}>
                                                                            {isMatched && !isSearchingInCell ? (
                                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                                                                                    <div>
                                                                                        <div style={{ fontWeight: '700', color: THEME.colors.primary, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                                            {item.matched_product.name}
                                                                                            <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 'normal', fontFamily: 'monospace' }}>
                                                                                                (ID: {item.matched_product.accounting_id || item.matched_product.sku})
                                                                                            </span>
                                                                                        </div>
                                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                                                                            <span style={{ fontSize: '0.64rem', padding: '1px 5px', borderRadius: '4px', backgroundColor: '#DCFCE7', color: '#15803D', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                                                                <Check size={10} strokeWidth={2.5} /> Match
                                                                                            </span>
                                                                                            {item.is_inactive && (
                                                                                                <span style={{ fontSize: '0.64rem', padding: '1px 5px', borderRadius: '4px', backgroundColor: '#FEF3C7', color: '#B45309', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                                                                    <AlertTriangle size={10} /> Inactivo en Bodega
                                                                                                </span>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => {
                                                                                            setActiveCellSearchRowIdx(rowIdx);
                                                                                            setActiveCellSearchQuery('');
                                                                                            setFocusedCellOptionIdx(0);
                                                                                        }}
                                                                                        title="Cambiar producto asociado"
                                                                                        style={{
                                                                                            padding: '3px 7px',
                                                                                            backgroundColor: '#F1F5F9',
                                                                                            border: '1px solid #CBD5E1',
                                                                                            borderRadius: '5px',
                                                                                            fontSize: '0.68rem',
                                                                                            fontWeight: '600',
                                                                                            color: '#475569',
                                                                                            cursor: 'pointer'
                                                                                        }}
                                                                                    >
                                                                                        <Edit3 size={11} /> Cambiar
                                                                                    </button>
                                                                                </div>
                                                                            ) : (
                                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                                    {!isMatched && (
                                                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                                                                                            <span style={{ fontSize: '0.68rem', fontWeight: '800', color: '#B45309', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                                                                <AlertTriangle size={12} color="#D97706" /> Sin Coincidencia
                                                                                            </span>
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => handleOpenQuickProductModal(rowIdx)}
                                                                                                style={{
                                                                                                    padding: '2px 7px',
                                                                                                    backgroundColor: '#0D7A57',
                                                                                                    color: 'white',
                                                                                                    border: 'none',
                                                                                                    borderRadius: '4px',
                                                                                                    fontSize: '0.68rem',
                                                                                                    fontWeight: 'bold',
                                                                                                    cursor: 'pointer',
                                                                                                    display: 'inline-flex',
                                                                                                    alignItems: 'center',
                                                                                                    gap: '3px'
                                                                                                }}
                                                                                            >
                                                                                                <Plus size={11} /> Crear en Catálogo
                                                                                            </button>
                                                                                        </div>
                                                                                    )}

                                                                                    {/* Predictive search input */}
                                                                                    <div style={{ position: 'relative' }}>
                                                                                        <Search size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none' }} />
                                                                                        <input 
                                                                                            type="text"
                                                                                            placeholder="Escribe nombre o #ID para buscar..."
                                                                                            value={isSearchingInCell ? activeCellSearchQuery : ''}
                                                                                            onFocus={() => {
                                                                                                setActiveCellSearchRowIdx(rowIdx);
                                                                                                setActiveCellSearchQuery('');
                                                                                                setFocusedCellOptionIdx(0);
                                                                                            }}
                                                                                            onChange={(e) => {
                                                                                                setActiveCellSearchRowIdx(rowIdx);
                                                                                                setActiveCellSearchQuery(e.target.value);
                                                                                                setFocusedCellOptionIdx(0);
                                                                                            }}
                                                                                            onKeyDown={(e) => {
                                                                                                if (e.key === 'ArrowDown') {
                                                                                                    e.preventDefault();
                                                                                                    setFocusedCellOptionIdx(prev => Math.min(prev + 1, searchCandidates.length - 1));
                                                                                                } else if (e.key === 'ArrowUp') {
                                                                                                    e.preventDefault();
                                                                                                    setFocusedCellOptionIdx(prev => Math.max(prev - 1, 0));
                                                                                                } else if (e.key === 'Enter') {
                                                                                                    e.preventDefault();
                                                                                                    if (searchCandidates[focusedCellOptionIdx]) {
                                                                                                        handleAssignProductToRow(rowIdx, searchCandidates[focusedCellOptionIdx]);
                                                                                                    }
                                                                                                } else if (e.key === 'Escape') {
                                                                                                    setActiveCellSearchRowIdx(null);
                                                                                                }
                                                                                            }}
                                                                                            style={{
                                                                                                width: '100%',
                                                                                                padding: '5px 8px 5px 26px',
                                                                                                borderRadius: '6px',
                                                                                                border: isSearchingInCell ? '2px solid #2563EB' : '1.5px solid #F59E0B',
                                                                                                backgroundColor: 'white',
                                                                                                fontSize: '0.78rem',
                                                                                                fontWeight: '600',
                                                                                                outline: 'none',
                                                                                                boxShadow: isSearchingInCell ? '0 0 0 3px rgba(37, 99, 235, 0.15)' : 'none'
                                                                                            }}
                                                                                        />

                                                                                        {/* Floating predictive dropdown */}
                                                                                        {isSearchingInCell && searchCandidates.length > 0 && (
                                                                                            <div style={{
                                                                                                position: 'absolute',
                                                                                                top: '100%',
                                                                                                left: 0,
                                                                                                right: 0,
                                                                                                marginTop: '4px',
                                                                                                backgroundColor: 'white',
                                                                                                borderRadius: '8px',
                                                                                                border: '1.5px solid #CBD5E1',
                                                                                                boxShadow: '0 12px 28px rgba(0,0,0,0.2)',
                                                                                                zIndex: 9999,
                                                                                                maxHeight: '220px',
                                                                                                overflowY: 'auto'
                                                                                            }}>
                                                                                                {searchCandidates.map((cand, candIdx) => {
                                                                                                    const isCandFocused = candIdx === focusedCellOptionIdx;
                                                                                                    return (
                                                                                                        <div
                                                                                                            key={cand.id}
                                                                                                            onMouseDown={(e) => {
                                                                                                                e.preventDefault();
                                                                                                                handleAssignProductToRow(rowIdx, cand);
                                                                                                            }}
                                                                                                            onMouseMove={() => {
                                                                                                                if (focusedCellOptionIdx !== candIdx) {
                                                                                                                    setFocusedCellOptionIdx(candIdx);
                                                                                                                }
                                                                                                            }}
                                                                                                            style={{
                                                                                                                padding: '6px 10px',
                                                                                                                cursor: 'pointer',
                                                                                                                backgroundColor: isCandFocused ? '#DBEAFE' : 'white',
                                                                                                                borderBottom: '1px solid #F1F5F9',
                                                                                                                display: 'flex',
                                                                                                                justifyContent: 'space-between',
                                                                                                                alignItems: 'center',
                                                                                                                fontSize: '0.78rem'
                                                                                                            }}
                                                                                                        >
                                                                                                            <div>
                                                                                                                <span style={{ fontWeight: 'bold', color: isCandFocused ? '#1E40AF' : '#0F172A' }}>
                                                                                                                    {cand.name}
                                                                                                                </span>
                                                                                                                <span style={{ color: '#64748B', fontSize: '0.7rem', marginLeft: '6px' }}>
                                                                                                                    ({cand.accounting_id || cand.sku} — {cand.unit_of_measure})
                                                                                                                </span>
                                                                                                            </div>
                                                                                                            <span style={{ color: '#0D7A57', fontWeight: 'bold', fontSize: '0.72rem' }}>
                                                                                                                Base: {formatMoney(cand.cost_basis || 0)}
                                                                                                            </span>
                                                                                                        </div>
                                                                                                    );
                                                                                                })}
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                        </td>

                                                                        {/* Cost Basis */}
                                                                        <td style={{ padding: '8px 10px', textAlign: 'right', color: '#64748B', fontSize: '0.78rem' }}>
                                                                            {isMatched ? formatMoney(item.cost_basis) : '—'}
                                                                        </td>

                                                                        {/* Negotiated Price */}
                                                                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 'bold', color: THEME.colors.primary, fontSize: '0.84rem' }}>
                                                                            {formatMoney(item.unit_price)}
                                                                        </td>

                                                                        {/* Margin % Badge */}
                                                                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                                            {isMatched ? (
                                                                                <span style={{
                                                                                    fontSize: '0.74rem',
                                                                                    padding: '2px 8px',
                                                                                    borderRadius: '12px',
                                                                                    fontWeight: '800',
                                                                                    backgroundColor: item.margin_percent >= 20 ? '#DCFCE7' : item.margin_percent >= 12 ? '#FEF3C7' : '#FEE2E2',
                                                                                    color: item.margin_percent >= 20 ? '#166534' : item.margin_percent >= 12 ? '#B45309' : '#991B1B'
                                                                                }}>
                                                                                    {item.margin_percent}%
                                                                                </span>
                                                                            ) : (
                                                                                <span style={{ color: '#94A3B8', fontSize: '0.74rem' }}>—</span>
                                                                            )}
                                                                        </td>

                                                                        {/* Row actions */}
                                                                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleDiscardRow(rowIdx)}
                                                                                title="Descartar fila (no comercial)"
                                                                                style={{
                                                                                    backgroundColor: 'transparent',
                                                                                    border: 'none',
                                                                                    cursor: 'pointer',
                                                                                    color: '#EF4444',
                                                                                    padding: '4px',
                                                                                    borderRadius: '4px',
                                                                                    display: 'inline-flex',
                                                                                    alignItems: 'center',
                                                                                    justifyContent: 'center'
                                                                                }}
                                                                            >
                                                                                <Trash2 size={14} />
                                                                            </button>
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Modal Footer - Step Navigation Buttons & Poka-Yoke Blocking */}
                        <div style={{ padding: '1.25rem 2rem', borderTop: `1px solid ${THEME.colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F9FAFB' }}>
                            <div>
                                {createStep > 1 ? (
                                    <button 
                                        type="button" 
                                        onClick={() => setCreateStep((createStep - 1) as 1 | 2)}
                                        style={{ 
                                            padding: '10px 18px', 
                                            borderRadius: THEME.radius.md, 
                                            border: `1px solid ${THEME.colors.borderActive}`, 
                                            backgroundColor: 'white', 
                                            color: '#334155',
                                            fontWeight: 'bold',
                                            fontSize: '0.85rem',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px'
                                        }}
                                    >
                                        <ArrowLeft size={16} /> Anterior
                                    </button>
                                ) : (
                                    <button 
                                        type="button" 
                                        onClick={() => {
                                            setIsCreateModalOpen(false);
                                            setSelectedClientId('');
                                            setParsedFile(null);
                                            setUploadedItems([]);
                                            setExcelPreviewData(null);
                                        }} 
                                        style={{ 
                                            padding: '10px 18px', 
                                            borderRadius: THEME.radius.md, 
                                            border: `1px solid ${THEME.colors.borderActive}`, 
                                            backgroundColor: 'white', 
                                            color: '#64748B',
                                            fontWeight: 'bold',
                                            fontSize: '0.85rem',
                                            cursor: 'pointer' 
                                        }}
                                    >
                                        Cancelar
                                    </button>
                                )}
                            </div>

                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                {createStep === 1 && (
                                    (() => {
                                        const isStep1Disabled = isMultiClientMode ? selectedClientIds.length === 0 : !selectedClientId;
                                        return (
                                            <button 
                                                type="button"
                                                disabled={isStep1Disabled}
                                                onClick={() => {
                                                    if (!agreementName || !isNameManuallyEdited) {
                                                        const clientObj = b2bClients.find(c => c.id === selectedClientId);
                                                        setAgreementName(computeDefaultAgreementName(clientObj, isMultiClientMode, startDate));
                                                    }
                                                    setCreateStep(2);
                                                }}
                                                style={{ 
                                                    padding: '10px 22px', 
                                                    borderRadius: THEME.radius.md, 
                                                    border: 'none', 
                                                    backgroundColor: isStep1Disabled ? '#CBD5E1' : THEME.colors.primary, 
                                                    color: 'white', 
                                                    fontWeight: 'bold', 
                                                    fontSize: '0.85rem', 
                                                    cursor: isStep1Disabled ? 'not-allowed' : 'pointer', 
                                                    display: 'flex', 
                                                    alignItems: 'center', 
                                                    gap: '8px', 
                                                    boxShadow: isStep1Disabled ? 'none' : '0 4px 12px rgba(13, 122, 87, 0.25)' 
                                                }}
                                            >
                                                Continuar a Vigencia <ArrowRight size={16} />
                                            </button>
                                        );
                                    })()
                                )}

                                {createStep === 2 && (
                                    <button 
                                        type="button"
                                        onClick={() => setCreateStep(3)}
                                        style={{ 
                                            padding: '10px 22px', 
                                            borderRadius: THEME.radius.md, 
                                            border: 'none', 
                                            backgroundColor: THEME.colors.primary, 
                                            color: 'white', 
                                            fontWeight: 'bold',
                                            fontSize: '0.85rem',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            boxShadow: '0 4px 12px rgba(13, 122, 87, 0.25)'
                                        }}
                                    >
                                        Continuar a Carga de Precios <ArrowRight size={16} />
                                    </button>
                                )}

                                {createStep === 3 && (() => {
                                    const hasItems = Boolean(excelPreviewData && excelPreviewData.items.length > 0);
                                    const hasUnmatched = Boolean(excelPreviewData && excelPreviewData.unmatchedCount > 0);
                                    const isSubmitDisabled = savingAgreement || parsing || isDigestingWithAI || !hasItems || hasUnmatched;

                                    return (
                                        <button 
                                            type="submit" 
                                            disabled={isSubmitDisabled}
                                            title={hasUnmatched ? `Hay ${excelPreviewData?.unmatchedCount} ítems sin coincidencia pendientes.` : undefined}
                                            style={{ 
                                                padding: '10px 24px', 
                                                borderRadius: THEME.radius.md, 
                                                border: 'none', 
                                                backgroundColor: isSubmitDisabled 
                                                    ? (hasUnmatched ? '#F87171' : '#CBD5E1') 
                                                    : '#0D7A57',
                                                backgroundImage: isSubmitDisabled 
                                                    ? 'none' 
                                                    : 'linear-gradient(135deg, #0D7A57 0%, #059669 100%)',
                                                color: 'white', 
                                                fontWeight: 'bold', 
                                                fontSize: '0.85rem', 
                                                cursor: isSubmitDisabled ? 'not-allowed' : 'pointer',
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                gap: '8px', 
                                                boxShadow: isSubmitDisabled ? 'none' : '0 4px 14px rgba(13, 122, 87, 0.35)',
                                                opacity: isSubmitDisabled && !hasUnmatched ? 0.7 : 1,
                                                transition: 'all 0.2s ease'
                                            }}
                                        >
                                            {savingAgreement ? (
                                                <><Loader2 size={16} className="animate-spin" /> Guardando Acuerdo...</>
                                            ) : hasUnmatched ? (
                                                <><AlertCircle size={16} /> {excelPreviewData?.unmatchedCount} Sin Coincidencia — Resuelve para Activar</>
                                            ) : !hasItems ? (
                                                <>Carga un archivo de precios para continuar</>
                                            ) : (
                                                <>
                                                    <Check size={16} strokeWidth={2.5} /> Crear y Activar Acuerdo Comercial ({excelPreviewData?.matchedCount} SKUs)
                                                </>
                                            )}
                                        </button>
                                    );
                                })()}
                            </div>
                        </div>
                    </form>
                </div>
            )}

            {/* EDIT AGREEMENT MODAL (WIDE 3-STEP WIZARD) */}
            {isEditModalOpen && editingAgreement && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)', padding: '1rem' }}>
                    <div style={{ 
                        backgroundColor: 'white', 
                        borderRadius: THEME.radius.lg, 
                        width: '96vw', 
                        maxWidth: '1600px', 
                        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)', 
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        height: '92vh',
                        maxHeight: '94vh',
                        border: `1px solid ${THEME.colors.border}`
                    }}>
                        {/* Modal Header */}
                        <div style={{ padding: '1.25rem 1.75rem', borderBottom: `1px solid ${THEME.colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#E8F5E9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: THEME.colors.primary }}>
                                    <Edit3 size={20} strokeWidth={2.2} />
                                </div>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <h3 style={{ margin: 0, fontWeight: '900', color: THEME.colors.textMain, fontSize: '1.15rem' }}>
                                            Modificar Acuerdo Comercial
                                        </h3>
                                        <span style={{ 
                                            fontFamily: 'monospace', 
                                            fontSize: '0.75rem', 
                                            backgroundColor: '#E2E8F0', 
                                            padding: '2px 8px', 
                                            borderRadius: '6px', 
                                            fontWeight: 'bold', 
                                            color: '#334155' 
                                        }}>
                                            {formatAgreementNumber(editingAgreement.quote_number, editingAgreement.created_at)}
                                        </span>
                                    </div>
                                    <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: THEME.colors.textSecondary }}>
                                        Cliente: <strong>{editingAgreement.profiles?.company_name || editingAgreement.client_name}</strong>
                                    </p>
                                </div>
                            </div>
                            <button 
                                type="button" 
                                onClick={() => setIsEditModalOpen(false)} 
                                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', padding: '6px', borderRadius: '50%' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* STEP PROGRESS BAR */}
                        <div style={{ display: 'flex', borderBottom: `1px solid ${THEME.colors.border}`, backgroundColor: '#FFFFFF' }}>
                            {[
                                { step: 1, title: '1. Vigencia & Fechas', desc: 'Plazos de contrato' },
                                { step: 2, title: '2. Lista de Precios', desc: 'Catálogo o Excel' },
                                { step: 3, title: '3. Confirmación', desc: 'Validación de cambios' },
                            ].map(s => {
                                const isCurrent = editStep === s.step;
                                const isDone = editStep > s.step;
                                return (
                                    <div 
                                        key={s.step} 
                                        style={{ 
                                            flex: 1, 
                                            padding: '0.75rem 1.25rem', 
                                            borderBottom: isCurrent ? `3px solid ${THEME.colors.primary}` : '3px solid transparent',
                                            backgroundColor: isCurrent ? '#F0FDF4' : 'transparent',
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: '10px',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        <div style={{ 
                                            width: '24px', 
                                            height: '24px', 
                                            borderRadius: '50%', 
                                            backgroundColor: isDone ? THEME.colors.primary : isCurrent ? THEME.colors.primaryLight : '#E2E8F0',
                                            color: isDone ? 'white' : isCurrent ? THEME.colors.primary : '#64748B',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '0.75rem',
                                            fontWeight: 'bold'
                                        }}>
                                            {isDone ? <Check size={14} strokeWidth={3} /> : s.step}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.8rem', fontWeight: isCurrent ? 'bold' : '600', color: isCurrent ? THEME.colors.primary : THEME.colors.textMain }}>
                                                {s.title}
                                            </div>
                                            <div style={{ fontSize: '0.68rem', color: THEME.colors.textSecondary }}>
                                                {s.desc}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* STEP CONTENT CONTAINER */}
                        <div style={{ padding: '0 2rem 1.75rem 2rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
                            
                            {/* ================= STEP 1: VIGENCIA & DATES ================= */}
                            {editStep === 1 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingTop: '1.5rem' }}>
                                    {/* Client details card */}
                                    <div style={{ 
                                        backgroundColor: '#F8FAFC', 
                                        border: '1.5px solid #E2E8F0', 
                                        borderRadius: '12px', 
                                        padding: '1.25rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '1rem'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <div style={{ width: '44px', height: '44px', borderRadius: '10px', backgroundColor: '#E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
                                                <Building2 size={22} />
                                            </div>
                                            <div>
                                                <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 'bold', textTransform: 'uppercase' }}>Cliente B2B Vinculado:</span>
                                                <div style={{ fontSize: '1rem', fontWeight: 'bold', color: THEME.colors.textMain, marginTop: '2px' }}>
                                                    {editingAgreement.profiles?.company_name || editingAgreement.client_name}
                                                </div>
                                                {editingAgreement.profiles?.nit && (
                                                    <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '2px' }}>
                                                        NIT: {editingAgreement.profiles.nit} {editingAgreement.profiles?.phone ? `• Tel: ${editingAgreement.profiles.phone}` : ''}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <span style={{ fontSize: '0.75rem', padding: '4px 10px', borderRadius: '20px', backgroundColor: '#E0F2FE', color: '#0369A1', fontWeight: 'bold' }}>
                                            Acuerdo Registrado
                                        </span>
                                    </div>

                                    {/* Date and Duration Controls */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '1.25rem' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }}>
                                                Fecha de Inicio del Acuerdo:
                                            </label>
                                            <div style={{ position: 'relative' }}>
                                                <Calendar size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                                                <input 
                                                    type="date" 
                                                    required
                                                    value={editStartDate} 
                                                    onChange={(e) => setEditStartDate(e.target.value)}
                                                    style={{ 
                                                        width: '100%', 
                                                        padding: '12px 12px 12px 38px', 
                                                        borderRadius: '10px', 
                                                        border: `1.5px solid ${THEME.colors.border}`,
                                                        fontSize: '0.9rem',
                                                        fontWeight: 'bold',
                                                        color: THEME.colors.textMain,
                                                        outline: 'none'
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }}>
                                                Duración de la Vigencia:
                                            </label>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <input 
                                                    type="number" 
                                                    min="1" 
                                                    required
                                                    value={editDurationValue}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        if (val === '') {
                                                            setEditDurationValue('');
                                                        } else {
                                                            const parsed = parseInt(val, 10);
                                                            setEditDurationValue(isNaN(parsed) ? '' : Math.max(1, parsed));
                                                        }
                                                    }}
                                                    onBlur={() => {
                                                        if (!editDurationValue || Number(editDurationValue) < 1) {
                                                            setEditDurationValue(1);
                                                        }
                                                    }}
                                                    style={{ 
                                                        width: '90px', 
                                                        padding: '12px', 
                                                        borderRadius: '10px', 
                                                        border: `1.5px solid ${THEME.colors.border}`,
                                                        fontSize: '0.9rem',
                                                        fontWeight: 'bold',
                                                        color: THEME.colors.textMain,
                                                        textAlign: 'center',
                                                        outline: 'none'
                                                    }}
                                                />
                                                <select
                                                    value={editDurationUnit}
                                                    onChange={(e) => setEditDurationUnit(e.target.value)}
                                                    style={{
                                                        flex: 1,
                                                        padding: '12px',
                                                        borderRadius: '10px',
                                                        border: `1.5px solid ${THEME.colors.border}`,
                                                        fontSize: '0.9rem',
                                                        fontWeight: 'bold',
                                                        color: THEME.colors.textMain,
                                                        backgroundColor: 'white'
                                                    }}
                                                >
                                                    <option value="days">Días</option>
                                                    <option value="weeks">Semanas</option>
                                                    <option value="months">Meses</option>
                                                    <option value="years">Años</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Dynamic Expiration Card */}
                                    {(() => {
                                        const numEditDuration = Math.max(1, Number(editDurationValue) || 1);
                                        const expiry = new Date(editStartDate + 'T12:00:00');
                                        if (editDurationUnit === 'days') {
                                            expiry.setDate(expiry.getDate() + numEditDuration);
                                        } else if (editDurationUnit === 'weeks') {
                                            expiry.setDate(expiry.getDate() + numEditDuration * 7);
                                        } else if (editDurationUnit === 'months') {
                                            expiry.setMonth(expiry.getMonth() + numEditDuration);
                                        } else if (editDurationUnit === 'years') {
                                            expiry.setFullYear(expiry.getFullYear() + numEditDuration);
                                        }
                                        const formattedExpiry = expiry.toLocaleDateString('es-CO', {
                                            weekday: 'long',
                                            day: 'numeric',
                                            month: 'long',
                                            year: 'numeric'
                                        });
                                        return (
                                            <div style={{ 
                                                padding: '14px 18px', 
                                                backgroundColor: '#EFF6FF', 
                                                border: '1.5px solid #BFDBFE', 
                                                borderRadius: '10px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '12px'
                                            }}>
                                                <Calendar size={22} color="#2563EB" />
                                                <div>
                                                    <span style={{ fontSize: '0.75rem', color: '#1E40AF', fontWeight: 'bold', display: 'block', textTransform: 'uppercase' }}>Vigencia Calculada:</span>
                                                    <strong style={{ color: '#1E3A8A', fontSize: '0.95rem', textTransform: 'capitalize' }}>
                                                        Vence el {formattedExpiry}
                                                    </strong>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}

                            {/* ================= STEP 2: PRICE LIST & EXCEL UPLOAD ================= */}
                            {editStep === 2 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingTop: '1.5rem' }}>
                                    {/* Toolbar */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                                        <div>
                                            <h4 style={{ margin: '0 0 2px', fontSize: '0.9rem', color: THEME.colors.textMain, fontWeight: '700' }}>
                                                Paso 2: Actualización de Precios Acordados (Opcional)
                                            </h4>
                                            <p style={{ margin: 0, fontSize: '0.75rem', color: THEME.colors.textSecondary }}>
                                                Puedes mantener la lista de precios actual o subir un archivo Excel para reemplazarla completamente.
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={downloadTemplate}
                                            style={{
                                                padding: '0.5rem 1rem',
                                                borderRadius: '8px',
                                                border: `1.5px solid ${THEME.colors.primary}`,
                                                backgroundColor: THEME.colors.primaryLight,
                                                color: THEME.colors.primary,
                                                fontSize: '0.8rem',
                                                fontWeight: 'bold',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px'
                                            }}
                                        >
                                            <Download size={14} /> Descargar Plantilla Oficial (.xlsx)
                                        </button>
                                    </div>

                                    {/* Excel Dropzone */}
                                    <div style={{
                                        border: `2px dashed ${editParsedFile ? THEME.colors.primary : '#CBD5E1'}`,
                                        backgroundColor: editParsedFile ? '#F0FDF4' : '#F8FAFC',
                                        borderRadius: '12px',
                                        padding: editParsedFile ? '1rem 1.5rem' : '1.75rem',
                                        textAlign: 'center',
                                        cursor: 'pointer',
                                        position: 'relative',
                                        transition: 'all 0.2s'
                                    }}>
                                        <input 
                                            type="file" 
                                            accept=".xlsx, .xls"
                                            onChange={handleEditFileUpload}
                                            style={{
                                                position: 'absolute',
                                                inset: 0,
                                                opacity: 0,
                                                cursor: 'pointer'
                                            }}
                                        />
                                        <UploadCloud size={editParsedFile ? 26 : 34} style={{ color: editParsedFile ? THEME.colors.primary : '#94A3B8', margin: '0 auto 6px auto' }} />
                                        {editParsedFile ? (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ textAlign: 'left' }}>
                                                    <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <FileText size={16} color={THEME.colors.primary} /> {editParsedFile.name}
                                                    </div>
                                                    <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, marginTop: '2px' }}>
                                                        Tamaño: {Math.round(editParsedFile.size / 1024)} KB — Haz clic o arrastra otro archivo para reemplazarlo
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontSize: '0.75rem', padding: '4px 10px', borderRadius: '20px', backgroundColor: '#DCFCE7', color: '#166534', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                        <Check size={13} strokeWidth={2.5} /> Archivo Analizado
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            e.preventDefault();
                                                            setEditParsedFile(null);
                                                            setEditUploadedItems([]);
                                                            setEditExcelPreviewData(null);
                                                        }}
                                                        style={{
                                                            background: 'none',
                                                            border: 'none',
                                                            color: '#EF4444',
                                                            cursor: 'pointer',
                                                            padding: '4px'
                                                        }}
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div>
                                                <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: THEME.colors.textMain }}>
                                                    Arrastra y suelta un nuevo archivo Excel aquí para reemplazar tarifas
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, marginTop: '4px' }}>
                                                    Dejar en blanco para conservar los precios actualmente acordados
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* If NO file uploaded, show info card & shortcut to partial adenda */}
                                    {!editExcelPreviewData && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            <div style={{ 
                                                padding: '0.85rem 1.15rem', 
                                                backgroundColor: '#F0FDF4', 
                                                border: '1.5px solid #BBF7D0', 
                                                borderRadius: '10px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '12px'
                                            }}>
                                                <CheckCircle2 size={20} color="#16A34A" style={{ flexShrink: 0 }} />
                                                <div>
                                                    <strong style={{ color: '#166534', fontSize: '0.82rem', display: 'block' }}>
                                                        Conservando precios vigentes del acuerdo
                                                    </strong>
                                                    <span style={{ fontSize: '0.74rem', color: '#15803D' }}>
                                                        No has cargado ningún Excel, por lo que se mantendrán intactos los precios acordados actuales y solo se actualizará la vigencia.
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Acceso Directo a Modificación Parcial / Adenda */}
                                            <div style={{
                                                padding: '0.85rem 1.15rem',
                                                backgroundColor: '#F8FAFC',
                                                border: '1.5px solid #CBD5E1',
                                                borderRadius: '10px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: '12px',
                                                flexWrap: 'wrap'
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '240px' }}>
                                                    <ClipboardList size={22} color="#0D7A57" style={{ flexShrink: 0 }} />
                                                    <div>
                                                        <strong style={{ color: '#1E293B', fontSize: '0.82rem', display: 'block' }}>
                                                            ¿Solo necesitas modificar algunos precios puntuales por cosecha / consumo?
                                                        </strong>
                                                        <span style={{ fontSize: '0.74rem', color: '#64748B' }}>
                                                            No requieres subir un Excel completo. Abre el asistente para modificar únicamente los productos con variación y enviar la notificación comparativa al cliente.
                                                        </span>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={async () => {
                                                        if (editingAgreement) {
                                                            const target = editingAgreement;
                                                            setIsEditModalOpen(false);
                                                            await handleViewPrices(target);
                                                            handleOpenPartialBatchModal();
                                                        }
                                                    }}
                                                    style={{
                                                        padding: '8px 14px',
                                                        backgroundColor: '#0D7A57',
                                                        color: 'white',
                                                        border: 'none',
                                                        borderRadius: '8px',
                                                        fontSize: '0.78rem',
                                                        fontWeight: 'bold',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        whiteSpace: 'nowrap',
                                                        boxShadow: '0 2px 6px rgba(13, 122, 87, 0.25)'
                                                    }}
                                                >
                                                    <ClipboardList size={14} /> Abrir Asistente de Adenda Parcial
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* PREVIEW & PRE-VALIDATION SECTION (When File Uploaded) */}
                                    {editExcelPreviewData && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '4px' }}>
                                             {/* Header with Collapsible Toggle */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontSize: '0.78rem', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                    Resumen de Validación y Tarifas
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => setIsEditKpiCollapsed(!isEditKpiCollapsed)}
                                                    style={{
                                                        backgroundColor: isEditKpiCollapsed ? '#E0F2FE' : '#F1F5F9',
                                                        border: `1px solid ${isEditKpiCollapsed ? '#BAE6FD' : '#CBD5E1'}`,
                                                        borderRadius: '6px',
                                                        padding: '4px 10px',
                                                        color: isEditKpiCollapsed ? '#0369A1' : '#475569',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 'bold',
                                                        cursor: 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        transition: 'all 0.15s ease'
                                                    }}
                                                >
                                                    {isEditKpiCollapsed ? (
                                                        <><ChevronDown size={14} /> Mostrar Métricas Detalladas</>
                                                    ) : (
                                                        <><ChevronUp size={14} /> Colapsar para más espacio</>
                                                    )}
                                                </button>
                                            </div>

                                            {/* Poka-Yoke Alert Banner for Inactive SKUs */}
                                            {editExcelPreviewData.inactiveCount > 0 && (
                                                <div style={{
                                                    padding: '8px 14px',
                                                    backgroundColor: '#FFFBEB',
                                                    border: '1.5px solid #FDE68A',
                                                    borderRadius: '8px',
                                                    fontSize: '0.78rem',
                                                    color: '#92400E',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '10px'
                                                }}>
                                                    <AlertTriangle size={18} color="#D97706" style={{ flexShrink: 0 }} />
                                                    <div>
                                                        <strong>Alerta Poka-Yoke ({editExcelPreviewData.inactiveCount} SKUs inactivos en catálogo):</strong> Estos productos coinciden pero están desactivados en la base de datos. Al guardar la edición, el sistema te solicitará confirmación para <em>reactivarlos automáticamente</em> y así poder usarlos en pedidos.
                                                    </div>
                                                </div>
                                            )}

                                            {/* KPI Section: Full Cards OR Compact Summary Strip */}
                                            {!isEditKpiCollapsed ? (
                                                <div style={{ display: 'grid', gridTemplateColumns: editExcelPreviewData.inactiveCount > 0 ? 'repeat(5, 1fr)' : 'repeat(4, 1fr)', gap: '10px' }}>
                                                    <div style={{ backgroundColor: '#F8FAFC', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                                        <span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 'bold', textTransform: 'uppercase' }}>Total Filas Excel</span>
                                                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: THEME.colors.textMain, marginTop: '2px' }}>
                                                            {editExcelPreviewData.items.length}
                                                        </div>
                                                    </div>
                                                    <div style={{ backgroundColor: '#F0FDF4', padding: '10px 14px', borderRadius: '8px', border: '1px solid #BBF7D0' }}>
                                                        <span style={{ fontSize: '0.68rem', color: '#166534', fontWeight: 'bold', textTransform: 'uppercase' }}>En Catálogo (OK)</span>
                                                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#16A34A', marginTop: '2px' }}>
                                                            {editExcelPreviewData.matchedCount}
                                                        </div>
                                                    </div>
                                                    {editExcelPreviewData.inactiveCount > 0 && (
                                                        <div style={{ backgroundColor: '#FFFBEB', padding: '10px 14px', borderRadius: '8px', border: '1px solid #FDE68A' }}>
                                                            <span style={{ fontSize: '0.68rem', color: '#B45309', fontWeight: 'bold', textTransform: 'uppercase' }}>Inactivos Catálogo</span>
                                                            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#D97706', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <AlertTriangle size={15} /> {editExcelPreviewData.inactiveCount}
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div style={{ backgroundColor: editExcelPreviewData.unmatchedCount > 0 ? '#FEF2F2' : '#F8FAFC', padding: '10px 14px', borderRadius: '8px', border: `1px solid ${editExcelPreviewData.unmatchedCount > 0 ? '#FECACA' : '#E2E8F0'}` }}>
                                                        <span style={{ fontSize: '0.68rem', color: editExcelPreviewData.unmatchedCount > 0 ? '#991B1B' : '#64748B', fontWeight: 'bold', textTransform: 'uppercase' }}>No Reconocidos</span>
                                                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: editExcelPreviewData.unmatchedCount > 0 ? '#DC2626' : '#64748B', marginTop: '2px' }}>
                                                            {editExcelPreviewData.unmatchedCount}
                                                        </div>
                                                    </div>
                                                    <div style={{ backgroundColor: '#EFF6FF', padding: '10px 14px', borderRadius: '8px', border: '1px solid #BFDBFE' }}>
                                                        <span style={{ fontSize: '0.68rem', color: '#1E40AF', fontWeight: 'bold', textTransform: 'uppercase' }}>Margen Promedio</span>
                                                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: editExcelPreviewData.avgMargin >= 50 ? '#059669' : editExcelPreviewData.avgMargin >= 20 ? '#D97706' : '#DC2626', marginTop: '2px' }}>
                                                            {editExcelPreviewData.avgMargin}%
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div style={{ 
                                                    display: 'flex', 
                                                    alignItems: 'center', 
                                                    justifyContent: 'space-between',
                                                    padding: '8px 14px', 
                                                    backgroundColor: '#F8FAFC', 
                                                    borderRadius: '8px', 
                                                    border: '1px solid #E2E8F0',
                                                    fontSize: '0.8rem'
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                                        <span><strong>{editExcelPreviewData.items.length}</strong> Filas</span>
                                                        <span style={{ color: '#166534', fontWeight: 'bold' }}>{editExcelPreviewData.matchedCount} En Catálogo</span>
                                                        {editExcelPreviewData.inactiveCount > 0 && (
                                                            <span style={{ color: '#D97706', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <AlertTriangle size={13} color="#D97706" /> {editExcelPreviewData.inactiveCount} Inactivos
                                                            </span>
                                                        )}
                                                        {editExcelPreviewData.unmatchedCount > 0 ? (
                                                            <span style={{ color: '#DC2626', fontWeight: 'bold' }}><AlertTriangle size={13} color="#DC2626" /> {editExcelPreviewData.unmatchedCount} No Reconocidos</span>
                                                        ) : (
                                                            <span style={{ color: '#64748B' }}>0 No reconocidos</span>
                                                        )}
                                                        <span>Margen Prom.: <strong style={{ color: editExcelPreviewData.avgMargin >= 50 ? '#059669' : editExcelPreviewData.avgMargin >= 20 ? '#D97706' : '#DC2626' }}>{editExcelPreviewData.avgMargin}%</strong></span>
                                                    </div>
                                                    <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                                        (Vista compacta activada)
                                                    </span>
                                                </div>
                                            )}

                                            {/* Preview Search & Filter toolbar - Sticky Docked Line 1 */}
                                            <div style={{ 
                                                display: 'flex', 
                                                justifyContent: 'space-between', 
                                                alignItems: 'center', 
                                                gap: '12px', 
                                                backgroundColor: '#FFFFFF', 
                                                padding: '8px 12px', 
                                                borderRadius: '8px 8px 0 0', 
                                                border: '1px solid #CBD5E1', 
                                                borderBottom: 'none',
                                                position: 'sticky',
                                                top: 0,
                                                zIndex: 40,
                                                minHeight: '48px',
                                                boxSizing: 'border-box',
                                                boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
                                            }}>
                                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                    {(['all', 'matched', 'unmatched', 'inactive'] as const).map(flt => {
                                                        if (flt === 'inactive' && (!editExcelPreviewData.inactiveCount || editExcelPreviewData.inactiveCount === 0)) return null;
                                                        return (
                                                            <button
                                                                key={flt}
                                                                type="button"
                                                                onClick={() => setEditExcelPreviewFilter(flt)}
                                                                style={{
                                                                    padding: '5px 12px',
                                                                    borderRadius: '6px',
                                                                    border: 'none',
                                                                    fontSize: '0.75rem',
                                                                    fontWeight: 'bold',
                                                                    cursor: 'pointer',
                                                                    backgroundColor: editExcelPreviewFilter === flt ? (flt === 'inactive' ? '#D97706' : THEME.colors.primary) : '#E2E8F0',
                                                                    color: editExcelPreviewFilter === flt ? 'white' : '#475569',
                                                                    transition: 'all 0.15s ease'
                                                                }}
                                                            >
                                                                {flt === 'all' && `Todos (${editExcelPreviewData.items.length})`}
                                                                {flt === 'matched' && `Reconocidos (${editExcelPreviewData.matchedCount})`}
                                                                {flt === 'unmatched' && `No Reconocidos (${editExcelPreviewData.unmatchedCount})`}
                                                                {flt === 'inactive' && `Inactivos (${editExcelPreviewData.inactiveCount})`}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                                <GalleryOmnibox
                                                    value={editExcelPreviewSearch}
                                                    onChange={setEditExcelPreviewSearch}
                                                    placeholder="Buscar producto, #ID contable, SKU o coincidencia..."
                                                    filteredCount={editExcelPreviewData.items.filter(item => {
                                                        if (editExcelPreviewFilter === 'matched' && !item.matched_product) return false;
                                                        if (editExcelPreviewFilter === 'unmatched' && item.matched_product) return false;
                                                        if (editExcelPreviewFilter === 'inactive' && (!item.matched_product || !item.is_inactive)) return false;
                                                        if (!editExcelPreviewSearch.trim()) return true;
                                                        return matchesUniversalSearch(
                                                            [
                                                                item.accounting_id,
                                                                item.product_name,
                                                                item.matched_product?.name,
                                                                item.matched_product?.accounting_id,
                                                                item.matched_product?.sku
                                                            ],
                                                            editExcelPreviewSearch
                                                        );
                                                    }).length}
                                                    totalCount={editExcelPreviewData.items.length}
                                                    style={{ flex: '1 1 300px', maxWidth: '420px' }}
                                                />
                                            </div>

                                            {/* Preview Table with Expanded Height and Sticky Headers */}
                                            <div style={{ 
                                                border: '1px solid #CBD5E1', 
                                                borderRadius: '0 0 8px 8px', 
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                                                position: 'relative',
                                                backgroundColor: '#FFFFFF',
                                                overflow: 'visible'
                                            }}>
                                                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left', fontSize: '0.8rem' }}>
                                                    <thead style={{ position: 'sticky', top: '48px', zIndex: 30 }}>
                                                        <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid #CBD5E1' }}>
                                                            <th style={{ position: 'sticky', top: '48px', zIndex: 30, padding: '10px 12px', fontWeight: 'bold', color: '#475569', backgroundColor: '#F8FAFC', borderBottom: '2px solid #CBD5E1', width: '12%' }}>Accounting ID</th>
                                                            <th style={{ position: 'sticky', top: '48px', zIndex: 30, padding: '10px 12px', fontWeight: 'bold', color: '#475569', backgroundColor: '#F8FAFC', borderBottom: '2px solid #CBD5E1', width: '28%' }}>Producto en Archivo</th>
                                                            <th style={{ position: 'sticky', top: '48px', zIndex: 30, padding: '10px 12px', fontWeight: 'bold', color: '#475569', backgroundColor: '#F8FAFC', borderBottom: '2px solid #CBD5E1', width: '28%' }}>Match en Catálogo</th>
                                                            <th style={{ position: 'sticky', top: '48px', zIndex: 30, padding: '10px 12px', fontWeight: 'bold', color: '#475569', textAlign: 'right', backgroundColor: '#F8FAFC', borderBottom: '2px solid #CBD5E1', width: '12%' }}>Costo Base FruFresco</th>
                                                            <th style={{ position: 'sticky', top: '48px', zIndex: 30, padding: '10px 12px', fontWeight: 'bold', color: '#475569', textAlign: 'right', backgroundColor: '#F8FAFC', borderBottom: '2px solid #CBD5E1', width: '12%' }}>Precio Acordado</th>
                                                            <th style={{ position: 'sticky', top: '48px', zIndex: 30, padding: '10px 12px', fontWeight: 'bold', color: '#475569', textAlign: 'center', backgroundColor: '#F8FAFC', borderBottom: '2px solid #CBD5E1', width: '8%' }}>Margen %</th>
                                                            <th style={{ position: 'sticky', top: '48px', zIndex: 30, padding: '10px 12px', fontWeight: 'bold', color: '#475569', textAlign: 'center', backgroundColor: '#F8FAFC', borderBottom: '2px solid #CBD5E1', width: '10%' }}>Estado</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {editExcelPreviewData.items
                                                            .filter(item => {
                                                                if (editExcelPreviewFilter === 'matched' && !item.matched_product) return false;
                                                                if (editExcelPreviewFilter === 'unmatched' && item.matched_product) return false;
                                                                if (editExcelPreviewFilter === 'inactive' && (!item.matched_product || !item.is_inactive)) return false;
                                                                if (!editExcelPreviewSearch.trim()) return true;
                                                                const q = editExcelPreviewSearch.toLowerCase().trim();
                                                                return (
                                                                    item.accounting_id.toLowerCase().includes(q) ||
                                                                    item.product_name.toLowerCase().includes(q) ||
                                                                    (item.matched_product?.name || '').toLowerCase().includes(q)
                                                                );
                                                            })
                                                            .map((item, idx) => (
                                                                <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: !item.matched_product ? '#FFF1F2' : item.is_inactive ? '#FFFBEB' : idx % 2 === 0 ? 'white' : '#FAFAFA' }}>
                                                                    <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontWeight: 'bold', color: '#334155' }}>
                                                                        {item.accounting_id}
                                                                    </td>
                                                                    <td style={{ padding: '6px 10px', color: '#1E293B' }}>
                                                                        {item.product_name || '---'}
                                                                    </td>
                                                                    <td style={{ padding: '6px 10px' }}>
                                                                        {item.matched_product ? (
                                                                            <span style={{ color: '#166534', fontWeight: '600' }}>
                                                                                {item.matched_product.name}
                                                                            </span>
                                                                        ) : (
                                                                            <span style={{ color: '#DC2626', fontWeight: 'bold', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                                <AlertCircle size={13} /> No encontrado en Catálogo
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                    <td style={{ padding: '6px 10px', textAlign: 'right', color: '#64748B' }}>
                                                                        {item.matched_product ? formatMoney(item.cost_basis || 0) : '---'}
                                                                    </td>
                                                                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 'bold', color: '#0F172A' }}>
                                                                        {formatMoney(item.unit_price)}
                                                                    </td>
                                                                    <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                                                                        {item.matched_product ? (
                                                                            <span style={{
                                                                                fontWeight: 'bold',
                                                                                color: (item.margin_percent || 0) >= 50 ? '#16A34A' : (item.margin_percent || 0) >= 20 ? '#D97706' : '#DC2626'
                                                                            }}>
                                                                                {(item.margin_percent || 0)}%
                                                                            </span>
                                                                        ) : '---'}
                                                                    </td>
                                                                    <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                                                                        {item.matched_product ? (
                                                                            item.is_inactive ? (
                                                                                <span 
                                                                                    title="Producto INACTIVO en catálogo maestro"
                                                                                    style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '12px', backgroundColor: '#FEF3C7', color: '#B45309', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                                                                >
                                                                                    <AlertTriangle size={11} /> Inactivo
                                                                                </span>
                                                                            ) : (
                                                                                <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '12px', backgroundColor: '#DCFCE7', color: '#166534', fontWeight: 'bold' }}>
                                                                                    OK
                                                                                </span>
                                                                            )
                                                                        ) : (
                                                                            <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '12px', backgroundColor: '#FEE2E2', color: '#991B1B', fontWeight: 'bold' }}>
                                                                                Falta SKU
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ================= STEP 3: SECURITY CONFIRMATION ================= */}
                            {editStep === 3 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', alignItems: 'center', textAlign: 'center', padding: '1rem 0', paddingTop: '1.5rem' }}>
                                    <div style={{ backgroundColor: '#FEF3C7', padding: '16px', borderRadius: '50%', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <AlertTriangle size={44} strokeWidth={2.2} />
                                    </div>
                                    
                                    <div style={{ maxWidth: '600px' }}>
                                        <h4 style={{ margin: '0 0 6px 0', fontSize: '1.2rem', fontWeight: '900', color: '#92400E' }}>
                                            Confirmación de Modificación de Acuerdo
                                        </h4>
                                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#6B7280', lineHeight: '1.5' }}>
                                            Estás a punto de aplicar modificaciones sobre el acuerdo <strong style={{ color: '#111827' }}>{formatAgreementNumber(editingAgreement.quote_number, editingAgreement.created_at)}</strong> para <strong style={{ color: '#111827' }}>{editingAgreement.profiles?.company_name || editingAgreement.client_name}</strong>.
                                        </p>
                                    </div>

                                    {/* Summary of changes */}
                                    <div style={{ width: '100%', maxWidth: '600px', backgroundColor: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '12px', padding: '1.25rem', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                            <span style={{ color: '#64748B' }}>Fecha Inicio:</span>
                                            <strong>{editStartDate ? new Date(editStartDate + 'T12:00:00').toLocaleDateString('es-CO') : '---'}</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                            <span style={{ color: '#64748B' }}>Duración Contractual:</span>
                                            <strong>{editDurationValue || 1} {editDurationUnit === 'days' ? 'Días' : editDurationUnit === 'weeks' ? 'Semanas' : editDurationUnit === 'months' ? 'Meses' : 'Años'}</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                            <span style={{ color: '#64748B' }}>Actualización de Precios:</span>
                                            <strong>
                                                {editUploadedItems.length > 0 ? (
                                                    <span style={{ color: THEME.colors.primary }}>Reemplazar con {editUploadedItems.length} productos de Excel</span>
                                                ) : (
                                                    <span style={{ color: '#64748B' }}>Conservar precios congelados actuales</span>
                                                )}
                                            </strong>
                                        </div>
                                    </div>

                                    {/* Safety Checkbox */}
                                    <label style={{ 
                                        display: 'flex', 
                                        alignItems: 'flex-start', 
                                        gap: '12px', 
                                        textAlign: 'left', 
                                        padding: '14px 18px', 
                                        backgroundColor: '#FFFBEB', 
                                        border: '1.5px solid #FCD34D', 
                                        borderRadius: '10px',
                                        cursor: 'pointer',
                                        width: '100%',
                                        maxWidth: '600px'
                                    }}>
                                        <input 
                                            type="checkbox"
                                            checked={editConfirmationChecked}
                                            onChange={(e) => setEditConfirmationChecked(e.target.checked)}
                                            style={{ marginTop: '3px', width: '18px', height: '18px', cursor: 'pointer', accentColor: '#D97706' }}
                                        />
                                        <span style={{ fontSize: '0.8rem', color: '#92400E', lineHeight: '1.4', fontWeight: 'bold' }}>
                                            Confirmo que he validado la vigencia y las tarifas con el cliente B2B y el área comercial, y autorizo la actualización de este acuerdo en el sistema.
                                        </span>
                                    </label>
                                </div>
                            )}

                        </div>

                        {/* Modal Footer with Stepper Controls */}
                        <div style={{ 
                            padding: '1rem 1.75rem', 
                            borderTop: `1px solid ${THEME.colors.border}`, 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            backgroundColor: '#F8FAFC'
                        }}>
                            <div>
                                {editStep > 1 ? (
                                    <button 
                                        type="button" 
                                        onClick={() => setEditStep(editStep - 1)} 
                                        style={{ 
                                            padding: '10px 18px', 
                                            borderRadius: THEME.radius.md, 
                                            border: `1px solid ${THEME.colors.borderActive}`, 
                                            backgroundColor: 'white', 
                                            color: '#334155',
                                            fontWeight: 'bold',
                                            fontSize: '0.85rem',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px'
                                        }}
                                    >
                                        <ArrowLeft size={16} /> Anterior
                                    </button>
                                ) : (
                                    <button 
                                        type="button" 
                                        onClick={() => setIsEditModalOpen(false)} 
                                        style={{ 
                                            padding: '10px 18px', 
                                            borderRadius: THEME.radius.md, 
                                            border: `1px solid ${THEME.colors.borderActive}`, 
                                            backgroundColor: 'white', 
                                            color: '#64748B',
                                            fontWeight: 'bold',
                                            fontSize: '0.85rem',
                                            cursor: 'pointer' 
                                        }}
                                    >
                                        Cancelar
                                    </button>
                                )}
                            </div>

                            <div style={{ display: 'flex', gap: '10px' }}>
                                {editStep === 1 && (
                                    <button 
                                        type="button"
                                        onClick={() => setEditStep(2)}
                                        style={{ 
                                            padding: '10px 22px', 
                                            borderRadius: THEME.radius.md, 
                                            border: 'none', 
                                            backgroundColor: THEME.colors.primary, 
                                            color: 'white', 
                                            fontWeight: 'bold',
                                            fontSize: '0.85rem',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            boxShadow: '0 4px 12px rgba(13, 122, 87, 0.25)'
                                        }}
                                    >
                                        Continuar a Precios <ArrowRight size={16} />
                                    </button>
                                )}

                                {editStep === 2 && (
                                    <button 
                                        type="button"
                                        disabled={editExcelPreviewData !== null && editExcelPreviewData.matchedCount === 0}
                                        onClick={() => setEditStep(3)}
                                        style={{ 
                                            padding: '10px 22px', 
                                            borderRadius: THEME.radius.md, 
                                            border: 'none', 
                                            backgroundColor: (editExcelPreviewData !== null && editExcelPreviewData.matchedCount === 0) ? '#CBD5E1' : THEME.colors.primary, 
                                            color: 'white', 
                                            fontWeight: 'bold',
                                            fontSize: '0.85rem',
                                            cursor: (editExcelPreviewData !== null && editExcelPreviewData.matchedCount === 0) ? 'not-allowed' : 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            boxShadow: '0 4px 12px rgba(13, 122, 87, 0.25)'
                                        }}
                                    >
                                        Continuar a Confirmación <ArrowRight size={16} />
                                    </button>
                                )}

                                {editStep === 3 && (
                                    <button 
                                        type="button" 
                                        disabled={!editConfirmationChecked || editSaving}
                                        onClick={handleEditSubmit}
                                        style={{ 
                                            padding: '10px 24px', 
                                            borderRadius: THEME.radius.md, 
                                            border: 'none', 
                                            backgroundColor: (!editConfirmationChecked || editSaving) ? '#CBD5E1' : THEME.colors.primary, 
                                            color: 'white', 
                                            fontWeight: 'bold',
                                            fontSize: '0.85rem',
                                            cursor: (!editConfirmationChecked || editSaving) ? 'not-allowed' : 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            boxShadow: (!editConfirmationChecked || editSaving) ? 'none' : '0 4px 12px rgba(13, 122, 87, 0.25)'
                                        }}
                                    >
                                        {editSaving ? (
                                            <>Guardando Cambios...</>
                                        ) : (
                                            <>
                                                <Check size={16} strokeWidth={2.5} /> Aplicar Modificaciones
                                            </>
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ================= MODAL: SUBIR / CONFIGURAR MODELO INSTITUCIONAL GENERAL ================= */}
            {isUploadMasterModalOpen && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '16px',
                        width: '95%',
                        maxWidth: '920px',
                        maxHeight: '90vh',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                        overflow: 'hidden'
                    }}>
                        {/* Header */}
                        <div style={{ padding: '1.25rem 1.5rem', borderBottom: `1px solid ${THEME.colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ backgroundColor: '#DCFCE7', padding: '8px', borderRadius: '10px', color: '#16A34A', display: 'flex' }}>
                                    <Sparkles size={20} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: THEME.colors.textMain }}>
                                        Modelo Institucional General (Plantilla Maestra de Precios)
                                    </h3>
                                    <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                                        Esta lista sirve de base oficial para aplicar a cualquier cliente institucional respetando sus fechas individuales.
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsUploadMasterModalOpen(false)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', display: 'flex', alignItems: 'center' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Body */}
                        <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            {/* Current Active Info */}
                            {masterTemplate && (
                                <div style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '10px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <span style={{ fontSize: '0.7rem', color: '#166534', fontWeight: 'bold', textTransform: 'uppercase' }}>Modelo Activo en Producción:</span>
                                        <div style={{ fontSize: '0.92rem', fontWeight: 'bold', color: '#14532D', marginTop: '2px' }}>
                                            {masterTemplate.model_snapshot_name || 'Modelo Institucional General'}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '16px', textAlign: 'right' }}>
                                        <div>
                                            <span style={{ fontSize: '0.7rem', color: '#166534', display: 'block' }}>SKUs:</span>
                                            <strong style={{ fontSize: '0.9rem', color: '#14532D' }}>{masterTemplate.items?.length || 0}</strong>
                                        </div>
                                        <div>
                                            <span style={{ fontSize: '0.7rem', color: '#166534', display: 'block' }}>Subtotal Base:</span>
                                            <strong style={{ fontSize: '0.9rem', color: '#14532D' }}>{formatMoney(masterTemplate.subtotal_amount || 0)}</strong>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Template Name Input */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: THEME.colors.textSecondary, marginBottom: '6px', textTransform: 'uppercase' }}>
                                    Nombre o Identificador del Nuevo Modelo:
                                </label>
                                <input
                                    type="text"
                                    value={masterModelName}
                                    onChange={(e) => setMasterModelName(e.target.value)}
                                    placeholder="Ej: Institucional General - Septiembre 2026"
                                    style={{
                                        width: '100%',
                                        padding: '10px 14px',
                                        borderRadius: '8px',
                                        border: `1px solid ${THEME.colors.border}`,
                                        fontSize: '0.88rem',
                                        fontWeight: 'bold',
                                        outline: 'none'
                                    }}
                                />
                            </div>

                            {/* Upload Area */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: THEME.colors.textSecondary, textTransform: 'uppercase' }}>
                                    Cargar Archivo Excel de Precios
                                </span>
                                <button
                                    type="button"
                                    onClick={downloadTemplate}
                                    style={{
                                        padding: '5px 12px',
                                        borderRadius: '6px',
                                        border: '1px solid #CBD5E1',
                                        backgroundColor: '#F8FAFC',
                                        color: '#334155',
                                        fontSize: '0.75rem',
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '5px'
                                    }}
                                >
                                    <Download size={13} /> Descargar Plantilla Oficial (.xlsx)
                                </button>
                            </div>

                            <div style={{
                                border: `2px dashed ${masterParsedFile ? '#16A34A' : '#CBD5E1'}`,
                                backgroundColor: masterParsedFile ? '#F0FDF4' : '#F8FAFC',
                                borderRadius: '12px',
                                padding: masterParsedFile ? '1rem 1.5rem' : '1.5rem',
                                textAlign: 'center',
                                cursor: 'pointer',
                                position: 'relative',
                                transition: 'all 0.2s'
                            }}>
                                <input
                                    type="file"
                                    accept=".xlsx, .xls"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleMasterFileDrop(file);
                                    }}
                                    style={{
                                        position: 'absolute',
                                        inset: 0,
                                        opacity: 0,
                                        cursor: 'pointer'
                                    }}
                                />
                                <UploadCloud size={masterParsedFile ? 28 : 34} style={{ color: masterParsedFile ? '#16A34A' : '#94A3B8', margin: '0 auto 6px auto' }} />
                                {masterParsedFile ? (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ textAlign: 'left' }}>
                                            <div style={{ fontSize: '0.88rem', fontWeight: 'bold', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <FileText size={16} color="#16A34A" /> {masterParsedFile.name}
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
                                                Tamaño: {Math.round(masterParsedFile.size / 1024)} KB — Haz clic para reemplazar
                                            </div>
                                        </div>
                                        <span style={{ fontSize: '0.72rem', padding: '4px 10px', borderRadius: '20px', backgroundColor: '#DCFCE7', color: '#166534', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                            <Check size={13} strokeWidth={2.5} /> Archivo Listo
                                        </span>
                                    </div>
                                ) : (
                                    <div>
                                        <div style={{ fontSize: '0.88rem', fontWeight: 'bold', color: THEME.colors.textMain }}>
                                            Arrastra el archivo Excel con las tarifas institucionales o haz clic aquí
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px' }}>
                                            Requiere: <strong>ID Producto (Accounting ID)</strong> y <strong>Precio Acordado</strong>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Preview & KPI Stats */}
                            {masterExcelPreviewData && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {masterExcelPreviewData.inactiveCount && masterExcelPreviewData.inactiveCount > 0 ? (
                                        <div style={{
                                            padding: '8px 14px',
                                            backgroundColor: '#FFFBEB',
                                            border: '1.5px solid #FDE68A',
                                            borderRadius: '8px',
                                            fontSize: '0.78rem',
                                            color: '#92400E',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px'
                                        }}>
                                            <AlertTriangle size={16} color="#D97706" style={{ flexShrink: 0 }} />
                                            <span><strong>Atención Comercial ({masterExcelPreviewData.inactiveCount} SKUs inactivos):</strong> Al guardar, el sistema te solicitará confirmación para activarlos automáticamente en el catálogo.</span>
                                        </div>
                                    ) : null}

                                    <div style={{ display: 'grid', gridTemplateColumns: (masterExcelPreviewData.inactiveCount && masterExcelPreviewData.inactiveCount > 0) ? 'repeat(5, 1fr)' : 'repeat(4, 1fr)', gap: '10px' }}>
                                        <div style={{ backgroundColor: '#F8FAFC', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                            <span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 'bold', textTransform: 'uppercase' }}>Total Filas</span>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: THEME.colors.textMain, marginTop: '2px' }}>
                                                {masterExcelPreviewData.items.length}
                                            </div>
                                        </div>
                                        <div style={{ backgroundColor: '#F0FDF4', padding: '10px 14px', borderRadius: '8px', border: '1px solid #BBF7D0' }}>
                                            <span style={{ fontSize: '0.68rem', color: '#166534', fontWeight: 'bold', textTransform: 'uppercase' }}>En Catálogo (OK)</span>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#16A34A', marginTop: '2px' }}>
                                                {masterExcelPreviewData.matchedCount}
                                            </div>
                                        </div>
                                        {masterExcelPreviewData.inactiveCount && masterExcelPreviewData.inactiveCount > 0 ? (
                                            <div style={{ backgroundColor: '#FFFBEB', padding: '10px 14px', borderRadius: '8px', border: '1px solid #FDE68A' }}>
                                                <span style={{ fontSize: '0.68rem', color: '#B45309', fontWeight: 'bold', textTransform: 'uppercase' }}>Inactivos Catálogo</span>
                                                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#D97706', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <AlertTriangle size={15} /> {masterExcelPreviewData.inactiveCount}
                                                </div>
                                            </div>
                                        ) : null}
                                        <div style={{ backgroundColor: masterExcelPreviewData.unmatchedCount > 0 ? '#FEF2F2' : '#F8FAFC', padding: '10px 14px', borderRadius: '8px', border: `1px solid ${masterExcelPreviewData.unmatchedCount > 0 ? '#FECACA' : '#E2E8F0'}` }}>
                                            <span style={{ fontSize: '0.68rem', color: masterExcelPreviewData.unmatchedCount > 0 ? '#DC2626' : '#64748B', fontWeight: 'bold', textTransform: 'uppercase' }}>No Coinciden</span>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: masterExcelPreviewData.unmatchedCount > 0 ? '#DC2626' : THEME.colors.textMain, marginTop: '2px' }}>
                                                {masterExcelPreviewData.unmatchedCount}
                                            </div>
                                        </div>
                                        <div style={{ backgroundColor: '#EFF6FF', padding: '10px 14px', borderRadius: '8px', border: '1px solid #BFDBFE' }}>
                                            <span style={{ fontSize: '0.68rem', color: '#1D4ED8', fontWeight: 'bold', textTransform: 'uppercase' }}>Margen Ponderado</span>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#1D4ED8', marginTop: '2px' }}>
                                                {masterExcelPreviewData.avgMargin}%
                                            </div>
                                        </div>
                                    </div>

                                    {/* Preview Table Container */}
                                    <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', maxHeight: '220px', overflowY: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                            <thead style={{ position: 'sticky', top: 0, backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', zIndex: 1 }}>
                                                <tr>
                                                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#64748B' }}>Cod. Contable</th>
                                                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#64748B' }}>Producto Catálogo</th>
                                                    <th style={{ padding: '8px 12px', textAlign: 'right', color: '#64748B' }}>Costo Base</th>
                                                    <th style={{ padding: '8px 12px', textAlign: 'right', color: '#64748B' }}>Precio General</th>
                                                    <th style={{ padding: '8px 12px', textAlign: 'center', color: '#64748B' }}>Margen</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {masterExcelPreviewData.items.slice(0, 50).map((it, idx) => (
                                                    <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: it.is_inactive ? '#FFFBEB' : 'transparent' }}>
                                                        <td style={{ padding: '6px 12px', fontFamily: 'monospace', color: '#475569' }}>{it.accounting_id}</td>
                                                        <td style={{ padding: '6px 12px', fontWeight: '600', color: it.matched_product ? '#1E293B' : '#DC2626' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                                <span>{it.product_name}</span>
                                                                {it.is_inactive && (
                                                                    <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', backgroundColor: '#FEF3C7', color: '#B45309', fontWeight: 'bold' }}>
                                                                        Inactivo
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '6px 12px', textAlign: 'right', color: '#64748B' }}>
                                                            {it.matched_product ? formatMoney(it.cost_basis) : '-'}
                                                        </td>
                                                        <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 'bold', color: '#0F172A' }}>
                                                            {formatMoney(it.unit_price)}
                                                        </td>
                                                        <td style={{ padding: '6px 12px', textAlign: 'center' }}>
                                                            {it.matched_product ? (
                                                                <span style={{
                                                                    fontSize: '0.72rem',
                                                                    padding: '2px 6px',
                                                                    borderRadius: '4px',
                                                                    fontWeight: 'bold',
                                                                    backgroundColor: it.margin_percent >= 50 ? '#ECFDF5' : it.margin_percent >= 20 ? '#FFFBEB' : '#FEF2F2',
                                                                    color: it.margin_percent >= 50 ? '#059669' : it.margin_percent >= 20 ? '#D97706' : '#DC2626'
                                                                }}>
                                                                    {it.margin_percent}%
                                                                </span>
                                                            ) : (
                                                                <span style={{ fontSize: '0.7rem', color: '#DC2626', fontWeight: 'bold' }}>Sin SKU</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div style={{ padding: '1.25rem 1.5rem', borderTop: `1px solid ${THEME.colors.border}`, display: 'flex', justifyContent: 'flex-end', gap: '10px', backgroundColor: '#F8FAFC' }}>
                            <button
                                type="button"
                                onClick={() => setIsUploadMasterModalOpen(false)}
                                style={{
                                    padding: '9px 16px',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1',
                                    backgroundColor: 'white',
                                    color: '#475569',
                                    fontWeight: 'bold',
                                    fontSize: '0.82rem',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                disabled={masterSaving || !masterExcelPreviewData || masterExcelPreviewData.matchedCount === 0}
                                onClick={handleSaveMasterTemplate}
                                style={{
                                    padding: '9px 20px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    backgroundColor: (masterSaving || !masterExcelPreviewData || masterExcelPreviewData.matchedCount === 0) ? '#CBD5E1' : '#16A34A',
                                    color: 'white',
                                    fontWeight: 'bold',
                                    fontSize: '0.82rem',
                                    cursor: (masterSaving || !masterExcelPreviewData || masterExcelPreviewData.matchedCount === 0) ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)'
                                }}
                            >
                                <Sparkles size={15} />
                                {masterSaving ? 'Guardando Modelo...' : 'Guardar como Modelo Institucional Activo'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ================= MODAL DE CONFIRMACIÓN: APLICAR MODELO GENERAL DESDE DRAWER ================= */}
            {confirmApplyMasterTarget && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '16px',
                        width: '95%',
                        maxWidth: '520px',
                        padding: '1.75rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1.25rem',
                        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                            <div style={{ backgroundColor: '#DCFCE7', padding: '12px', borderRadius: '12px', color: '#16A34A', flexShrink: 0 }}>
                                <Sparkles size={26} />
                            </div>
                            <div>
                                <h3 style={{ margin: '0 0 4px', fontSize: '1.1rem', fontWeight: '800', color: THEME.colors.textMain }}>
                                    Cargar Precios del Modelo Institucional General
                                </h3>
                                <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748B', lineHeight: '1.4' }}>
                                    ¿Deseas sincronizar y cargar los precios del Modelo Institucional General activo en el acuerdo comercial de <strong style={{ color: '#0F172A' }}>{confirmApplyMasterTarget.profiles?.company_name || confirmApplyMasterTarget.client_name}</strong>?
                                </p>
                            </div>
                        </div>

                        <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ fontSize: '0.78rem', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Check size={14} color="#16A34A" />
                                <strong>Modelo Activo:</strong> {masterTemplate?.model_snapshot_name || 'Institucional General'} ({masterTemplate?.items?.length || 0} SKUs)
                            </div>
                            <div style={{ fontSize: '0.78rem', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Check size={14} color="#16A34A" />
                                <strong>Vigencia Intacta:</strong> Las fechas de inicio y vencimiento de este cliente no cambiarán.
                            </div>
                            <div style={{ fontSize: '0.78rem', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Check size={14} color="#16A34A" />
                                <strong>Auditoría:</strong> Se registrará el cambio de lista en el historial forense.
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
                            <button
                                type="button"
                                onClick={() => setConfirmApplyMasterTarget(null)}
                                style={{
                                    padding: '9px 16px',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1',
                                    backgroundColor: 'white',
                                    color: '#475569',
                                    fontWeight: 'bold',
                                    fontSize: '0.82rem',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                disabled={Boolean(isApplyingMasterToAgreement)}
                                onClick={() => handleApplyMasterToAgreement(confirmApplyMasterTarget)}
                                style={{
                                    padding: '9px 20px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    backgroundColor: '#16A34A',
                                    color: 'white',
                                    fontWeight: 'bold',
                                    fontSize: '0.82rem',
                                    cursor: isApplyingMasterToAgreement ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)'
                                }}
                            >
                                <Sparkles size={14} />
                                {isApplyingMasterToAgreement ? 'Aplicando Precios...' : 'Sí, Cargar Precios del Modelo'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ================= MODAL: MODIFICACIÓN PARCIAL DE PRECIOS POR COSECHA / CONSUMO (ADENDAS) ================= */}
            {isPartialBatchModalOpen && selectedAgreement && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 2150, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '16px',
                        width: '95%',
                        maxWidth: '980px',
                        maxHeight: '92vh',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
                        border: '1px solid #E2E8F0'
                    }}>
                        {/* Header */}
                        <div style={{
                            backgroundColor: '#0F172A',
                            color: 'white',
                            padding: '1.2rem 1.5rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            borderBottom: '1px solid #1E293B'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{
                                    width: '38px',
                                    height: '38px',
                                    borderRadius: '10px',
                                    backgroundColor: 'rgba(16, 185, 129, 0.2)',
                                    border: '1px solid rgba(16, 185, 129, 0.4)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#34D399'
                                }}>
                                    <ClipboardList size={20} />
                                </div>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900, color: 'white' }}>
                                            Modificación Parcial de Precios por Cosecha / Consumo
                                        </h2>
                                        <span style={{
                                            fontSize: '0.65rem',
                                            fontWeight: 800,
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.5px',
                                            padding: '2px 8px',
                                            borderRadius: '100px',
                                            backgroundColor: '#DCFCE7',
                                            color: '#166534',
                                            border: '1px solid currentColor'
                                        }}>
                                            Adenda Parcial
                                        </span>
                                    </div>
                                    <p style={{ margin: '2px 0 0', fontSize: '0.74rem', color: '#94A3B8' }}>
                                        Cliente: <strong style={{ color: 'white' }}>{selectedAgreement.profiles?.company_name || selectedAgreement.client_name}</strong> • Modifica puntualmente los SKUs con variación y asocia su justificación agronómica.
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsPartialBatchModalOpen(false)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '4px' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Search & Tool Bar */}
                        <div style={{
                            padding: '0.85rem 1.5rem',
                            backgroundColor: '#F8FAFC',
                            borderBottom: '1px solid #E2E8F0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '12px',
                            flexWrap: 'wrap'
                        }}>
                            <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
                                <Search size={15} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                                <input
                                    type="text"
                                    placeholder="Buscar producto a modificar en la lista..."
                                    value={partialBatchSearch}
                                    onChange={(e) => setPartialBatchSearch(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '7px 10px 7px 32px',
                                        borderRadius: '8px',
                                        border: '1px solid #CBD5E1',
                                        fontSize: '0.82rem',
                                        outline: 'none',
                                        backgroundColor: 'white'
                                    }}
                                />
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <button
                                    type="button"
                                    onClick={() => setIsMiniImportOpen(!isMiniImportOpen)}
                                    style={{
                                        padding: '6px 12px',
                                        borderRadius: '8px',
                                        backgroundColor: isMiniImportOpen ? '#0D7A57' : '#FFFFFF',
                                        color: isMiniImportOpen ? 'white' : '#0D7A57',
                                        border: `1.5px solid ${THEME.colors.primary}`,
                                        fontSize: '0.78rem',
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                                    }}
                                    title="Importar archivo Excel pequeño o pegar filas con variaciones de precios"
                                >
                                    <UploadCloud size={14} />
                                    {isMiniImportOpen ? 'Cerrar Importador' : 'Importar Mini-Excel / Pegar'}
                                </button>

                                {(() => {
                                    const modified = partialBatchItems.filter(p => Number(p.newPrice) > 0 && Number(p.newPrice) !== p.oldPrice);
                                    const upCount = partialBatchItems.filter(p => Number(p.newPrice) > p.oldPrice).length;
                                    const downCount = partialBatchItems.filter(p => Number(p.newPrice) > 0 && Number(p.newPrice) < p.oldPrice).length;

                                    return (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                            <span style={{
                                                padding: '4px 10px',
                                                borderRadius: '6px',
                                                backgroundColor: modified.length > 0 ? '#EFF6FF' : '#F1F5F9',
                                                color: modified.length > 0 ? '#1D4ED8' : '#64748B',
                                                border: '1px solid #CBD5E1'
                                            }}>
                                                {modified.length} de {partialBatchItems.length} modificados
                                            </span>
                                            {upCount > 0 && (
                                                <span style={{ padding: '4px 8px', borderRadius: '6px', backgroundColor: '#FEE2E2', color: '#991B1B', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                    <TrendingUp size={12} strokeWidth={2.5} /> {upCount} Sube
                                                </span>
                                            )}
                                            {downCount > 0 && (
                                                <span style={{ padding: '4px 8px', borderRadius: '6px', backgroundColor: '#DCFCE7', color: '#166534', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                    <TrendingDown size={12} strokeWidth={2.5} /> {downCount} Baja
                                                </span>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>

                        {/* Collapsible Mini-Excel & Clipboard Importer Panel */}
                        {isMiniImportOpen && (
                            <div style={{
                                padding: '1rem 1.5rem',
                                backgroundColor: '#F0FDF4',
                                borderBottom: '2px solid #86EFAC',
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                                gap: '1.25rem'
                            }}>
                                {/* Option A: Subir Mini-Excel */}
                                <div style={{ backgroundColor: 'white', padding: '1rem', borderRadius: '10px', border: '1px solid #BBF7D0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#166534', fontWeight: 'bold', fontSize: '0.82rem' }}>
                                        <FileText size={16} color="#16A34A" />
                                        Opción A: Subir Mini-Excel de Novedades (.xlsx)
                                    </div>
                                    <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748B' }}>
                                        Sube un archivo con solo los 5 a 15 productos que cambiaron (Columnas: Producto / Código, Precio Nuevo, Motivo opcional).
                                    </p>
                                    <input
                                        type="file"
                                        accept=".xlsx, .xls"
                                        onChange={handleMiniExcelUpload}
                                        style={{ fontSize: '0.78rem', marginTop: '4px', cursor: 'pointer' }}
                                    />
                                </div>

                                {/* Option B: Pegar desde Portapapeles */}
                                <div style={{ backgroundColor: 'white', padding: '1rem', borderRadius: '10px', border: '1px solid #BBF7D0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#166534', fontWeight: 'bold', fontSize: '0.82rem' }}>
                                        <Sparkles size={16} color="#16A34A" />
                                        Opción B: Pegar Celdas de Excel / Portapapeles
                                    </div>
                                    <textarea
                                        rows={2}
                                        placeholder="Pega filas copiadas de Excel... ej:&#10;Aguacate	10500	Clima y lluvias&#10;Tomate chonto	4800	Pico de cosecha"
                                        value={pasteText}
                                        onChange={(e) => setPasteText(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '6px 8px',
                                            borderRadius: '6px',
                                            border: '1px solid #CBD5E1',
                                            fontSize: '0.72rem',
                                            fontFamily: 'monospace',
                                            outline: 'none',
                                            resize: 'vertical'
                                        }}
                                    />
                                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                        <button
                                            type="button"
                                            disabled={!pasteText.trim()}
                                            onClick={() => handlePasteRowsFromClipboard(pasteText)}
                                            style={{
                                                padding: '5px 12px',
                                                borderRadius: '6px',
                                                backgroundColor: pasteText.trim() ? '#16A34A' : '#CBD5E1',
                                                color: 'white',
                                                border: 'none',
                                                fontSize: '0.74rem',
                                                fontWeight: 'bold',
                                                cursor: pasteText.trim() ? 'pointer' : 'not-allowed'
                                            }}
                                        >
                                            Procesar Texto Pegado
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Bulk Justification 1-Click Applicator Bar */}
                        <div style={{
                            padding: '0.6rem 1.5rem',
                            backgroundColor: '#F8FAFC',
                            borderBottom: '1px solid #E2E8F0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '12px',
                            flexWrap: 'wrap'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '320px' }}>
                                <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#334155', display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}>
                                    <Sparkles size={14} color="#D97706" /> Asignar motivo en lote:
                                </span>
                                <select
                                    value={bulkJustification}
                                    onChange={(e) => setBulkJustification(e.target.value)}
                                    style={{
                                        flex: 1,
                                        padding: '4px 8px',
                                        borderRadius: '6px',
                                        border: '1px solid #CBD5E1',
                                        fontSize: '0.74rem',
                                        backgroundColor: 'white',
                                        color: '#334155'
                                    }}
                                >
                                    <option value="">-- Seleccionar motivo común para todos los modificados --</option>
                                    {SUPPLY_JUSTIFICATION_PRESETS.map((pres, pIdx) => (
                                        <option key={pIdx} value={pres.value === 'CUSTOM' ? '' : pres.value}>{pres.label}</option>
                                    ))}
                                </select>
                                <input
                                    type="text"
                                    placeholder="O motivo personalizado..."
                                    value={bulkJustification}
                                    onChange={(e) => setBulkJustification(e.target.value)}
                                    style={{
                                        maxWidth: '180px',
                                        padding: '4px 8px',
                                        borderRadius: '6px',
                                        border: '1px solid #CBD5E1',
                                        fontSize: '0.74rem',
                                        backgroundColor: 'white',
                                        color: '#334155'
                                    }}
                                />
                            </div>

                            <button
                                type="button"
                                onClick={() => handleApplyBulkJustification()}
                                disabled={!bulkJustification.trim()}
                                style={{
                                    padding: '5px 12px',
                                    borderRadius: '6px',
                                    backgroundColor: bulkJustification.trim() ? '#D97706' : '#E2E8F0',
                                    color: bulkJustification.trim() ? 'white' : '#94A3B8',
                                    border: 'none',
                                    fontSize: '0.74rem',
                                    fontWeight: 'bold',
                                    cursor: bulkJustification.trim() ? 'pointer' : 'not-allowed',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    whiteSpace: 'nowrap'
                                }}
                                title="Aplica esta justificación a todas las filas con precio modificado"
                            >
                                <Sparkles size={13} />
                                Aplicar a todos los modificados
                            </button>
                        </div>

                        {/* Informational Guidance Notice */}
                        <div style={{
                            padding: '0.55rem 1.5rem',
                            backgroundColor: '#F0FDF4',
                            borderBottom: '1px solid #BBF7D0',
                            fontSize: '0.73rem',
                            color: '#166534',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            <Info size={14} color="#16A34A" style={{ flexShrink: 0 }} />
                            <span>
                                <strong>Flujo Automatizado:</strong> Al presionar <em>"Aplicar Adenda y Despachar Notificación"</em>, se actualizarán los precios en el acuerdo, se registrará la auditoría forense y se abrirá el despachador de correo con la <strong>tabla comparativa de 5 columnas</strong> lista para enviar.
                            </span>
                        </div>

                        {/* Items Table */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', textAlign: 'left' }}>
                                <thead style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', position: 'sticky', top: 0, zIndex: 10, color: '#475569', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 800 }}>
                                    <tr>
                                        <th style={{ padding: '10px 14px' }}>Producto</th>
                                        <th style={{ padding: '10px 10px', textAlign: 'center' }}>Presentación</th>
                                        <th style={{ padding: '10px 10px', textAlign: 'right' }}>Costo Base</th>
                                        <th style={{ padding: '10px 10px', textAlign: 'right' }}>Precio Pactado Actual</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'right', width: '140px' }}>Nuevo Precio COP</th>
                                        <th style={{ padding: '10px 10px', textAlign: 'center' }}>Variación</th>
                                        <th style={{ padding: '10px 14px', textAlign: 'left', minWidth: '220px' }}>Justificación Abastecimiento</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(() => {
                                        const filtered = partialBatchItems.filter(p => {
                                            if (!partialBatchSearch.trim()) return true;
                                            return p.name.toLowerCase().includes(partialBatchSearch.toLowerCase().trim());
                                        });

                                        if (filtered.length === 0) {
                                            return (
                                                <tr>
                                                    <td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: '#94A3B8' }}>
                                                        No se encontraron productos coincidentes con "{partialBatchSearch}".
                                                    </td>
                                                </tr>
                                            );
                                        }

                                        return filtered.map((item, idx) => {
                                            const numNew = Number(item.newPrice);
                                            const hasChanged = !isNaN(numNew) && numNew > 0 && numNew !== item.oldPrice;
                                            const diff = hasChanged ? numNew - item.oldPrice : 0;
                                            const margin = numNew > 0 ? Math.round(((numNew - item.costBasis) / numNew) * 100) : 0;
                                            const rowBg = hasChanged ? '#FEF9C3' : (idx % 2 === 0 ? '#FFFFFF' : '#F8FAF9');

                                            return (
                                                <tr key={item.itemId} style={{ backgroundColor: rowBg, borderBottom: '1px solid #F1F5F9', transition: 'background-color 0.15s ease' }}>
                                                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#1E293B' }}>
                                                        {item.name}
                                                    </td>
                                                    <td style={{ padding: '10px 10px', textAlign: 'center', color: '#64748B' }}>
                                                        {item.unit}
                                                    </td>
                                                    <td style={{ padding: '10px 10px', textAlign: 'right', color: '#64748B', fontVariantNumeric: 'tabular-nums' }}>
                                                        ${formatNumber(item.costBasis)}
                                                    </td>
                                                    <td style={{ padding: '10px 10px', textAlign: 'right', color: hasChanged ? '#94A3B8' : '#334155', textDecoration: hasChanged ? 'line-through' : 'none', fontVariantNumeric: 'tabular-nums' }}>
                                                        ${formatNumber(item.oldPrice)}
                                                    </td>
                                                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <span style={{ fontSize: '0.75rem', color: '#64748B' }}>$</span>
                                                                <input
                                                                    type="number"
                                                                    min="1"
                                                                    step="1"
                                                                    value={item.newPrice}
                                                                    onChange={(e) => {
                                                                        const val = e.target.value;
                                                                        setPartialBatchItems(prev => prev.map(p => p.itemId === item.itemId ? { ...p, newPrice: val } : p));
                                                                    }}
                                                                    style={{
                                                                        width: '95px',
                                                                        padding: '4px 6px',
                                                                        borderRadius: '6px',
                                                                        border: hasChanged ? '2px solid #0D7A57' : '1px solid #CBD5E1',
                                                                        fontSize: '0.84rem',
                                                                        fontWeight: 'bold',
                                                                        textAlign: 'right',
                                                                        color: hasChanged ? '#0D7A57' : '#1E293B',
                                                                        backgroundColor: 'white',
                                                                        outline: 'none'
                                                                    }}
                                                                />
                                                            </div>
                                                            {numNew > 0 && (
                                                                <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: margin >= 50 ? '#059669' : (margin >= 20 ? '#D97706' : '#DC2626') }}>
                                                                    Margen: {margin}%
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '10px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                        {hasChanged ? (
                                                            <span style={{
                                                                padding: '3px 8px',
                                                                borderRadius: '100px',
                                                                fontSize: '0.7rem',
                                                                fontWeight: 800,
                                                                backgroundColor: diff > 0 ? '#FEE2E2' : '#DCFCE7',
                                                                color: diff > 0 ? '#991B1B' : '#166534',
                                                                border: diff > 0 ? '1px solid #FCA5A5' : '1px solid #86EFAC'
                                                            }}>
                                                                {diff > 0 ? (
                                                                <>
                                                                    <TrendingUp size={12} strokeWidth={2.5} /> Sube +${formatNumber(diff)}
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <TrendingDown size={12} strokeWidth={2.5} /> Baja -${formatNumber(Math.abs(diff))}
                                                                </>
                                                            )}
                                                            </span>
                                                        ) : (
                                                            <span style={{ color: '#94A3B8', fontSize: '0.72rem' }}>Sin cambio</span>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '8px 14px' }}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                            <select
                                                                value={item.justification}
                                                                onChange={(e) => {
                                                                    const val = e.target.value;
                                                                    setPartialBatchItems(prev => prev.map(p => p.itemId === item.itemId ? { ...p, justification: val } : p));
                                                                }}
                                                                style={{
                                                                    width: '100%',
                                                                    padding: '4px 6px',
                                                                    borderRadius: '6px',
                                                                    border: '1px solid #CBD5E1',
                                                                    fontSize: '0.72rem',
                                                                    backgroundColor: 'white',
                                                                    color: '#334155'
                                                                }}
                                                            >
                                                                <option value="">-- Seleccionar Justificación --</option>
                                                                {SUPPLY_JUSTIFICATION_PRESETS.map((pres, pIdx) => (
                                                                    <option key={pIdx} value={pres.value === 'CUSTOM' ? '' : pres.value}>{pres.label}</option>
                                                                ))}
                                                            </select>
                                                            <input
                                                                type="text"
                                                                placeholder="O escribe motivo personalizado..."
                                                                value={item.justification}
                                                                onChange={(e) => {
                                                                    const val = e.target.value;
                                                                    setPartialBatchItems(prev => prev.map(p => p.itemId === item.itemId ? { ...p, justification: val } : p));
                                                                }}
                                                                style={{
                                                                    width: '100%',
                                                                    padding: '3px 6px',
                                                                    borderRadius: '4px',
                                                                    border: '1px solid #E2E8F0',
                                                                    fontSize: '0.7rem',
                                                                    color: '#475569',
                                                                    backgroundColor: '#FAFAFA'
                                                                }}
                                                            />
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        });
                                    })()}
                                </tbody>
                            </table>
                        </div>

                        {/* Footer */}
                        <div style={{
                            padding: '1rem 1.5rem',
                            backgroundColor: '#F8FAFC',
                            borderTop: '1px solid #E2E8F0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '12px'
                        }}>
                            {(() => {
                                const modified = partialBatchItems.filter(p => Number(p.newPrice) > 0 && Number(p.newPrice) !== p.oldPrice);
                                return (
                                    <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                                        {modified.length === 0 ? (
                                            <span style={{ color: '#94A3B8' }}>Edita los precios deseados arriba para habilitar la aplicación de la adenda.</span>
                                        ) : (
                                            <span>
                                                Se aplicará adenda con <strong>{modified.length} {modified.length === 1 ? 'producto modificado' : 'productos modificados'}</strong>.
                                            </span>
                                        )}
                                    </div>
                                );
                            })()}

                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button
                                    type="button"
                                    onClick={() => setIsPartialBatchModalOpen(false)}
                                    disabled={isSavingPartialBatch}
                                    style={{
                                        padding: '9px 16px',
                                        borderRadius: '8px',
                                        border: '1px solid #CBD5E1',
                                        backgroundColor: 'white',
                                        color: '#475569',
                                        fontWeight: 'bold',
                                        fontSize: '0.82rem',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    disabled={isSavingPartialBatch || partialBatchItems.filter(p => Number(p.newPrice) > 0 && Number(p.newPrice) !== p.oldPrice).length === 0}
                                    onClick={handleSavePartialBatch}
                                    style={{
                                        padding: '9px 20px',
                                        borderRadius: '8px',
                                        border: 'none',
                                        backgroundColor: '#0D7A57',
                                        color: 'white',
                                        fontWeight: 'bold',
                                        fontSize: '0.82rem',
                                        cursor: isSavingPartialBatch || partialBatchItems.filter(p => Number(p.newPrice) > 0 && Number(p.newPrice) !== p.oldPrice).length === 0 ? 'not-allowed' : 'pointer',
                                        opacity: partialBatchItems.filter(p => Number(p.newPrice) > 0 && Number(p.newPrice) !== p.oldPrice).length === 0 ? 0.6 : 1,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        boxShadow: '0 4px 12px rgba(13, 122, 87, 0.25)'
                                    }}
                                >
                                    {isSavingPartialBatch ? (
                                        <>
                                            <RefreshCw size={15} className="animate-spin" />
                                            Guardando Adenda...
                                        </>
                                    ) : (
                                        <>
                                            <Send size={15} />
                                            Aplicar Adenda y Despachar Notificación (Diff)
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* IN-SITU QUICK PRODUCT CREATION MODAL */}
            {isQuickProductModalOpen && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: 'rgba(15, 23, 42, 0.65)',
                    backdropFilter: 'blur(5px)',
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '1rem'
                }}>
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '16px',
                        width: '100%',
                        maxWidth: '520px',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                        overflow: 'hidden',
                        border: '1px solid #E2E8F0',
                        animation: 'slideUp 0.2s ease-out'
                    }}>
                        <div style={{
                            padding: '1.25rem 1.5rem',
                            borderBottom: '1px solid #E2E8F0',
                            backgroundColor: '#F8FAFC',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '8px',
                                    backgroundColor: '#DCFCE7',
                                    color: '#15803D',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <Plus size={18} strokeWidth={2.5} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: '800', color: '#0F172A' }}>
                                        Crear Nuevo Producto en Catálogo Maestro
                                    </h3>
                                    <p style={{ margin: 0, fontSize: '0.74rem', color: '#64748B' }}>
                                        Se registrará en la base de datos y se vinculará a esta fila de forma inmediata.
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsQuickProductModalOpen(false)}
                                style={{
                                    backgroundColor: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: '#94A3B8',
                                    padding: '4px',
                                    borderRadius: '6px'
                                }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>
                                    Nombre Oficial del Producto *
                                </label>
                                <input 
                                    type="text"
                                    value={quickProductName}
                                    onChange={(e) => setQuickProductName(e.target.value)}
                                    placeholder="Ej. Aguacate Hass Extra"
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        borderRadius: '8px',
                                        border: '1.5px solid #CBD5E1',
                                        fontSize: '0.85rem',
                                        fontWeight: '600',
                                        outline: 'none'
                                    }}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>
                                        Unidad de Medida *
                                    </label>
                                    <select
                                        value={quickProductUnit}
                                        onChange={(e) => setQuickProductUnit(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '8px 10px',
                                            borderRadius: '8px',
                                            border: '1.5px solid #CBD5E1',
                                            fontSize: '0.82rem',
                                            backgroundColor: 'white',
                                            outline: 'none'
                                        }}
                                    >
                                        <option value="Kg">Kilogramo (Kg)</option>
                                        <option value="Und">Unidad (Und)</option>
                                        <option value="Bolsa">Bolsa</option>
                                        <option value="Atado">Atado</option>
                                        <option value="Canastilla">Canastilla</option>
                                        <option value="Gramos">Gramos (g)</option>
                                        <option value="Litro">Litro (Lt)</option>
                                    </select>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>
                                        Categoría *
                                    </label>
                                    <select
                                        value={quickProductCategory}
                                        onChange={(e) => setQuickProductCategory(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '8px 10px',
                                            borderRadius: '8px',
                                            border: '1.5px solid #CBD5E1',
                                            fontSize: '0.82rem',
                                            backgroundColor: 'white',
                                            outline: 'none'
                                        }}
                                    >
                                        <option value="FR">Frutas (FR)</option>
                                        <option value="VE">Verduras (VE)</option>
                                        <option value="LA">Lácteos (LA)</option>
                                        <option value="AB">Abarrotes (AB)</option>
                                        <option value="CA">Carnes (CA)</option>
                                        <option value="PR">Procesados (PR)</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>
                                        Costo Base Estimado (COP)
                                    </label>
                                    <input 
                                        type="text"
                                        value={quickProductCostBasis}
                                        onChange={(e) => setQuickProductCostBasis(e.target.value)}
                                        placeholder="Ej. 3500"
                                        style={{
                                            width: '100%',
                                            padding: '8px 12px',
                                            borderRadius: '8px',
                                            border: '1.5px solid #CBD5E1',
                                            fontSize: '0.85rem',
                                            outline: 'none'
                                        }}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>
                                        Tarifa IVA (%)
                                    </label>
                                    <select
                                        value={quickProductIvaRate}
                                        onChange={(e) => setQuickProductIvaRate(Number(e.target.value))}
                                        style={{
                                            width: '100%',
                                            padding: '8px 10px',
                                            borderRadius: '8px',
                                            border: '1.5px solid #CBD5E1',
                                            fontSize: '0.82rem',
                                            backgroundColor: 'white',
                                            outline: 'none'
                                        }}
                                    >
                                        <option value={0}>0% (Exento / Agropecuario)</option>
                                        <option value={5}>5% (Bienes Especiales)</option>
                                        <option value={19}>19% (Tarifa General)</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div style={{
                            padding: '1rem 1.5rem',
                            borderTop: '1px solid #E2E8F0',
                            backgroundColor: '#F8FAFC',
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: '10px'
                        }}>
                            <button
                                type="button"
                                onClick={() => setIsQuickProductModalOpen(false)}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1',
                                    backgroundColor: 'white',
                                    color: '#64748B',
                                    fontWeight: 'bold',
                                    fontSize: '0.82rem',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveQuickProduct}
                                disabled={isCreatingQuickProduct || !quickProductName.trim()}
                                style={{
                                    padding: '8px 18px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    backgroundColor: !quickProductName.trim() || isCreatingQuickProduct ? '#CBD5E1' : '#0D7A57',
                                    color: 'white',
                                    fontWeight: 'bold',
                                    fontSize: '0.82rem',
                                    cursor: !quickProductName.trim() || isCreatingQuickProduct ? 'not-allowed' : 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: '0 4px 12px rgba(13, 122, 87, 0.25)'
                                }}
                            >
                                {isCreatingQuickProduct ? (
                                    <><Loader2 size={14} className="animate-spin" /> Creando...</>
                                ) : (
                                    <><Check size={14} strokeWidth={2.5} /> Crear y Asignar a Fila</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL GESTIÓN DE CLIENTES / SEDES VINCULADAS EN CALIENTE A LISTA MAESTRA */}
            {isLinkedClientsModalOpen && managingSharedAgreement && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: 'rgba(15, 23, 42, 0.65)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 2500,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '1.5rem'
                }}>
                    <div style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '16px',
                        width: '100%',
                        maxWidth: '750px',
                        maxHeight: '90vh',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                        overflow: 'hidden',
                        border: '1px solid #E2E8F0',
                        animation: 'slideUp 0.25s ease'
                    }}>
                        {/* Modal Header */}
                        <div style={{
                            padding: '1.25rem 1.75rem',
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
                                        fontSize: '0.72rem', 
                                        fontWeight: '800',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}>
                                        <Sparkles size={12} /> LISTA MAESTRA COMPARTIDA
                                    </span>
                                    <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0F172A', fontWeight: '800' }}>
                                        Gestionar Clientes y Sedes Vinculadas
                                    </h3>
                                </div>
                                <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                                    Acuerdo central: <strong style={{ color: '#0D7A57' }}>{managingSharedAgreement.model_snapshot_name || managingSharedAgreement.client_name || 'Lista Maestra'}</strong>
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsLinkedClientsModalOpen(false)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', display: 'flex', alignItems: 'center', padding: '6px' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div style={{ padding: '1.25rem 1.75rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
                            {/* Explanatory Banner */}
                            <div style={{
                                backgroundColor: '#F0FDF4',
                                border: '1.5px solid #86EFAC',
                                borderRadius: '10px',
                                padding: '0.85rem 1rem',
                                display: 'flex',
                                gap: '10px',
                                alignItems: 'center'
                            }}>
                                <Info size={20} color="#16A34A" style={{ flexShrink: 0 }} />
                                <div style={{ fontSize: '0.8rem', color: '#166534', lineHeight: '1.4' }}>
                                    <strong>Efecto Cascada en Vivo:</strong> Cualquier cambio de precio en esta lista maestra impactará automáticamente a todas las sedes marcadas abajo al cotizar y facturar.
                                </div>
                            </div>

                            {/* Controls: Search and Select All */}
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ position: 'relative', flex: 1 }}>
                                    <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                                    <input 
                                        type="text"
                                        placeholder="Filtrar clientes o sucursales por nombre o NIT..."
                                        value={linkedClientsSearch}
                                        onChange={(e) => setLinkedClientsSearch(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '8px 12px 8px 36px',
                                            borderRadius: '8px',
                                            border: '1.5px solid #CBD5E1',
                                            fontSize: '0.82rem',
                                            outline: 'none'
                                        }}
                                    />
                                </div>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const allIds = b2bClients.map(c => c.id);
                                            setEditableLinkedClientIds(allIds);
                                        }}
                                        style={{ background: 'none', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '6px 10px', fontSize: '0.72rem', fontWeight: 'bold', color: THEME.colors.primary, cursor: 'pointer' }}
                                    >
                                        Marcar Todos
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setEditableLinkedClientIds([])}
                                        style={{ background: 'none', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '6px 10px', fontSize: '0.72rem', fontWeight: 'bold', color: '#64748B', cursor: 'pointer' }}
                                    >
                                        Desmarcar
                                    </button>
                                </div>
                            </div>

                            {/* Client List */}
                            <div style={{
                                maxHeight: '340px',
                                overflowY: 'auto',
                                border: '1.5px solid #E2E8F0',
                                borderRadius: '10px',
                                backgroundColor: '#FFFFFF',
                                display: 'flex',
                                flexDirection: 'column'
                            }}>
                                {(() => {
                                    const filtered = b2bClients.filter(c => {
                                        if (!linkedClientsSearch.trim()) return true;
                                        const q = linkedClientsSearch.toLowerCase();
                                        return (c.company_name?.toLowerCase().includes(q)) ||
                                               (c.nit?.toLowerCase().includes(q)) ||
                                               (c.contact_name?.toLowerCase().includes(q)) ||
                                               (c.parentName?.toLowerCase().includes(q));
                                    });

                                    if (filtered.length === 0) {
                                        return (
                                            <div style={{ padding: '2rem', textAlign: 'center', color: '#64748B', fontSize: '0.85rem' }}>
                                                No se encontraron clientes ni sucursales con "{linkedClientsSearch}"
                                            </div>
                                        );
                                    }

                                    return filtered.map(c => {
                                        const isChecked = editableLinkedClientIds.includes(c.id);
                                        const isSucursal = Boolean(c.parent_id);

                                        return (
                                            <div
                                                key={c.id}
                                                onClick={() => {
                                                    setEditableLinkedClientIds(prev =>
                                                        prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id]
                                                    );
                                                }}
                                                style={{
                                                    padding: '10px 14px',
                                                    borderBottom: '1px solid #F1F5F9',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    backgroundColor: isChecked ? '#F0FDF4' : 'transparent',
                                                    transition: 'background 0.15s'
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    {isChecked ? (
                                                        <CheckSquare size={18} color="#0D7A57" strokeWidth={2.5} />
                                                    ) : (
                                                        <Square size={18} color="#94A3B8" />
                                                    )}
                                                    <div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#1E293B' }}>
                                                                {c.company_name}
                                                            </span>
                                                            {isSucursal ? (
                                                                <span style={{ fontSize: '0.65rem', backgroundColor: '#E0F2FE', color: '#0284C7', padding: '1px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                                                                    Sucursal
                                                                </span>
                                                            ) : (
                                                                <span style={{ fontSize: '0.65rem', backgroundColor: '#F5F3FF', color: '#6D28D9', padding: '1px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                                                                    Casa Matriz
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div style={{ fontSize: '0.7rem', color: '#64748B', display: 'flex', gap: '8px', marginTop: '2px' }}>
                                                            {c.nit && <span>NIT: {c.nit}</span>}
                                                            {isSucursal && c.parentName && <span>• Dependiente de: <strong>{c.parentName}</strong></span>}
                                                            {!isSucursal && c.branchCount > 0 && <span>• {c.branchCount} {c.branchCount === 1 ? 'sucursal' : 'sucursales'}</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                                {isChecked && (
                                                    <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: '12px', backgroundColor: '#DCFCE7', color: '#15803D', fontWeight: 'bold' }}>
                                                        Vinculado
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    });
                                })()}
                            </div>

                            {/* Summary Badge */}
                            <div style={{
                                padding: '8px 14px',
                                borderRadius: '8px',
                                backgroundColor: editableLinkedClientIds.length > 0 ? '#F0FDF4' : '#FFFBEB',
                                border: `1px solid ${editableLinkedClientIds.length > 0 ? '#BBF7D0' : '#FDE68A'}`,
                                fontSize: '0.78rem',
                                fontWeight: '600',
                                color: editableLinkedClientIds.length > 0 ? '#15803D' : '#92400E',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between'
                            }}>
                                <span>
                                    {editableLinkedClientIds.length > 0
                                        ? `✓ ${editableLinkedClientIds.length} clientes/sucursales recibirán los precios de este acuerdo central`
                                        : 'Sin clientes vinculados. Marca al menos uno para activar el efecto cascada.'}
                                </span>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div style={{
                            padding: '1rem 1.75rem',
                            borderTop: '1px solid #E2E8F0',
                            backgroundColor: '#F8FAFC',
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: '10px'
                        }}>
                            <button
                                type="button"
                                onClick={() => setIsLinkedClientsModalOpen(false)}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1',
                                    backgroundColor: 'white',
                                    color: '#64748B',
                                    fontWeight: 'bold',
                                    fontSize: '0.82rem',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveLinkedClients}
                                disabled={savingLinkedClients}
                                style={{
                                    padding: '8px 20px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    backgroundColor: savingLinkedClients ? '#CBD5E1' : '#0D7A57',
                                    color: 'white',
                                    fontWeight: 'bold',
                                    fontSize: '0.82rem',
                                    cursor: savingLinkedClients ? 'not-allowed' : 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: '0 4px 12px rgba(13, 122, 87, 0.25)'
                                }}
                            >
                                {savingLinkedClients ? (
                                    <><Loader2 size={14} className="animate-spin" /> Guardando Vinculaciones...</>
                                ) : (
                                    <><Check size={14} strokeWidth={2.5} /> Guardar Vinculaciones en Cascada</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* TOAST NOTIFICATION */}
            {toast && (
                <div style={{ 
                    position: 'fixed', 
                    bottom: '24px', 
                    right: '24px', 
                    backgroundColor: toast.type === 'success' ? '#0D7A57' : toast.type === 'warning' ? '#D97706' : toast.type === 'info' ? '#2563EB' : '#EF4444', 
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
                    {toast.type === 'success' ? <Check size={16} /> : toast.type === 'warning' ? <AlertTriangle size={16} /> : toast.type === 'info' ? <Info size={16} /> : <X size={16} />}
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

function LocalKPICard({ title, value, icon, color, textColor, subtitle }: { title: string, value: number | string, icon: React.ReactNode, color: string, textColor: string, subtitle: string }) {
    return (
        <div style={{
            backgroundColor: 'white',
            padding: '1.5rem',
            borderRadius: THEME.radius.lg,
            boxShadow: THEME.shadow.sm,
            display: 'flex',
            alignItems: 'center',
            gap: '1.5rem',
            border: `1px solid ${THEME.colors.border}`,
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            cursor: 'default',
            fontFamily: THEME.typography.fontFamilySecondary
        }} onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = THEME.shadow.lg;
        }} onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = THEME.shadow.sm;
        }}>
            <div style={{ backgroundColor: color, width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: textColor, flexShrink: 0 }}>
                {icon}
            </div>
            <div>
                <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05rem', fontFamily: THEME.typography.fontFamilyMain }}>{title}</div>
                <div style={{ fontSize: '1.3rem', fontWeight: '700', color: THEME.colors.textMain, margin: '0.2rem 0', lineHeight: 1.1 }}>{value}</div>
                <div style={{ fontSize: '0.75rem', color: '#94A3B8', fontWeight: '500' }}>{subtitle}</div>
            </div>
        </div>
    );
}
