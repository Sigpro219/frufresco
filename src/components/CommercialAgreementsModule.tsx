'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { THEME, formatMoney, formatNumber } from '@/lib/adminTheme';
import { 
    Search, 
    Calendar, 
    Clock, 
    AlertCircle, 
    AlertTriangle,
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
    Building2, 
    FileText,
    Plus,
    HelpCircle,
    Info,
    UploadCloud,
    Download,
    Trash2,
    Edit3
} from 'lucide-react';
import * as XLSX from 'xlsx';

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
    const [sortColumn, setSortColumn] = useState<'quote_number' | 'client_name' | 'model' | 'valid_until' | 'duration' | 'status' | 'margin'>('valid_until');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
    const [modelFilter, setModelFilter] = useState<string>('all');
    
    // Details Drawer State
    const [selectedAgreement, setSelectedAgreement] = useState<Agreement | null>(null);
    const [agreementItems, setAgreementItems] = useState<AgreementItem[]>([]);
    const [loadingItems, setLoadingItems] = useState(false);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [drawerSearchTerm, setDrawerSearchTerm] = useState('');

    // Renewal Modal State
    const [renewTarget, setRenewTarget] = useState<Agreement | null>(null);
    const [newExpiryDate, setNewExpiryDate] = useState('');
    const [renewing, setRenewing] = useState(false);

    // Create Modal State
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [createStep, setCreateStep] = useState<1 | 2 | 3>(1);
    const [b2bClients, setB2bClients] = useState<any[]>([]);
    const [selectedClientId, setSelectedClientId] = useState('');
    const [clientSearchQuery, setClientSearchQuery] = useState('');
    const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
    const [focusedOptionIndex, setFocusedOptionIndex] = useState(0);
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [durationValue, setDurationValue] = useState<number>(2);
    const [durationUnit, setDurationUnit] = useState<string>('weeks');
    const [uploadedItems, setUploadedItems] = useState<{ accounting_id: string; unit_price: number; product_name?: string }[]>([]);
    const [excelPreviewData, setExcelPreviewData] = useState<{
        items: Array<{
            accounting_id: string;
            product_name: string;
            unit_price: number;
            matched_product: any | null;
            cost_basis: number;
            margin_percent: number;
            iva_rate: number;
        }>;
        matchedCount: number;
        unmatchedCount: number;
        avgMargin: number;
        totalSubtotal: number;
    } | null>(null);
    const [excelPreviewSearch, setExcelPreviewSearch] = useState('');
    const [excelPreviewFilter, setExcelPreviewFilter] = useState<'all' | 'matched' | 'unmatched'>('all');
    const [parsedFile, setParsedFile] = useState<File | null>(null);
    const [parsing, setParsing] = useState(false);
    const [savingAgreement, setSavingAgreement] = useState(false);
    const [isKpiCollapsed, setIsKpiCollapsed] = useState(false);
    const [isMainKpiCollapsed, setIsMainKpiCollapsed] = useState(false);

    // Edit Modal State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingAgreement, setEditingAgreement] = useState<Agreement | null>(null);
    const [editStartDate, setEditStartDate] = useState('');
    const [editDurationValue, setEditDurationValue] = useState<number>(2);
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
        }>;
        matchedCount: number;
        unmatchedCount: number;
        avgMargin: number;
        totalSubtotal: number;
    } | null>(null);
    const [editExcelPreviewSearch, setEditExcelPreviewSearch] = useState('');
    const [editExcelPreviewFilter, setEditExcelPreviewFilter] = useState<'all' | 'matched' | 'unmatched'>('all');
    const [editParsedFile, setEditParsedFile] = useState<File | null>(null);
    const [editParsing, setEditParsing] = useState(false);
    const [editSaving, setEditSaving] = useState(false);
    const [editStep, setEditStep] = useState<number>(1);
    const [editConfirmationChecked, setEditConfirmationChecked] = useState(false);
    const [isEditKpiCollapsed, setIsEditKpiCollapsed] = useState(false);

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
                .select('*, profiles:client_id (company_name, contact_name, nit, phone, address), items:quote_items(margin_percent)')
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

    const fetchB2bClients = async () => {
        try {
            // Fetch all b2b_client profiles to compute branch relations and isolate true Casas Matrices
            const { data, error } = await supabase
                .from('profiles')
                .select('id, company_name, contact_name, nit, parent_id, is_corporate_parent, address, phone')
                .eq('role', 'b2b_client')
                .order('company_name');

            if (error) throw error;

            const allProfiles = data || [];
            
            // Map branch counts for each parent_id
            const branchCounts: Record<string, number> = {};
            allProfiles.forEach(p => {
                if (p.parent_id) {
                    branchCounts[p.parent_id] = (branchCounts[p.parent_id] || 0) + 1;
                }
            });

            // Filter STRICTLY for legitimate Casas Matrices (must have is_corporate_parent=true and parent_id=null)
            const verifiedCasasMatrices = allProfiles
                .filter(p => !p.parent_id && p.is_corporate_parent === true)
                .map(p => ({
                    ...p,
                    branchCount: branchCounts[p.id] || 0
                }));

            setB2bClients(verifiedCasasMatrices);
        } catch (err: any) {
            console.error('Error fetching B2B clients:', err);
        }
    };

    const fetchAllProductsMap = async (): Promise<Record<string, any>> => {
        const productMap: Record<string, any> = {};

        // 1. Fetch official active costs from commercial_cost_matrix
        const { data: costMatrixData, error: matrixErr } = await supabase
            .from('commercial_cost_matrix')
            .select('product_id, manual_cost');

        if (matrixErr) {
            console.error('Error fetching commercial_cost_matrix:', matrixErr);
        }

        const costMatrixMap: Record<string, number> = {};
        (costMatrixData || []).forEach(r => {
            if (r.manual_cost !== null && r.manual_cost !== undefined) {
                costMatrixMap[r.product_id] = r.manual_cost;
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
                .select('id, name, base_price, accounting_id, iva_rate, unit_of_measure, sku')
                .range(from, to);

            if (error) {
                console.error('Error fetching paginated products:', error);
                throw error;
            }

            if (data && data.length > 0) {
                data.forEach(p => {
                    // Use official Costo Base FruFresco from commercial_cost_matrix if defined
                    const officialCost = costMatrixMap[p.id] ?? p.base_price ?? 0;
                    p.base_price = officialCost;
                    p.cost_basis = officialCost;

                    if (p.accounting_id !== null && p.accounting_id !== undefined) {
                        const rawId = String(p.accounting_id).trim();
                        productMap[rawId] = p;
                        const numId = parseInt(rawId, 10);
                        if (!isNaN(numId)) {
                            productMap[String(numId)] = p;
                        }
                    }
                    if (p.sku) {
                        productMap[p.sku.trim()] = p;
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

    useEffect(() => {
        fetchAgreements();
        fetchB2bClients();
    }, []);

    const handleOpenCreateModal = () => {
        setSelectedClientId('');
        setClientSearchQuery('');
        setCreateStep(1);
        setStartDate(new Date().toISOString().split('T')[0]);
        setDurationValue(2);
        setDurationUnit('weeks');
        setUploadedItems([]);
        setExcelPreviewData(null);
        setExcelPreviewSearch('');
        setExcelPreviewFilter('all');
        setParsedFile(null);
        setFocusedOptionIndex(0);
        setIsCreateModalOpen(true);
    };

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

    const downloadTemplate = async () => {
        try {
            const rows = [
                {
                    'ID Producto (Cod. Contable)': '',
                    'Nombre del Producto': '',
                    'Precio Acordado': ''
                }
            ];
            
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

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        setParsedFile(file);
        setParsing(true);
        
        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                
                const rawRows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
                if (rawRows.length === 0) {
                    throw new Error('El archivo está vacío');
                }
                
                const headers = Object.keys(rawRows[0]);
                const idCol = headers.find(h => /idProducto|id_producto|accounting_id|cod.*contable|codigo|código|id/i.test(h));
                const priceCol = headers.find(h => /precio|price|acordado|neto/i.test(h));
                const nameCol = headers.find(h => /nombre|producto/i.test(h)) || '';
                
                if (!idCol || !priceCol) {
                    throw new Error('No se encontraron las columnas Código de producto y Precio acordado');
                }
                
                const parsedItems: any[] = [];
                rawRows.forEach((row) => {
                    const idVal = String(row[idCol] || '').trim();
                    const priceVal = parseFloat(String(row[priceCol] || '').replace(/[^0-9.-]/g, ''));
                    const nameVal = nameCol ? String(row[nameCol] || '') : '';
                    
                    if (idVal && !isNaN(priceVal)) {
                        parsedItems.push({
                            accounting_id: idVal,
                            unit_price: priceVal,
                            product_name: nameVal
                        });
                    }
                });
                
                if (parsedItems.length === 0) {
                    throw new Error('No se encontraron filas válidas con Código y Precio');
                }

                // Query full database catalogue with pagination to pre-validate matches and margins in real time
                const productMap = await fetchAllProductsMap();

                let matchCount = 0;
                let unmatchedCount = 0;
                let totalMarginSum = 0;
                let totalSubtotal = 0;

                const enrichedItems = parsedItems.map(item => {
                    const matched = productMap[String(item.accounting_id).trim()];
                    if (matched) {
                        matchCount++;
                        const costBasis = matched.base_price || 0;
                        const margin = item.unit_price > 0 
                            ? Math.round(((item.unit_price - costBasis) / item.unit_price) * 10000) / 100 
                            : 0;
                        totalMarginSum += margin;
                        totalSubtotal += item.unit_price;

                        return {
                            accounting_id: item.accounting_id,
                            product_name: item.product_name || matched.name,
                            unit_price: item.unit_price,
                            matched_product: matched,
                            cost_basis: costBasis,
                            margin_percent: margin,
                            iva_rate: matched.iva_rate || 0
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

                setUploadedItems(parsedItems);
                setExcelPreviewData({
                    items: enrichedItems,
                    matchedCount: matchCount,
                    unmatchedCount: unmatchedCount,
                    avgMargin: Math.round(avgMargin * 10) / 10,
                    totalSubtotal
                });

                showToast(`Excel procesado: ${matchCount} reconocidos, ${unmatchedCount} no reconocidos`, matchCount > 0 ? 'success' : 'error');
            } catch (err: any) {
                console.error(err);
                showToast('Error al leer Excel: ' + err.message, 'error');
                setParsedFile(null);
                setUploadedItems([]);
                setExcelPreviewData(null);
            } finally {
                setParsing(false);
            }
        };
        reader.readAsBinaryString(file);
    };

    const handleCreateAgreementSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedClientId) {
            showToast('Por favor, selecciona un cliente', 'error');
            return;
        }
        if (uploadedItems.length === 0) {
            showToast('Por favor, carga un archivo Excel con precios', 'error');
            return;
        }
        
        setSavingAgreement(true);
        try {
            const client = b2bClients.find(c => c.id === selectedClientId);
            if (!client) throw new Error('Cliente no encontrado');
            
            const expiry = new Date(startDate + 'T12:00:00');
            if (durationUnit === 'days') {
                expiry.setDate(expiry.getDate() + durationValue);
            } else if (durationUnit === 'weeks') {
                expiry.setDate(expiry.getDate() + durationValue * 7);
            } else if (durationUnit === 'months') {
                expiry.setMonth(expiry.getMonth() + durationValue);
            } else if (durationUnit === 'years') {
                expiry.setFullYear(expiry.getFullYear() + durationValue);
            }
            const calculatedValidUntil = expiry.toISOString();
            
            // Query full database catalogue with pagination
            const productMap = await fetchAllProductsMap();
            
            const { data: existing, error: existErr } = await supabase
                .from('quotes')
                .select('id')
                .eq('client_id', selectedClientId)
                .eq('status', 'agreement');
                
            if (existErr) throw existErr;
            
            if (existing && existing.length > 0) {
                const quoteIds = existing.map(q => q.id);
                // Mark previous agreements as expired instead of deleting them to preserve history
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                await supabase.from('quotes')
                    .update({ 
                        status: 'expired', 
                        valid_until: yesterday.toISOString().split('T')[0] 
                    })
                    .in('id', quoteIds);
            }
            
            // Calculate negotiated totals dynamically with actual product IVA rates
            const itemsToInsert: any[] = [];
            let matchCount = 0;
            let subtotal = 0;
            let totalTax = 0;
            
            uploadedItems.forEach(item => {
                const dbProduct = productMap[String(item.accounting_id)];
                if (dbProduct) {
                    matchCount++;
                    const basePrice = dbProduct.base_price || 0;
                    const negotiatedPrice = item.unit_price;
                    const marginPercent = negotiatedPrice > 0 ? Math.round(((negotiatedPrice - basePrice) / negotiatedPrice) * 10000) / 100 : 0;
                    
                    const ivaRate = dbProduct.iva_rate || 0;
                    const ivaAmount = negotiatedPrice * (ivaRate / 100);
                    
                    subtotal += negotiatedPrice;
                    totalTax += ivaAmount;
                    
                    itemsToInsert.push({
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
            
            const { data: newQuote, error: insertQErr } = await supabase
                .from('quotes')
                .insert({
                    client_id: selectedClientId,
                    client_name: client.company_name || client.contact_name,
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
            
            if (itemsToInsert.length > 0) {
                // Assign quote_id to items
                const finalItemsToInsert = itemsToInsert.map(item => ({
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
            
            showToast(`Acuerdo creado con éxito. ${matchCount} productos asociados.`, 'success');
            setIsCreateModalOpen(false);
            
            // Reset
            setSelectedClientId('');
            setStartDate(new Date().toISOString().split('T')[0]);
            setDurationValue(2);
            setDurationUnit('weeks');
            setParsedFile(null);
            setUploadedItems([]);
            
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
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                
                const rawRows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
                if (rawRows.length === 0) {
                    throw new Error('El archivo está vacío');
                }
                
                const headers = Object.keys(rawRows[0]);
                const idCol = headers.find(h => /idProducto|id_producto|accounting_id|cod.*contable|codigo|código|id/i.test(h));
                const priceCol = headers.find(h => /precio|price|acordado|neto/i.test(h));
                const nameCol = headers.find(h => /nombre|producto/i.test(h)) || '';
                
                if (!idCol || !priceCol) {
                    throw new Error('No se encontraron las columnas Código de producto y Precio acordado');
                }
                
                const parsedItems: any[] = [];
                let rowCount = 0;
                
                rawRows.forEach((row) => {
                    const idVal = String(row[idCol] || '').trim();
                    const priceVal = parseFloat(String(row[priceCol] || '').replace(/[^0-9.-]/g, ''));
                    const nameVal = nameCol ? String(row[nameCol] || '') : '';
                    
                    if (idVal && !isNaN(priceVal)) {
                        parsedItems.push({
                            accounting_id: idVal,
                            unit_price: priceVal,
                            product_name: nameVal
                        });
                        rowCount++;
                    }
                });
                
                if (parsedItems.length === 0) {
                    throw new Error('No se encontraron filas válidas con Código y Precio');
                }

                // Real-time matching against full paginated products catalogue
                const productMap = await fetchAllProductsMap();

                let matchCount = 0;
                let unmatchedCount = 0;
                let totalMarginSum = 0;
                let totalSubtotal = 0;

                const enrichedItems = parsedItems.map(item => {
                    const matched = productMap[String(item.accounting_id).trim()];
                    if (matched) {
                        matchCount++;
                        const costBasis = matched.base_price || 0;
                        const marginPercent = item.unit_price > 0 ? Math.round(((item.unit_price - costBasis) / item.unit_price) * 10000) / 100 : 0;
                        totalMarginSum += marginPercent;
                        totalSubtotal += item.unit_price;

                        return {
                            accounting_id: item.accounting_id,
                            product_name: item.product_name || matched.name,
                            unit_price: item.unit_price,
                            matched_product: matched,
                            cost_basis: costBasis,
                            margin_percent: marginPercent,
                            iva_rate: matched.iva_rate || 0
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
                    avgMargin: Math.round(avgMargin * 10) / 10,
                    totalSubtotal
                });

                showToast(`Excel procesado: ${matchCount} reconocidos, ${unmatchedCount} no reconocidos`, matchCount > 0 ? 'success' : 'error');
            } catch (err: any) {
                console.error(err);
                showToast('Error al leer Excel: ' + err.message, 'error');
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
            const expiry = new Date(editStartDate + 'T12:00:00');
            if (editDurationUnit === 'days') {
                expiry.setDate(expiry.getDate() + editDurationValue);
            } else if (editDurationUnit === 'weeks') {
                expiry.setDate(expiry.getDate() + editDurationValue * 7);
            } else if (editDurationUnit === 'months') {
                expiry.setMonth(expiry.getMonth() + editDurationValue);
            } else if (editDurationUnit === 'years') {
                expiry.setFullYear(expiry.getFullYear() + editDurationValue);
            }
            const calculatedValidUntil = expiry.toISOString();
            
            // 1. Update the quote record itself
            const { error: updateErr } = await supabase
                .from('quotes')
                .update({
                    start_date: editStartDate ? new Date(editStartDate).toISOString() : new Date().toISOString(),
                    valid_until: calculatedValidUntil
                })
                .eq('id', editingAgreement.id);
                
            if (updateErr) throw updateErr;
            
            // 2. If new excel file uploaded, replace items
            if (editUploadedItems.length > 0) {
                // Query full database catalogue with pagination
                const productMap = await fetchAllProductsMap();
                
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
                    const dbProduct = productMap[String(item.accounting_id)];
                    if (dbProduct) {
                        matchCount++;
                        const basePrice = dbProduct.base_price || 0;
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

    const formatAgreementNumber = (seq: number, dateStr?: string) => {
        const date = dateStr ? new Date(dateStr) : new Date();
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const paddedSeq = String(seq).padStart(4, '0');
        return `ACI ${day}${month} ${paddedSeq}`;
    };

    const filteredB2bClients = b2bClients.filter(c => {
        // Strictly only Casas Matrices (no branches / parent_id is null)
        if (c.parent_id) return false;

        if (!clientSearchQuery.trim()) return true;
        const query = clientSearchQuery.toLowerCase().trim();
        
        const matchesName = c.company_name?.toLowerCase().includes(query);
        const matchesContact = c.contact_name?.toLowerCase().includes(query);
        const matchesNit = String(c.nit || '').toLowerCase().includes(query);
        return Boolean(matchesName || matchesContact || matchesNit);
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
            const matchSearch = agreement.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                agreement.profiles?.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                String(agreement.quote_number).includes(searchTerm);
            
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
                            subtitle="Expira en menos de 15 días" 
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
                                🟢 <strong>{activeCount}</strong> Acuerdos Vigentes
                            </span>
                            <span style={{ color: '#D97706', fontWeight: 'bold' }}>
                                🟡 <strong>{warningCount}</strong> Próximos a Vencer
                            </span>
                            <span style={{ color: expiredCount > 0 ? '#EF4444' : '#64748B', fontWeight: 'bold' }}>
                                🔴 <strong>{expiredCount}</strong> Vencidos
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
                backgroundColor: THEME.colors.surface, 
                borderRadius: THEME.radius.lg, 
                border: `1px solid ${THEME.colors.border}`, 
                boxShadow: THEME.shadow.sm, 
                overflow: 'hidden' 
            }}>
                {/* TOP TOOLBAR CONTROLS */}
                <div style={{ 
                    padding: '1.1rem 1.25rem', 
                    borderBottom: `1px solid ${THEME.colors.border}`, 
                    backgroundColor: '#FFFFFF',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '1.25rem',
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
                                marginLeft: '8px',
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
                    <div style={{ 
                        maxHeight: isMainKpiCollapsed ? 'calc(100vh - 160px)' : 'calc(100vh - 280px)', 
                        minHeight: '380px',
                        overflowY: 'auto', 
                        overflowX: 'auto', 
                        width: '100%', 
                        position: 'relative',
                        transition: 'max-height 0.25s ease'
                    }}>
                        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left' }}>
                            <thead style={{ position: 'sticky', top: 0, zIndex: 15 }}>
                                <tr style={{ backgroundColor: '#F8FAFC' }}>
                                    {/* CÓDIGO */}
                                    <th 
                                        onClick={() => toggleSort('quote_number')}
                                        style={{ padding: '0.75rem 1.25rem', ...THEME.typography.tableHeader, cursor: 'pointer', userSelect: 'none', transition: 'background 0.15s', backgroundColor: '#F8FAFC', borderBottom: `1.5px solid ${THEME.colors.border}` }}
                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F1F5F9'}
                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#F8FAFC'}
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
                                        style={{ padding: '0.75rem 1.25rem', ...THEME.typography.tableHeader, cursor: 'pointer', userSelect: 'none', transition: 'background 0.15s', backgroundColor: '#F8FAFC', borderBottom: `1.5px solid ${THEME.colors.border}` }}
                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F1F5F9'}
                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#F8FAFC'}
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
                                        style={{ padding: '0.75rem 1.25rem', ...THEME.typography.tableHeader, cursor: 'pointer', userSelect: 'none', transition: 'background 0.15s', backgroundColor: '#F8FAFC', borderBottom: `1.5px solid ${THEME.colors.border}` }}
                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F1F5F9'}
                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#F8FAFC'}
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
                                        style={{ padding: '0.75rem 1.25rem', ...THEME.typography.tableHeader, cursor: 'pointer', userSelect: 'none', transition: 'background 0.15s', backgroundColor: '#F8FAFC', borderBottom: `1.5px solid ${THEME.colors.border}` }}
                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F1F5F9'}
                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#F8FAFC'}
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
                                        style={{ padding: '0.75rem 1.25rem', ...THEME.typography.tableHeader, cursor: 'pointer', userSelect: 'none', transition: 'background 0.15s', backgroundColor: '#F8FAFC', borderBottom: `1.5px solid ${THEME.colors.border}` }}
                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F1F5F9'}
                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#F8FAFC'}
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
                                        style={{ padding: '0.75rem 1.25rem', ...THEME.typography.tableHeader, textAlign: 'center', cursor: 'pointer', userSelect: 'none', transition: 'background 0.15s', backgroundColor: '#F8FAFC', borderBottom: `1.5px solid ${THEME.colors.border}` }}
                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F1F5F9'}
                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#F8FAFC'}
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
                                    <th style={{ padding: '0.75rem 1.25rem', ...THEME.typography.tableHeader, textAlign: 'right', backgroundColor: '#F8FAFC', borderBottom: `1.5px solid ${THEME.colors.border}` }}>
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
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <Building2 size={16} color="#94A3B8" />
                                                <div>
                                                    <div style={{ fontWeight: 'bold', color: THEME.colors.textMain }}>
                                                        {agreement.profiles?.company_name || agreement.client_name}
                                                    </div>
                                                    {agreement.profiles?.nit && (
                                                        <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '2px' }}>
                                                            NIT: {agreement.profiles.nit}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
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
                                                padding: '3px 8px', 
                                                borderRadius: '4px', 
                                                fontSize: '0.75rem', 
                                                fontWeight: 'bold',
                                                whiteSpace: 'nowrap'
                                            }}>
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
                                    Lista de Precios Congelados ({formatAgreementNumber(selectedAgreement.quote_number, selectedAgreement.created_at)})
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
                            <div>
                                <span style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary, display: 'block' }}>MARGEN PROMEDIO:</span>
                                <strong style={{ 
                                    fontSize: '0.85rem', 
                                    color: averageMargin >= 50 ? '#059669' : averageMargin >= 20 ? '#D97706' : '#DC2626' 
                                }}>
                                    {loadingItems ? 'Cargando...' : `${(Math.round(averageMargin * 10) / 10).toFixed(1)}%`}
                                </strong>
                            </div>
                        </div>

                        {/* Drawer Search Bar */}
                        <div style={{ padding: '0.75rem 1.5rem', backgroundColor: 'white', borderBottom: `1px solid ${THEME.colors.border}`, display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ position: 'relative', flex: 1 }}>
                                <Search size={16} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                                <input
                                    type="text"
                                    placeholder="Buscar producto por nombre o código contable..."
                                    value={drawerSearchTerm}
                                    onChange={(e) => setDrawerSearchTerm(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.55rem 2rem 0.55rem 2.2rem',
                                        borderRadius: '8px',
                                        border: `1px solid ${THEME.colors.border}`,
                                        fontSize: '0.82rem',
                                        outline: 'none'
                                    }}
                                />
                                {drawerSearchTerm && (
                                    <button
                                        onClick={() => setDrawerSearchTerm('')}
                                        style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                            <span style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                {agreementItems.filter(item => {
                                    if (!drawerSearchTerm.trim()) return true;
                                    const q = drawerSearchTerm.toLowerCase().trim();
                                    const name = (item.product_name || '').toLowerCase();
                                    const accountingId = (item.products?.accounting_id || '').toString().toLowerCase();
                                    return name.includes(q) || accountingId.includes(q);
                                }).length} de {agreementItems.length}
                            </span>
                        </div>

                        {/* Drawer List Content */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
                            {loadingItems ? (
                                <div style={{ padding: '4rem', textAlign: 'center', color: THEME.colors.textSecondary, fontWeight: 'bold' }}>Cargando lista de precios...</div>
                            ) : agreementItems.length === 0 ? (
                                <div style={{ padding: '4rem', textAlign: 'center', color: THEME.colors.textSecondary }}>No hay ítems registrados en este acuerdo comercial.</div>
                            ) : (
                                (() => {
                                    const filtered = agreementItems.filter(item => {
                                        if (!drawerSearchTerm.trim()) return true;
                                        const q = drawerSearchTerm.toLowerCase().trim();
                                        const name = (item.product_name || '').toLowerCase();
                                        const accountingId = (item.products?.accounting_id || '').toString().toLowerCase();
                                        return name.includes(q) || accountingId.includes(q);
                                    });

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
                                                {filtered.map(item => (
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
                                                        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: item.margin_percent >= 50 ? '#059669' : item.margin_percent >= 20 ? '#D97706' : '#DC2626', fontWeight: 'bold', fontSize: '0.85rem' }}>
                                                            {Math.round(item.margin_percent * 10) / 10}%
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    );
                                })()
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

            {/* CREATE AGREEMENT MODAL - WIDE 3-STEP SEQUENTIAL WIZARD */}
            {isCreateModalOpen && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)', padding: '1rem' }}>
                    <form 
                        onSubmit={handleCreateAgreementSubmit}
                        style={{ 
                            backgroundColor: 'white', 
                            borderRadius: THEME.radius.lg, 
                            width: '95%', 
                            maxWidth: '900px', 
                            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)', 
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                            maxHeight: '92vh'
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
                                { step: 2, label: '2. Vigencia & Duración', desc: 'Plazo y vencimiento' },
                                { step: 3, label: '3. Carga de Precios', desc: 'Excel y pre-validación' }
                            ].map(s => {
                                const isActive = createStep === s.step;
                                const isPassed = createStep > s.step;
                                const canClick = s.step < createStep || (s.step === 2 && !!selectedClientId) || (s.step === 3 && !!selectedClientId);

                                return (
                                    <div 
                                        key={s.step}
                                        onClick={() => {
                                            if (canClick) setCreateStep(s.step as 1 | 2 | 3);
                                        }}
                                        style={{
                                            flex: 1,
                                            padding: '0.9rem 1.25rem',
                                            display: 'flex',
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
                        <div style={{ padding: '1.75rem 2rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: 1 }}>
                            
                            {/* ================= STEP 1: CLIENT SELECTION (CASAS MATRICES ONLY) ================= */}
                            {createStep === 1 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                    <div style={{ backgroundColor: '#F8FAFC', padding: '1rem 1.25rem', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                                        <h4 style={{ margin: '0 0 4px', fontSize: '0.95rem', color: THEME.colors.textMain, fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Building2 size={18} color="#0D7A57" /> Paso 1: Selecciona la Casa Matriz B2B
                                        </h4>
                                        <p style={{ margin: 0, fontSize: '0.8rem', color: THEME.colors.textSecondary, lineHeight: '1.4' }}>
                                            Los acuerdos comerciales institucionales se definen a nivel de <strong>Casa Matriz</strong> y sus precios congelados aplican a todas sus sucursales.
                                        </p>
                                    </div>

                                    {/* If NO client selected yet: show search bar and immediate live list */}
                                    {!selectedClientId ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: THEME.colors.textSecondary, textTransform: 'uppercase' }}>
                                                Buscar Casa Matriz por Nombre o NIT:
                                            </label>
                                            
                                            <div style={{ position: 'relative' }}>
                                                <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                                                <input 
                                                    type="text"
                                                    autoFocus
                                                    placeholder="Escribe para buscar... ej: Aldimark, ECCI, Lao Kao, Colsubsidio..."
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

                                            {/* Live List of Casas Matrices */}
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
                                                            No se encontraron Casas Matrices con "{clientSearchQuery}"
                                                        </div>
                                                        <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: '4px' }}>
                                                            Solo se muestran Casas Matrices principales (las sucursales heredan el acuerdo de su matriz).
                                                        </div>
                                                    </div>
                                                ) : (
                                                    filteredB2bClients.map((c) => (
                                                        <div
                                                            key={c.id}
                                                            onClick={() => {
                                                                setSelectedClientId(c.id);
                                                                setClientSearchQuery('');
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
                                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F0FDF4'}
                                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                        >
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                                <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#E0F2FE', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0369A1', flexShrink: 0 }}>
                                                                    <Building2 size={18} />
                                                                </div>
                                                                <div>
                                                                    <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#1E293B' }}>
                                                                        {c.company_name}
                                                                    </div>
                                                                    <div style={{ fontSize: '0.75rem', color: '#64748B', display: 'flex', gap: '8px', marginTop: '2px' }}>
                                                                        {c.nit && <span>NIT: <strong>{c.nit}</strong></span>}
                                                                        {c.contact_name && c.contact_name !== c.company_name && <span>• Contacto: {c.contact_name}</span>}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                <span style={{ fontSize: '0.7rem', padding: '3px 9px', borderRadius: '20px', backgroundColor: '#E0F2FE', color: '#0369A1', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                    <Building2 size={12} /> Casa Matriz {c.branchCount > 0 ? `(${c.branchCount} ${c.branchCount === 1 ? 'sucursal' : 'sucursales'})` : ''}
                                                                </span>
                                                                <ChevronRight size={16} color="#94A3B8" />
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        /* Selected Casa Matriz Card */
                                        (() => {
                                            const selectedClient = b2bClients.find(c => c.id === selectedClientId);
                                            return (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                                    <div style={{
                                                        backgroundColor: '#F0FDF4',
                                                        border: '2px solid #0D7A57',
                                                        borderRadius: '12px',
                                                        padding: '1.25rem 1.5rem',
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        gap: '1rem',
                                                        boxShadow: '0 4px 12px rgba(13, 122, 87, 0.08)'
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                                            <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0D7A57', flexShrink: 0 }}>
                                                                <Building2 size={24} strokeWidth={2.2} />
                                                            </div>
                                                            <div>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    <span style={{ fontSize: '0.7rem', color: '#15803D', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                        <Check size={13} strokeWidth={2.5} /> Casa Matriz Verificada
                                                                    </span>
                                                                    {selectedClient?.branchCount !== undefined && selectedClient.branchCount > 0 && (
                                                                        <span style={{ fontSize: '0.65rem', backgroundColor: '#DCFCE7', color: '#166534', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' }}>
                                                                            {selectedClient.branchCount} {selectedClient.branchCount === 1 ? 'sucursal vinculada' : 'sucursales vinculadas'}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div style={{ fontSize: '1.05rem', fontWeight: '900', color: '#064E3B', marginTop: '2px' }}>
                                                                    {selectedClient?.company_name || 'Cliente B2B'}
                                                                </div>
                                                                <div style={{ fontSize: '0.8rem', color: '#047857', marginTop: '2px' }}>
                                                                    {selectedClient?.nit ? `NIT: ${selectedClient.nit}` : ''} {selectedClient?.phone ? `• Tel: ${selectedClient.phone}` : ''}
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

                                                    {/* ACTIVE AGREEMENT STATUS OR SUCCESS CONFIRMATION */}
                                                    {(() => {
                                                        const activeAgreement = agreements.find(a => 
                                                            a.client_id === selectedClientId && 
                                                            getAgreementStatus(a.valid_until).label === 'Vigente'
                                                        );

                                                        if (activeAgreement) {
                                                            const itemsCount = (activeAgreement as any).items?.length || (activeAgreement as any).quote_items?.length || 0;
                                                            
                                                            // Format start date with created_at fallback
                                                            const rawStartDate = activeAgreement.start_date || activeAgreement.created_at;
                                                            const startDateFormatted = rawStartDate 
                                                                ? new Date(rawStartDate.includes('T') ? rawStartDate : rawStartDate + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
                                                                : 'Inicial';

                                                            // Format expiration date
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
                                                                                Advertencia: Esta Casa Matriz ya tiene un Acuerdo Comercial Vigente
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
                                                                    backgroundColor: '#F0FDF4', 
                                                                    border: '1px solid #BBF7D0', 
                                                                    borderRadius: '10px', 
                                                                    padding: '0.9rem 1.25rem', 
                                                                    display: 'flex', 
                                                                    gap: '10px', 
                                                                    alignItems: 'center' 
                                                                }}>
                                                                    <CheckCircle2 size={18} color="#16A34A" />
                                                                    <span style={{ fontSize: '0.82rem', color: '#166534', fontWeight: '600' }}>
                                                                        Casa Matriz verificada sin acuerdos comerciales vigentes previos. Lista para configurar vigencia y precios.
                                                                    </span>
                                                                </div>
                                                            );
                                                        }
                                                    })()}
                                                </div>
                                            );
                                        })()
                                    )}
                                </div>
                            )}

                            {/* ================= STEP 2: DATES & DURATION ================= */}
                            {createStep === 2 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                    <div style={{ backgroundColor: '#F8FAFC', padding: '1rem 1.25rem', borderRadius: '10px', border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 'bold', textTransform: 'uppercase' }}>Cliente Seleccionado:</span>
                                            <div style={{ fontSize: '1rem', fontWeight: 'bold', color: THEME.colors.textMain }}>
                                                {b2bClients.find(c => c.id === selectedClientId)?.company_name}
                                            </div>
                                        </div>
                                        <button 
                                            type="button" 
                                            onClick={() => setCreateStep(1)}
                                            style={{ background: 'none', border: '1px solid #CBD5E1', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold', color: '#475569', cursor: 'pointer' }}
                                        >
                                            Cambiar Cliente
                                        </button>
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
                                                onChange={(e) => setStartDate(e.target.value)}
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
                                                    onChange={(e) => setDurationValue(Math.max(1, parseInt(e.target.value) || 1))}
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
                                        </div>
                                    </div>

                                    {(() => {
                                        const expiry = new Date(startDate + 'T12:00:00');
                                        if (durationUnit === 'days') {
                                            expiry.setDate(expiry.getDate() + durationValue);
                                        } else if (durationUnit === 'weeks') {
                                            expiry.setDate(expiry.getDate() + durationValue * 7);
                                        } else if (durationUnit === 'months') {
                                            expiry.setMonth(expiry.getMonth() + durationValue);
                                        } else if (durationUnit === 'years') {
                                            expiry.setFullYear(expiry.getFullYear() + durationValue);
                                        }
                                        const formattedExpiry = expiry.toLocaleDateString('es-CO', {
                                            weekday: 'long',
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

                            {/* ================= STEP 3: EXCEL UPLOAD & LIVE PRE-VALIDATION ================= */}
                            {createStep === 3 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                    {/* Action bar and instructions */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                                        <div>
                                            <h4 style={{ margin: '0 0 2px', fontSize: '0.9rem', color: THEME.colors.textMain, fontWeight: '700' }}>
                                                Paso 3: Carga Masiva de Precios por Accounting ID
                                            </h4>
                                            <p style={{ margin: 0, fontSize: '0.75rem', color: THEME.colors.textSecondary }}>
                                                El sistema cruzará automáticamente los códigos contables con el catálogo y calculará los márgenes brutos.
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

                                    {/* Drag-drop or File Input */}
                                    <div style={{
                                        border: `2px dashed ${parsedFile ? THEME.colors.primary : '#CBD5E1'}`,
                                        backgroundColor: parsedFile ? '#F0FDF4' : '#F8FAFC',
                                        borderRadius: '12px',
                                        padding: parsedFile ? '1rem 1.5rem' : '1.75rem',
                                        textAlign: 'center',
                                        cursor: 'pointer',
                                        position: 'relative',
                                        transition: 'all 0.2s'
                                    }}>
                                        <input 
                                            type="file" 
                                            accept=".xlsx, .xls"
                                            onChange={handleFileUpload}
                                            style={{
                                                position: 'absolute',
                                                inset: 0,
                                                opacity: 0,
                                                cursor: 'pointer'
                                            }}
                                        />
                                        <UploadCloud size={parsedFile ? 26 : 34} style={{ color: parsedFile ? THEME.colors.primary : '#94A3B8', margin: '0 auto 6px auto' }} />
                                        {parsedFile ? (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ textAlign: 'left' }}>
                                                    <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <FileText size={16} color={THEME.colors.primary} /> {parsedFile.name}
                                                    </div>
                                                    <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, marginTop: '2px' }}>
                                                        Tamaño: {Math.round(parsedFile.size / 1024)} KB — Haz clic o arrastra otro archivo para reemplazarlo
                                                    </div>
                                                </div>
                                                <span style={{ fontSize: '0.75rem', padding: '4px 10px', borderRadius: '20px', backgroundColor: '#DCFCE7', color: '#166534', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                    <Check size={13} strokeWidth={2.5} /> Archivo Analizado
                                                </span>
                                            </div>
                                        ) : (
                                            <div>
                                                <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: THEME.colors.textMain }}>
                                                    Arrastra y suelta tu archivo Excel de Tarifas aquí, o haz clic para examinar
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, marginTop: '4px' }}>
                                                    Columnas requeridas: <strong>ID Producto (Accounting ID)</strong> y <strong>Precio Acordado</strong>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* PREVIEW & PRE-VALIDATION SECTION */}
                                    {excelPreviewData && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '4px' }}>
                                            {/* Header with Collapsible Toggle */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontSize: '0.78rem', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                    Resumen de Validación y Tarifas
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

                                            {/* KPI Section: Full Cards OR Compact Summary Strip */}
                                            {!isKpiCollapsed ? (
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                                                    <div style={{ backgroundColor: '#F8FAFC', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                                        <span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 'bold', textTransform: 'uppercase' }}>Total Filas Excel</span>
                                                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: THEME.colors.textMain, marginTop: '2px' }}>
                                                            {excelPreviewData.items.length}
                                                        </div>
                                                    </div>
                                                    <div style={{ backgroundColor: '#F0FDF4', padding: '10px 14px', borderRadius: '8px', border: '1px solid #BBF7D0' }}>
                                                        <span style={{ fontSize: '0.68rem', color: '#166534', fontWeight: 'bold', textTransform: 'uppercase' }}>En Catálogo (OK)</span>
                                                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#16A34A', marginTop: '2px' }}>
                                                            {excelPreviewData.matchedCount}
                                                        </div>
                                                    </div>
                                                    <div style={{ backgroundColor: excelPreviewData.unmatchedCount > 0 ? '#FEF2F2' : '#F8FAFC', padding: '10px 14px', borderRadius: '8px', border: `1px solid ${excelPreviewData.unmatchedCount > 0 ? '#FECACA' : '#E2E8F0'}` }}>
                                                        <span style={{ fontSize: '0.68rem', color: excelPreviewData.unmatchedCount > 0 ? '#991B1B' : '#64748B', fontWeight: 'bold', textTransform: 'uppercase' }}>No Reconocidos</span>
                                                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: excelPreviewData.unmatchedCount > 0 ? '#DC2626' : '#64748B', marginTop: '2px' }}>
                                                            {excelPreviewData.unmatchedCount}
                                                        </div>
                                                    </div>
                                                    <div style={{ backgroundColor: '#EFF6FF', padding: '10px 14px', borderRadius: '8px', border: '1px solid #BFDBFE' }}>
                                                        <span style={{ fontSize: '0.68rem', color: '#1E40AF', fontWeight: 'bold', textTransform: 'uppercase' }}>Margen Promedio</span>
                                                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: excelPreviewData.avgMargin >= 50 ? '#059669' : excelPreviewData.avgMargin >= 20 ? '#D97706' : '#DC2626', marginTop: '2px' }}>
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
                                                        <span style={{ color: '#166534', fontWeight: 'bold' }}>✓ {excelPreviewData.matchedCount} En Catálogo</span>
                                                        {excelPreviewData.unmatchedCount > 0 ? (
                                                            <span style={{ color: '#DC2626', fontWeight: 'bold' }}>⚠️ {excelPreviewData.unmatchedCount} No Reconocidos</span>
                                                        ) : (
                                                            <span style={{ color: '#64748B' }}>0 No reconocidos</span>
                                                        )}
                                                        <span>Margen Prom.: <strong style={{ color: excelPreviewData.avgMargin >= 50 ? '#059669' : excelPreviewData.avgMargin >= 20 ? '#D97706' : '#DC2626' }}>{excelPreviewData.avgMargin}%</strong></span>
                                                    </div>
                                                    <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                                        (Vista compacta activada)
                                                    </span>
                                                </div>
                                            )}

                                            {/* Preview Search & Filter toolbar */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', backgroundColor: '#F8FAFC', padding: '8px 12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    {(['all', 'matched', 'unmatched'] as const).map(flt => (
                                                        <button
                                                            key={flt}
                                                            type="button"
                                                            onClick={() => setExcelPreviewFilter(flt)}
                                                            style={{
                                                                padding: '4px 10px',
                                                                borderRadius: '6px',
                                                                border: 'none',
                                                                fontSize: '0.75rem',
                                                                fontWeight: 'bold',
                                                                cursor: 'pointer',
                                                                backgroundColor: excelPreviewFilter === flt ? THEME.colors.primary : '#E2E8F0',
                                                                color: excelPreviewFilter === flt ? 'white' : '#475569'
                                                            }}
                                                        >
                                                            {flt === 'all' && `Todos (${excelPreviewData.items.length})`}
                                                            {flt === 'matched' && `Reconocidos (${excelPreviewData.matchedCount})`}
                                                            {flt === 'unmatched' && `No Reconocidos (${excelPreviewData.unmatchedCount})`}
                                                        </button>
                                                    ))}
                                                </div>
                                                <div style={{ position: 'relative', width: '240px' }}>
                                                    <Search size={14} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                                                    <input 
                                                        type="text"
                                                        placeholder="Filtrar por código o nombre..."
                                                        value={excelPreviewSearch}
                                                        onChange={(e) => setExcelPreviewSearch(e.target.value)}
                                                        style={{
                                                            width: '100%',
                                                            padding: '6px 8px 6px 28px',
                                                            borderRadius: '6px',
                                                            border: '1px solid #CBD5E1',
                                                            fontSize: '0.75rem',
                                                            outline: 'none'
                                                        }}
                                                    />
                                                </div>
                                            </div>

                                            {/* Preview Table with Expanded Height and Sticky Headers */}
                                            <div style={{ 
                                                maxHeight: isKpiCollapsed ? '460px' : '320px', 
                                                overflowY: 'auto', 
                                                border: '1.5px solid #E2E8F0', 
                                                borderRadius: '8px',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                                                transition: 'max-height 0.25s ease'
                                            }}>
                                                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left', fontSize: '0.8rem' }}>
                                                    <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                                                        <tr style={{ backgroundColor: '#F1F5F9', borderBottom: '2px solid #CBD5E1' }}>
                                                            <th style={{ padding: '9px 10px', fontWeight: 'bold', color: '#475569', backgroundColor: '#F1F5F9', borderBottom: '1.5px solid #CBD5E1' }}>Accounting ID</th>
                                                            <th style={{ padding: '9px 10px', fontWeight: 'bold', color: '#475569', backgroundColor: '#F1F5F9', borderBottom: '1.5px solid #CBD5E1' }}>Producto en Archivo</th>
                                                            <th style={{ padding: '9px 10px', fontWeight: 'bold', color: '#475569', backgroundColor: '#F1F5F9', borderBottom: '1.5px solid #CBD5E1' }}>Match en Catálogo</th>
                                                            <th style={{ padding: '9px 10px', fontWeight: 'bold', color: '#475569', textAlign: 'right', backgroundColor: '#F1F5F9', borderBottom: '1.5px solid #CBD5E1' }}>Costo Base FruFresco</th>
                                                            <th style={{ padding: '9px 10px', fontWeight: 'bold', color: '#475569', textAlign: 'right', backgroundColor: '#F1F5F9', borderBottom: '1.5px solid #CBD5E1' }}>Precio Acordado</th>
                                                            <th style={{ padding: '9px 10px', fontWeight: 'bold', color: '#475569', textAlign: 'center', backgroundColor: '#F1F5F9', borderBottom: '1.5px solid #CBD5E1' }}>Margen %</th>
                                                            <th style={{ padding: '9px 10px', fontWeight: 'bold', color: '#475569', textAlign: 'center', backgroundColor: '#F1F5F9', borderBottom: '1.5px solid #CBD5E1' }}>Estado</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {excelPreviewData.items
                                                            .filter(item => {
                                                                if (excelPreviewFilter === 'matched' && !item.matched_product) return false;
                                                                if (excelPreviewFilter === 'unmatched' && item.matched_product) return false;
                                                                if (!excelPreviewSearch.trim()) return true;
                                                                const q = excelPreviewSearch.toLowerCase().trim();
                                                                return (
                                                                    item.accounting_id.toLowerCase().includes(q) ||
                                                                    item.product_name.toLowerCase().includes(q) ||
                                                                    (item.matched_product?.name || '').toLowerCase().includes(q)
                                                                );
                                                            })
                                                            .map((item, idx) => (
                                                                <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: !item.matched_product ? '#FFF1F2' : idx % 2 === 0 ? 'white' : '#FAFAFA' }}>
                                                                    <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontWeight: 'bold', color: '#334155' }}>
                                                                        {item.accounting_id}
                                                                    </td>
                                                                    <td style={{ padding: '6px 10px', color: '#1E293B' }}>
                                                                        {item.product_name}
                                                                    </td>
                                                                    <td style={{ padding: '6px 10px', fontWeight: item.matched_product ? '600' : 'normal', color: item.matched_product ? THEME.colors.primary : '#EF4444' }}>
                                                                        {item.matched_product ? item.matched_product.name : '— No encontrado en catálogo —'}
                                                                    </td>
                                                                    <td style={{ padding: '6px 10px', textAlign: 'right', color: '#64748B' }}>
                                                                        {item.matched_product ? formatMoney(item.cost_basis) : '—'}
                                                                    </td>
                                                                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 'bold', color: THEME.colors.primary }}>
                                                                        {formatMoney(item.unit_price)}
                                                                    </td>
                                                                    <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 'bold', color: item.margin_percent >= 50 ? '#059669' : item.margin_percent >= 20 ? '#D97706' : '#DC2626' }}>
                                                                        {item.matched_product ? `${item.margin_percent}%` : '—'}
                                                                    </td>
                                                                    <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                                                                        {item.matched_product ? (
                                                                            <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#DCFCE7', color: '#15803D', fontWeight: 'bold' }}>
                                                                                OK
                                                                            </span>
                                                                        ) : (
                                                                            <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#FEE2E2', color: '#991B1B', fontWeight: 'bold' }}>
                                                                                Omitir
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
                        </div>

                        {/* Modal Footer - Step Navigation Buttons */}
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

                            <div style={{ display: 'flex', gap: '10px' }}>
                                {createStep === 1 && (
                                    <button 
                                        type="button"
                                        disabled={!selectedClientId}
                                        onClick={() => setCreateStep(2)}
                                        style={{ 
                                            padding: '10px 22px', 
                                            borderRadius: THEME.radius.md, 
                                            border: 'none', 
                                            backgroundColor: !selectedClientId ? '#CBD5E1' : THEME.colors.primary, 
                                            color: 'white', 
                                            fontWeight: 'bold',
                                            fontSize: '0.85rem',
                                            cursor: !selectedClientId ? 'not-allowed' : 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            boxShadow: !selectedClientId ? 'none' : '0 4px 12px rgba(13, 122, 87, 0.25)'
                                        }}
                                    >
                                        Continuar a Vigencia <ArrowRight size={16} />
                                    </button>
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

                                {createStep === 3 && (
                                    <button 
                                        type="submit" 
                                        disabled={savingAgreement || parsing || uploadedItems.length === 0 || (excelPreviewData?.matchedCount === 0)}
                                        style={{ 
                                            padding: '10px 24px', 
                                            borderRadius: THEME.radius.md, 
                                            border: 'none', 
                                            backgroundColor: (uploadedItems.length === 0 || savingAgreement || excelPreviewData?.matchedCount === 0) ? '#CBD5E1' : THEME.colors.primary, 
                                            color: 'white', 
                                            fontWeight: 'bold',
                                            fontSize: '0.85rem',
                                            cursor: (uploadedItems.length === 0 || savingAgreement || excelPreviewData?.matchedCount === 0) ? 'not-allowed' : 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            boxShadow: (uploadedItems.length === 0 || savingAgreement) ? 'none' : '0 4px 12px rgba(13, 122, 87, 0.25)'
                                        }}
                                    >
                                        {savingAgreement ? (
                                            <>Guardando Acuerdo...</>
                                        ) : (
                                            <>
                                                <Check size={16} strokeWidth={2.5} /> Crear y Activar Acuerdo Comercial
                                            </>
                                        )}
                                    </button>
                                )}
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
                        borderRadius: '16px', 
                        width: '95%', 
                        maxWidth: '900px', 
                        boxShadow: '0 25px 60px -15px rgba(0,0,0,0.3)', 
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        maxHeight: '92vh',
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
                        <div style={{ padding: '1.5rem 1.75rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            
                            {/* ================= STEP 1: VIGENCIA & DATES ================= */}
                            {editStep === 1 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
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
                                                    onChange={(e) => setEditDurationValue(Math.max(1, parseInt(e.target.value) || 1))}
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
                                        const expiry = new Date(editStartDate + 'T12:00:00');
                                        if (editDurationUnit === 'days') {
                                            expiry.setDate(expiry.getDate() + editDurationValue);
                                        } else if (editDurationUnit === 'weeks') {
                                            expiry.setDate(expiry.getDate() + editDurationValue * 7);
                                        } else if (editDurationUnit === 'months') {
                                            expiry.setMonth(expiry.getMonth() + editDurationValue);
                                        } else if (editDurationUnit === 'years') {
                                            expiry.setFullYear(expiry.getFullYear() + editDurationValue);
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
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
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

                                    {/* If NO file uploaded, show info card */}
                                    {!editExcelPreviewData && (
                                        <div style={{ 
                                            padding: '1rem 1.25rem', 
                                            backgroundColor: '#F0FDF4', 
                                            border: '1.5px solid #BBF7D0', 
                                            borderRadius: '10px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px'
                                        }}>
                                            <CheckCircle2 size={22} color="#16A34A" />
                                            <div>
                                                <strong style={{ color: '#166534', fontSize: '0.85rem', display: 'block' }}>
                                                    Conservando precios vigentes del acuerdo
                                                </strong>
                                                <span style={{ fontSize: '0.75rem', color: '#15803D' }}>
                                                    No has cargado ningún Excel, por lo que se mantendrán intactos los precios congelados actuales y solo se actualizará la vigencia.
                                                </span>
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

                                            {/* KPI Section: Full Cards OR Compact Summary Strip */}
                                            {!isEditKpiCollapsed ? (
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
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
                                                        <span style={{ color: '#166534', fontWeight: 'bold' }}>✓ {editExcelPreviewData.matchedCount} En Catálogo</span>
                                                        {editExcelPreviewData.unmatchedCount > 0 ? (
                                                            <span style={{ color: '#DC2626', fontWeight: 'bold' }}>⚠️ {editExcelPreviewData.unmatchedCount} No Reconocidos</span>
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

                                            {/* Preview Search & Filter toolbar */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', backgroundColor: '#F8FAFC', padding: '8px 12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    {(['all', 'matched', 'unmatched'] as const).map(flt => (
                                                        <button
                                                            key={flt}
                                                            type="button"
                                                            onClick={() => setEditExcelPreviewFilter(flt)}
                                                            style={{
                                                                padding: '4px 10px',
                                                                borderRadius: '6px',
                                                                border: 'none',
                                                                fontSize: '0.75rem',
                                                                fontWeight: 'bold',
                                                                cursor: 'pointer',
                                                                backgroundColor: editExcelPreviewFilter === flt ? THEME.colors.primary : '#E2E8F0',
                                                                color: editExcelPreviewFilter === flt ? 'white' : '#475569'
                                                            }}
                                                        >
                                                            {flt === 'all' && `Todos (${editExcelPreviewData.items.length})`}
                                                            {flt === 'matched' && `Reconocidos (${editExcelPreviewData.matchedCount})`}
                                                            {flt === 'unmatched' && `No Reconocidos (${editExcelPreviewData.unmatchedCount})`}
                                                        </button>
                                                    ))}
                                                </div>
                                                <div style={{ position: 'relative', width: '240px' }}>
                                                    <Search size={14} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                                                    <input 
                                                        type="text"
                                                        placeholder="Filtrar por código o nombre..."
                                                        value={editExcelPreviewSearch}
                                                        onChange={(e) => setEditExcelPreviewSearch(e.target.value)}
                                                        style={{
                                                            width: '100%',
                                                            padding: '6px 8px 6px 28px',
                                                            borderRadius: '6px',
                                                            border: '1px solid #CBD5E1',
                                                            fontSize: '0.75rem',
                                                            outline: 'none'
                                                        }}
                                                    />
                                                </div>
                                            </div>

                                            {/* Preview Table with Expanded Height and Sticky Headers */}
                                            <div style={{ 
                                                maxHeight: isEditKpiCollapsed ? '460px' : '300px', 
                                                overflowY: 'auto', 
                                                border: '1.5px solid #E2E8F0', 
                                                borderRadius: '8px',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                                                transition: 'max-height 0.25s ease'
                                            }}>
                                                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left', fontSize: '0.8rem' }}>
                                                    <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                                                        <tr style={{ backgroundColor: '#F1F5F9', borderBottom: '2px solid #CBD5E1' }}>
                                                            <th style={{ padding: '9px 10px', fontWeight: 'bold', color: '#475569', backgroundColor: '#F1F5F9', borderBottom: '1.5px solid #CBD5E1' }}>Accounting ID</th>
                                                            <th style={{ padding: '9px 10px', fontWeight: 'bold', color: '#475569', backgroundColor: '#F1F5F9', borderBottom: '1.5px solid #CBD5E1' }}>Producto en Archivo</th>
                                                            <th style={{ padding: '9px 10px', fontWeight: 'bold', color: '#475569', backgroundColor: '#F1F5F9', borderBottom: '1.5px solid #CBD5E1' }}>Match en Catálogo</th>
                                                            <th style={{ padding: '9px 10px', fontWeight: 'bold', color: '#475569', textAlign: 'right', backgroundColor: '#F1F5F9', borderBottom: '1.5px solid #CBD5E1' }}>Costo Base FruFresco</th>
                                                            <th style={{ padding: '9px 10px', fontWeight: 'bold', color: '#475569', textAlign: 'right', backgroundColor: '#F1F5F9', borderBottom: '1.5px solid #CBD5E1' }}>Precio Acordado</th>
                                                            <th style={{ padding: '9px 10px', fontWeight: 'bold', color: '#475569', textAlign: 'center', backgroundColor: '#F1F5F9', borderBottom: '1.5px solid #CBD5E1' }}>Margen %</th>
                                                            <th style={{ padding: '9px 10px', fontWeight: 'bold', color: '#475569', textAlign: 'center', backgroundColor: '#F1F5F9', borderBottom: '1.5px solid #CBD5E1' }}>Estado</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {editExcelPreviewData.items
                                                            .filter(item => {
                                                                if (editExcelPreviewFilter === 'matched' && !item.matched_product) return false;
                                                                if (editExcelPreviewFilter === 'unmatched' && item.matched_product) return false;
                                                                if (!editExcelPreviewSearch.trim()) return true;
                                                                const q = editExcelPreviewSearch.toLowerCase().trim();
                                                                return (
                                                                    item.accounting_id.toLowerCase().includes(q) ||
                                                                    item.product_name.toLowerCase().includes(q) ||
                                                                    (item.matched_product?.name || '').toLowerCase().includes(q)
                                                                );
                                                            })
                                                            .map((item, idx) => (
                                                                <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: !item.matched_product ? '#FFF1F2' : idx % 2 === 0 ? 'white' : '#FAFAFA' }}>
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
                                                                            <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '12px', backgroundColor: '#DCFCE7', color: '#166534', fontWeight: 'bold' }}>
                                                                                OK
                                                                            </span>
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
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', alignItems: 'center', textAlign: 'center', padding: '1rem 0' }}>
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
                                            <strong>{editDurationValue} {editDurationUnit === 'days' ? 'Días' : editDurationUnit === 'weeks' ? 'Semanas' : editDurationUnit === 'months' ? 'Meses' : 'Años'}</strong>
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
