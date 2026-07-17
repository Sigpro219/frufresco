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
    
    // Details Drawer State
    const [selectedAgreement, setSelectedAgreement] = useState<Agreement | null>(null);
    const [agreementItems, setAgreementItems] = useState<AgreementItem[]>([]);
    const [loadingItems, setLoadingItems] = useState(false);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    // Renewal Modal State
    const [renewTarget, setRenewTarget] = useState<Agreement | null>(null);
    const [newExpiryDate, setNewExpiryDate] = useState('');
    const [renewing, setRenewing] = useState(false);

    // Create Modal State
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [b2bClients, setB2bClients] = useState<any[]>([]);
    const [selectedClientId, setSelectedClientId] = useState('');
    const [clientSearchQuery, setClientSearchQuery] = useState('');
    const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
    const [focusedOptionIndex, setFocusedOptionIndex] = useState(0);
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [durationValue, setDurationValue] = useState<number>(2);
    const [durationUnit, setDurationUnit] = useState<string>('weeks');
    const [uploadedItems, setUploadedItems] = useState<{ accounting_id: string; unit_price: number; product_name?: string }[]>([]);
    const [parsedFile, setParsedFile] = useState<File | null>(null);
    const [parsing, setParsing] = useState(false);
    const [savingAgreement, setSavingAgreement] = useState(false);

    // Edit Modal State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingAgreement, setEditingAgreement] = useState<Agreement | null>(null);
    const [editStartDate, setEditStartDate] = useState('');
    const [editDurationValue, setEditDurationValue] = useState<number>(2);
    const [editDurationUnit, setEditDurationUnit] = useState<string>('weeks');
    const [editUploadedItems, setEditUploadedItems] = useState<{ accounting_id: string; unit_price: number; product_name?: string }[]>([]);
    const [editParsedFile, setEditParsedFile] = useState<File | null>(null);
    const [editParsing, setEditParsing] = useState(false);
    const [editSaving, setEditSaving] = useState(false);
    const [editStep, setEditStep] = useState<number>(1);
    const [editConfirmationChecked, setEditConfirmationChecked] = useState(false);

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
            const { data, error } = await supabase
                .from('profiles')
                .select('id, company_name, contact_name, nit')
                .eq('role', 'b2b_client')
                .order('company_name');
            if (error) throw error;
            setB2bClients(data || []);
        } catch (err: any) {
            console.error('Error fetching B2B clients:', err);
        }
    };

    useEffect(() => {
        fetchAgreements();
        fetchB2bClients();
    }, []);

    const handleOpenCreateModal = () => {
        setSelectedClientId('');
        setClientSearchQuery('');
        setStartDate(new Date().toISOString().split('T')[0]);
        setDurationValue(2);
        setDurationUnit('weeks');
        setUploadedItems([]);
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
        reader.onload = (evt) => {
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
                
                setUploadedItems(parsedItems);
                showToast(`Se cargaron ${rowCount} productos válidos desde el Excel`, 'success');
            } catch (err: any) {
                console.error(err);
                showToast('Error al leer Excel: ' + err.message, 'error');
                setParsedFile(null);
                setUploadedItems([]);
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
                  const { data: dbProducts, error: dbProdErr } = await supabase
                .from('products')
                .select('id, name, base_price, accounting_id, iva_rate');
                
            if (dbProdErr) throw dbProdErr;
            
            const productMap: Record<string, any> = {};
            dbProducts.forEach(p => {
                if (p.accounting_id !== null && p.accounting_id !== undefined) {
                    productMap[String(p.accounting_id)] = p;
                }
            });
            
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
        reader.onload = (evt) => {
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
                
                setEditUploadedItems(parsedItems);
                showToast(`Se cargaron ${rowCount} productos válidos desde el Excel`, 'success');
            } catch (err: any) {
                console.error(err);
                showToast('Error al leer Excel: ' + err.message, 'error');
                setEditParsedFile(null);
                setEditUploadedItems([]);
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
                const { data: dbProducts, error: dbProdErr } = await supabase
                    .from('products')
                    .select('id, name, base_price, accounting_id, iva_rate');
                    
                if (dbProdErr) throw dbProdErr;
                
                const productMap: Record<string, any> = {};
                dbProducts.forEach(p => {
                    if (p.accounting_id !== null && p.accounting_id !== undefined) {
                        productMap[String(p.accounting_id)] = p;
                    }
                });
                
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
        if (!clientSearchQuery) return true;
        const query = clientSearchQuery.toLowerCase();
        
        // Direct match
        const matchesName = c.company_name?.toLowerCase().includes(query);
        const matchesNit = String(c.nit || '').includes(query);
        if (matchesName || matchesNit) return true;
        
        // If this client is a branch (has parent_id), check if the parent matches
        if (c.parent_id) {
            const parent = b2bClients.find(p => p.id === c.parent_id);
            if (parent) {
                const parentMatchesName = parent.company_name?.toLowerCase().includes(query);
                const parentMatchesNit = String(parent.nit || '').includes(query);
                if (parentMatchesName || parentMatchesNit) return true;
            }
        }
        
        return false;
    });

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

    const totalMargin = agreementItems.reduce((sum, item) => sum + (item.margin_percent || 0), 0);
    const averageMargin = agreementItems.length > 0 ? totalMargin / agreementItems.length : 0;

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

                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
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
                    <button
                        onClick={handleOpenCreateModal}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '0.5rem 1rem',
                            borderRadius: THEME.radius.md,
                            backgroundColor: THEME.colors.primary,
                            color: 'white',
                            border: 'none',
                            fontSize: '0.8rem',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            marginLeft: '8px',
                            boxShadow: '0 2px 4px rgba(13,122,87,0.15)'
                        }}
                    >
                        <Plus size={14} /> Nuevo Acuerdo
                    </button>
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
                                <th style={{ padding: '0.75rem 1.25rem', ...THEME.typography.tableHeader }}>Vigencia</th>
                                <th style={{ padding: '0.75rem 1.25rem', ...THEME.typography.tableHeader }}>Duración</th>
                                <th style={{ padding: '0.75rem 1.25rem', ...THEME.typography.tableHeader }}>Estado</th>
                                <th style={{ padding: '0.75rem 1.25rem', ...THEME.typography.tableHeader, textAlign: 'center' }}>Margen Promedio</th>
                                <th style={{ padding: '0.75rem 1.25rem', ...THEME.typography.tableHeader, textAlign: 'right' }}>Acciones</th>
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
                                        <td style={{ padding: '1rem 1.25rem', whiteSpace: 'nowrap' }}>
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
                                        <td style={{ padding: '1rem 1.25rem' }}>
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
                                        <td style={{ padding: '1rem 1.25rem', color: THEME.colors.textSecondary }}>
                                            {agreement.model_snapshot_name || 'Personalizado'}
                                        </td>
                                        <td style={{ padding: '1rem 1.25rem', whiteSpace: 'nowrap' }}>
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
                                        <td style={{ padding: '1rem 1.25rem', whiteSpace: 'nowrap' }}>
                                            <span style={{ 
                                                fontSize: '0.75rem', 
                                                backgroundColor: '#F3F4F6', 
                                                padding: '3px 8px', 
                                                borderRadius: '12px', 
                                                color: '#374151',
                                                fontWeight: '500'
                                            }}>
                                                ⏳ {getDurationText(agreement.start_date, agreement.valid_until)}
                                            </span>
                                        </td>
                                        <td style={{ padding: '1rem 1.25rem' }}>
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
                                        <td style={{ padding: '1rem 1.25rem', textAlign: 'center' }}>
                                            {(() => {
                                                const rowItems = (agreement as any).items || [];
                                                const totalRowMargin = rowItems.reduce((sum: number, item: any) => sum + (item.margin_percent || 0), 0);
                                                const rowAvgMargin = rowItems.length > 0 ? totalRowMargin / rowItems.length : 0;
                                                return (
                                                    <span style={{ 
                                                        color: rowAvgMargin >= 50 ? '#059669' : rowAvgMargin >= 20 ? '#D97706' : '#DC2626', 
                                                        fontWeight: 'bold',
                                                        fontSize: '0.85rem'
                                                    }}>
                                                        {(Math.round(rowAvgMargin * 10) / 10).toFixed(1)}%
                                                    </span>
                                                );
                                            })()}
                                        </td>
                                        <td style={{ padding: '0.75rem 1.25rem', textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                                                <button
                                                    onClick={() => handleViewPrices(agreement)}
                                                    style={{
                                                        padding: '0.25rem 0.6rem',
                                                        border: `1px solid ${THEME.colors.borderActive}`,
                                                        borderRadius: THEME.radius.sm,
                                                        background: 'white',
                                                        cursor: 'pointer',
                                                        fontSize: '0.7rem',
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
                                                    onClick={() => handleOpenEdit(agreement)}
                                                    style={{
                                                        padding: '0.25rem 0.6rem',
                                                        border: 'none',
                                                        borderRadius: THEME.radius.sm,
                                                        background: '#EFF6FF',
                                                        color: '#1D4ED8',
                                                        cursor: 'pointer',
                                                        fontSize: '0.7rem',
                                                        fontWeight: 'bold',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}
                                                >
                                                    <Edit3 size={12} /> Modificar
                                                </button>
                                                
                                                <button
                                                    onClick={() => handleOpenRenew(agreement)}
                                                    style={{
                                                        padding: '0.25rem 0.6rem',
                                                        border: 'none',
                                                        borderRadius: THEME.radius.sm,
                                                        background: status.type === 'expired' ? '#FEE2E2' : '#FFFBEB',
                                                        color: status.type === 'expired' ? '#EF4444' : '#D97706',
                                                        cursor: 'pointer',
                                                        fontSize: '0.7rem',
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

            {/* CREATE AGREEMENT MODAL */}
            {isCreateModalOpen && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
                    <form 
                        onSubmit={handleCreateAgreementSubmit}
                        style={{ 
                            backgroundColor: 'white', 
                            borderRadius: THEME.radius.lg, 
                            width: '95%', 
                            maxWidth: '540px', 
                            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', 
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                            maxHeight: '90vh'
                        }}
                    >
                        {/* Modal Header */}
                        <div style={{ padding: '1.25rem 1.5rem', borderBottom: `1px solid ${THEME.colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <FileText size={18} style={{ color: THEME.colors.primary }} />
                                <h3 style={{ margin: 0, fontWeight: '900', color: THEME.colors.textMain }}>Crear Acuerdo Comercial</h3>
                            </div>
                            <button 
                                type="button" 
                                onClick={() => {
                                    setIsCreateModalOpen(false);
                                    setSelectedClientId('');
                                    setParsedFile(null);
                                    setUploadedItems([]);
                                }} 
                                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', overflowY: 'auto' }}>
                            
                            {/* EXPLANATORY COMPONENT WITH HELP ICON */}
                            <div style={{ 
                                backgroundColor: '#EFF6FF', 
                                border: '1px solid #BFDBFE', 
                                padding: '1rem', 
                                borderRadius: '12px', 
                                display: 'flex', 
                                gap: '10px', 
                                alignItems: 'flex-start' 
                            }}>
                                <HelpCircle size={20} style={{ color: '#2563EB', flexShrink: 0, marginTop: '2px' }} />
                                <div>
                                    <h4 style={{ margin: 0, fontSize: '0.8rem', fontWeight: 'bold', color: '#1E40AF' }}>
                                        ¿Cómo funciona la Carga Masiva de Precios?
                                    </h4>
                                    <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: '#1E3A8A', lineHeight: '1.4' }}>
                                        Puedes descargar la plantilla pre-rellenada con todos tus productos activos y colocar el precio en la columna vacía, o subir tu propio Excel personalizado. El sistema identificará de forma inteligente las columnas buscando:
                                    </p>
                                    <ul style={{ margin: '6px 0 0 0', paddingLeft: '1.2rem', fontSize: '0.75rem', color: '#1E3A8A', lineHeight: '1.4' }}>
                                        <li><strong>Identificador de Producto:</strong> Cabeceras como <em>idProducto, accounting_id, código, cod. contable, id</em>.</li>
                                        <li><strong>Precio Acordado:</strong> Cabeceras como <em>precio, precio acordado, price, precio neto</em>.</li>
                                    </ul>
                                </div>
                            </div>

                            {/* Client Searchable Dropdown */}
                            <div style={{ position: 'relative' }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: THEME.colors.textSecondary, marginBottom: '6px', textTransform: 'uppercase' }}>Cliente Institucional B2B:</label>
                                
                                <div 
                                    onClick={() => setIsClientDropdownOpen(!isClientDropdownOpen)}
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        borderRadius: THEME.radius.md || '8px',
                                        border: `1px solid ${THEME.colors.border || '#CBD5E1'}`,
                                        backgroundColor: '#FFFFFF',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        fontSize: '0.85rem',
                                        fontWeight: 'bold',
                                        color: selectedClientId ? '#1E293B' : '#94A3B8',
                                        minHeight: '40px'
                                    }}
                                >
                                    <span>
                                        {selectedClientId 
                                            ? `${b2bClients.find(c => c.id === selectedClientId)?.company_name} ${b2bClients.find(c => c.id === selectedClientId)?.nit ? `(NIT: ${b2bClients.find(c => c.id === selectedClientId)?.nit})` : ''}`
                                            : '-- Selecciona un Cliente B2B --'}
                                    </span>
                                    <ChevronRight size={16} style={{ transform: isClientDropdownOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', color: '#64748B' }} />
                                </div>

                                {/* Hidden input for HTML5 required validation */}
                                <input 
                                    type="text" 
                                    required 
                                    value={selectedClientId} 
                                    readOnly 
                                    style={{ position: 'absolute', opacity: 0, width: '100%', height: '1px', bottom: 0, pointerEvents: 'none' }} 
                                />

                                {isClientDropdownOpen && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '100%',
                                        left: 0,
                                        right: 0,
                                        backgroundColor: '#FFFFFF',
                                        borderRadius: '8px',
                                        border: '1px solid #CBD5E1',
                                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                                        zIndex: 2200,
                                        marginTop: '4px',
                                        padding: '8px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '6px'
                                    }}>
                                        {/* Search input inside dropdown panel */}
                                        <div style={{ position: 'relative' }}>
                                            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                                            <input 
                                                type="text"
                                                autoFocus
                                                placeholder="Buscar por nombre, NIT o matriz..."
                                                value={clientSearchQuery}
                                                onChange={(e) => {
                                                    setClientSearchQuery(e.target.value);
                                                    setFocusedOptionIndex(0);
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'ArrowDown') {
                                                        e.preventDefault();
                                                        setFocusedOptionIndex(prev => 
                                                            filteredB2bClients.length > 0 
                                                                ? (prev + 1) % filteredB2bClients.length 
                                                                : 0
                                                        );
                                                    } else if (e.key === 'ArrowUp') {
                                                        e.preventDefault();
                                                        setFocusedOptionIndex(prev => 
                                                            filteredB2bClients.length > 0 
                                                                ? (prev - 1 + filteredB2bClients.length) % filteredB2bClients.length 
                                                                : 0
                                                        );
                                                    } else if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        if (filteredB2bClients[focusedOptionIndex]) {
                                                            setSelectedClientId(filteredB2bClients[focusedOptionIndex].id);
                                                            setClientSearchQuery('');
                                                            setIsClientDropdownOpen(false);
                                                            setFocusedOptionIndex(0);
                                                        }
                                                    } else if (e.key === 'Escape') {
                                                        setIsClientDropdownOpen(false);
                                                    }
                                                }}
                                                onClick={(e) => e.stopPropagation()} // Prevent closing dropdown on click
                                                style={{
                                                    width: '100%',
                                                    padding: '8px 8px 8px 30px',
                                                    borderRadius: '6px',
                                                    border: '1px solid #E2E8F0',
                                                    fontSize: '0.8rem',
                                                    outline: 'none'
                                                }}
                                            />
                                        </div>

                                        {/* Client options list */}
                                        <div style={{ maxHeight: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                            {filteredB2bClients.length === 0 ? (
                                                <div style={{ padding: '12px', fontSize: '0.8rem', color: '#64748B', textAlign: 'center' }}>
                                                    No se encontraron clientes
                                                </div>
                                            ) : (
                                                filteredB2bClients.map((c, index) => {
                                                    const isSelected = selectedClientId === c.id;
                                                    const isFocused = focusedOptionIndex === index;
                                                    return (
                                                        <div
                                                            key={c.id}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedClientId(c.id);
                                                                setClientSearchQuery('');
                                                                setIsClientDropdownOpen(false);
                                                                setFocusedOptionIndex(0);
                                                            }}
                                                            style={{
                                                                padding: '8px 10px',
                                                                borderRadius: '6px',
                                                                cursor: 'pointer',
                                                                backgroundColor: isSelected ? '#F0FDF4' : isFocused ? '#F1F5F9' : 'transparent',
                                                                display: 'flex',
                                                                justifyContent: 'space-between',
                                                                alignItems: 'center',
                                                                transition: 'background-color 0.15s'
                                                            }}
                                                            onMouseEnter={(e) => {
                                                                setFocusedOptionIndex(index);
                                                                e.currentTarget.style.backgroundColor = isSelected ? '#DCFCE7' : '#F1F5F9';
                                                            }}
                                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = isSelected ? '#F0FDF4' : 'transparent'}
                                                        >
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left' }}>
                                                                <span style={{ fontSize: '0.85rem', fontWeight: isSelected ? 'bold' : 'normal', color: isSelected ? '#0D7A57' : '#1E293B' }}>
                                                                    {c.company_name}
                                                                </span>
                                                                {c.nit && (
                                                                    <span style={{ fontSize: '0.7rem', color: '#64748B' }}>
                                                                        NIT: {c.nit}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                                {c.is_corporate_parent && (
                                                                    <span style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#DCFCE7', color: '#15803D', fontWeight: 'bold' }}>
                                                                        Matriz
                                                                    </span>
                                                                )}
                                                                {c.parent_id && (
                                                                    <span style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#E0F2FE', color: '#0369A1', fontWeight: 'bold' }}>
                                                                        Sucursal
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Dates section */}
                            <div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '1rem' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: THEME.colors.textSecondary, marginBottom: '6px', textTransform: 'uppercase' }}>Fecha de Inicio:</label>
                                        <input 
                                            type="date" 
                                            required
                                            value={startDate} 
                                            onChange={(e) => setStartDate(e.target.value)}
                                            style={{ 
                                                width: '100%', 
                                                padding: '10px', 
                                                borderRadius: THEME.radius.md, 
                                                border: `1px solid ${THEME.colors.border}`,
                                                fontSize: '0.85rem'
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: THEME.colors.textSecondary, marginBottom: '6px', textTransform: 'uppercase' }}>Duración:</label>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <input 
                                                type="number"
                                                min="1"
                                                required
                                                value={durationValue}
                                                onChange={(e) => setDurationValue(Math.max(1, parseInt(e.target.value) || 1))}
                                                style={{ 
                                                    width: '80px', 
                                                    padding: '10px', 
                                                    borderRadius: THEME.radius.md, 
                                                    border: `1px solid ${THEME.colors.border}`,
                                                    fontSize: '0.85rem',
                                                    textAlign: 'center'
                                                }}
                                            />
                                            <select
                                                value={durationUnit}
                                                onChange={(e) => setDurationUnit(e.target.value)}
                                                style={{
                                                    flex: 1,
                                                    padding: '10px',
                                                    borderRadius: THEME.radius.md,
                                                    border: `1px solid ${THEME.colors.border}`,
                                                    fontSize: '0.85rem'
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
                                    const formattedExpiry = expiry.toLocaleDateString('es-ES', {
                                        day: '2-digit',
                                        month: '2-digit',
                                        year: 'numeric'
                                    });
                                    return (
                                        <div style={{ 
                                            marginTop: '10px', 
                                            fontSize: '0.8rem', 
                                            color: THEME.colors.textSecondary,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px'
                                        }}>
                                            <span>📅 El acuerdo vencerá el:</span>
                                            <strong style={{ color: THEME.colors.primary }}>{formattedExpiry}</strong>
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* Excel section */}
                            <div style={{ borderTop: `1px solid ${THEME.colors.border}`, paddingTop: '1.25rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: THEME.colors.textSecondary, textTransform: 'uppercase' }}>Lista de Precios (Excel):</span>
                                    <button
                                        type="button"
                                        onClick={downloadTemplate}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: THEME.colors.primary,
                                            fontSize: '0.75rem',
                                            fontWeight: 'bold',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}
                                    >
                                        <Download size={14} /> Descargar Plantilla
                                    </button>
                                </div>

                                {/* Drag-drop or File Input */}
                                <div style={{
                                    border: `2px dashed ${parsedFile ? THEME.colors.primary : '#CBD5E1'}`,
                                    backgroundColor: parsedFile ? '#F0FDF4' : '#F8FAFC',
                                    borderRadius: '12px',
                                    padding: '1.5rem',
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
                                    <UploadCloud size={32} style={{ color: parsedFile ? THEME.colors.primary : '#94A3B8', margin: '0 auto 8px auto' }} />
                                    {parsedFile ? (
                                        <div>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: THEME.colors.textMain }}>{parsedFile.name}</div>
                                            <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, marginTop: '2px' }}>
                                                {uploadedItems.length} productos detectados listos para cargar
                                            </div>
                                        </div>
                                    ) : (
                                        <div>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: THEME.colors.textMain }}>Selecciona o arrastra tu archivo Excel</div>
                                            <div style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary, marginTop: '2px' }}>
                                                Formatos soportados: .xlsx, .xls
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div style={{ padding: '1.25rem 1.5rem', borderTop: `1px solid ${THEME.colors.border}`, display: 'flex', gap: '10px', backgroundColor: '#F9FAFB' }}>
                            <button 
                                type="button" 
                                onClick={() => {
                                    setIsCreateModalOpen(false);
                                    setSelectedClientId('');
                                    setParsedFile(null);
                                    setUploadedItems([]);
                                }} 
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
                                disabled={savingAgreement || parsing || uploadedItems.length === 0}
                                style={{ 
                                    flex: 2, 
                                    padding: '10px', 
                                    borderRadius: THEME.radius.md, 
                                    border: 'none', 
                                    backgroundColor: (uploadedItems.length === 0 || savingAgreement) ? '#CBD5E1' : THEME.colors.primary, 
                                    color: 'white', 
                                    fontWeight: 'bold',
                                    cursor: (uploadedItems.length === 0 || savingAgreement) ? 'not-allowed' : 'pointer'
                                }}
                            >
                                {savingAgreement ? 'Guardando...' : 'Crear Acuerdo'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* EDIT AGREEMENT MODAL */}
            {isEditModalOpen && editingAgreement && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
                    <div style={{ 
                        backgroundColor: 'white', 
                        borderRadius: THEME.radius.lg, 
                        width: '95%', 
                        maxWidth: '540px', 
                        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', 
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        maxHeight: '90vh'
                    }}>
                        {/* Modal Header */}
                        <div style={{ padding: '1.25rem 1.5rem', borderBottom: `1px solid ${THEME.colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontWeight: '900', color: THEME.colors.textMain }}>
                                {editStep === 1 && `Modificar Acuerdo ${formatAgreementNumber(editingAgreement.quote_number, editingAgreement.created_at)}`}
                                {editStep === 2 && '⚠️ Confirmación de Modificación (Paso 1/2)'}
                                {editStep === 3 && '🛑 Confirmación de Seguridad (Paso 2/2)'}
                            </h3>
                            <button 
                                type="button"
                                onClick={() => setIsEditModalOpen(false)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: THEME.colors.textSecondary }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {editStep === 1 && (
                            <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                {/* Client Info Block */}
                                <div style={{ backgroundColor: '#F8FAFC', padding: '12px 16px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                    <span style={{ display: 'block', fontSize: '0.7rem', fontWeight: 'bold', color: '#64748B', textTransform: 'uppercase', marginBottom: '4px' }}>Cliente B2B Asociado:</span>
                                    <strong style={{ display: 'block', fontSize: '0.95rem', color: THEME.colors.textMain }}>
                                        {editingAgreement.profiles?.company_name || editingAgreement.client_name}
                                    </strong>
                                    {editingAgreement.profiles?.nit && (
                                        <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748B', marginTop: '2px' }}>
                                            NIT: {editingAgreement.profiles.nit}
                                        </span>
                                    )}
                                </div>

                                {/* Start Date & Duration */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '1rem' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#64748B', marginBottom: '6px', textTransform: 'uppercase' }}>Fecha de Inicio:</label>
                                        <input 
                                            type="date" 
                                            required
                                            value={editStartDate} 
                                            onChange={(e) => setEditStartDate(e.target.value)}
                                            style={{ 
                                                width: '100%', 
                                                padding: '10px', 
                                                borderRadius: '8px', 
                                                border: `1px solid #CBD5E1`,
                                                fontSize: '0.85rem'
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#64748B', marginBottom: '6px', textTransform: 'uppercase' }}>Duración:</label>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <input 
                                                type="number"
                                                min="1"
                                                required
                                                value={editDurationValue}
                                                onChange={(e) => setEditDurationValue(Math.max(1, parseInt(e.target.value) || 1))}
                                                style={{ 
                                                    width: '80px', 
                                                    padding: '10px', 
                                                    borderRadius: '8px', 
                                                    border: `1px solid #CBD5E1`,
                                                    fontSize: '0.85rem',
                                                    textAlign: 'center'
                                                }}
                                            />
                                            <select
                                                value={editDurationUnit}
                                                onChange={(e) => setEditDurationUnit(e.target.value)}
                                                style={{
                                                    flex: 1,
                                                    padding: '10px',
                                                    borderRadius: '8px',
                                                    border: `1px solid #CBD5E1`,
                                                    fontSize: '0.85rem'
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

                                {/* Dynamic Expiration Preview */}
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
                                    const formattedExpiry = expiry.toLocaleDateString('es-ES', {
                                        day: '2-digit',
                                        month: '2-digit',
                                        year: 'numeric'
                                    });
                                    return (
                                        <div style={{ 
                                            fontSize: '0.8rem', 
                                            color: '#64748B',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            backgroundColor: '#F0FDF4',
                                            padding: '10px 14px',
                                            borderRadius: '8px',
                                            border: '1px solid #DCFCE7'
                                        }}>
                                            <span>📅 Nueva fecha de vencimiento:</span>
                                            <strong style={{ color: '#0D7A57' }}>{formattedExpiry}</strong>
                                        </div>
                                    );
                                })()}

                                {/* Excel File Upload (Optional) */}
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#64748B', textTransform: 'uppercase' }}>Actualizar Precios (Opcional):</span>
                                        <button
                                            type="button"
                                            onClick={downloadTemplate}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                color: '#0D7A57',
                                                fontSize: '0.75rem',
                                                fontWeight: 'bold',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                        >
                                            <Download size={12} /> Descargar Planilla Vacía
                                        </button>
                                    </div>
                                    
                                    <p style={{ margin: '0 0 10px 0', fontSize: '0.75rem', color: '#64748B', lineHeight: '1.4' }}>
                                        Sube un nuevo Excel si deseas reemplazar la lista de precios congelados actual. Si lo dejas vacío, se mantendrán los mismos precios que tiene el acuerdo actualmente.
                                    </p>

                                    {/* Excel Dropzone */}
                                    <div style={{ position: 'relative' }}>
                                        <input 
                                            type="file" 
                                            accept=".xlsx, .xls"
                                            onChange={handleEditFileUpload}
                                            style={{
                                                position: 'absolute',
                                                inset: 0,
                                                opacity: 0,
                                                cursor: 'pointer',
                                                zIndex: 10
                                            }}
                                        />
                                        <div style={{
                                            border: `2px dashed ${editParsedFile ? '#0D7A57' : '#CBD5E1'}`,
                                            borderRadius: THEME.radius.md,
                                            padding: '1.5rem',
                                            textAlign: 'center',
                                            backgroundColor: editParsedFile ? '#F0FDF4' : '#F8FAFC',
                                            transition: 'all 0.2s',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '8px'
                                        }}>
                                            <UploadCloud size={32} color={editParsedFile ? '#0D7A57' : '#94A3B8'} />
                                            {editParsing ? (
                                                <div style={{ fontSize: '0.85rem', color: '#64748B' }}>Procesando archivo...</div>
                                            ) : editParsedFile ? (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#0D7A57' }}>
                                                        {editParsedFile.name} ({editUploadedItems.length} productos)
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            e.preventDefault();
                                                            setEditParsedFile(null);
                                                            setEditUploadedItems([]);
                                                        }}
                                                        style={{
                                                            background: 'none',
                                                            border: 'none',
                                                            color: '#EF4444',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            padding: '2px'
                                                        }}
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div>
                                                    <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: THEME.colors.textMain }}>Selecciona o arrastra tu archivo Excel</div>
                                                    <div style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary, marginTop: '2px' }}>
                                                        Dejar en blanco para conservar los precios existentes
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Modal Footer */}
                                <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                                    <button 
                                        type="button" 
                                        onClick={() => setIsEditModalOpen(false)} 
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
                                        type="button" 
                                        onClick={() => setEditStep(2)}
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
                                        Continuar
                                    </button>
                                </div>
                            </div>
                        )}

                        {editStep === 2 && (
                            <div style={{ padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '1.5rem' }}>
                                <div style={{ backgroundColor: '#FEF3C7', padding: '16px', borderRadius: '50%', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <AlertCircle size={48} />
                                </div>
                                <div>
                                    <h4 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: '900', color: '#92400E' }}>
                                        ¿Estás seguro de que deseas modificar este acuerdo?
                                    </h4>
                                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#6B7280', lineHeight: '1.5' }}>
                                        Estás modificando la vigencia o la lista de precios congelados para el cliente <strong style={{ color: '#111827' }}>{editingAgreement.profiles?.company_name || editingAgreement.client_name}</strong>. Esta modificación entrará en vigor inmediatamente y afectará la facturación de todos sus pedidos pendientes y futuros.
                                    </p>
                                </div>

                                <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                                    <button 
                                        type="button" 
                                        onClick={() => setEditStep(1)} 
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
                                        Volver a Editar
                                    </button>
                                    <button 
                                        type="button" 
                                        onClick={() => setEditStep(3)}
                                        style={{ 
                                            flex: 1, 
                                            padding: '10px', 
                                            borderRadius: THEME.radius.md, 
                                            border: 'none', 
                                            backgroundColor: '#D97706', 
                                            color: 'white', 
                                            fontWeight: 'bold',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Confirmar y Continuar
                                    </button>
                                </div>
                            </div>
                        )}

                        {editStep === 3 && (
                            <div style={{ padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '1.5rem' }}>
                                <div style={{ backgroundColor: '#FEE2E2', padding: '16px', borderRadius: '50%', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <AlertCircle size={48} />
                                </div>
                                <div>
                                    <h4 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: '900', color: '#991B1B' }}>
                                        Confirmación de Seguridad Obligatoria
                                    </h4>
                                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#6B7280', lineHeight: '1.5' }}>
                                        Para prevenir errores comerciales accidentales en la base de datos de precios, por favor lee y marca la casilla de consentimiento de seguridad.
                                    </p>
                                </div>

                                <label style={{ 
                                    display: 'flex', 
                                    alignItems: 'flex-start', 
                                    gap: '10px', 
                                    textAlign: 'left', 
                                    padding: '12px', 
                                    backgroundColor: '#FFF5F5', 
                                    border: '1px solid #FEE2E2', 
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    width: '100%'
                                }}>
                                    <input 
                                        type="checkbox"
                                        checked={editConfirmationChecked}
                                        onChange={(e) => setEditConfirmationChecked(e.target.checked)}
                                        style={{ marginTop: '3px', width: '16px', height: '16px', cursor: 'pointer' }}
                                    />
                                    <span style={{ fontSize: '0.8rem', color: '#991B1B', lineHeight: '1.4', fontWeight: 'bold' }}>
                                        Confirmo que he validado los nuevos precios y vigencia con el área comercial y el cliente B2B, y asumo la responsabilidad técnica de esta modificación.
                                    </span>
                                </label>

                                <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                                    <button 
                                        type="button" 
                                        onClick={() => setEditStep(2)} 
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
                                        Volver
                                    </button>
                                    <button 
                                        type="button" 
                                        disabled={!editConfirmationChecked || editSaving}
                                        onClick={handleEditSubmit}
                                        style={{ 
                                            flex: 2, 
                                            padding: '10px', 
                                            borderRadius: THEME.radius.md, 
                                            border: 'none', 
                                            backgroundColor: (!editConfirmationChecked || editSaving) ? '#CBD5E1' : '#DC2626', 
                                            color: 'white', 
                                            fontWeight: 'bold',
                                            cursor: (!editConfirmationChecked || editSaving) ? 'not-allowed' : 'pointer'
                                        }}
                                    >
                                        {editSaving ? 'Guardando...' : 'Aplicar Modificaciones'}
                                    </button>
                                </div>
                            </div>
                        )}
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
