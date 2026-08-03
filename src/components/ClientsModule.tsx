'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/authContext';
import Toast from '@/components/Toast';
import { parseLogisticsText, formatTimeWindow, LogisticsData } from '@/lib/logistics-parser';
import { THEME, formatNumber, formatMoney } from '@/lib/adminTheme';
import {
    AlertTriangle,
    Check,
    Cpu,
    Edit2,
    FileText,
    Folder,
    Loader2,
    Mail,
    MapPin,
    Package,
    Phone,
    Printer,
    Search,
    Sliders,
    Sparkles,
    Trash2,
    X,
    RefreshCw,
    FileDown,
    FileUp,
    BarChart3,
    Building2,
    Users,
    ChevronRight,
    Home,
    HelpCircle,
    Info,
    UploadCloud,
    Download,
    Plus,
    User,
    List,
    Grid,
    Lock,
    CheckCircle2,
    AlertCircle,
    ExternalLink,
    ArrowLeft,
    Settings,
    ClipboardList,
    UserCheck,
    CreditCard,
    MessageSquare,
    Scale,
    DollarSign,
    Calendar
} from 'lucide-react';
import * as XLSX from 'xlsx';
import CommercialAgreementsModule from './CommercialAgreementsModule';

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
    contact_phone?: string;
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
    logistics_data?: LogisticsData;
    needs_crates?: boolean;
    document_type?: string;
    remission_with_prices?: boolean;
    print_invoice?: boolean;
    total_orders?: number;
    total_spent?: number;
    last_order?: string;
    is_corporate_parent?: boolean;
    parent_id?: string;
    branch_id?: string;
    corporate_role?: string;
    additional_billing_emails?: string;
    rut_url?: string;
    mercantile_registry_url?: string;
    iva_responsible?: boolean;
    is_gran_contribuyente?: boolean;
    is_autorretenedor?: boolean;
    is_regimen_simple?: boolean;
    economic_activity_code?: string;
    collection_responsible_name?: string;
    collection_responsible_email?: string;
    collection_responsible_phone?: string;
    comm_ref_1_name?: string;
    comm_ref_1_nit?: string;
    comm_ref_1_phone?: string;
    comm_ref_1_email?: string;
    comm_ref_2_name?: string;
    comm_ref_2_nit?: string;
    comm_ref_2_phone?: string;
    comm_ref_2_email?: string;
    remission_copies?: number;
    id_zr?: string;
    id_lp?: string;
    payment_days?: number;
    is_active?: boolean;
    created_at: string;
}

interface Lead {
    id: string;
    company_name?: string;
    nit?: string;
    contact_name: string;
    phone: string;
    email?: string;
    status: string;
    notes?: string;
    business_type?: string;
    business_size?: string;
    latitude?: number;
    longitude?: number;
    address?: string;
    municipality?: string;
    last_contact_date?: string;
    next_contact_date?: string;
    contact_count?: number;
    logistics_data?: LogisticsData;
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

export default function ClientsModule() {
    const { profile } = useAuth();

    const hasEditPermission = () => {
        if (!profile) return false;
        if (profile.role === 'admin' || profile.role === 'sys_admin') return true;
        const perms = profile.custom_permissions || [];
        return perms.includes('*') || perms.includes('admin.commercial.clients') || perms.includes('admin.commercial.clients.edit') || perms.includes('admin.clients.edit');
    };

    const [activeTab, setActiveTab] = useState('dashboard');
    const [hoveredTab, setHoveredTab] = useState<string | null>(null);
    const [clientsB2B, setClientsB2B] = useState<Profile[]>([]);
    const [clientsB2C, setClientsB2C] = useState<Profile[]>([]);
    const [leads, setLeads] = useState<Lead[]>([]);
    const [pricingModels, setPricingModels] = useState<PricingModel[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<Partial<Profile> | null>(null);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
    const [showHelpTooltip, setShowHelpTooltip] = useState(false);
    const [isNicknameModalOpen, setIsNicknameModalOpen] = useState(false);
    const [nicknameClientId, setNicknameClientId] = useState<string | null>(null);
    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isFormReadOnly, setIsFormReadOnly] = useState(false);

    // Lead Conversion Modal State
    const [conversionLead, setConversionLead] = useState<Lead | null>(null);
    const [conversionCompanyName, setConversionCompanyName] = useState('');
    const [conversionNit, setConversionNit] = useState('');
    const [conversionPhone, setConversionPhone] = useState('');
    const [conversionAddress, setConversionAddress] = useState('');
    const [conversionCreateAgreement, setConversionCreateAgreement] = useState(false);
    const [conversionStartDate, setConversionStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [conversionDurationValue, setConversionDurationValue] = useState<number>(2);
    const [conversionDurationUnit, setConversionDurationUnit] = useState<string>('weeks');
    const [conversionFile, setConversionFile] = useState<File | null>(null);
    const [conversionItems, setConversionItems] = useState<{ accounting_id: string; unit_price: number; product_name?: string }[]>([]);
    const [converting, setConverting] = useState(false);
    const [parsingFile, setParsingFile] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Clientes B2B (Profiles)
            const { data: b2bData } = await supabase
                .from('profiles')
                .select('*')
                .eq('role', 'b2b_client')
                .order('created_at', { ascending: false });

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

            // 6. Acuerdos Activos (Semáforo)
            const { data: agreementData } = await supabase
                .from('quotes')
                .select('client_id, valid_until')
                .eq('status', 'agreement');
            
            const normalizeProfile = (p: any) => ({
                ...p,
                phone: p.phone || p.contact_phone || '',
                is_active: p.is_active !== false
            });
            setClientsB2B((b2bData || []).map(normalizeProfile));
            setLeads(leadData || []);
            setPricingModels(pmData || []);
            setClientsB2C((b2cData || []).map(normalizeProfile));
            setOrders(orderData || []);
            setAllAgreements(agreementData || []);
        } catch (error) {
            console.error('Error fetching client data:', error);
        } finally {
            setLoading(false);
        }
    };

    const [allAgreements, setAllAgreements] = useState<any[]>([]);

    const getAgreementStatus = (clientId: string, parentId?: string): 'active' | 'warning' | 'expired' | 'none' => {
        let clientAgreements = allAgreements.filter(a => a.client_id === clientId);
        if (clientAgreements.length === 0 && parentId) {
            clientAgreements = allAgreements.filter(a => a.client_id === parentId);
        }
        if (clientAgreements.length === 0) return 'none';
        
        const now = new Date();
        const fifteenDaysFromNow = new Date();
        fifteenDaysFromNow.setDate(now.getDate() + 15);
        
        // 1. Si hay al menos un acuerdo activo vigente por más de 15 días o sin expiración fija -> active
        const hasActive = clientAgreements.some(a => {
            if (!a.valid_until) return true; // Abierto / sin vencimiento
            const expiry = new Date(a.valid_until);
            return expiry > fifteenDaysFromNow;
        });
        if (hasActive) return 'active';
        
        // 2. Si vence en los próximos 15 días -> warning (Por Vencer)
        const hasWarning = clientAgreements.some(a => {
            if (!a.valid_until) return false;
            const expiry = new Date(a.valid_until);
            return expiry >= now && expiry <= fifteenDaysFromNow;
        });
        if (hasWarning) return 'warning';
        
        // 3. Si la fecha de vencimiento ya pasó en el pasado -> expired (Vencido)
        const hasExpired = clientAgreements.some(a => {
            if (!a.valid_until) return false;
            const expiry = new Date(a.valid_until);
            return expiry < now;
        });
        if (hasExpired) return 'expired';
        
        return 'none';
    };

    const isAgreementInherited = (clientId: string, parentId?: string) => {
        const hasOwn = allAgreements.some(a => a.client_id === clientId);
        return !hasOwn && !!parentId && allAgreements.some(a => a.client_id === parentId);
    };

    const handleUpdateLeadStatus = async (id: string, newStatus: string) => {
        if (newStatus === 'converted') {
            const lead = leads.find(l => l.id === id);
            if (lead) {
                let parsedAddress = lead.address || '';
                let parsedNit = lead.nit ? String(lead.nit) : '';
                if (!parsedAddress) {
                    const notesText = lead.notes || '';
                    if (notesText.includes('ORIG:')) {
                        const origMatch = notesText.match(/ORIG:\s*([^|]+)/);
                        if (origMatch) parsedAddress = origMatch[1].trim();
                    }
                }
                setConversionLead(lead);
                setConversionCompanyName(lead.company_name || lead.contact_name || '');
                setConversionNit(parsedNit);
                setConversionPhone(lead.phone || '');
                setConversionAddress(parsedAddress);
                setConversionCreateAgreement(false);
                setConversionStartDate(new Date().toISOString().split('T')[0]);
                setConversionDurationValue(2);
                setConversionDurationUnit('weeks');
                setConversionFile(null);
                setConversionItems([]);
                return;
            }
        }

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

    const downloadConversionTemplate = async () => {
        try {
            const { data: products, error } = await supabase
                .from('products')
                .select('accounting_id, name, base_price, unit_of_measure')
                .eq('is_active', true)
                .order('name');
            
            if (error) throw error;
            if (!products || products.length === 0) {
                window.showToast?.('No se encontraron productos activos', 'error');
                return;
            }
            
            const rows = products.map(p => ({
                'ID Producto (Cod. Contable)': p.accounting_id,
                'Nombre del Producto': p.name,
                'U.M.': p.unit_of_measure || 'Unidad',
                'Costo Base (Referencia)': p.base_price || 0,
                'Precio Acordado': ''
            }));
            
            const worksheet = XLSX.utils.json_to_sheet(rows);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Plantilla Precios B2B');
            XLSX.writeFile(workbook, 'Plantilla_Acuerdo_Comercial.xlsx');
            window.showToast?.('Plantilla descargada con éxito', 'success');
        } catch (err: any) {
            console.error(err);
            window.showToast?.('Error al descargar plantilla: ' + err.message, 'error');
        }
    };

    const handleConversionFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        setConversionFile(file);
        setParsingFile(true);
        
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
                    throw new Error('No se encontraron las columnas Código y Precio');
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
                
                setConversionItems(parsedItems);
                window.showToast?.(`Se cargaron ${rowCount} productos válidos desde el Excel`, 'success');
            } catch (err: any) {
                console.error(err);
                window.showToast?.('Error al leer Excel: ' + err.message, 'error');
                setConversionFile(null);
                setConversionItems([]);
            } finally {
                setParsingFile(false);
            }
        };
        reader.readAsBinaryString(file);
    };

    const handleConversionSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!conversionLead) return;
        
        setConverting(true);
        try {
            const { data: newProfile, error: profileErr } = await supabase
                .from('profiles')
                .insert({
                    company_name: conversionCompanyName,
                    contact_name: conversionLead.contact_name,
                    email: conversionLead.email,
                    phone: conversionPhone,
                    address: conversionAddress,
                    nit: conversionNit ? parseInt(conversionNit.replace(/[^0-9]/g, '')) : null,
                    role: 'b2b_client',
                    is_active: true
                })
                .select()
                .single();
                
            if (profileErr) throw profileErr;
            
            const { error: leadErr } = await supabase
                .from('leads')
                .update({ status: 'converted' })
                .eq('id', conversionLead.id);
                
            if (leadErr) throw leadErr;
            
            if (conversionCreateAgreement && conversionItems.length > 0) {
                const expiry = new Date(conversionStartDate + 'T12:00:00');
                if (conversionDurationUnit === 'days') {
                    expiry.setDate(expiry.getDate() + conversionDurationValue);
                } else if (conversionDurationUnit === 'weeks') {
                    expiry.setDate(expiry.getDate() + conversionDurationValue * 7);
                } else if (conversionDurationUnit === 'months') {
                    expiry.setMonth(expiry.getMonth() + conversionDurationValue);
                } else if (conversionDurationUnit === 'years') {
                    expiry.setFullYear(expiry.getFullYear() + conversionDurationValue);
                }
                const calculatedValidUntil = expiry.toISOString();
                
                const { data: dbProducts, error: dbProdErr } = await supabase
                    .from('products')
                    .select('id, name, base_price, accounting_id');
                    
                if (dbProdErr) throw dbProdErr;
                
                const productMap: Record<string, any> = {};
                dbProducts.forEach(p => {
                    if (p.accounting_id !== null && p.accounting_id !== undefined) {
                        productMap[String(p.accounting_id)] = p;
                    }
                });
                
                const { data: newQuote, error: insertQErr } = await supabase
                    .from('quotes')
                    .insert({
                        client_id: newProfile.id,
                        client_name: newProfile.company_name || newProfile.contact_name,
                        status: 'agreement',
                        start_date: conversionStartDate ? new Date(conversionStartDate).toISOString() : new Date().toISOString(),
                        valid_until: calculatedValidUntil,
                        version: 1,
                        subtotal_amount: 0,
                        total_tax_amount: 0,
                        total_amount: 0
                    })
                    .select()
                    .single();
                    
                if (insertQErr) throw insertQErr;
                
                const itemsToInsert: any[] = [];
                conversionItems.forEach(item => {
                    const dbProduct = productMap[String(item.accounting_id)];
                    if (dbProduct) {
                        const basePrice = dbProduct.base_price || 0;
                        const negotiatedPrice = item.unit_price;
                        const marginPercent = negotiatedPrice > 0 ? Math.round(((negotiatedPrice - basePrice) / negotiatedPrice) * 10000) / 100 : 0;
                        
                        itemsToInsert.push({
                            quote_id: newQuote.id,
                            product_id: dbProduct.id,
                            product_name: dbProduct.name,
                            quantity: 1,
                            cost_basis: basePrice,
                            margin_percent: marginPercent,
                            unit_price: negotiatedPrice,
                            iva_rate: 0,
                            iva_amount: 0,
                            total_price: negotiatedPrice
                        });
                    }
                });
                
                if (itemsToInsert.length > 0) {
                    const batchSize = 100;
                    for (let i = 0; i < itemsToInsert.length; i += batchSize) {
                        const batch = itemsToInsert.slice(i, i + batchSize);
                        const { error: insertItemsErr } = await supabase
                            .from('quote_items')
                            .insert(batch);
                        if (insertItemsErr) throw insertItemsErr;
                    }
                }
            }
            
            window.showToast?.('Prospecto convertido a cliente con éxito', 'success');
            setConversionLead(null);
            
            fetchData();
        } catch (err: any) {
            console.error(err);
            window.showToast?.('Error en conversión: ' + err.message, 'error');
        } finally {
            setConverting(false);
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
        setEditTarget(client);
        setIsFormReadOnly(true);
        setIsFormModalOpen(true);
    };

    const handleEditClient = (client: Profile) => {
        setEditTarget(client);
        setIsFormReadOnly(false);
        setIsFormModalOpen(true);
    };

    const handleCreateClient = (role: 'b2b_client' | 'b2c_client' = 'b2b_client') => {
        setEditTarget({ role }); // Send role even if new
        setIsFormReadOnly(false);
        setIsFormModalOpen(true);
    };

    const downloadClientsMaster = () => {
        // Ordenamiento Jerárquico: Matriz primero, sucursales vinculadas inmediatamente abajo
        const sortedClients: Profile[] = [];
        const addedIds = new Set<string>();

        // 1. Matrices y sus sucursales
        const parents = clientsB2B.filter(c => c.is_corporate_parent);
        parents.forEach(parent => {
            sortedClients.push(parent);
            addedIds.add(parent.id);
            
            const branches = clientsB2B.filter(c => c.parent_id === parent.id);
            branches.forEach(b => {
                sortedClients.push(b);
                addedIds.add(b.id);
            });
        });

        // 2. Clientes B2B independientes (sin matriz)
        clientsB2B.forEach(c => {
            if (!addedIds.has(c.id)) {
                sortedClients.push(c);
                addedIds.add(c.id);
            }
        });

        // 3. Clientes B2C (Hogar)
        clientsB2C.forEach(c => {
            if (!addedIds.has(c.id)) {
                sortedClients.push(c);
                addedIds.add(c.id);
            }
        });

        // Tab 1: Clientes Base
        const exportData = sortedClients.map(c => {
            const parent = clientsB2B.find(p => p.id === c.parent_id);
            const pModel = pricingModels.find(m => m.id === c.pricing_model_id);
            const isBranch = !!c.parent_id && !c.is_corporate_parent;

            let jerarquiaVisual = 'INDEPENDIENTE';
            if (c.role === 'b2c_client') jerarquiaVisual = 'HOGAR';
            else if (c.is_corporate_parent) jerarquiaVisual = '🏢 CASA MATRIZ';
            else if (isBranch) jerarquiaVisual = '  ↳ SUCURSAL';

            return {
                Estado: c.is_active !== false ? 'ACTIVO' : 'INACTIVO',
                Jerarquia_Visual: jerarquiaVisual,
                ID_INTERNO: c.id,
                NIT_CEDULA: c.nit || '',
                Nombre_Comercial: c.company_name || c.contact_name || '',
                Razon_Social: c.razon_social || c.company_name || '',
                Nombre_Contacto: c.contact_name || '',
                Telefono: c.phone || c.contact_phone || '',
                Email: c.email || '',
                Email_Notificacion_2: (c as any).email_2 || '',
                Email_Notificacion_3: (c as any).email_3 || '',
                Direccion: c.address || '',
                Complemento_Direccion: (c as any).address_complement || '',
                Ciudad: c.city || 'Bogotá',
                Municipio: c.municipality || c.city || 'Bogotá',
                Departamento: c.department || 'Cundinamarca',
                Tipo_Cliente: c.role === 'b2c_client' ? 'HOGAR' : 'INSTITUCIONAL',
                Modelo_Precios_Nombre: pModel ? pModel.name : (isBranch ? 'HEREDADO_MATRIZ' : ''),
                
                // Jerarquía Comercial
                Es_Matriz: c.is_corporate_parent ? 'SI' : 'NO',
                NIT_Matriz_Padre: parent?.nit || '',
                Nombre_Matriz_Padre: parent?.company_name || '',
                Codigo_Sucursal: c.branch_id || '',
                Rol_Corporativo: c.corporate_role || '',

                // Configuración Financiera y Facturación (Institucional / Matriz)
                Cupo_Credito: c.credit_limit || 0,
                Condicion_Pago: c.payment_terms || 'Contado',
                Responsable_IVA: c.iva_responsible ? 'SI' : 'NO',
                Gran_Contribuyente: c.is_gran_contribuyente ? 'SI' : 'NO',
                Autorretenedor: c.is_autorretenedor ? 'SI' : 'NO',
                Regimen_Simple: c.is_regimen_simple ? 'SI' : 'NO',
                Actividad_Economica: c.economic_activity_code || '',
                Correos_Facturacion_Adicionales: c.additional_billing_emails || '',

                // Contacto Cartera (Institucional / Matriz)
                Responsable_Cartera: c.collection_responsible_name || '',
                Email_Cartera: c.collection_responsible_email || '',
                Telefono_Cartera: c.collection_responsible_phone || '',

                // Referencias Comerciales
                Ref_Comercial_1_Nombre: c.comm_ref_1_name || '',
                Ref_Comercial_1_NIT: c.comm_ref_1_nit || '',
                Ref_Comercial_1_Telefono: c.comm_ref_1_phone || '',
                Ref_Comercial_1_Email: c.comm_ref_1_email || '',
                Ref_Comercial_2_Nombre: c.comm_ref_2_name || '',
                Ref_Comercial_2_NIT: c.comm_ref_2_nit || '',
                Ref_Comercial_2_Telefono: c.comm_ref_2_phone || '',
                Ref_Comercial_2_Email: c.comm_ref_2_email || '',

                // Operaciones y Logística (Sucursal / Hogar)
                Requiere_Canastillas: c.needs_crates ? 'SI' : 'NO',
                Tipo_Documento: c.document_type || 'invoice', // invoice | remission
                Imprimir_Factura_Fisica: c.print_invoice ? 'SI' : 'NO',
                Remision_Con_Precios: c.remission_with_prices ? 'SI' : 'NO',
                Restricciones_Entrega: c.delivery_restrictions || '',
                Copias_Remision: c.remission_copies || 2,
                Latitud: c.latitude || '',
                Longitud: c.longitude || '',
                URL_RUT: c.rut_url || '',
                URL_Camara_Comercio: c.mercantile_registry_url || '',
                
                // Códigos ERP de Integración
                Codigo_ZR: c.id_zr || '',
                Codigo_LP: c.id_lp || '',
                Dias_Pago: c.payment_days || 0
            };
        });

        // Tab 2: Guía de Datos
        const guideHeaders = ["Campo Excel", "Requerido", "Aplica A", "Descripción y Valores Permitidos"];
        const guideRows = [
            ["Estado", "NO", "Todos", "ACTIVO = Cuenta habilitada para ventas. INACTIVO = Cuenta archivada/deshabilitada."],
            ["ID_INTERNO", "NO", "Todos", "ID único de Supabase. Dejar intacto para actualizar cliente existente. Dejar vacío si es nuevo."],
            ["NIT_CEDULA", "SÍ", "Todos", "NIT de la empresa o Cédula de Ciudadanía."],
            ["Nombre_Comercial", "SÍ", "Todos", "Nombre de fantasía o del negocio."],
            ["Razon_Social", "SÍ (Institucionales)", "Institucional", "Razón social legal para facturación electrónica."],
            ["Nombre_Contacto", "SÍ", "Todos", "Persona encargada de recibir o coordinar."],
            ["Telefono", "SÍ", "Todos", "Teléfono celular principal."],
            ["Email", "SÍ", "Todos", "Correo electrónico de contacto y recepción."],
            ["Direccion", "SÍ", "Todos", "Dirección de entrega."],
            ["Ciudad", "SÍ", "Todos", "Ciudad (ej: Bogotá, Villavicencio)."],
            ["Municipio", "SÍ", "Todos", "Municipio específico."],
            ["Departamento", "SÍ", "Todos", "Departamento político (ej: Cundinamarca, Meta)."],
            ["Tipo_Cliente", "SÍ", "Todos", "INSTITUCIONAL o HOGAR."],
            ["Modelo_Precios_Nombre", "NO", "Institucional", "Nombre exacto del esquema de precios (ej: Lista Base, Lista VIP)."],
            ["Es_Matriz", "NO", "Institucional", "SI = Si centraliza la facturación y cartera. NO = Si es punto de entrega o independiente."],
            ["NIT_Matriz_Padre", "NO", "Sucursal", "NIT de la casa matriz vinculada."],
            ["Nombre_Matriz_Padre", "NO", "Sucursal", "Nombre de la matriz como referencia."],
            ["Codigo_Sucursal", "NO", "Sucursal", "Código interno de sucursal (ej: SUC-01)."],
            ["Rol_Corporativo", "NO", "Sucursal", "Descripción del rol (ej: Punto de Venta Mall)."],
            ["Cupo_Credito", "NO", "Matriz / Indep.", "Monto máximo en pesos aprobado a crédito."],
            ["Condicion_Pago", "NO", "Matriz / Indep.", "Condición de pago (ej: Contado, 8 Días, 15 Días, 30 Días)."],
            ["Responsable_IVA", "NO", "Matriz / Indep.", "SI / NO."],
            ["Gran_Contribuyente", "NO", "Matriz / Indep.", "SI / NO."],
            ["Autorretenedor", "NO", "Matriz / Indep.", "SI / NO."],
            ["Regimen_Simple", "NO", "Matriz / Indep.", "SI / NO."],
            ["Actividad_Economica", "NO", "Matriz / Indep.", "Código CIIU de actividad económica."],
            ["Correos_Facturacion_Adicionales", "NO", "Matriz / Indep.", "Correos adicionales separados por comas."],
            ["Responsable_Cartera", "NO", "Matriz / Indep.", "Nombre del contacto de contabilidad/pagos."],
            ["Email_Cartera", "NO", "Matriz / Indep.", "Correo de pagos/cartera."],
            ["Telefono_Cartera", "NO", "Matriz / Indep.", "Teléfono de pagos."],
            ["Ref_Comercial_1_Nombre", "NO", "Matriz / Indep.", "Razón social proveedor de referencia 1."],
            ["Ref_Comercial_1_NIT", "NO", "Matriz / Indep.", "NIT ref 1."],
            ["Ref_Comercial_1_Telefono", "NO", "Matriz / Indep.", "Teléfono ref 1."],
            ["Ref_Comercial_1_Email", "NO", "Matriz / Indep.", "Email ref 1."],
            ["Ref_Comercial_2_Nombre", "NO", "Matriz / Indep.", "Razón social proveedor de referencia 2."],
            ["Ref_Comercial_2_NIT", "NO", "Matriz / Indep.", "NIT ref 2."],
            ["Ref_Comercial_2_Telefono", "NO", "Matriz / Indep.", "Teléfono ref 2."],
            ["Ref_Comercial_2_Email", "NO", "Matriz / Indep.", "Email ref 2."],
            ["Requiere_Canastillas", "NO", "Todos", "SI / NO."],
            ["Tipo_Documento", "SÍ", "Todos", "invoice = Factura Electrónica. remission = Remisión."],
            ["Imprimir_Factura_Fisica", "NO", "Todos", "SI / NO."],
            ["Remision_Con_Precios", "NO", "Todos", "SI / NO."],
            ["Restricciones_Entrega", "NO", "Todos", "Horarios y notas logísticas."],
            ["Copias_Remision", "NO", "Todos", "Número de copias físicas."],
            ["Latitud", "NO", "Todos", "Coordenada latitud (ej: 4.6097)."],
            ["Longitud", "NO", "Todos", "Coordenada longitud (ej: -74.0817)."],
            ["URL_RUT", "NO", "Matriz / Indep.", "Enlace al documento RUT."],
            ["URL_Camara_Comercio", "NO", "Matriz / Indep.", "Enlace a Cámara de Comercio."],
            ["Codigo_ZR", "NO", "Todos", "Código de zona ruteo ERP."],
            ["Codigo_LP", "NO", "Todos", "Código lista de precios ERP."],
            ["Dias_Pago", "NO", "Todos", "Días de plazo en número (ej: 15)."]
        ];
        const guideSheetData = [guideHeaders, ...guideRows];

        const workbook = XLSX.utils.book_new();
        const wsClients = XLSX.utils.json_to_sheet(exportData);
        const wsGuide = XLSX.utils.aoa_to_sheet(guideSheetData);

        // Ajustar anchos
        wsClients['!cols'] = Object.keys(exportData[0] || {}).map(() => ({ wch: 20 }));
        wsGuide['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 65 }];

        XLSX.utils.book_append_sheet(workbook, wsClients, "Clientes_Master");
        XLSX.utils.book_append_sheet(workbook, wsGuide, "Guia_Campos");

        XLSX.writeFile(workbook, `CRM_Clientes_${new Date().toISOString().split('T')[0]}.xlsx`);
        window.showToast?.('Base completa de clientes exportada con éxito', 'success');
    };

    const downloadClientsTemplate = () => {
        const headers = [
            "Estado", "Jerarquia_Visual", "NIT_CEDULA", "Nombre_Comercial", "Razon_Social", "Nombre_Contacto", "Telefono", 
            "Email", "Email_Notificacion_2", "Email_Notificacion_3", "Direccion", "Complemento_Direccion", "Ciudad", "Municipio", "Departamento", "Tipo_Cliente", "Modelo_Precios_Nombre",
            "Es_Matriz", "NIT_Matriz_Padre", "Nombre_Matriz_Padre", "Codigo_Sucursal", "Rol_Corporativo",
            "Cupo_Credito", "Condicion_Pago", "Responsable_IVA", "Gran_Contribuyente", "Autorretenedor", 
            "Regimen_Simple", "Actividad_Economica", "Correos_Facturacion_Adicionales", "Responsable_Cartera", 
            "Email_Cartera", "Telefono_Cartera", "Ref_Comercial_1_Nombre", "Ref_Comercial_1_NIT", 
            "Ref_Comercial_1_Telefono", "Ref_Comercial_1_Email", "Ref_Comercial_2_Nombre", "Ref_Comercial_2_NIT", 
            "Ref_Comercial_2_Telefono", "Ref_Comercial_2_Email", "Requiere_Canastillas", "Tipo_Documento", 
            "Imprimir_Factura_Fisica", "Remision_Con_Precios", "Restricciones_Entrega", "Copias_Remision", 
            "Latitud", "Longitud", "URL_RUT", "URL_Camara_Comercio", "Codigo_ZR", "Codigo_LP", "Dias_Pago"
        ];

        const sample1 = [
            "ACTIVO", "🏢 CASA MATRIZ", "901234567-1", "Restaurante El Gourmet", "Gourmet SAS", "Carlos Mendoza", "3159998877", 
            "carlos@elgourmet.com", "facturacion2@elgourmet.com", "", "Calle 100 # 15-30", "Oficina 502", "Bogotá", "Bogotá", "Cundinamarca", "INSTITUCIONAL", "Lista Base",
            "SI", "", "", "", "", 
            5000000, "15 Días", "SI", "NO", "NO", 
            "NO", "5611", "contabilidad@elgourmet.com", "Luz Marina Pérez", 
            "pagos@elgourmet.com", "3001112233", "Distribuidora La 80", "800111222-3",
            "3108889900", "ventas@la80.com", "Comercializadora del Valle", "890333444-5",
            "3127776655", "contacto@delvalle.com", "SI", "invoice", 
            "NO", "SI", "Entregar por bahía de carga antes de las 11 AM", 2,
            4.6853, -74.0521, "", "", "ZR-Norte", "LP-01", 15
        ];

        const sample2 = [
            "ACTIVO", "  ↳ SUCURSAL", "901234567-1", "Sucursal Gourmet Unicentro", "Gourmet SAS", "Diana Restrepo", "3204445566", 
            "unicentro@elgourmet.com", "", "", "Avenida Carrera 15 # 124-30", "Local 12 - Zona Comercial", "Bogotá", "Bogotá", "Cundinamarca", "INSTITUCIONAL", "HEREDADO_MATRIZ",
            "NO", "901234567-1", "Restaurante El Gourmet", "SUC-02", "Punto de Venta Mall", 
            0, "Contado", "SI", "NO", "NO", 
            "NO", "5611", "", "", 
            "", "", "", "",
            "", "", "", "",
            "", "", "NO", "HEREDADO", 
            "NO", "SI", "Acceso por sótano de servicios, requiere carnet ARL", 2,
            4.7022, -74.0411, "", "", "ZR-Norte", "LP-01", 0
        ];

        const sample3 = [
            "ACTIVO", "HOGAR", "1020304050", "Familia Rincón", "", "Marcela Rincón", "3115556677", 
            "marcela.rincon@gmail.com", "", "", "Carrera 7 # 150-10", "Apto 402 - Torre B", "Bogotá", "Bogotá", "Cundinamarca", "HOGAR", "",
            "NO", "", "", "", "", 
            0, "Contado", "NO", "NO", "NO", 
            "NO", "", "", "", 
            "", "", "", "",
            "", "", "", "",
            "", "", "NO", "remission", 
            "NO", "NO", "Dejar en portería si no se encuentra", 1,
            4.7255, -74.0289, "", "", "ZR-Hogar-Norte", "LP-B2C", 0
        ];

        const dataSheet = [headers, sample1, sample2, sample3];

        const workbook = XLSX.utils.book_new();
        const wsTemplate = XLSX.utils.aoa_to_sheet(dataSheet);
        wsTemplate['!cols'] = headers.map(() => ({ wch: 20 }));

        XLSX.utils.book_append_sheet(workbook, wsTemplate, "Plantilla_Clientes");
        XLSX.writeFile(workbook, "plantilla_carga_masiva_clientes.xlsx");
        window.showToast?.('Plantilla completa de clientes descargada', 'success');
    };

    const processClientsFile = async () => {
        if (!selectedFile) return;

        const reader = new FileReader();
        reader.onload = async (readerEvent) => {
            const data = readerEvent.target?.result;
            const workbook = XLSX.read(data, { type: 'binary' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(worksheet) as Record<string, any>[];

            if (rows.length === 0) {
                window.showToast?.('El archivo está vacío o tiene formato incorrecto', 'error');
                return;
            }

            setLoading(true);
            try {
                const cleanBool = (val: any) => val === 'SI' || val === 'si' || val === true || val === '1';

                // Mapearemos todos los clientes con sus 51 atributos
                const clientsToInsert = rows.map(row => {
                    const type_client = (row.Tipo_Cliente || '').toString().toUpperCase();
                    const estadoVal = (row.Estado || row.Activo || row['Estado (ACTIVO/INACTIVO)'] || '').toString().trim().toUpperCase();
                    const is_active = estadoVal === 'INACTIVO' || estadoVal === 'NO' || estadoVal === 'FALSE' || estadoVal === '0' ? false : true;

                    // Buscar id de modelo de precios si especificaron nombre
                    const modelName = (row.Modelo_Precios_Nombre || row.Modelo_Precios || '').toString().trim().toLowerCase();
                    const matchedModel = pricingModels.find(m => m.name.toLowerCase() === modelName);

                    return {
                        id: row.ID_INTERNO || undefined,
                        is_active: is_active,
                        nit: (row.NIT_CEDULA || '').toString().trim(),
                        company_name: (row.Nombre_Comercial || '').toString().trim(),
                        razon_social: (row.Razon_Social || row.Nombre_Comercial || '').toString().trim(),
                        contact_name: (row.Nombre_Contacto || row.Nombre_Comercial || '').toString().trim(),
                        phone: (row.Telefono || '').toString().trim(),
                        contact_phone: (row.Telefono || '').toString().trim(),
                        email: (row.Email || '').toString().trim(),
                        email_2: (row.Email_Notificacion_2 || '').toString().trim() || null,
                        email_3: (row.Email_Notificacion_3 || '').toString().trim() || null,
                        notify_email_1: !!row.Email,
                        notify_email_2: !!row.Email_Notificacion_2,
                        notify_email_3: !!row.Email_Notificacion_3,
                        address: (row.Direccion || '').toString().trim(),
                        address_complement: (row.Complemento_Direccion || '').toString().trim() || null,
                        city: (row.Ciudad || 'Bogotá').toString().trim(),
                        municipality: (row.Municipio || row.Ciudad || 'Bogotá').toString().trim(),
                        department: (row.Departamento || 'Cundinamarca').toString().trim(),
                        role: type_client === 'HOGAR' ? 'b2c_client' : 'b2b_client',
                        pricing_model_id: matchedModel ? matchedModel.id : (row.pricing_model_id || null),
                        
                        // Jerarquía
                        is_corporate_parent: cleanBool(row.Es_Matriz),
                        branch_id: (row.Codigo_Sucursal || '').toString().trim() || null,
                        corporate_role: (row.Rol_Corporativo || '').toString().trim() || null,
                        
                        // Financiera
                        credit_limit: parseFloat(row.Cupo_Credito || '0') || 0,
                        payment_terms: (row.Condicion_Pago || 'Contado').toString().trim(),
                        iva_responsible: cleanBool(row.Responsable_IVA),
                        is_gran_contribuyente: cleanBool(row.Gran_Contribuyente),
                        is_autorretenedor: cleanBool(row.Autorretenedor),
                        is_regimen_simple: cleanBool(row.Regimen_Simple),
                        economic_activity_code: (row.Actividad_Economica || '').toString().trim() || null,
                        additional_billing_emails: (row.Correos_Facturacion_Adicionales || '').toString().trim() || null,

                        // Cartera
                        collection_responsible_name: (row.Responsable_Cartera || '').toString().trim() || null,
                        collection_responsible_email: (row.Email_Cartera || '').toString().trim() || null,
                        collection_responsible_phone: (row.Telefono_Cartera || '').toString().trim() || null,

                        // Referencias Comerciales
                        comm_ref_1_name: (row.Ref_Comercial_1_Nombre || '').toString().trim() || null,
                        comm_ref_1_nit: (row.Ref_Comercial_1_NIT || '').toString().trim() || null,
                        comm_ref_1_phone: (row.Ref_Comercial_1_Telefono || '').toString().trim() || null,
                        comm_ref_1_email: (row.Ref_Comercial_1_Email || '').toString().trim() || null,
                        comm_ref_2_name: (row.Ref_Comercial_2_Nombre || '').toString().trim() || null,
                        comm_ref_2_nit: (row.Ref_Comercial_2_NIT || '').toString().trim() || null,
                        comm_ref_2_phone: (row.Ref_Comercial_2_Telefono || '').toString().trim() || null,
                        comm_ref_2_email: (row.Ref_Comercial_2_Email || '').toString().trim() || null,

                        // Operaciones y Logística
                        needs_crates: cleanBool(row.Requiere_Canastillas),
                        document_type: (row.Tipo_Documento || 'invoice').toString().trim().toLowerCase(),
                        print_invoice: cleanBool(row.Imprimir_Factura_Fisica),
                        remission_with_prices: cleanBool(row.Remision_Con_Precios),
                        delivery_restrictions: (row.Restricciones_Entrega || '').toString().trim() || null,
                        remission_copies: parseInt(row.Copias_Remision || '2') || 2,
                        latitude: parseFloat(row.Latitud || '0') || null,
                        longitude: parseFloat(row.Longitud || '0') || null,
                        rut_url: (row.URL_RUT || '').toString().trim() || null,
                        mercantile_registry_url: (row.URL_Camara_Comercio || '').toString().trim() || null,

                        // ERP
                        id_zr: (row.Codigo_ZR || '').toString().trim() || null,
                        id_lp: (row.Codigo_LP || '').toString().trim() || null,
                        payment_days: parseInt(row.Dias_Pago || '0') || 0,
                        geocoding_status: 'manual'
                    };
                });

                // Cargar en bloques de 50
                const chunkSize = 50;
                const insertedClients: any[] = [];

                for (let i = 0; i < clientsToInsert.length; i += chunkSize) {
                    const chunk = clientsToInsert.slice(i, i + chunkSize);
                    // Usamos upsert para actualizar por ID o insertar si es nuevo
                    const { data, error } = await supabase.from('profiles').upsert(chunk).select('id, nit');
                    if (error) throw error;
                    if (data) insertedClients.push(...data);
                }

                // Vinculación parent_id si es Sucursal y especificaron NIT_Matriz_Padre
                const branches = rows.filter(r => (r.NIT_Matriz_Padre || '').toString().trim() !== '' && !cleanBool(r.Es_Matriz));
                if (branches.length > 0) {
                    const { data: allParents } = await supabase.from('profiles').select('*').eq('is_corporate_parent', true);
                    
                    if (allParents) {
                        for (const row of branches) {
                            const cleanNit = (row.NIT_CEDULA || '').toString().trim();
                            const cleanParentNit = (row.NIT_Matriz_Padre || '').toString().trim();
                            const branchProfile = insertedClients.find(c => c.nit === cleanNit);
                            const parentProfile = allParents.find(p => p.nit === cleanParentNit) || insertedClients.find(c => c.nit === cleanParentNit);
                            
                            if (branchProfile && parentProfile) {
                                const docVal = (row.Tipo_Documento || '').toString().trim().toUpperCase();
                                const isInheritedDoc = docVal === 'HEREDADO' || docVal === 'HEREDADO_MATRIZ' || docVal === '';

                                const branchUpdate: any = { parent_id: parentProfile.id };
                                if (isInheritedDoc) {
                                    branchUpdate.document_type = parentProfile.document_type || 'invoice';
                                    branchUpdate.needs_crates = parentProfile.needs_crates || false;
                                    branchUpdate.remission_with_prices = parentProfile.remission_with_prices !== undefined ? parentProfile.remission_with_prices : true;
                                    branchUpdate.print_invoice = parentProfile.print_invoice || false;
                                }

                                const modelVal = (row.Modelo_Precios_Nombre || row.Modelo_Precios || '').toString().trim().toUpperCase();
                                if (modelVal === 'HEREDADO' || modelVal === 'HEREDADO_MATRIZ' || modelVal === '') {
                                    branchUpdate.pricing_model_id = null; // Hereda lista de precios de la Casa Matriz
                                }

                                await supabase.from('profiles')
                                    .update(branchUpdate)
                                    .eq('id', branchProfile.id);
                            }
                        }
                    }
                }

                window.showToast?.(`Base de datos de clientes actualizada: ${clientsToInsert.length} registros procesados exitosamente`, 'success');
                setIsBulkModalOpen(false);
                setSelectedFile(null);
                fetchData();
            } catch (err: any) {
                console.error('Error en carga masiva de clientes:', err);
                window.showToast?.('Error al procesar el archivo: ' + err.message, 'error');
            } finally {
                setLoading(false);
            }
        };
        reader.readAsBinaryString(selectedFile);
    };

    const tabs = [
        { id: 'dashboard', label: 'Resumen', icon: <BarChart3 size={16} /> },
        { id: 'leads', label: 'Prospectos', icon: <Mail size={16} /> },
        { id: 'b2b', label: 'Institucionales', icon: <Building2 size={16} /> },
        { id: 'agreements', label: 'Acuerdos Institucionales', icon: <FileText size={16} /> },
        { id: 'b2c', label: 'Hogar', icon: <Users size={16} /> },
    ];

    const filterData = <T extends object>(data: T[], fields: string[]): T[] => {
        let result = data;
        if (searchTerm) {
            const searchTerms = searchTerm.toLowerCase().split(',').map(term => term.trim()).filter(term => term.length > 0);
            if (searchTerms.length > 0) {
                result = data.filter(item => {
                    const record = item as Record<string, unknown>;
                    return searchTerms.every(term => {
                        // Special command handlers starting with @
                        if (term.startsWith('@')) {
                            const cleanCmd = term.slice(1).trim().toLowerCase();
                            if (!cleanCmd) return true;

                            if (cleanCmd === 'branch' || cleanCmd === 'sucursal' || cleanCmd === 'sucursales') {
                                return !!record.parent_id;
                            }
                            if (cleanCmd === 'matrix' || cleanCmd === 'matriz') {
                                return record.is_corporate_parent === true || !record.parent_id;
                            }
                            if (cleanCmd === 'activo') {
                                return record.is_active !== false;
                            }
                            if (cleanCmd === 'inactivo' || cleanCmd === 'archivado') {
                                return record.is_active === false;
                            }
                            if (cleanCmd === 'acuerdo_activo' || cleanCmd === 'acuerdoactivo' || cleanCmd === 'acuerdo') {
                                return getAgreementStatus(String(record.id || ''), String(record.parent_id || '')) === 'active';
                            }
                            if (cleanCmd === 'por_vencer' || cleanCmd === 'porvencer') {
                                return getAgreementStatus(String(record.id || ''), String(record.parent_id || '')) === 'warning';
                            }
                            if (cleanCmd === 'vencido' || cleanCmd === 'expirado') {
                                return getAgreementStatus(String(record.id || ''), String(record.parent_id || '')) === 'expired';
                            }
                            if (cleanCmd === 'sin_acuerdo' || cleanCmd === 'sinacuerdo' || cleanCmd === 'sin acuerdo') {
                                return getAgreementStatus(String(record.id || ''), String(record.parent_id || '')) === 'none';
                            }
                            if (cleanCmd === 'nogps' || cleanCmd === 'singps') {
                                return !record.latitude || !record.longitude;
                            }
                            if (cleanCmd === 'gps' || cleanCmd === 'congps') {
                                return !!record.latitude && !!record.longitude;
                            }
                            if (cleanCmd.startsWith('nit')) {
                                const valuePart = cleanCmd.replace('nit', '').replace(':', '').trim();
                                if (!valuePart) {
                                    return !!record.nit;
                                }
                                return String(record.nit || '').toLowerCase().includes(valuePart);
                            }

                            // Dinámico para cualquier ciudad / ubicación
                            const cityVal = String(record.city || '').toLowerCase();
                            const muniVal = String(record.municipality || '').toLowerCase();
                            const deptVal = String(record.department || '').toLowerCase();
                            const addrVal = String(record.address || '').toLowerCase();
                            const compVal = String(record.company_name || '').toLowerCase();

                            return cityVal.includes(cleanCmd) || muniVal.includes(cleanCmd) || deptVal.includes(cleanCmd) || addrVal.includes(cleanCmd) || compVal.includes(cleanCmd);
                        }

                        // Default field searching
                        return fields.some(field => {
                            const value = record[field];
                            return String(value || '').toLowerCase().includes(term);
                        });
                    });
                });
            }
        }

        // Identifica la Matriz principal en los resultados
        const matrizProfile = result.find((item: any) => item.is_corporate_parent === true || item.classification === 'matriz' || !item.parent_id);
        const matrizId = matrizProfile ? (matrizProfile as any).id : null;

        // Orden de Jerarquía Visual:
        // 1. Casa Matriz (Puesto #1)
        // 2. Sucursales directas que pertenecen a la Matriz (#2)
        // 3. Registros sin herencia directa de la Matriz (Enviados al fondo de la lista/galería #3)
        return [...result].sort((a: any, b: any) => {
            const aIsMatriz = a.is_corporate_parent === true || a.classification === 'matriz' || !a.parent_id;
            const bIsMatriz = b.is_corporate_parent === true || b.classification === 'matriz' || !b.parent_id;

            const aIsDirectBranch = matrizId ? a.parent_id === matrizId : false;
            const bIsDirectBranch = matrizId ? b.parent_id === matrizId : false;

            const aTier = aIsMatriz ? 0 : aIsDirectBranch ? 1 : 2;
            const bTier = bIsMatriz ? 0 : bIsDirectBranch ? 1 : 2;

            if (aTier !== bTier) return aTier - bTier;

            return String(a.company_name || a.contact_name || '').localeCompare(String(b.company_name || b.contact_name || ''));
        });
    };

    const getActiveFilteredCount = (): number | null => {
        if (!searchTerm) return null;
        if (activeTab === 'b2b') {
            return filterData(clientsB2B, ['company_name', 'razon_social', 'nit', 'contact_name', 'phone', 'email', 'city', 'municipality', 'department', 'address']).length;
        }
        if (activeTab === 'b2c') {
            return filterData(clientsB2C, ['company_name', 'contact_name', 'phone', 'email', 'nit', 'address', 'municipality', 'department']).length;
        }
        if (activeTab === 'leads') {
            return filterData(leads, ['company_name', 'contact_name', 'phone', 'email', 'nit', 'notes', 'business_type', 'municipality', 'department', 'address']).length;
        }
        return null;
    };

    return (
        <div style={{ backgroundColor: THEME.colors.background, height: '100%' }}>
            <Toast />



            {/* MODAL FORMULARIO (NUEVO / EDITAR) */}
            {isFormModalOpen && (
                <ClientFormModal 
                    key={editTarget?.id || 'new'}
                    onClose={() => setIsFormModalOpen(false)} 
                    onRefresh={fetchData}
                    pricingModels={pricingModels}
                    editData={editTarget}
                    setNicknameClientId={setNicknameClientId}
                    setIsNicknameModalOpen={setIsNicknameModalOpen}
                    isReadOnly={isFormReadOnly}
                    onSwitchClient={(client) => {
                        setEditTarget(client);
                        setIsFormReadOnly(true);
                    }}
                />
            )}

            {/* MODAL FORMULARIO PROSPECTO MANUAL (NUEVO) */}
            {isLeadModalOpen && (
                <LeadFormModal 
                    onClose={() => setIsLeadModalOpen(false)} 
                    onRefresh={fetchData}
                />
            )}

            {/* MODAL EXCEPCIONES (NICKNAMES) */}
            {isNicknameModalOpen && nicknameClientId && (
                <ClientExceptionsModal 
                    clientId={nicknameClientId}
                    onClose={() => {
                        setIsNicknameModalOpen(false);
                        setNicknameClientId(null);
                    }}
                />
            )}

            <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0.75rem 1rem' }}>
                <header style={{ 
                    marginBottom: '0.85rem', 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    flexWrap: 'wrap', 
                    gap: '0.85rem',
                    borderBottom: '1px solid #E2E8F0',
                    paddingBottom: '0.65rem'
                }}>
                    <div>
                        <h1 style={{ fontSize: '1.8rem', fontWeight: '900', color: THEME.colors.textMain, margin: 0, letterSpacing: '-0.05rem' }}>Core de <span style={{ color: THEME.colors.primary }}>Clientes</span></h1>
                        <p style={{ color: '#4A5568', fontSize: '0.85rem', marginTop: '0.1rem', fontWeight: '500' }}>Gestión integral de la base comercial y prospectos.</p>
                    </div>

                    {/* TABS MOVIDAS ARRIBA */}
                    <div style={{ 
                        display: 'flex', 
                        gap: '0.25rem', 
                        backgroundColor: '#EAEFEA', 
                        padding: '4px', 
                        borderRadius: '12px', 
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.03)',
                        border: '1px solid rgba(13, 122, 87, 0.08)'
                    }}>
                        {tabs.map(tab => {
                            const isActive = activeTab === tab.id;
                            const isHovered = hoveredTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => { setActiveTab(tab.id); setSearchTerm(''); }}
                                    onMouseEnter={() => setHoveredTab(tab.id)}
                                    onMouseLeave={() => setHoveredTab(null)}
                                    style={{
                                        padding: '0.45rem 1.1rem',
                                        border: 'none',
                                        borderRadius: '8px',
                                        background: isActive 
                                            ? THEME.colors.primary 
                                            : (isHovered ? THEME.colors.primaryLight : 'transparent'),
                                        color: isActive 
                                            ? 'white' 
                                            : (isHovered ? THEME.colors.textMain : '#4E6157'),
                                        fontWeight: isActive ? '700' : '500',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        fontSize: '0.8rem',
                                        boxShadow: isActive ? '0 4px 12px rgba(13, 122, 87, 0.25)' : 'none'
                                    }}
                                >
                                    <span style={{ 
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        color: isActive ? 'white' : (isHovered ? THEME.colors.textMain : '#4E6157'),
                                        opacity: isActive ? 1 : 0.8
                                    }}>{tab.icon}</span>
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>
                </header>

                {/* SEGUNDA FILA: ACCIONES Y BUSCADOR (STICKY) */}
                {activeTab !== 'dashboard' && activeTab !== 'agreements' && (
                    <div style={{ 
                        display: 'flex', 
                        gap: '0.8rem', 
                        alignItems: 'center', 
                        marginBottom: '1.2rem',
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        backdropFilter: 'blur(12px)',
                        padding: '0.65rem 1.2rem',
                        borderRadius: '20px',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.07), 0 1px 3px rgba(0, 0, 0, 0.05)',
                        border: '1px solid #E2E8F0',
                        position: 'sticky',
                        top: '85px',
                        zIndex: 90,
                        transition: 'all 0.2s ease-in-out'
                    }}>
                        {/* BOTÓN DE CREACIÓN */}
                        {activeTab === 'b2b' && hasEditPermission() && (
                            <button 
                                onClick={() => handleCreateClient('b2b_client')}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = THEME.colors.primaryHover}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = THEME.colors.primary}
                                style={{ 
                                    backgroundColor: THEME.colors.primary, 
                                    color: 'white', 
                                    padding: '0 1.2rem', 
                                    borderRadius: '10px', 
                                    border: 'none', 
                                    fontWeight: '800', 
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 12px rgba(13, 122, 87, 0.2)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    whiteSpace: 'nowrap',
                                    height: '40px',
                                    fontSize: '0.85rem',
                                    transition: 'background-color 0.2s'
                                }}
                            >
                                <Plus size={16} strokeWidth={1.5} /> Nuevo Institucional
                            </button>
                        )}
                        {activeTab === 'b2c' && hasEditPermission() && (
                            <button 
                                onClick={() => handleCreateClient('b2c_client')}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = THEME.colors.primaryHover}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = THEME.colors.primary}
                                style={{ 
                                    backgroundColor: THEME.colors.primary, 
                                    color: 'white', 
                                    padding: '0 1.2rem', 
                                    borderRadius: '10px', 
                                    border: 'none', 
                                    fontWeight: '800', 
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 12px rgba(13, 122, 87, 0.2)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    whiteSpace: 'nowrap',
                                    height: '40px',
                                    fontSize: '0.85rem',
                                    transition: 'background-color 0.2s'
                                }}
                            >
                                <User size={16} strokeWidth={1.5} /> Nuevo Cliente Hogar
                            </button>
                        )}
                        {activeTab === 'leads' && hasEditPermission() && (
                            <button 
                                onClick={() => setIsLeadModalOpen(true)}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = THEME.colors.primaryHover}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = THEME.colors.primary}
                                style={{ 
                                    backgroundColor: THEME.colors.primary, 
                                    color: 'white', 
                                    padding: '0 1.2rem', 
                                    borderRadius: '10px', 
                                    border: 'none', 
                                    fontWeight: '800', 
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 12px rgba(13, 122, 87, 0.2)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    whiteSpace: 'nowrap',
                                    height: '40px',
                                    fontSize: '0.85rem',
                                    transition: 'background-color 0.2s'
                                }}
                            >
                                <Mail size={16} strokeWidth={1.5} /> Nuevo Prospecto
                            </button>
                        )}

                        {/* BOTONES DE IMPORTACIÓN/EXPORTACIÓN DE CLIENTES */}
                        {(activeTab === 'b2b' || activeTab === 'b2c') && (
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                                <button
                                    onClick={downloadClientsMaster}
                                    style={{
                                        backgroundColor: 'white',
                                        color: '#475569',
                                        border: '1px solid #E2E8F0',
                                        borderRadius: '10px',
                                        width: '40px',
                                        height: '40px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.borderColor = '#94A3B8'}
                                    onMouseLeave={e => e.currentTarget.style.borderColor = '#E2E8F0'}
                                    title="Exportar Clientes a Excel"
                                >
                                    <FileDown size={18} />
                                </button>
                                <button
                                    onClick={() => setIsBulkModalOpen(true)}
                                    style={{
                                        backgroundColor: 'white',
                                        color: '#475569',
                                        border: '1px solid #E2E8F0',
                                        borderRadius: '10px',
                                        width: '40px',
                                        height: '40px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.borderColor = '#94A3B8'}
                                    onMouseLeave={e => e.currentTarget.style.borderColor = '#E2E8F0'}
                                    title="Carga Masiva de Clientes"
                                >
                                    <FileUp size={18} />
                                </button>
                            </div>
                        )}

                        {/* TOGGLE VISTA */}
                        <div style={{ 
                            display: 'flex', 
                            backgroundColor: '#F1F5F9', 
                            padding: '3px', 
                            borderRadius: '10px', 
                            height: '40px',
                            alignItems: 'center',
                            border: '1px solid #E2E8F0'
                        }}>
                            <button 
                                onClick={() => setViewMode('list')}
                                style={{
                                    padding: '0.3rem 0.6rem',
                                    borderRadius: '7px',
                                    border: 'none',
                                    backgroundColor: viewMode === 'list' ? 'white' : 'transparent',
                                    boxShadow: viewMode === 'list' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: '32px',
                                    height: '32px'
                                }}
                            >
                                <List size={16} strokeWidth={1.5} style={{ color: viewMode === 'list' ? THEME.colors.primary : '#64748B' }} />
                            </button>
                            <button 
                                onClick={() => setViewMode('grid')}
                                style={{
                                    padding: '0.3rem 0.6rem',
                                    borderRadius: '7px',
                                    border: 'none',
                                    backgroundColor: viewMode === 'grid' ? 'white' : 'transparent',
                                    boxShadow: viewMode === 'grid' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: '32px',
                                    height: '32px'
                                }}
                            >
                                <Grid size={16} strokeWidth={1.5} style={{ color: viewMode === 'grid' ? THEME.colors.primary : '#64748B' }} />
                            </button>
                        </div>

                        {/* BUSCADOR ESTÁNDAR FLEXIBLE (OCUPANDO TODO EL ESPACIO) */}
                        <div style={{ position: 'relative', flex: 1 }}>
                            <span style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                                <Search size={16} strokeWidth={1.5} style={{ color: '#94A3B8' }} />
                            </span>
                            <input 
                                type="text"
                                placeholder={activeTab === 'b2b' ? "Buscar por NIT, nombre comercial, contacto, sucursal, ciudad, email o teléfono..." : activeTab === 'b2c' ? "Buscar cliente hogar por nombre, nit, contacto o teléfono..." : "Buscar prospecto por empresa, nombre, notas, tipo o contacto..."}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '0.65rem 1rem 0.65rem 2.2rem',
                                    border: '1px solid #E2E8F0',
                                    borderRadius: '12px',
                                    outline: 'none',
                                    fontSize: '0.85rem',
                                    transition: 'all 0.15s',
                                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)'
                                }}
                                onFocus={e => {
                                    e.target.style.borderColor = '#0891B2';
                                    e.target.style.boxShadow = '0 0 0 3px rgba(8, 145, 178, 0.1), inset 0 1px 2px rgba(0,0,0,0.02)';
                                }}
                                onBlur={e => {
                                    e.target.style.borderColor = '#E2E8F0';
                                    e.target.style.boxShadow = 'inset 0 1px 2px rgba(0,0,0,0.02)';
                                }}
                            />
                            {searchTerm && (
                                <button 
                                    onClick={() => setSearchTerm('')} 
                                    style={{
                                        position: 'absolute',
                                        right: '0.8rem',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        background: 'none',
                                        border: 'none',
                                        color: '#A0AEC0',
                                        cursor: 'pointer',
                                        fontSize: '0.85rem',
                                        fontWeight: '700'
                                    }}
                                >
                                    ✕
                                </button>
                            )}
                        </div>

                        {/* Botón Informativo (i) */}
                        <div style={{ position: 'relative' }}>
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowHelpTooltip(!showHelpTooltip);
                                }}
                                style={{ 
                                    width: '40px', 
                                    height: '40px', 
                                    borderRadius: '10px', 
                                    backgroundColor: showHelpTooltip ? '#ECFDF5' : '#EFF6FF', 
                                    color: showHelpTooltip ? '#059669' : '#2563EB', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    border: '1px solid',
                                    borderColor: showHelpTooltip ? '#A7F3D0' : '#DBEAFE',
                                    fontSize: '1rem',
                                    fontWeight: '900',
                                    flexShrink: 0,
                                    transition: 'all 0.2s',
                                    boxShadow: showHelpTooltip ? '0 0 0 3px rgba(16, 185, 129, 0.15)' : 'none'
                                }}
                                title="Ver comandos de búsqueda (@)"
                            >
                                i
                                {getActiveFilteredCount() !== null && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '-6px',
                                        right: '-6px',
                                        backgroundColor: '#10B981', // Emerald green
                                        color: 'white',
                                        fontSize: '0.65rem',
                                        fontWeight: '900',
                                        borderRadius: '9999px',
                                        height: '18px',
                                        minWidth: '18px',
                                        padding: '0 5px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        border: '2px solid white',
                                        boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                                        animation: 'popIn 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                                        pointerEvents: 'none'
                                    }}>
                                        {getActiveFilteredCount()}
                                    </div>
                                )}
                            </button>

                            {showHelpTooltip && (
                                <>
                                    {/* Backdrop transparente para cerrar al hacer clic afuera */}
                                    <div 
                                        onClick={() => setShowHelpTooltip(false)} 
                                        style={{ position: 'fixed', inset: 0, zIndex: 999, cursor: 'default' }} 
                                    />

                                    <div 
                                        onClick={(e) => e.stopPropagation()}
                                        style={{
                                            position: 'absolute',
                                            top: '48px',
                                            right: '0',
                                            width: '390px',
                                            backgroundColor: '#FFFFFF',
                                            color: '#1E293B',
                                            padding: '1.25rem',
                                            borderRadius: '20px',
                                            boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05)',
                                            border: '1px solid #E2E8F0',
                                            zIndex: 1000,
                                            fontSize: '0.75rem',
                                            lineHeight: '1.5',
                                            animation: 'fadeInDown 0.2s ease-out'
                                        }}
                                    >
                                        {/* Encabezado Estilo FruFresco */}
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', borderBottom: '1px solid #F1F5F9', paddingBottom: '10px' }}>
                                            <div>
                                                <div style={{ fontWeight: '900', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem' }}>
                                                    <Sparkles size={16} strokeWidth={1.5} style={{ color: THEME.colors.primary }} /> Comandos de Búsqueda (@)
                                                </div>
                                                <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: '500', marginTop: '2px' }}>
                                                    Haz clic en una opción o escribe cualquier ciudad (ej: <code style={{ backgroundColor: '#F1F5F9', color: '#059669', padding: '1px 5px', borderRadius: '4px', fontWeight: '800' }}>@villavicencio</code>)
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => setShowHelpTooltip(false)}
                                                style={{ border: 'none', background: '#F1F5F9', color: '#64748B', width: '26px', height: '26px', borderRadius: '8px', cursor: 'pointer', fontWeight: '900', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                            >
                                                <X size={14} strokeWidth={2} />
                                            </button>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            {/* SECCIÓN: ESTADO DE LA CUENTA */}
                                            <div style={{ backgroundColor: '#F8FAFC', padding: '0.75rem 0.9rem', borderRadius: '14px', border: '1px solid #F1F5F9' }}>
                                                <div style={{ fontSize: '0.62rem', fontWeight: '900', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04rem', marginBottom: '6px' }}>
                                                    Estado de la Cuenta
                                                </div>
                                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                    <button
                                                        onClick={() => setSearchTerm('@activo')}
                                                        style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#047857', padding: '4px 10px', borderRadius: '8px', fontSize: '0.72rem', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', transition: 'all 0.15s' }}
                                                    >
                                                        <Check size={13} strokeWidth={2.5} style={{ color: '#059669' }} /> @activo <span style={{ color: '#059669', fontWeight: '500' }}>Activas</span>
                                                    </button>
                                                    <button
                                                        onClick={() => setSearchTerm('@inactivo')}
                                                        style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', padding: '4px 10px', borderRadius: '8px', fontSize: '0.72rem', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', transition: 'all 0.15s' }}
                                                    >
                                                        <X size={13} strokeWidth={2.5} style={{ color: '#DC2626' }} /> @inactivo <span style={{ color: '#DC2626', fontWeight: '500' }}>Inactivas</span>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* SECCIÓN: ESTRUCTURA CLIENTE */}
                                            <div style={{ backgroundColor: '#F8FAFC', padding: '0.75rem 0.9rem', borderRadius: '14px', border: '1px solid #F1F5F9' }}>
                                                <div style={{ fontSize: '0.62rem', fontWeight: '900', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04rem', marginBottom: '6px' }}>
                                                    Estructura Comercial
                                                </div>
                                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                    <button
                                                        onClick={() => setSearchTerm('@matriz')}
                                                        style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', color: '#0369A1', padding: '4px 10px', borderRadius: '8px', fontSize: '0.72rem', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', transition: 'all 0.15s' }}
                                                    >
                                                        <Building2 size={13} strokeWidth={2} style={{ color: '#0284C7' }} /> @matriz <span style={{ color: '#0284C7', fontWeight: '500' }}>Casas Matriz</span>
                                                    </button>
                                                    <button
                                                        onClick={() => setSearchTerm('@sucursal')}
                                                        style={{ background: '#FFF7ED', border: '1px solid #FFEDD5', color: '#C2410C', padding: '4px 10px', borderRadius: '8px', fontSize: '0.72rem', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', transition: 'all 0.15s' }}
                                                    >
                                                        <MapPin size={13} strokeWidth={2} style={{ color: '#EA580C' }} /> @sucursal <span style={{ color: '#EA580C', fontWeight: '500' }}>Sucursales</span>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* SECCIÓN: ACUERDOS COMERCIALES */}
                                            <div style={{ backgroundColor: '#F8FAFC', padding: '0.75rem 0.9rem', borderRadius: '14px', border: '1px solid #F1F5F9' }}>
                                                <div style={{ fontSize: '0.62rem', fontWeight: '900', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04rem', marginBottom: '6px' }}>
                                                    Acuerdos Comerciales
                                                </div>
                                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                    <button
                                                        onClick={() => setSearchTerm('@acuerdo_activo')}
                                                        style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#047857', padding: '4px 10px', borderRadius: '8px', fontSize: '0.72rem', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', transition: 'all 0.15s' }}
                                                    >
                                                        <Sparkles size={13} strokeWidth={2} style={{ color: '#059669' }} /> @acuerdo_activo <span style={{ color: '#059669', fontWeight: '500' }}>Vigente</span>
                                                    </button>
                                                    <button
                                                        onClick={() => setSearchTerm('@vencido')}
                                                        style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#B45309', padding: '4px 10px', borderRadius: '8px', fontSize: '0.72rem', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', transition: 'all 0.15s' }}
                                                    >
                                                        <AlertTriangle size={13} strokeWidth={2} style={{ color: '#D97706' }} /> @vencido <span style={{ color: '#D97706', fontWeight: '500' }}>Por Vencer</span>
                                                    </button>
                                                    <button
                                                        onClick={() => setSearchTerm('@sin_acuerdo')}
                                                        style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#64748B', padding: '4px 10px', borderRadius: '8px', fontSize: '0.72rem', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', transition: 'all 0.15s' }}
                                                    >
                                                        <FileText size={13} strokeWidth={2} style={{ color: '#64748B' }} /> @sin_acuerdo <span style={{ color: '#475569', fontWeight: '500' }}>Sin Acuerdo</span>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* SECCIÓN: UBICACIÓN Y CIUDADES (DINÁMICO) */}
                                            <div style={{ backgroundColor: '#F8FAFC', padding: '0.75rem 0.9rem', borderRadius: '14px', border: '1px solid #F1F5F9' }}>
                                                <div style={{ fontSize: '0.62rem', fontWeight: '900', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04rem', marginBottom: '6px' }}>
                                                    Ciudades y Geolocalización
                                                </div>
                                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                    <button
                                                        onClick={() => setSearchTerm('@villavicencio')}
                                                        style={{ background: '#F3E8FF', border: '1px solid #E9D5FF', color: '#7E22CE', padding: '4px 10px', borderRadius: '8px', fontSize: '0.72rem', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', transition: 'all 0.15s' }}
                                                    >
                                                        <MapPin size={13} strokeWidth={2} style={{ color: '#7E22CE' }} /> @villavicencio
                                                    </button>
                                                    <button
                                                        onClick={() => setSearchTerm('@bogota')}
                                                        style={{ background: '#F3E8FF', border: '1px solid #E9D5FF', color: '#7E22CE', padding: '4px 10px', borderRadius: '8px', fontSize: '0.72rem', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', transition: 'all 0.15s' }}
                                                    >
                                                        <MapPin size={13} strokeWidth={2} style={{ color: '#7E22CE' }} /> @bogota
                                                    </button>
                                                    <button
                                                        onClick={() => setSearchTerm('@nogps')}
                                                        style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', padding: '4px 10px', borderRadius: '8px', fontSize: '0.72rem', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', transition: 'all 0.15s' }}
                                                    >
                                                        <MapPin size={13} strokeWidth={2} style={{ color: '#DC2626' }} /> @nogps <span style={{ color: '#DC2626', fontWeight: '500' }}>Sin GPS</span>
                                                    </button>
                                                    <button
                                                        onClick={() => setSearchTerm('@nit')}
                                                        style={{ background: '#EEF2FF', border: '1px solid #C7D2FE', color: '#4338CA', padding: '4px 10px', borderRadius: '8px', fontSize: '0.72rem', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', transition: 'all 0.15s' }}
                                                    >
                                                        <FileText size={13} strokeWidth={2} style={{ color: '#4F46E5' }} /> @nit <span style={{ color: '#4F46E5', fontWeight: '500' }}>Filtro NIT</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '10rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                            <Loader2 size={64} className="animate-spin" style={{ color: THEME.colors.primary }} />
                        </div>
                        <p style={{ fontWeight: '700', color: '#718096', marginTop: '1rem' }}>Sincronizando base de datos...</p>
                    </div>
                ) : (
                    <>
                        {/* DASHBOARD VIEW */}
                        {activeTab === 'dashboard' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                {/* Top Row: Main KPIs */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.25rem' }}>
                                    <KPICard title="CLIENTES B2B" value={clientsB2B.length} icon={<Building2 size={18} strokeWidth={1.5} />} color="#EAEFEA" textColor="#0D7A57" subtitle="Institucionales" />
                                    <KPICard title="CLIENTES B2C" value={clientsB2C.length} icon={<Home size={18} strokeWidth={1.5} />} color="#EAEFEA" textColor="#0D7A57" subtitle="Consumidores" />
                                    <KPICard 
                                        title="TAREAS CRÍTICAS" 
                                        value={leads.filter(l => l.status !== 'converted' && l.status !== 'rejected' && l.next_contact_date && new Date(l.next_contact_date) <= new Date()).length} 
                                        icon={<AlertTriangle size={18} strokeWidth={1.5} />} 
                                        color="#EAEFEA" 
                                        textColor="#0D7A57" 
                                        subtitle="Prioridad comercial" 
                                    />
                                </div>

                                {/* Middle Row: Funnel & Critical Tasks & Sales */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
                                    {/* Funnel Box */}
                                    <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '1.5rem', boxShadow: THEME.shadow.sm, border: `1px solid ${THEME.colors.border}` }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
                                            <div>
                                                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <BarChart3 size={18} style={{ color: '#0D7A57' }} /> Embudo Comercial
                                                </h3>
                                                <p style={{ margin: '0.1rem 0 0 0', fontSize: '0.8rem', color: THEME.colors.textSecondary, fontWeight: '500' }}>Trayectoria del prospecto</p>
                                            </div>
                                            <div style={{ backgroundColor: '#F1F5F9', padding: '0.35rem 0.75rem', borderRadius: '8px', border: `1px solid ${THEME.colors.border}`, textAlign: 'center', minWidth: '54px' }}>
                                                <div style={{ fontSize: '0.55rem', fontWeight: '700', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>ITEMS</div>
                                                <div style={{ fontSize: '1rem', fontWeight: '800', color: THEME.colors.textMain, lineHeight: '1.2' }}>{leads.length}</div>
                                            </div>
                                        </div>
                                        <FunnelGraphic leads={leads} />
                                    </div>

                                    {/* Sales Distribution Pie Chart */}
                                    <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '1.5rem', boxShadow: THEME.shadow.sm, border: `1px solid ${THEME.colors.border}` }}>
                                        <div style={{ marginBottom: '1.2rem' }}>
                                            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <BarChart3 size={18} style={{ color: '#0D7A57' }} /> Distribución de Ventas
                                            </h3>
                                            <p style={{ margin: '0.1rem 0 0 0', fontSize: '0.8rem', color: THEME.colors.textSecondary, fontWeight: '500' }}>Balance B2B vs B2C</p>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '160px' }}>
                                            <SalesPieChart 
                                                totalB2B={orders.filter(o => o.is_b2b).reduce((sum, o) => sum + (o.total || 0), 0)}
                                                totalB2C={orders.filter(o => !o.is_b2b).reduce((sum, o) => sum + (o.total || 0), 0)}
                                            />
                                        </div>
                                    </div>

                                    {/* Task Box */}
                                    <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '1.5rem', boxShadow: THEME.shadow.sm, border: `1px solid ${THEME.colors.border}`, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                                            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <AlertTriangle size={18} style={{ color: '#0D7A57' }} /> Alertas de Seguimiento
                                            </h3>
                                            <p style={{ margin: '0.1rem 0 0 0', fontSize: '0.8rem', color: '#64748B', fontWeight: '500' }}>Tareas críticas pendientes</p>
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
                                                <div style={{ textAlign: 'center', padding: '4rem 2rem', backgroundColor: THEME.colors.primaryLight, borderRadius: THEME.radius.lg, border: '1px dashed #A7F3D0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                    <Check size={28} strokeWidth={1.5} style={{ color: THEME.colors.primary, marginBottom: '1rem' }} />
                                                    <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: THEME.colors.textMain }}>¡Gran trabajo comercial!</h4>
                                                    <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: THEME.colors.textSecondary, fontWeight: '600' }}>No tienes tareas pendientes vencidas en este momento.</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* B2B VIEW */}
                        {activeTab === 'b2b' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                {viewMode === 'grid' ? (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '2rem' }}>
                                        {filterData(clientsB2B, ['company_name', 'razon_social', 'nit', 'contact_name', 'phone', 'email', 'city', 'municipality', 'department', 'address']).map(client => (
                                            <ClientCard 
                                                key={client.id} 
                                                type="b2b" 
                                                data={client} 
                                                pricingModels={pricingModels} 
                                                onUpdatePricingModel={handleUpdatePricingModel}
                                                onViewDetails={() => handleViewDetails(client)}
                                                onEdit={hasEditPermission() ? () => handleEditClient(client) : undefined}
                                                agreementStatus={getAgreementStatus(client.id, client.parent_id)}
                                                isInheritedAgreement={isAgreementInherited(client.id, client.parent_id)}
                                                branchCount={clientsB2B.filter(c => c.parent_id === client.id).length}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{ backgroundColor: 'white', borderRadius: THEME.radius.lg, overflow: 'hidden', boxShadow: THEME.shadow.sm, border: `1px solid ${THEME.colors.border}` }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                            <thead>
                                                <tr style={{ backgroundColor: '#F9FAFB', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                                    <th style={{ padding: '0.65rem 1.25rem', ...THEME.typography.tableHeader }}>IDENTIFICACIÓN / CLIENTE</th>
                                                    <th style={{ padding: '0.65rem 1.25rem', ...THEME.typography.tableHeader }}>CONTACTO</th>
                                                    <th style={{ padding: '0.65rem 1.25rem', ...THEME.typography.tableHeader }}>UBICACIÓN</th>
                                                    <th style={{ padding: '0.65rem 1.25rem', ...THEME.typography.tableHeader }}>ESTADO CUENTA</th>
                                                    <th style={{ padding: '0.65rem 1.25rem', ...THEME.typography.tableHeader }}>ACUERDO / GPS</th>
                                                    <th style={{ padding: '0.65rem 1.25rem', ...THEME.typography.tableHeader }}>ACCIONES</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filterData(clientsB2B, ['company_name', 'razon_social', 'nit', 'contact_name', 'phone', 'email', 'city', 'municipality', 'department', 'address']).map(client => (
                                                    <ClientListRow 
                                                        key={client.id} 
                                                        client={client} 
                                                        pricingModels={pricingModels}
                                                        onViewDetails={() => handleViewDetails(client)}
                                                        onEdit={hasEditPermission() ? () => handleEditClient(client) : undefined}
                                                        agreementStatus={getAgreementStatus(client.id, client.parent_id)}
                                                        isInheritedAgreement={isAgreementInherited(client.id, client.parent_id)}
                                                        branchCount={clientsB2B.filter(c => c.parent_id === client.id).length}
                                                    />
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* B2C VIEW */}
                        {activeTab === 'b2c' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                {viewMode === 'grid' ? (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '2rem' }}>
                                        {filterData(clientsB2C, ['company_name', 'contact_name', 'phone', 'email', 'nit', 'address', 'municipality', 'department']).map((client, idx) => (
                                            <ClientCard 
                                                key={client.id || idx} 
                                                type="b2c" 
                                                data={client} 
                                                onViewDetails={() => handleViewDetails(client)}
                                                onEdit={hasEditPermission() ? () => handleEditClient(client) : undefined}
                                            />
                                        ))}
                                        {clientsB2C.length === 0 && <EmptyState text="No hay clientes hogar registrados aún." />}
                                    </div>
                                ) : (
                                    <div style={{ backgroundColor: 'white', borderRadius: THEME.radius.lg, overflow: 'hidden', boxShadow: THEME.shadow.sm, border: `1px solid ${THEME.colors.border}` }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                            <thead>
                                                <tr style={{ backgroundColor: '#F9FAFB', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                                    <th style={{ padding: '0.65rem 1.25rem', ...THEME.typography.tableHeader }}>CLIENTE / IDENTIFICACIÓN</th>
                                                    <th style={{ padding: '0.65rem 1.25rem', ...THEME.typography.tableHeader }}>CONTACTO</th>
                                                    <th style={{ padding: '0.65rem 1.25rem', ...THEME.typography.tableHeader }}>DIRECCIÓN</th>
                                                    <th style={{ padding: '0.65rem 1.25rem', ...THEME.typography.tableHeader }}>ESTADO</th>
                                                    <th style={{ padding: '0.65rem 1.25rem', ...THEME.typography.tableHeader }}>ACCIONES</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filterData(clientsB2C, ['company_name', 'contact_name', 'phone', 'email', 'nit', 'address', 'municipality', 'department']).map(client => (
                                                    <ClientListRow 
                                                        key={client.id} 
                                                        client={client} 
                                                        onViewDetails={() => handleViewDetails(client)}
                                                        onEdit={hasEditPermission() ? () => handleEditClient(client) : undefined}
                                                    />
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* LEADS VIEW */}
                        {activeTab === 'leads' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                {viewMode === 'grid' ? (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '2rem' }}>
                                        {filterData(leads, ['company_name', 'contact_name', 'phone', 'email', 'nit', 'notes', 'business_type', 'municipality', 'department', 'address']).map(lead => (
                                            <ClientCard 
                                                key={lead.id} 
                                                type="lead" 
                                                data={lead} 
                                                onUpdateStatus={handleUpdateLeadStatus} 
                                                onViewDetails={() => handleViewDetails(lead as unknown as Profile)}
                                                onRegisterContact={() => handleUpdateLeadContact(lead.id)}
                                                onScheduleTask={(date) => handleScheduleLeadTask(lead.id, date)}
                                            />
                                        ))}
                                        {leads.length === 0 && <EmptyState text="Aún no tienes prospectos registrados." />}
                                    </div>
                                ) : (
                                    <div style={{ backgroundColor: 'white', borderRadius: THEME.radius.lg, overflow: 'hidden', boxShadow: THEME.shadow.sm, border: `1px solid ${THEME.colors.border}` }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                            <thead>
                                                <tr style={{ backgroundColor: '#F9FAFB', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                                    <th style={{ padding: '0.65rem 1.25rem', ...THEME.typography.tableHeader }}>PROSPECTO / EMPRESA</th>
                                                    <th style={{ padding: '0.65rem 1.25rem', ...THEME.typography.tableHeader }}>CONTACTO</th>
                                                    <th style={{ padding: '0.65rem 1.25rem', ...THEME.typography.tableHeader }}>UBICACIÓN</th>
                                                    <th style={{ padding: '0.65rem 1.25rem', ...THEME.typography.tableHeader }}>ESTADO</th>
                                                    <th style={{ padding: '0.65rem 1.25rem', ...THEME.typography.tableHeader }}>SEGUIMIENTO</th>
                                                    <th style={{ padding: '0.65rem 1.25rem', ...THEME.typography.tableHeader }}>ACCIONES</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filterData(leads, ['company_name', 'contact_name', 'phone', 'email', 'nit', 'notes', 'business_type', 'municipality', 'department', 'address']).map(lead => (
                                                    <ClientListRow 
                                                        key={lead.id} 
                                                        client={lead as any} 
                                                        onViewDetails={() => handleViewDetails(lead as any)}
                                                        onRegisterContact={() => handleUpdateLeadContact(lead.id)}
                                                    />
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* AGREEMENTS VIEW */}
                        {activeTab === 'agreements' && (
                            <CommercialAgreementsModule />
                        )}
                    </>
                )}
            </div>

            {/* MODAL CARGA MASIVA DE CLIENTES */}
            {isBulkModalOpen && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>
                    <div style={{ backgroundColor: '#FFFFFF', padding: 0, borderRadius: '20px', width: '90%', maxWidth: '500px', border: `1px solid #E2E8F0`, boxShadow: '0 20px 40px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderBottom: `1px solid #E2E8F0` }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ backgroundColor: '#ECFDF5', color: '#10B981', padding: '6px', borderRadius: '8px' }}>
                                    <FileUp size={16} strokeWidth={1.5} />
                                </div>
                                <h2 style={{ fontSize: '0.95rem', fontWeight: '700', color: '#1E293B', margin: 0 }}>Cargue Masivo (Clientes CRM)</h2>
                            </div>
                            <button onClick={() => setIsBulkModalOpen(false)} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: '1.25rem', fontWeight: '300' }}>✕</button>
                        </div>

                        <div style={{ padding: '1.5rem' }}>
                            <p style={{ color: '#64748B', fontSize: '0.8rem', textAlign: 'center', marginBottom: '1rem', lineHeight: '1.4' }}>
                                Sube la planilla de clientes para crear nuevos registros o actualizar la cartera, cupos y logística de los existentes masivamente.
                            </p>

                            {/* Drop Zone */}
                            <div 
                                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                                onDragLeave={() => setDragging(false)}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    setDragging(false);
                                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                                        setSelectedFile(e.dataTransfer.files[0]);
                                    }
                                }}
                                style={{ 
                                    border: dragging ? `2px solid #0891B2` : `2px dashed #E2E8F0`,
                                    backgroundColor: dragging ? '#ECFDF5' : '#F8FAFC',
                                    borderRadius: '12px',
                                    height: '180px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    position: 'relative',
                                    transition: 'all 0.15s'
                                }}
                                onClick={() => document.getElementById('clients-file-input')?.click()}
                            >
                                <input 
                                    id="clients-file-input"
                                    type="file" 
                                    accept=".xlsx, .xls"
                                    onChange={(e) => {
                                        if (e.target.files && e.target.files[0]) {
                                            setSelectedFile(e.target.files[0]);
                                        }
                                    }}
                                    style={{ display: 'none' }}
                                />
                                <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>📁</div>
                                {selectedFile ? (
                                    <div style={{ textAlign: 'center', padding: '0 1rem' }}>
                                        <div style={{ fontSize: '0.8rem', fontWeight: '700', color: '#0F172A', wordBreak: 'break-all' }}>{selectedFile.name}</div>
                                        <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '4px' }}>{(selectedFile.size / 1024).toFixed(1)} KB</div>
                                    </div>
                                ) : (
                                    <div style={{ textAlign: 'center', padding: '0 1rem' }}>
                                        <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#334155' }}>Arrastra tu archivo aquí</div>
                                        <div style={{ fontSize: '0.7rem', color: '#94A3B8', marginTop: '2px' }}>o haz clic para explorar en tu equipo (.xlsx)</div>
                                    </div>
                                )}
                            </div>

                            <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <button 
                                    disabled={!selectedFile || loading}
                                    onClick={processClientsFile}
                                    style={{ 
                                        width: '100%', 
                                        padding: '0.6rem', 
                                        backgroundColor: selectedFile ? '#0891B2' : '#94A3B8', 
                                        color: 'white', 
                                        border: 'none', 
                                        borderRadius: '8px', 
                                        fontWeight: '700', 
                                        cursor: selectedFile ? 'pointer' : 'not-allowed',
                                        fontSize: '0.85rem',
                                        transition: 'all 0.15s'
                                    }}
                                >
                                    {loading ? 'Procesando...' : 'Procesar Clientes'}
                                </button>
                                
                                <button 
                                    onClick={downloadClientsTemplate}
                                    style={{ 
                                        width: '100%', 
                                        padding: '0.6rem', 
                                        backgroundColor: '#F1F5F9', 
                                        color: '#334155', 
                                        border: `1px solid #E2E8F0`, 
                                        borderRadius: '8px', 
                                        fontWeight: '600', 
                                        cursor: 'pointer',
                                        fontSize: '0.8rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    <FileDown size={14} />
                                    Descargar Plantilla Limpia (.xlsx)
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL CONVERSIÓN DE LEAD */}
            {conversionLead && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
                    <form 
                        onSubmit={handleConversionSubmit}
                        style={{ 
                            backgroundColor: 'white', 
                            borderRadius: THEME.radius.lg || '12px', 
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
                        <div style={{ padding: '1.25rem 1.5rem', borderBottom: `1px solid #E2E8F0`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Building2 size={18} style={{ color: '#0D7A57' }} />
                                <h3 style={{ margin: 0, fontWeight: '900', color: '#1E293B' }}>Convertir Prospecto a Cliente B2B</h3>
                            </div>
                            <button 
                                type="button" 
                                onClick={() => setConversionLead(null)} 
                                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', overflowY: 'auto' }}>
                            
                            {/* Client Information */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#64748B', marginBottom: '6px', textTransform: 'uppercase' }}>Razón Social / Nombre Comercial:</label>
                                <input 
                                    type="text" 
                                    required
                                    value={conversionCompanyName} 
                                    onChange={(e) => setConversionCompanyName(e.target.value)}
                                    style={{ 
                                        width: '100%', 
                                        padding: '10px', 
                                        borderRadius: '8px', 
                                        border: `1px solid #CBD5E1`,
                                        fontSize: '0.85rem'
                                    }}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#64748B', marginBottom: '6px', textTransform: 'uppercase' }}>NIT / Identificación:</label>
                                    <input 
                                        type="text" 
                                        value={conversionNit} 
                                        onChange={(e) => setConversionNit(e.target.value)}
                                        placeholder="Ej: 900123456"
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
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#64748B', marginBottom: '6px', textTransform: 'uppercase' }}>Teléfono:</label>
                                    <input 
                                        type="text" 
                                        required
                                        value={conversionPhone} 
                                        onChange={(e) => setConversionPhone(e.target.value)}
                                        style={{ 
                                            width: '100%', 
                                            padding: '10px', 
                                            borderRadius: '8px', 
                                            border: `1px solid #CBD5E1`,
                                            fontSize: '0.85rem'
                                        }}
                                    />
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#64748B', marginBottom: '6px', textTransform: 'uppercase' }}>Dirección:</label>
                                <input 
                                    type="text" 
                                    required
                                    value={conversionAddress} 
                                    onChange={(e) => setConversionAddress(e.target.value)}
                                    style={{ 
                                        width: '100%', 
                                        padding: '10px', 
                                        borderRadius: '8px', 
                                        border: `1px solid #CBD5E1`,
                                        fontSize: '0.85rem'
                                    }}
                                />
                            </div>

                            {/* Checkbox to create agreement */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.5rem 0' }}>
                                <input 
                                    type="checkbox" 
                                    id="create_agreement"
                                    checked={conversionCreateAgreement} 
                                    onChange={(e) => setConversionCreateAgreement(e.target.checked)}
                                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                />
                                <label htmlFor="create_agreement" style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#1E293B', cursor: 'pointer' }}>
                                    ¿Inicializar Acuerdo Comercial de Precios Congelados B2B?
                                </label>
                            </div>

                            {/* Conditional Agreement Fields */}
                            {conversionCreateAgreement && (
                                <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                    
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

                                    <div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '1rem' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: '#64748B', marginBottom: '6px', textTransform: 'uppercase' }}>Fecha de Inicio:</label>
                                                <input 
                                                    type="date" 
                                                    required={conversionCreateAgreement}
                                                    value={conversionStartDate} 
                                                    onChange={(e) => setConversionStartDate(e.target.value)}
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
                                                        required={conversionCreateAgreement}
                                                        value={conversionDurationValue}
                                                        onChange={(e) => setConversionDurationValue(Math.max(1, parseInt(e.target.value) || 1))}
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
                                                        value={conversionDurationUnit}
                                                        onChange={(e) => setConversionDurationUnit(e.target.value)}
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
                                        {(() => {
                                            const expiry = new Date(conversionStartDate + 'T12:00:00');
                                            if (conversionDurationUnit === 'days') {
                                                expiry.setDate(expiry.getDate() + conversionDurationValue);
                                            } else if (conversionDurationUnit === 'weeks') {
                                                expiry.setDate(expiry.getDate() + conversionDurationValue * 7);
                                            } else if (conversionDurationUnit === 'months') {
                                                expiry.setMonth(expiry.getMonth() + conversionDurationValue);
                                            } else if (conversionDurationUnit === 'years') {
                                                expiry.setFullYear(expiry.getFullYear() + conversionDurationValue);
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
                                                    color: '#64748B',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px'
                                                }}>
                                                    <span>📅 El acuerdo vencerá el:</span>
                                                    <strong style={{ color: '#0D7A57' }}>{formattedExpiry}</strong>
                                                </div>
                                            );
                                        })()}
                                    </div>

                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#64748B', textTransform: 'uppercase' }}>Lista de Precios (Excel):</span>
                                            <button
                                                type="button"
                                                onClick={downloadConversionTemplate}
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
                                                <Download size={14} /> Descargar Plantilla
                                            </button>
                                        </div>

                                        <div style={{
                                            border: `2px dashed ${conversionFile ? '#0D7A57' : '#CBD5E1'}`,
                                            backgroundColor: conversionFile ? '#F0FDF4' : '#F8FAFC',
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
                                                onChange={handleConversionFileUpload}
                                                style={{
                                                    position: 'absolute',
                                                    inset: 0,
                                                    opacity: 0,
                                                    cursor: 'pointer'
                                                }}
                                            />
                                            <UploadCloud size={32} style={{ color: conversionFile ? '#0D7A57' : '#94A3B8', margin: '0 auto 8px auto' }} />
                                            {conversionFile ? (
                                                <div>
                                                    <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#1E293B' }}>{conversionFile.name}</div>
                                                    <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '2px' }}>
                                                        {conversionItems.length} productos detectados listos para cargar
                                                    </div>
                                                </div>
                                            ) : (
                                                <div>
                                                    <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#1E293B' }}>Selecciona o arrastra tu archivo Excel</div>
                                                    <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '2px' }}>
                                                        Formatos soportados: .xlsx, .xls
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div style={{ padding: '1.25rem 1.5rem', borderTop: `1px solid #E2E8F0`, display: 'flex', gap: '10px', backgroundColor: '#F9FAFB' }}>
                            <button 
                                type="button" 
                                onClick={() => setConversionLead(null)} 
                                style={{ 
                                    flex: 1, 
                                    padding: '10px', 
                                    borderRadius: '8px', 
                                    border: `1px solid #CBD5E1`, 
                                    backgroundColor: 'white', 
                                    fontWeight: 'bold',
                                    cursor: 'pointer' 
                                }}
                            >
                                Cancelar
                            </button>
                            <button 
                                type="submit" 
                                disabled={converting || parsingFile || (conversionCreateAgreement && conversionItems.length === 0)}
                                style={{ 
                                    flex: 2, 
                                    padding: '10px', 
                                    borderRadius: '8px', 
                                    border: 'none', 
                                    backgroundColor: (conversionCreateAgreement && conversionItems.length === 0) || converting ? '#CBD5E1' : '#0D7A57', 
                                    color: 'white', 
                                    fontWeight: 'bold',
                                    cursor: (conversionCreateAgreement && conversionItems.length === 0) || converting ? 'not-allowed' : 'pointer'
                                }}
                            >
                                {converting ? 'Procesando...' : 'Convertir y Guardar'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}



function KPICard({ title, value, icon, color, textColor, subtitle }: { title: string, value: number | string, icon: React.ReactNode, color: string, textColor: string, subtitle: string }) {
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

function SalesPieChart({ totalB2B, totalB2C }: { totalB2B: number, totalB2C: number }) {
    const total = totalB2B + totalB2C;
    const b2bPercent = total > 0 ? (totalB2B / total) * 100 : 0;
    const b2cPercent = total > 0 ? (totalB2C / total) * 100 : 0;

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', width: '100%', justifyContent: 'center', fontFamily: 'var(--font-inter), sans-serif' }}>
            <div style={{
                width: '130px',
                height: '130px',
                borderRadius: '50%',
                background: total > 0 ? `conic-gradient(#5C728D ${b2bPercent}%, #7E8F9F 0)` : '#5C728D',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
            }}>
                <div style={{
                    width: '94px',
                    height: '94px',
                    backgroundColor: 'white',
                    borderRadius: '50%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: '700', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>TOTAL</span>
                    <span style={{ fontSize: '1.25rem', fontWeight: '800', color: THEME.colors.textMain, marginTop: '2px' }}>{formatMoney(total)}</span>
                </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '4px', backgroundColor: '#0D7A57', marginTop: '4px' }} />
                    <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.03em' }}>CANAL B2B</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#0D7A57', marginTop: '2px' }}>{formatMoney(totalB2B)}</div>
                        <div style={{ fontSize: '0.75rem', fontWeight: '500', color: '#94A3B8', marginTop: '1px' }}>{Math.round(b2bPercent)}% del total</div>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', borderTop: `1px solid ${THEME.colors.border}`, paddingTop: '1rem' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '4px', backgroundColor: '#7E8F9F', marginTop: '4px' }} />
                    <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.03em' }}>CANAL B2C</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: '800', color: THEME.colors.textMain, marginTop: '2px' }}>{formatMoney(totalB2C)}</div>
                        <div style={{ fontSize: '0.75rem', fontWeight: '500', color: '#94A3B8', marginTop: '1px' }}>{Math.round(b2cPercent)}% del total</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function FunnelGraphic({ leads }: { leads: Lead[] }) {
    const stages = [
        { label: 'Prospectos', status: 'new', color: '#5C728D' },
        { label: 'En Gestión', status: 'contacted', color: '#E28743' },
        { label: 'Convertidos', status: 'converted', color: '#0D7A57' },
        { label: 'Descartados', status: 'rejected', color: '#D9534F' }
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', width: '100%', fontFamily: 'var(--font-inter), sans-serif' }}>
            {stages.map((stage) => {
                const count = leads.filter(l => l.status === stage.status).length;
                const percent = leads.length > 0 ? (count / leads.length) * 100 : 0;
                return (
                    <div key={stage.status} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', fontWeight: '700', color: '#64748B' }}>
                            <span style={{ textTransform: 'uppercase', letterSpacing: '0.03em' }}>{stage.label}</span>
                            <span style={{ fontWeight: '800', color: '#1E293B' }}>{count} <span style={{ fontWeight: '500', color: '#94A3B8', fontSize: '0.7rem' }}>({Math.round(percent)}%)</span></span>
                        </div>
                        <div style={{ 
                            height: '10px', 
                            backgroundColor: '#F1F5F9', 
                            borderRadius: '9999px', 
                            display: 'flex',
                            justifyContent: 'center',
                            overflow: 'hidden'
                        }}>
                            <div style={{ 
                                height: '100%', 
                                width: `${percent}%`, 
                                backgroundColor: stage.color, 
                                borderRadius: '9999px',
                                transition: 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)'
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
            padding: '1.4rem', 
            borderRadius: '20px', 
            border: '1px solid #FFE4E6', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            gap: '1.2rem',
            boxShadow: '0 4px 10px rgba(159, 18, 57, 0.05)',
            transition: 'all 0.2s ease'
        }} onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateX(5px)';
            e.currentTarget.style.borderColor = '#FDA4AF';
        }} onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateX(0)';
            e.currentTarget.style.borderColor = '#FFE4E6';
        }}>
            <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '900', color: '#9F1239', fontSize: '1rem', marginBottom: '0.2rem' }}>{lead.company_name || lead.contact_name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', backgroundColor: '#BE123C', color: 'white', borderRadius: '6px', fontWeight: '900' }}>⚠️ VENCIDA</span>
                    <span style={{ fontSize: '0.8rem', color: '#E11D48', fontWeight: '700' }}>
                        {overdueDays <= 0 ? 'Para hoy' : `Hace ${overdueDays} días`}
                    </span>
                </div>
            </div>
            <div style={{ display: 'flex', gap: '0.8rem' }}>
                <button 
                    onClick={() => {
                        const cleanPhone = lead.phone.replace(/\D/g, '');
                        window.open(`https://wa.me/57${cleanPhone}?text=Hola ${lead.contact_name}, te escribimos de Frubana Express...`, '_blank');
                    }}
                    style={{ backgroundColor: '#10B981', color: 'white', border: 'none', width: '42px', height: '42px', borderRadius: '12px', cursor: 'pointer', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(16, 185, 129, 0.2)' }}
                    title="WhatsApp Directo"
                >
                    💬
                </button>
                <button 
                    onClick={onWaitlist}
                    style={{ backgroundColor: 'white', color: '#9F1239', border: '2px solid #FFE4E6', padding: '0 1.2rem', borderRadius: '12px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '800', height: '42px' }}
                >
                    Gestionar
                </button>
            </div>
        </div>
    );
}

function ClientCard({ type, data, pricingModels, onUpdatePricingModel, onUpdateStatus, onViewDetails, onEdit, onRegisterContact, onScheduleTask, agreementStatus, isInheritedAgreement, branchCount }: { 
    type: 'b2b' | 'b2c' | 'lead', 
    data: Profile | Lead, 
    pricingModels?: PricingModel[],
    onUpdatePricingModel?: (id: string, modelId: string) => void,
    onUpdateStatus?: (id: string, status: string) => void,
    onViewDetails?: () => void,
    onEdit?: () => void,
    onRegisterContact?: () => void,
    onScheduleTask?: (date: string) => void,
    agreementStatus?: 'active' | 'warning' | 'expired' | 'none',
    isInheritedAgreement?: boolean,
    branchCount?: number
}) {
    const isB2B = type === 'b2b';
    const isB2C = type === 'b2c';
    const isLead = type === 'lead';

    const profileData = (isB2B || isB2C) ? (data as Profile) : null;
    const leadData = isLead ? (data as Lead) : null;

    const selectedModel = isB2B ? pricingModels?.find((m: PricingModel) => m.id === profileData?.pricing_model_id) : null;

    const handleWhatsApp = () => {
        if (!data.phone) return alert('No hay teléfono registrado');
        const cleanPhone = data.phone.replace(/\D/g, '');
        const contactName = isLead ? leadData?.contact_name : profileData?.contact_name;
        const message = encodeURIComponent(`Hola ${contactName || ''}, te contactamos de Frubana Express.`);
        window.open(`https://wa.me/57${cleanPhone}?text=${message}`, '_blank');
    };

    const isMatriz = isB2B && (data.is_corporate_parent === true || (data as any).classification === 'matriz' || !data.parent_id);
    const isRealBranch = isB2B && !!data.parent_id && (isInheritedAgreement || agreementStatus !== 'none');

    return (
        <div 
            onClick={onViewDetails}
            onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = THEME.shadow.lg;
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = THEME.shadow.md;
            }}
            style={{ 
                backgroundColor: isMatriz ? '#F8FAFC' : 'white', 
                borderRadius: THEME.radius.lg, 
                padding: '2rem', 
                boxShadow: THEME.shadow.md,
                border: isMatriz ? '2px solid #1E3A8A' : `1px solid ${THEME.colors.border}`,
                display: 'flex',
                flexDirection: 'column',
                gap: '1.5rem',
                position: 'relative',
                overflow: 'hidden',
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
        >
            {/* Tag / Status Area */}
            <div 
                onClick={(e) => e.stopPropagation()}
                style={{ 
                    position: 'absolute', 
                    top: '1.5rem', 
                    right: '1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    gap: '0.6rem',
                    zIndex: 2
                }}
            >
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {isMatriz && (
                        <span style={{ fontSize: '0.62rem', backgroundColor: '#1E3A8A', color: '#FFFFFF', padding: '0.35rem 0.7rem', borderRadius: '8px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'inline-flex', alignItems: 'center', gap: '4px', boxShadow: '0 2px 4px rgba(30,58,138,0.25)' }}>🏢 MATRIZ</span>
                    )}
                    {isMatriz && branchCount !== undefined && branchCount > 0 && (
                        <span title="Sucursales vinculadas a esta Casa Matriz" style={{ fontSize: '0.62rem', backgroundColor: '#EFF6FF', color: '#1E40AF', padding: '0.35rem 0.7rem', borderRadius: '8px', fontWeight: '900', border: '1px solid #BFDBFE', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Building2 size={12} strokeWidth={2} /> {branchCount} {branchCount === 1 ? 'Sucursal' : 'Sucursales'}
                        </span>
                    )}
                    {!isMatriz && (
                        <div style={{ 
                            padding: '0.4rem 0.8rem',
                            borderRadius: '8px',
                            fontSize: '0.7rem',
                            fontWeight: '900',
                            backgroundColor: isB2B ? '#E0F2FE' : isB2C ? '#DCFCE7' : '#FEE2E2',
                            color: isB2B ? '#0369A1' : isB2C ? '#15803D' : '#991B1B',
                            textTransform: 'uppercase'
                        }}>
                            {isB2B ? 'Institucional' : isB2C ? 'Hogar' : 'Prospecto'}
                        </div>
                    )}
                </div>

                {/* TRAFFIC LIGHT (Semáforo Comercial) */}
                {isB2B && agreementStatus && (() => {
                    let bg = '#F8FAFC';
                    let border = '#E2E8F0';
                    let color = '#64748B';
                    let dotColor = '#94A3B8';
                    let text = 'Sin Acuerdo';

                    if (agreementStatus === 'active') {
                        if (isInheritedAgreement) {
                            bg = '#F0F9FF';
                            border = '#BAE6FD';
                            color = '#0284C7';
                            dotColor = '#0EA5E9';
                            text = 'Acuerdo Heredado';
                        } else {
                            bg = '#ECFDF5';
                            border = '#A7F3D0';
                            color = '#047857';
                            dotColor = '#10B981';
                            text = 'Acuerdo Activo';
                        }
                    } else if (agreementStatus === 'warning') {
                        bg = '#FFFBEB';
                        border = '#FDE68A';
                        color = '#B45309';
                        dotColor = '#F59E0B';
                        text = isInheritedAgreement ? 'Heredado Por Vencer' : 'Por Vencer';
                    } else if (agreementStatus === 'expired') {
                        bg = '#FEF2F2';
                        border = '#FCA5A5';
                        color = '#991B1B';
                        dotColor = '#EF4444';
                        text = isInheritedAgreement ? 'Heredado Vencido' : 'Acuerdo Vencido';
                    }

                    return (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            backgroundColor: bg,
                            padding: '4px 10px',
                            borderRadius: '10px',
                            border: `1px solid ${border}`,
                            boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                            whiteSpace: 'nowrap'
                        }}>
                            <div style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                backgroundColor: dotColor,
                                boxShadow: `0 0 6px ${dotColor}aa`
                            }} />
                            <span style={{ 
                                fontSize: '0.6rem', 
                                fontWeight: '900', 
                                color: color,
                                textTransform: 'uppercase',
                                letterSpacing: '0.02rem'
                            }}>
                                {text}
                            </span>
                        </div>
                    );
                })()}

                {/* INACTIVE / ARCHIVED BADGE */}
                {(isB2B || isB2C) && profileData?.is_active === false && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        backgroundColor: '#FEF2F2',
                        padding: '4px 10px',
                        borderRadius: '10px',
                        border: '1px solid #FCA5A5',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                    }}>
                        <div style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: '#EF4444',
                            boxShadow: '0 0 6px #EF444488'
                        }} />
                        <span style={{ 
                            fontSize: '0.6rem', 
                            fontWeight: '900', 
                            color: '#DC2626',
                            textTransform: 'uppercase',
                            letterSpacing: '0.02rem'
                        }}>
                            INACTIVO / ARCHIVADO
                        </span>
                    </div>
                )}

                {/* GPS INDICATOR (Gerencia Visual) */}
                {(isB2B || isB2C) && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        backgroundColor: 'rgba(255, 255, 255, 0.9)',
                        padding: '4px 10px',
                        borderRadius: '10px',
                        border: '1px solid',
                        borderColor: (profileData?.latitude && profileData?.longitude) ? '#A7F3D0' : '#FECACA',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                    }}>
                        <div style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: (profileData?.latitude && profileData?.longitude) ? '#10B981' : '#EF4444',
                            boxShadow: `0 0 6px ${(profileData?.latitude && profileData?.longitude) ? '#10B98188' : '#EF444488'}`
                        }} />
                        <span style={{ 
                            fontSize: '0.6rem', 
                            fontWeight: '900', 
                            color: (profileData?.latitude && profileData?.longitude) ? '#059669' : '#B91C1C',
                            textTransform: 'uppercase',
                            letterSpacing: '0.02rem'
                        }}>
                            {(profileData?.latitude && profileData?.longitude) ? 'GPS OK' : 'FALTA GPS'}
                        </span>
                    </div>
                )}

                {/* CORPORATE BADGE */}
                {isB2B && (profileData?.is_corporate_parent || profileData?.parent_id) && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        backgroundColor: profileData.is_corporate_parent ? '#F0F9FF' : '#FFF7ED',
                        padding: '4px 10px',
                        borderRadius: '10px',
                        border: '1px solid',
                        borderColor: profileData.is_corporate_parent ? '#BAE6FD' : '#FFEDD5',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                    }}>
                        <span style={{ display: 'flex', alignItems: 'center' }}>
                            {profileData.is_corporate_parent ? <Building2 size={12} strokeWidth={1.5} /> : <MapPin size={12} strokeWidth={1.5} />}
                        </span>
                        <span style={{ 
                            fontSize: '0.6rem', 
                            fontWeight: '900', 
                            color: profileData.is_corporate_parent ? '#0369A1' : '#C2410C',
                            textTransform: 'uppercase',
                            letterSpacing: '0.02rem'
                        }}>
                            {profileData.is_corporate_parent ? 'Casa Matriz' : 'Sucursal'}
                        </span>
                    </div>
                )}
            </div>

            {/* Header Info */}
            <div style={{ marginTop: '0.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '900', color: THEME.colors.textMain, paddingRight: '100px', lineHeight: '1.3' }}>
                    {isB2B ? profileData?.company_name : isB2C ? profileData?.contact_name : leadData?.company_name}
                </h3>
                {isB2B && profileData?.razon_social && <p style={{ margin: '0.1rem 0', fontSize: '0.75rem', color: THEME.colors.textSecondary, fontStyle: 'italic', lineHeight: '1.2' }}>{profileData.razon_social}</p>}
                {(isB2B || isLead) && <p style={{ margin: '0.4rem 0', fontSize: '0.8rem', color: THEME.colors.textSecondary, fontWeight: '700' }}>{isB2B ? profileData?.contact_name : leadData?.contact_name}</p>}
            </div>

            {/* Content Fields */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.8rem' }}>
                {(isB2B || isLead || isB2C) && (
                    <InfoRow icon="" label="Contacto" value={data.phone} />
                )}
                {(isB2B || isLead || isB2C) && (
                    <InfoRow icon="" label="Email" value={data.email} />
                )}
                {((isB2B && profileData?.nit) || (isLead && leadData?.nit)) && (
                    <InfoRow icon="" label="NIT" value={isB2B ? profileData?.nit : leadData?.nit} />
                )}
                {(isB2B || isB2C) && profileData && (
                    <InfoRow 
                        icon="" 
                        label="Ubicación" 
                        value={`${profileData.address || ''}${profileData.municipality || profileData.city ? `, ${profileData.municipality || profileData.city}` : ''}${profileData.department ? `, ${profileData.department}` : ''}`} 
                    />
                )}
                {isLead && leadData && (
                    <InfoRow 
                        icon="" 
                        label="Ubicación" 
                        value={`${leadData.address || ''}${leadData.municipality ? `, ${leadData.municipality}` : ''}`} 
                    />
                )}
                {((isB2B || isB2C) && profileData && profileData.latitude && profileData.longitude) || (isLead && leadData && leadData.latitude && leadData.longitude) ? (
                    <div style={{ fontSize: '0.75rem', color: THEME.colors.primary, fontWeight: '700', paddingLeft: '1.5rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <MapPin size={12} strokeWidth={1.5} /> {isLead ? leadData?.latitude?.toFixed(4) : profileData?.latitude?.toFixed(4)}, {isLead ? leadData?.longitude?.toFixed(4) : profileData?.longitude?.toFixed(4)} 
                        <span style={{ marginLeft: '8px', color: '#059669' }}>✓ Geo</span>
                    </div>
                ) : null}
                {isB2B && profileData && (
                    <div style={{ padding: '1rem', backgroundColor: '#F8FAFC', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}` }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: '800', color: THEME.colors.textSecondary, display: 'block', marginBottom: '0.6rem' }}>MODELO DE COTIZACIÓN</label>
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

                {(isB2B || isB2C) && profileData && (
                    <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
                        {profileData.needs_crates && (
                            <div style={{ backgroundColor: '#F0F9FF', color: '#0369A1', padding: '0.4rem 0.8rem', borderRadius: '8px', fontSize: '0.7rem', fontWeight: '900', border: '1px solid #BAE6FD', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Package size={12} strokeWidth={1.5} /> CON CANASTAS
                            </div>
                        )}
                        <div style={{ backgroundColor: '#F8FAFC', color: '#475569', padding: '0.4rem 0.8rem', borderRadius: '8px', fontSize: '0.7rem', fontWeight: '900', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <FileText size={12} strokeWidth={1.5} /> {
                                profileData.document_type === 'invoice' 
                                    ? (profileData.print_invoice ? 'FACTURA IMPRESA' : 'FACTURA DIGITAL')
                                    : (profileData.remission_with_prices ? 'REMISIÓN ($)' : 'REMISIÓN (Sin $)')
                            }
                        </div>
                    </div>
                )}

                {isB2B && profileData && profileData.delivery_restrictions && (
                    <div style={{ backgroundColor: '#FFFBEB', padding: '0.8rem', borderRadius: '12px', border: '1px solid #FEF3C7' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#B45309', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '0.2rem' }}><AlertTriangle size={12} strokeWidth={1.5} /> RESTRICCIONES</span>
                        <span style={{ fontSize: '0.8rem', color: '#92400E', display: 'block', marginBottom: '0.4rem' }}>{profileData.delivery_restrictions}</span>
                        
                        {profileData.logistics_data && profileData.logistics_data.windows && profileData.logistics_data.windows.length > 0 && (
                            <div style={{ 
                                backgroundColor: '#FEF3C7', 
                                padding: '0.6rem', 
                                borderRadius: '8px', 
                                border: '1px solid #F59E0B',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                marginTop: '0.5rem'
                            }}>
                                <Cpu size={12} strokeWidth={1.5} style={{ color: '#92400E' }} />
                                <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#92400E', lineHeight: '1.2' }}>
                                    FRANJA ESTRUCTURADA: {formatTimeWindow(profileData.logistics_data)}
                                </span>
                            </div>
                        )}
                    </div>
                )}
                {isB2C && profileData && profileData.total_orders !== undefined && (
                    <>
                        <InfoRow icon="" label="Actividad" value={`${formatNumber(profileData.total_orders || 0)} Pedidos | ${formatMoney(profileData.total_spent || 0)} totales`} />
                        {profileData.last_order && <InfoRow icon="" label="Último pedido" value={new Date(profileData.last_order as string).toLocaleDateString()} />}
                    </>
                )}
                {isLead && leadData && (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', backgroundColor: '#F8FAFC', padding: '1rem', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
                            <div>
                                <label style={{ fontSize: '0.65rem', fontWeight: '800', color: '#94A3B8', display: 'block', textTransform: 'uppercase' }}>Tipo Negocio</label>
                                <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#334155' }}>{leadData.business_type || 'No especificado'}</div>
                            </div>
                            <div>
                                <label style={{ fontSize: '0.65rem', fontWeight: '800', color: '#94A3B8', display: 'block', textTransform: 'uppercase' }}>Tamaño</label>
                                <div style={{ 
                                    fontSize: '0.85rem', 
                                    fontWeight: '800', 
                                    color: (() => {
                                        const size = leadData.business_size || '';
                                        if (size.includes('Grande') || size.includes('30M')) return '#15803D';
                                        if (size.includes('Mediano') || size.includes('10M')) return '#B45309';
                                        if (size.includes('Pequeño') || size.includes('< 10M')) return '#B91C1C';
                                        return '#334155';
                                    })(),
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    marginTop: '2px'
                                }}>
                                    {(() => {
                                        const size = leadData.business_size || '';
                                        if (size.includes('Grande') || size.includes('30M')) return '🟢 ' + size;
                                        if (size.includes('Mediano') || size.includes('10M')) return '🟡 ' + size;
                                        if (size.includes('Pequeño') || size.includes('< 10M')) return '🔴 ' + size;
                                        return size || 'No especificado';
                                    })()}
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.8rem', backgroundColor: '#F1F5F9', borderRadius: '12px' }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '0.65rem', fontWeight: '800', color: '#64748B', display: 'block' }}>CONTACTOS</label>
                                <div style={{ fontSize: '0.9rem', fontWeight: '800', color: '#1E293B' }}>📞 {leadData.contact_count || 0} veces</div>
                            </div>
                            {leadData.last_contact_date && (
                                <div style={{ flex: 2 }}>
                                    <label style={{ fontSize: '0.65rem', fontWeight: '800', color: '#64748B', display: 'block' }}>ÚLTIMO CONTACTO</label>
                                    <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569' }}>{new Date(leadData.last_contact_date as string).toLocaleDateString()}</div>
                                </div>
                            )}
                        </div>

                        {leadData.next_contact_date && (
                            <div style={{ 
                                padding: '0.8rem', 
                                borderRadius: '12px', 
                                backgroundColor: new Date(leadData.next_contact_date as string) < new Date() ? '#FEF2F2' : '#F0FDF4',
                                border: `1px solid ${new Date(leadData.next_contact_date as string) < new Date() ? '#FEE2E2' : '#DCFCE7'}`,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px'
                            }}>
                                <span style={{ fontSize: '1.2rem' }}>{new Date(leadData.next_contact_date as string) < new Date() ? '⚠️' : '📅'}</span>
                                <div>
                                    <label style={{ fontSize: '0.65rem', fontWeight: '800', color: new Date(leadData.next_contact_date as string) < new Date() ? '#991B1B' : '#166534', display: 'block' }}>
                                        {new Date(leadData.next_contact_date as string) < new Date() ? 'TAREA VENCIDA' : 'SIGUIENTE CONTACTO'}
                                    </label>
                                    <div style={{ fontSize: '0.85rem', fontWeight: '800', color: new Date(leadData.next_contact_date as string) < new Date() ? '#B91C1C' : '#15803D' }}>
                                        {new Date(leadData.next_contact_date as string).toLocaleDateString()}
                                    </div>
                                </div>
                            </div>
                        )}

                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: '800', color: THEME.colors.textSecondary, display: 'block', marginBottom: '0.4rem' }}>ESTADO DE GESTIÓN</label>
                            <select
                                value={leadData.status}
                                onChange={(e) => onUpdateStatus && onUpdateStatus(leadData.id, e.target.value)}
                                style={{ 
                                    width: '100%', 
                                    padding: '0.8rem', 
                                    borderRadius: '12px', 
                                    border: `1px solid ${THEME.colors.border}`,
                                    fontWeight: '700',
                                    backgroundColor: '#F8FAFC'
                                }}
                            >
                                <option value="new">Nuevo Contacto</option>
                                <option value="contacted">Contactado</option>
                                <option value="converted">Convertido a Cliente</option>
                                <option value="rejected">Descartado</option>
                            </select>
                        </div>

                        {leadData.latitude && leadData.longitude ? (
                            <div style={{ marginBottom: '1rem', padding: '0.8rem', backgroundColor: THEME.colors.primaryLight, borderRadius: '12px', border: '1px solid #A7F3D0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <MapPin size={16} strokeWidth={1.5} style={{ color: THEME.colors.primary }} />
                                <div>
                                    <label style={{ fontSize: '0.65rem', fontWeight: '800', color: THEME.colors.primary, display: 'block' }}>UBICACIÓN VERIFICADA</label>
                                    <div style={{ fontSize: '0.8rem', fontWeight: '800', color: THEME.colors.textMain }}>
                                        {leadData.latitude.toFixed(6)}, {leadData.longitude.toFixed(6)}
                                        <a 
                                            href={`https://www.google.com/maps?q=${leadData.latitude},${leadData.longitude}`} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            style={{ marginLeft: '10px', color: THEME.colors.primary, textDecoration: 'none', fontSize: '0.75rem', fontWeight: '900' }}
                                        >
                                            Abrir Mapa ↗
                                        </a>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div style={{ marginBottom: '1rem', padding: '0.8rem', backgroundColor: '#FEF2F2', borderRadius: '12px', border: '1px solid #FEE2E2', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <AlertTriangle size={16} strokeWidth={1.5} style={{ color: '#EF4444' }} />
                                <div>
                                    <label style={{ fontSize: '0.65rem', fontWeight: '800', color: '#991B1B', display: 'block' }}>SIN UBICACIÓN GPS</label>
                                    <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#B91C1C' }}>
                                        Ubicación no capturada por el bot (v1.0 o error)
                                    </div>
                                </div>
                            </div>
                        )}
                        {leadData.notes && (
                            <div style={{ backgroundColor: THEME.colors.primaryLight, padding: '0.8rem', borderRadius: '12px', border: '1px solid #A7F3D0' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: '800', color: THEME.colors.primary, display: 'block', marginBottom: '0.2rem' }}>NOTA</span>
                                <span style={{ fontSize: '0.8rem', color: THEME.colors.textMain }}>{leadData.notes}</span>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Actions */}
            <div 
                onClick={(e) => e.stopPropagation()}
                style={{ marginTop: 'auto', paddingTop: '1.5rem', borderTop: `1px solid ${THEME.colors.border}`, display: 'flex', gap: '0.5rem' }}
            >
                {onViewDetails && (
                    <button 
                        onClick={onViewDetails}
                        style={{ flex: 1, padding: '0.5rem 0.8rem', border: '1px solid #D1D5DB', color: '#64748B', fontSize: '0.75rem', fontWeight: 600, borderRadius: '8px', backgroundColor: 'white', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }} 
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F9FAFB'} 
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                    >
                        Ficha
                    </button>
                )}
                {(isB2B || isB2C) && onEdit && (
                    <button 
                        onClick={onEdit}
                        style={{ flex: 1, padding: '0.5rem 0.8rem', border: '1px solid #D1D5DB', color: '#64748B', fontSize: '0.75rem', fontWeight: 600, borderRadius: '8px', backgroundColor: 'white', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F9FAFB'} 
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                    >
                        Editar
                    </button>
                )}
                {isLead && onRegisterContact && (
                    <button 
                        onClick={onRegisterContact}
                        style={{ flex: 1.5, padding: '0.5rem 0.8rem', borderRadius: '8px', border: 'none', background: THEME.colors.primary, color: 'white', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.75rem' }}
                    >
                        <Check size={14} strokeWidth={1.5} /> Contacto
                    </button>
                )}
                {isLead && onScheduleTask && (
                    <button 
                        onClick={() => {
                            const date = window.prompt('Fecha de siguiente contacto (AAAA-MM-DD):', new Date(Date.now() + 86400000).toISOString().split('T')[0]);
                            if (date) onScheduleTask(date);
                        }}
                        style={{ flex: 1, padding: '0.5rem 0.8rem', border: '1px solid #D1D5DB', color: '#64748B', fontSize: '0.75rem', fontWeight: 600, borderRadius: '8px', backgroundColor: 'white', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F9FAFB'} 
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                    >
                        <Sliders size={14} strokeWidth={1.5} /> Tarea
                    </button>
                )}
                <button 
                    onClick={handleWhatsApp}
                    style={{ padding: '0.5rem 0.8rem', borderRadius: '8px', border: 'none', background: '#25D366', color: 'white', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', fontSize: '0.75rem' }}
                >
                    <Phone size={14} strokeWidth={1.5} /> WhatsApp
                </button>
            </div>
        </div>
    );
}

function ClientListRow({ client, pricingModels, onViewDetails, onEdit, agreementStatus, isInheritedAgreement, onRegisterContact, branchCount }: { 
    client: Profile, 
    pricingModels?: PricingModel[], 
    onViewDetails: () => void, 
    onEdit?: () => void, 
    agreementStatus?: 'active' | 'warning' | 'expired' | 'none',
    isInheritedAgreement?: boolean,
    onRegisterContact?: () => void,
    branchCount?: number
}) {
    const isB2B = client.role === 'b2b_client';
    const isLead = (client as any).status !== undefined;
    const selectedModel = isB2B ? pricingModels?.find(m => m.id === client.pricing_model_id) : null;

    const handleWhatsApp = () => {
        if (!client.phone) return alert('No hay teléfono');
        const cleanPhone = client.phone.replace(/\D/g, '');
        window.open(`https://wa.me/57${cleanPhone}`, '_blank');
    };

    let displayMunicipality = client.municipality || '';
    let displayAddress = client.address || '';
    let displayCity = client.city || '';

    if (isLead) {
        if (!displayCity) displayCity = 'Prospecto';
        if (!displayAddress || !displayMunicipality) {
            const notesText = (client as any).notes || '';
            if (notesText.includes('MUN:') || notesText.includes('ORIG:')) {
                const munMatch = notesText.match(/MUN:\s*([^|]+)/);
                const origMatch = notesText.match(/ORIG:\s*([^|]+)/);
                if (munMatch && !displayMunicipality) displayMunicipality = munMatch[1].trim();
                if (origMatch && !displayAddress) displayAddress = origMatch[1].trim();
            }
        }
    }

    const isMatriz = !isLead && (client.is_corporate_parent === true || (client as any).classification === 'matriz' || !client.parent_id);
    const isRealBranch = !isLead && !!client.parent_id && (isInheritedAgreement || agreementStatus !== 'none');

    return (
        <tr 
            style={{ 
                borderBottom: `1px solid ${THEME.colors.border}`, 
                borderLeft: isMatriz ? '4px solid #1E3A8A' : '4px solid transparent',
                backgroundColor: isMatriz ? '#F8FAFC' : 'transparent',
                transition: 'background 0.2s', 
                cursor: 'pointer' 
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = isMatriz ? '#F1F5F9' : '#F8FAF9')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = isMatriz ? '#F8FAFC' : 'transparent')}
            onClick={onViewDetails}
        >
            <td style={{ padding: '0.65rem 1.25rem' }}>
                <div style={{ fontWeight: '800', color: THEME.colors.textMain, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {client.company_name || client.contact_name}
                </div>
                {isLead ? (
                    <>
                        {client.nit && <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, fontWeight: '600' }}>NIT: {client.nit}</div>}
                        <div style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                            {(client as any).business_type && <span style={{ fontSize: '0.65rem', backgroundColor: THEME.colors.primaryLight, color: THEME.colors.primary, padding: '2px 6px', borderRadius: '4px', fontWeight: '800' }}>{(client as any).business_type}</span>}
                            {(client as any).business_size && (() => {
                                const size = (client as any).business_size;
                                let bg = '#F3F4F6';
                                let textCol = '#374151';
                                if (size.includes('Grande') || size.includes('30M')) { bg = '#DCFCE7'; textCol = '#15803D'; }
                                else if (size.includes('Mediano') || size.includes('10M')) { bg = '#FEF3C7'; textCol = '#B45309'; }
                                else if (size.includes('Pequeño') || size.includes('< 10M') || size.includes('Peq')) { bg = '#FEE2E2'; textCol = '#B91C1C'; }
                                return (
                                    <span style={{ fontSize: '0.65rem', backgroundColor: bg, color: textCol, padding: '2px 6px', borderRadius: '4px', fontWeight: '800' }}>
                                        {size}
                                    </span>
                                );
                            })()}
                        </div>
                    </>
                ) : (
                    <>
                        <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, fontWeight: '600' }}>NIT: {client.nit || '---'}</div>
                        <div style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                            {isMatriz ? (
                                <>
                                    <span style={{ fontSize: '0.62rem', backgroundColor: '#1E3A8A', color: '#FFFFFF', padding: '2px 8px', borderRadius: '6px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'inline-flex', alignItems: 'center', gap: '3px', boxShadow: '0 1px 3px rgba(30,58,138,0.25)' }}>🏢 MATRIZ</span>
                                    {branchCount !== undefined && branchCount > 0 && (
                                        <span title="Sucursales vinculadas a esta Casa Matriz" style={{ fontSize: '0.62rem', backgroundColor: '#EFF6FF', color: '#1E40AF', padding: '2px 8px', borderRadius: '6px', fontWeight: '800', border: '1px solid #BFDBFE', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                            <Building2 size={11} strokeWidth={2} /> {branchCount} {branchCount === 1 ? 'Sucursal' : 'Sucursales'}
                                        </span>
                                    )}
                                </>
                            ) : isRealBranch ? (
                                <span style={{ fontSize: '0.6rem', backgroundColor: '#FFF7ED', color: '#C2410C', padding: '1px 6px', borderRadius: '4px', fontWeight: '900', textTransform: 'uppercase' }}>Sucursal</span>
                            ) : null}
                            {client.needs_crates && <span title="Requiere Canastillas" style={{ fontSize: '0.6rem', backgroundColor: '#ECFDF5', color: '#059669', padding: '1px 6px', borderRadius: '4px', fontWeight: '900', border: '1px solid #A7F3D0', display: 'flex', alignItems: 'center', gap: '2px' }}><Package size={10} strokeWidth={1.5} /> SI</span>}
                            <span title="Tipo de Documento" style={{ fontSize: '0.6rem', backgroundColor: '#F8FAFC', color: '#475569', padding: '1px 6px', borderRadius: '4px', fontWeight: '900', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                <FileText size={10} strokeWidth={1.5} /> {client.document_type === 'invoice' ? (client.print_invoice ? 'FAC-IMP' : 'FAC-DIG') : (client.remission_with_prices ? 'REM-$' : 'REM-S/S')}
                            </span>
                        </div>
                    </>
                )}
            </td>
            <td style={{ padding: '0.65rem 1.25rem' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#475569' }}>{client.contact_name}</div>
                <div style={{ fontSize: '0.8rem', color: THEME.colors.textSecondary }}>{client.phone}</div>
                {client.email && <div style={{ fontSize: '0.75rem', color: THEME.colors.primary, fontWeight: '600', marginTop: '2px' }}>{client.email}</div>}
            </td>
            <td style={{ padding: '0.65rem 1.25rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569' }}>
                    {displayCity ? `${displayCity} / ` : ''}{displayMunicipality || '---'}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>{displayAddress || '---'}</div>
            </td>
            <td style={{ padding: '0.65rem 1.25rem' }}>
                {isB2B || client.role === 'b2c_client' ? (
                    <div>
                        {client.is_active !== false ? (
                            <span style={{ 
                                fontSize: '0.7rem', 
                                padding: '3px 8px', 
                                borderRadius: '6px', 
                                fontWeight: '900', 
                                backgroundColor: '#ECFDF5',
                                color: '#059669',
                                border: '1px solid #A7F3D0',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10B981' }} />
                                ACTIVO
                            </span>
                        ) : (
                            <span style={{ 
                                fontSize: '0.7rem', 
                                padding: '3px 8px', 
                                borderRadius: '6px', 
                                fontWeight: '900', 
                                backgroundColor: '#FEF2F2',
                                color: '#DC2626',
                                border: '1px solid #FCA5A5',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#EF4444' }} />
                                INACTIVO
                            </span>
                        )}
                        {selectedModel?.name && selectedModel?.name !== 'Varios' && (
                            <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '4px', fontWeight: '600' }}>
                                {selectedModel.name}
                            </div>
                        )}
                    </div>
                ) : isLead ? (
                    <span style={{ 
                        fontSize: '0.7rem', 
                        padding: '4px 8px', 
                        borderRadius: '6px', 
                        fontWeight: '900', 
                        textTransform: 'uppercase',
                        backgroundColor: (client as any).status === 'new' ? '#EEF2FF' : '#FFFBEB',
                        color: (client as any).status === 'new' ? '#4F46E5' : '#D97706'
                    }}>
                        {(client as any).status === 'new' ? 'NUEVO' : 
                         (client as any).status === 'contacted' ? 'CONTACTADO' : 
                         (client as any).status === 'converted' ? 'CONVERTIDO' : 
                         (client as any).status === 'rejected' ? 'DESCARTADO' : 
                         (client as any).status}
                    </span>
                ) : (
                    <span style={{ fontSize: '0.85rem', color: '#94A3B8' }}>Hogar</span>
                )}
            </td>
            <td style={{ padding: '0.65rem 1.25rem' }}>
                {isLead ? (
                    <div>
                        {(client as any).last_contact_date ? (
                            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#475569' }}>Último: {new Date((client as any).last_contact_date).toLocaleDateString()}</div>
                        ) : (
                            <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Sin contacto</div>
                        )}
                        {(client as any).next_contact_date ? (
                            <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#D97706', marginTop: '2px' }}>Tarea: {new Date((client as any).next_contact_date).toLocaleDateString()}</div>
                        ) : (
                            <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: '2px' }}>Sin tareas</div>
                        )}
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', alignItems: 'flex-start' }}>
                        {agreementStatus && (() => {
                            let bg = '#F8FAFC';
                            let border = '#E2E8F0';
                            let color = '#64748B';
                            let dotColor = '#94A3B8';
                            let text = 'SIN ACUERDO';

                            if (agreementStatus === 'active') {
                                if (isInheritedAgreement) {
                                    bg = '#F0F9FF';
                                    border = '#BAE6FD';
                                    color = '#0284C7';
                                    dotColor = '#0EA5E9';
                                    text = '🏢 HEREDADO';
                                } else {
                                    bg = '#ECFDF5';
                                    border = '#A7F3D0';
                                    color = '#047857';
                                    dotColor = '#10B981';
                                    text = '⚡ AL DÍA';
                                }
                            } else if (agreementStatus === 'warning') {
                                bg = '#FFFBEB';
                                border = '#FDE68A';
                                color = '#B45309';
                                dotColor = '#F59E0B';
                                text = isInheritedAgreement ? '⚠️ HEREDADO POR VENCER' : '⚠️ POR VENCER';
                            } else if (agreementStatus === 'expired') {
                                bg = '#FEF2F2';
                                border = '#FCA5A5';
                                color = '#991B1B';
                                dotColor = '#EF4444';
                                text = isInheritedAgreement ? '🚫 HEREDADO VENCIDO' : '🚫 VENCIDO';
                            }

                            return (
                                <span style={{
                                    fontSize: '0.68rem',
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    fontWeight: '900',
                                    backgroundColor: bg,
                                    color: color,
                                    border: `1px solid ${border}`,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    whiteSpace: 'nowrap',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                                }}>
                                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: dotColor, boxShadow: `0 0 4px ${dotColor}aa` }} />
                                    {text}
                                </span>
                            );
                        })()}

                        {(client.latitude && client.longitude) ? (
                            <span style={{
                                fontSize: '0.65rem',
                                padding: '2px 7px',
                                borderRadius: '6px',
                                fontWeight: '800',
                                backgroundColor: '#F0FDF4',
                                color: '#15803D',
                                border: '1px solid #BBF7D0',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                whiteSpace: 'nowrap'
                            }}>
                                <MapPin size={10} strokeWidth={2} style={{ color: '#16A34A' }} /> GPS OK
                            </span>
                        ) : (
                            <span style={{
                                fontSize: '0.65rem',
                                padding: '2px 7px',
                                borderRadius: '6px',
                                fontWeight: '800',
                                backgroundColor: '#FEF2F2',
                                color: '#B91C1C',
                                border: '1px solid #FECACA',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                whiteSpace: 'nowrap'
                            }}>
                                <MapPin size={10} strokeWidth={2} style={{ color: '#DC2626' }} /> SIN GPS
                            </span>
                        )}
                    </div>
                )}
            </td>
            <td style={{ padding: '0.65rem 1.25rem' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                    {!isLead && onEdit && (
                        <button 
                            onClick={onEdit} 
                            style={{ background: '#F1F5F9', border: 'none', padding: '6px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            title="Editar"
                        >
                            <Edit2 size={14} strokeWidth={1.5} style={{ color: '#475569' }} />
                        </button>
                    )}
                    <button 
                        onClick={handleWhatsApp} 
                        style={{ background: '#DCFCE7', border: 'none', padding: '6px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title="WhatsApp"
                    >
                        <Phone size={14} strokeWidth={1.5} style={{ color: '#166534' }} />
                    </button>
                    {onRegisterContact && (
                        <button 
                            onClick={onRegisterContact} 
                            style={{ background: '#F3E8FF', border: 'none', padding: '6px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            title="Registrar Contacto"
                        >
                            <Check size={14} strokeWidth={1.5} style={{ color: '#6B21A8' }} />
                        </button>
                    )}
                </div>
            </td>
        </tr>
    );
}

function InfoRow({ icon, label, value }: { icon: string, label: string, value: string | number | undefined | null }) {
    return (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {icon && <span style={{ fontSize: '1rem' }}>{icon}</span>}
            <div style={{ fontSize: '0.78rem' }}>
                <span style={{ color: THEME.colors.textSecondary, fontWeight: '600' }}>{label}: </span>
                <span style={{ color: THEME.colors.textMain, fontWeight: '800' }}>{value || 'N/A'}</span>
            </div>
        </div>
    );
}

function EmptyState({ text }: { text: string }) {
    return (
        <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '5rem', backgroundColor: 'white', borderRadius: THEME.radius.lg, border: `1px dashed ${THEME.colors.border}`, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Search size={32} strokeWidth={1.5} style={{ color: THEME.colors.textSecondary, marginBottom: '1rem' }} />
            <p style={{ color: THEME.colors.textSecondary, fontWeight: '700' }}>{text}</p>
        </div>
    );
}



function AgreementDetailsModal({ agreement, onClose }: { agreement: any, onClose: () => void }) {
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchItems = async () => {
            setLoading(true);
            try {
                const { data } = await supabase
                    .from('quote_items')
                    .select('*, products:product_id (name, accounting_id, unit_of_measure)')
                    .eq('quote_id', agreement.id)
                    .order('created_at');
                if (data) setItems(data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchItems();
    }, [agreement.id]);

    const formatAgreementNumber = (seq: number, dateStr?: string) => {
        const date = dateStr ? new Date(dateStr) : new Date();
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const paddedSeq = String(seq).padStart(4, '0');
        return `ACI ${day}${month} ${paddedSeq}`;
    };

    const agreementId = formatAgreementNumber(agreement.quote_number, agreement.created_at);

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(8px)' }}>
            <div style={{ backgroundColor: 'white', borderRadius: '24px', width: '90%', maxWidth: '800px', maxHeight: '80vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', border: '1px solid #E2E8F0', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.2rem 2rem', borderBottom: '1px solid #F1F5F9', background: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '1.2rem' }}>📜</span>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '900', color: '#1E293B' }}>Precios Congelados: {agreementId}</h3>
                            <span style={{ fontSize: '0.7rem', color: '#64748B' }}>Modelo de Precios / Acuerdo Institucional activo</span>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'white', border: '1px solid #E2E8F0', cursor: 'pointer', color: '#64748B', transition: 'all 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F1F5F9'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}>
                        <X size={16} />
                    </button>
                </div>

                {/* Content */}
                <div style={{ padding: '2rem', flex: 1 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', backgroundColor: '#F8FAFC', padding: '1rem 1.2rem', borderRadius: '16px', border: '1px solid #E2E8F0', marginBottom: '1.5rem', fontSize: '0.8rem', color: '#475569' }}>
                        <div><strong>Vigencia:</strong> {agreement.start_date ? new Date(agreement.start_date).toLocaleDateString('es-CO') : '---'} al {agreement.valid_until ? new Date(agreement.valid_until).toLocaleDateString('es-CO') : 'Indefinida'}</div>
                        {agreement.model_snapshot_name && <div><strong>Modelo Base:</strong> {agreement.model_snapshot_name}</div>}
                    </div>

                    {loading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '3rem 0' }}>
                            <Loader2 size={24} className="animate-spin" style={{ color: '#0D7A57' }} />
                            <span style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: '600' }}>Cargando catálogo congelado...</span>
                        </div>
                    ) : items.length === 0 ? (
                        <p style={{ textAlign: 'center', color: '#64748B', fontSize: '0.85rem', fontStyle: 'italic', padding: '2rem 0' }}>Este acuerdo no tiene productos vinculados.</p>
                    ) : (
                        <div style={{ border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', color: '#475569', fontWeight: '800' }}>
                                        <th style={{ padding: '0.75rem 1rem' }}>Producto</th>
                                        <th style={{ padding: '0.75rem 1rem' }}>UoM</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Precio Base</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>IVA</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Precio con IVA</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map(item => {
                                        const ivaPercent = item.iva_rate || 0;
                                        const basePrice = item.unit_price || 0;
                                        const ivaAmount = basePrice * (ivaPercent / 100);
                                        const totalPrice = basePrice + ivaAmount;

                                        return (
                                            <tr key={item.id} style={{ borderBottom: '1px solid #F1F5F9', color: '#334155' }}>
                                                <td style={{ padding: '0.75rem 1rem', fontWeight: '700' }}>
                                                    {item.products?.name || 'Producto Desconocido'}
                                                    {item.products?.accounting_id && <span style={{ display: 'block', fontSize: '0.6rem', color: '#94A3B8', fontWeight: 'normal', marginTop: '2px' }}>Cód. Contable: {item.products.accounting_id}</span>}
                                                </td>
                                                <td style={{ padding: '0.75rem 1rem', color: '#64748B' }}>{item.products?.unit_of_measure || 'un'}</td>
                                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: '600' }}>${basePrice.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#64748B' }}>{ivaPercent}%</td>
                                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: '800', color: '#0D7A57' }}>${totalPrice.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: '1.2rem 2rem', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'flex-end', backgroundColor: '#F8FAFC' }}>
                    <button onClick={onClose} style={{ padding: '0.6rem 1.5rem', borderRadius: '12px', border: '1px solid #E2E8F0', background: 'white', color: '#475569', fontWeight: '600', fontSize: '0.75rem', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F1F5F9'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}>
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}

function ClientFormModal({ onClose, onRefresh, pricingModels, editData, setNicknameClientId, setIsNicknameModalOpen, isReadOnly = false, onSwitchClient }: { onClose: () => void, onRefresh: () => void, pricingModels: PricingModel[], editData?: Partial<Profile> | null, setNicknameClientId?: (id: string | null) => void, setIsNicknameModalOpen?: (open: boolean) => void, isReadOnly?: boolean, onSwitchClient?: (client: Profile) => void }) {
    const isEdit = !!editData && !!editData.id;
    const isLead = !!editData && ('status' in editData);
    const role = (editData as any)?.role || 'b2b_client';
    const isB2C = role === 'b2c_client';
    const isB2B = role === 'b2b_client';
    const [formData, setFormData] = useState({
        company_name: editData?.company_name || '',
        razon_social: editData?.razon_social || '',
        nit: editData?.nit || '',
        contact_name: editData?.contact_name || '',
        phone: editData?.phone || '',
        email: editData?.email || '',
        contact_email: (editData as any)?.contact_email || '',
        address: editData?.address || '',
        address_complement: (editData as any)?.address_complement || '',
        city: editData?.city || 'Bogotá',
        municipality: editData?.municipality || 'Bogotá',
        department: editData?.department || 'Cundinamarca',
        pricing_model_id: editData?.pricing_model_id || '',
        credit_limit: editData?.credit_limit || 0,
        payment_terms: editData?.payment_terms || 'Contado',
        delivery_restrictions: editData?.delivery_restrictions || '',
        logistics_data: editData?.logistics_data || null,
        latitude: editData?.latitude || '',
        longitude: editData?.longitude || '',
        geocoding_status: editData?.geocoding_status || 'manual',
        needs_crates: editData?.needs_crates || false,
        document_type: editData?.document_type || 'invoice',
        remission_with_prices: editData?.remission_with_prices !== undefined ? editData.remission_with_prices : true,
        print_invoice: (editData as any)?.print_invoice || false,
        is_corporate_parent: editData?.is_corporate_parent || false,
        parent_id: editData?.parent_id || '',
        branch_id: editData?.branch_id || '',
        corporate_role: editData?.corporate_role || '',
        additional_billing_emails: (editData as any)?.additional_billing_emails || '',
        rut_url: (editData as any)?.rut_url || '',
        mercantile_registry_url: (editData as any)?.mercantile_registry_url || '',
        iva_responsible: (editData as any)?.iva_responsible || false,
        is_gran_contribuyente: (editData as any)?.is_gran_contribuyente || false,
        is_autorretenedor: (editData as any)?.is_autorretenedor || false,
        is_regimen_simple: (editData as any)?.is_regimen_simple || false,
        economic_activity_code: (editData as any)?.economic_activity_code || '',
        collection_responsible_name: (editData as any)?.collection_responsible_name || '',
        collection_responsible_email: (editData as any)?.collection_responsible_email || '',
        collection_responsible_phone: (editData as any)?.collection_responsible_phone || '',
        legal_rep_id_url: (editData as any)?.legal_rep_id_url || '',
        comm_ref_1_name: (editData as any)?.comm_ref_1_name || '',
        comm_ref_1_nit: (editData as any)?.comm_ref_1_nit || '',
        comm_ref_1_phone: (editData as any)?.comm_ref_1_phone || '',
        comm_ref_1_email: (editData as any)?.comm_ref_1_email || '',
        comm_ref_2_name: (editData as any)?.comm_ref_2_name || '',
        comm_ref_2_nit: (editData as any)?.comm_ref_2_nit || '',
        comm_ref_2_phone: (editData as any)?.comm_ref_2_phone || '',
        comm_ref_2_email: (editData as any)?.comm_ref_2_email || '',
        remission_copies: (editData as any)?.remission_copies || 2,
        id_zr: (editData as any)?.id_zr || '',
        id_lp: (editData as any)?.id_lp || '',
        payment_days: (editData as any)?.payment_days || 0,
        email_2: (editData as any)?.email_2 || '',
        email_3: (editData as any)?.email_3 || '',
        is_active: editData?.is_active !== undefined ? editData.is_active : true,
        notify_email_1: (editData as any)?.notify_email_1 !== undefined ? (editData as any).notify_email_1 : true,
        notify_email_2: (editData as any)?.notify_email_2 || false,
        notify_email_3: (editData as any)?.notify_email_3 || false,
        commercial_references_urls: (editData as any)?.commercial_references_urls || []
    });
    const [saving, setSaving] = useState(false);

    const [geocoding, setGeocoding] = useState(false);
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<google.maps.Map | null>(null);
    const markerInstance = useRef<google.maps.Marker | null>(null);
    const [potentialParents, setPotentialParents] = useState<Profile[]>([]);
    const [parentSearch, setParentSearch] = useState('');
    const [isParentDropdownOpen, setIsParentDropdownOpen] = useState(false);
    const [isExceptionsModalOpen, setIsExceptionsModalOpen] = useState(false);
    const [exceptionCount, setExceptionCount] = useState(0);
    const [applyConfigToBranches, setApplyConfigToBranches] = useState(false);
    const [syncingBranches, setSyncingBranches] = useState(false);

    const fetchExceptionCount = async () => {
        if (!editData?.id) return;
        const { count } = await supabase
            .from('product_nicknames')
            .select('*', { count: 'exact', head: true })
            .eq('customer_id', editData.id);
        setExceptionCount(count || 0);
    };

    useEffect(() => {
        if (editData?.id) {
            fetchExceptionCount();
        }
    }, [editData?.id]);
    const [stableClientId] = useState(editData?.id || crypto.randomUUID());

    // B2B access credentials states
    const [b2bAccess, setB2bAccess] = useState<{ hasAccess: boolean, email?: string, createdAt?: string } | null>(null);
    const [loadingAccess, setLoadingAccess] = useState(false);
    const [showCredentialModal, setShowCredentialModal] = useState(false);
    const [tempPassword, setTempPassword] = useState('');
    const [tempEmail, setTempEmail] = useState('');
    const [generatingAccess, setGeneratingAccess] = useState(false);
    const [generatedCreds, setGeneratedCreds] = useState<{ email: string, pass: string } | null>(null);

    const checkB2bAccess = async () => {
        if (!isEdit || !isB2B) return;
        setLoadingAccess(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            if (!token) return;

            const res = await fetch(`/api/b2b/create-account?profileId=${editData.id}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (res.ok) {
                const data = await res.json();
                setB2bAccess(data);
            }
        } catch (e) {
            console.error('Error checking B2B access:', e);
        } finally {
            setLoadingAccess(false);
        }
    };

    useEffect(() => {
        checkB2bAccess();
    }, [isEdit, isB2B, editData?.id]);

    const [branches, setBranches] = useState<Profile[]>([]);

    const fetchBranches = async () => {
        if (!editData?.id || !formData.is_corporate_parent) return;
        const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('parent_id', editData.id);
        if (data) setBranches(data as Profile[]);
    };

    const handleSwitchToBranch = async (branch: Profile) => {
        let target = branch;
        if (!branch.role || !branch.city) {
            const { data } = await supabase.from('profiles').select('*').eq('id', branch.id).single();
            if (data) target = data as Profile;
        }
        if (onSwitchClient) {
            onSwitchClient(target);
        }
    };

    const handleSyncBranchesConfig = async () => {
        if (!editData?.id || !formData.is_corporate_parent) return;
        setSyncingBranches(true);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({
                    needs_crates: formData.needs_crates,
                    document_type: formData.document_type,
                    remission_with_prices: formData.remission_with_prices,
                    print_invoice: formData.print_invoice
                })
                .eq('parent_id', editData.id);
                
            if (error) throw error;
            window.showToast?.(`Configuración de documento replicada a ${branches.length} sucursales`, 'success');
            fetchBranches();
        } catch (err: any) {
            console.error('Error al replicar configuración a sucursales:', err);
            window.showToast?.('Error al replicar a sucursales', 'error');
        } finally {
            setSyncingBranches(false);
        }
    };

    useEffect(() => {
        fetchBranches();
    }, [editData?.id, formData.is_corporate_parent]);

    const [agreement, setAgreement] = useState<any>(null);
    const [isAgreementModalOpen, setIsAgreementModalOpen] = useState(false);
    const [loadingAgreement, setLoadingAgreement] = useState(false);
    const [inheritedFromParent, setInheritedFromParent] = useState(false);

    const fetchAgreement = async () => {
        if (!editData?.id) return;
        setLoadingAgreement(true);
        try {
            if (formData.parent_id) {
                const { data: parentData } = await supabase
                    .from('quotes')
                    .select('id, quote_number, status, start_date, valid_until, client_id, model_snapshot_name, created_at')
                    .eq('client_id', formData.parent_id)
                    .eq('status', 'agreement')
                    .maybeSingle();

                if (parentData) {
                    setAgreement(parentData);
                    setInheritedFromParent(true);
                } else {
                    setAgreement(null);
                }
            } else {
                const { data: ownData } = await supabase
                    .from('quotes')
                    .select('id, quote_number, status, start_date, valid_until, client_id, model_snapshot_name, created_at')
                    .eq('client_id', editData.id)
                    .eq('status', 'agreement')
                    .maybeSingle();

                if (ownData) {
                    setAgreement(ownData);
                    setInheritedFromParent(false);
                } else {
                    setAgreement(null);
                }
            }
        } catch (err) {
            console.error('Error fetching customer agreement:', err);
        } finally {
            setLoadingAgreement(false);
        }
    };

    useEffect(() => {
        fetchAgreement();
    }, [editData?.id, formData.parent_id]);

    useEffect(() => {
        const fetchParents = async () => {
            const { data } = await supabase
                .from('profiles')
                .select('id, company_name, nit, razon_social, email, pricing_model_id, document_type, phone, rut_url, mercantile_registry_url, legal_rep_id_url, commercial_references_urls')
                .eq('role', 'b2b_client')
                .eq('is_corporate_parent', true);
            if (data) setPotentialParents(data);
        };
        if (!isB2C) fetchParents();
    }, [isB2C]);

    const handleParentSelection = async (parentId: string) => {
        if (!parentId) {
            setFormData(prev => ({ ...prev, parent_id: '', nit: '', razon_social: '' }));
            return;
        }

        const parent = potentialParents.find(p => p.id === parentId);
        if (parent) {
            // Auto-fill shared fields from parent (Inheritance with potential override)
            setFormData(prev => ({
                ...prev,
                parent_id: parentId,
                nit: parent.nit || prev.nit,
                razon_social: parent.razon_social || prev.razon_social,
                email: parent.email || prev.email,
                pricing_model_id: parent.pricing_model_id || prev.pricing_model_id,
                document_type: parent.document_type || prev.document_type,
                is_corporate_parent: false,
                notify_email_1: true
            }));
        }
    };

    // Initialización / Actualización del Mapa Interactivo
    useEffect(() => {
        if (!mapRef.current || !window.google) return;

        let latVal = 4.6097;
        let lngVal = -74.0817;
        let draggable = !isReadOnly;

        if (isLead) {
            draggable = false;
            if (editData?.latitude && editData?.longitude) {
                latVal = parseFloat(String(editData.latitude));
                lngVal = parseFloat(String(editData.longitude));
            } else {
                return;
            }
        } else {
            const latF = parseFloat(String(formData.latitude));
            const lngF = parseFloat(String(formData.longitude));
            latVal = !isNaN(latF) ? latF : 4.6097;
            lngVal = !isNaN(lngF) ? lngF : -74.0817;
        }

        const lat = latVal;
        const lng = lngVal;

        if (!mapInstance.current) {
            mapInstance.current = new window.google.maps.Map(mapRef.current, {
                center: { lat, lng },
                zoom: 16,
                mapTypeControl: false,
                streetViewControl: false,
                fullscreenControl: false
            });

            markerInstance.current = new window.google.maps.Marker({
                position: { lat, lng },
                map: mapInstance.current,
                draggable: draggable,
                animation: window.google.maps.Animation.DROP
            });

            if (!isLead) {
                markerInstance.current.addListener('dragend', () => {
                    if (!markerInstance.current) return;
                    const pos = markerInstance.current.getPosition();
                    if (!pos) return;
                    setFormData(prev => ({
                        ...prev,
                        latitude: pos.lat().toFixed(7),
                        longitude: pos.lng().toFixed(7),
                        geocoding_status: 'manual'
                    }));
                });

                mapInstance.current.addListener('click', (e: google.maps.MapMouseEvent) => {
                    if (isReadOnly) return;
                    const pos = e.latLng;
                    if (!pos || !markerInstance.current) return;
                    markerInstance.current.setPosition(pos);
                    setFormData(prev => ({
                        ...prev,
                        latitude: pos.lat().toFixed(7),
                        longitude: pos.lng().toFixed(7),
                        geocoding_status: 'manual'
                    }));
                });
            }
        } else {
            const newPos = { lat, lng };
            mapInstance.current.setCenter(newPos);
            markerInstance.current?.setPosition(newPos);
        }
    }, [formData.latitude, formData.longitude, formData.geocoding_status, editData?.latitude, editData?.longitude, isReadOnly, isLead]);

    const handleGeocode = async () => {
        if (!formData.address) {
            window.showToast?.('Ingresa una dirección primero', 'info');
            return;
        }
        
        setGeocoding(true);
        try {
            const addressQuery = `${formData.address}, ${formData.municipality || 'Bogotá'}, Colombia`;

            console.log('--- 🛰️ INICIANDO GEOCODING VÍA PROXY ---');
            console.log('Query:', addressQuery);

            const response = await fetch(`/api/geocode?address=${encodeURIComponent(addressQuery)}`);
            const data = await response.json();

            console.log('Resultado Proxy:', data.status);
            
            if (data.status === 'OK' && data.results && data.results[0]) {
                const { lat, lng } = data.results[0].geometry.location;
                
                console.log('✅ Coordenadas encontradas:', lat, lng);
                
                setFormData(prev => ({
                    ...prev,
                    latitude: lat.toFixed(7),
                    longitude: lng.toFixed(7),
                    geocoding_status: 'verified'
                }));
                
                window.showToast?.('¡Ubicación detectada con éxito!', 'success');
            } else if (data.status === 'ZERO_RESULTS') {
                // Fallback simplificado
                const simplerAddress = `${formData.address.split('#')[0].trim()}, ${formData.municipality || 'Bogotá'}, Colombia`;
                const r2 = await fetch(`/api/geocode?address=${encodeURIComponent(simplerAddress)}`);
                const d2 = await r2.json();

                if (d2.status === 'OK' && d2.results && d2.results[0]) {
                    const { lat, lng } = d2.results[0].geometry.location;
                    setFormData(prev => ({
                        ...prev,
                        latitude: lat.toFixed(7),
                        longitude: lng.toFixed(7),
                        geocoding_status: 'verified'
                    }));
                    window.showToast?.('Ubicación aproximada detectada', 'info');
                } else {
                    window.showToast?.('No se encontró la dirección.', 'info');
                }
            } else {
                console.error('Error Proxy status:', data.status, data.error_message);
                window.showToast?.(`Error de Google: ${data.status}`, 'error');
            }
        } catch (err) {
            console.error('❌ Error crítico en Geocoding Proxy:', err);
            window.showToast?.('Error al conectar con el servicio de mapas', 'error');
        } finally {
            setGeocoding(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            // Restauramos la extracción completa para asegurar que la data se guarde cuando las columnas existan
            const { 
                credit_limit: _cl, 
                payment_terms: _pt, 
                geocoding_status: _gs, 
                ...coreData 
            } = formData;
            
            const payload: any = {
                ...coreData,
                contact_phone: formData.phone,
                latitude: formData.latitude ? parseFloat(String(formData.latitude)) : null,
                longitude: formData.longitude ? parseFloat(String(formData.longitude)) : null,
                logistics_data: formData.logistics_data,
                geocoding_status: formData.geocoding_status,
                address_complement: formData.address_complement,
                // Sanitización estricta de UUIDs: Si están vacíos, deben ser null, nunca ""
                pricing_model_id: !formData.pricing_model_id || formData.pricing_model_id === '' ? null : formData.pricing_model_id,
                parent_id: !formData.parent_id || formData.parent_id === '' ? null : formData.parent_id
            };

            console.log('--- INTENTO DE GUARDADO (Payload Sanitized) ---');
            console.log('Payload:', JSON.stringify(payload, null, 2));

            if (isEdit) {
                const { error, status, statusText } = await supabase
                    .from('profiles')
                    .update(payload)
                    .eq('id', (editData as Profile).id);
                
                if (error) {
                    const fullError = JSON.stringify({ error, status, statusText }, null, 2);
                    console.error('DETALLES SUPABASE:', fullError);
                    throw new Error(`DB Error [${error.code}]: ${error.message} (${fullError})`);
                }

                if (formData.is_corporate_parent && applyConfigToBranches && (editData as Profile).id) {
                    await supabase
                        .from('profiles')
                        .update({
                            needs_crates: formData.needs_crates,
                            document_type: formData.document_type,
                            remission_with_prices: formData.remission_with_prices,
                            print_invoice: formData.print_invoice
                        })
                        .eq('parent_id', (editData as Profile).id);
                }

                window.showToast?.('Base de datos actualizada', 'success');
            } else {
                const targetRole = role;
                // Usamos el ID estable generado al inicio para asegurar consistencia con las excepciones
                const newId = stableClientId;
                
                const { error, status, statusText } = await supabase
                    .from('profiles')
                    .insert([{ ...payload, id: newId, role: targetRole }]);
                
                if (error) {
                    const fullError = JSON.stringify({ error, status, statusText }, null, 2);
                    console.error('DETALLES SUPABASE:', fullError);
                    throw new Error(`DB Error [${error.code}]: ${error.message} (${fullError})`);
                }
                window.showToast?.('Cliente creado con éxito', 'success');
            }
            onRefresh();
            onClose();
        } catch (err: any) {
            console.error('ERROR COMPLETO:', err);
            window.showToast?.(err.message || 'Error desconocido', 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '1.5rem' }}>
            <div style={{ 
                backgroundColor: 'white', 
                borderRadius: '32px', 
                width: '100%', 
                maxWidth: '1200px', 
                maxHeight: '92vh', 
                overflowY: 'auto', 
                boxShadow: '0 30px 60px -12px rgba(0,0,0,0.4)',
                border: '1px solid rgba(255,255,255,0.2)',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column'
            }}>
                {isExceptionsModalOpen && (
                    <ClientExceptionsModal 
                        clientId={stableClientId} 
                        readOnly={isReadOnly}
                        onClose={() => {
                            setIsExceptionsModalOpen(false);
                            fetchExceptionCount();
                        }} 
                    />
                )}
                {isAgreementModalOpen && agreement && (
                    <AgreementDetailsModal
                        agreement={agreement}
                        onClose={() => setIsAgreementModalOpen(false)}
                    />
                )}
                {/* HEADER PREMIUM */}
                <header style={{ 
                    padding: '1.2rem 2.5rem', 
                    background: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)', 
                    borderBottom: '1px solid #E2E8F0',
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    position: 'sticky',
                    top: 0,
                    zIndex: 10
                }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                            <span style={{ fontSize: '1.5rem' }}>{isLead ? '🔥' : isReadOnly ? '📋' : (isB2C ? '👤' : (formData.is_corporate_parent ? '🏢' : '📍'))}</span>
                            <h2 style={{ fontSize: '1.8rem', fontWeight: '900', color: '#0F172A', margin: 0, letterSpacing: '-0.03rem' }}>
                                {isLead ? 'Ficha de Prospecto (Lead)' : isReadOnly ? 'Consulta de Cliente' : (isEdit ? `Editar ${isB2C ? 'Cliente Hogar' : 'Cuenta'}` : `Nueva ${isB2C ? 'Cuenta Hogar' : 'Cuenta Institucional'}`)}
                            </h2>
                        </div>
                        <p style={{ color: '#64748B', margin: 0, fontSize: '0.9rem', fontWeight: '500' }}>
                            {isLead ? `Detalles del lead capturado por el chatbot` : isReadOnly ? `Visualizando perfil de: ${formData.company_name || 'Sin nombre'}` : (isEdit ? `Modificando: ${formData.company_name || 'Sin nombre'}` : 'Configura el perfil comercial y operativo del cliente.')}
                        </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem', marginLeft: 'auto', marginRight: '1.5rem' }}>
                        {!isLead && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', backgroundColor: formData.is_active ? '#F0FDF4' : '#FEF2F2', padding: '0.4rem 0.8rem', borderRadius: '16px', border: '1px solid', borderColor: formData.is_active ? '#BBF7D0' : '#FCA5A5' }}>
                                <div style={{ textAlign: 'right' }}>
                                    <span style={{ fontSize: '0.6rem', fontWeight: '900', color: formData.is_active ? '#166534' : '#991B1B', textTransform: 'uppercase', letterSpacing: '0.02rem', display: 'block' }}>
                                        Estado de la Cuenta
                                    </span>
                                    <span style={{ fontSize: '0.7rem', color: formData.is_active ? '#15803D' : '#B91C1C', fontWeight: '600' }}>
                                        {formData.is_active ? 'Ventas Habilitadas' : 'Ventas Bloqueadas'}
                                    </span>
                                </div>
                                <select
                                    value={formData.is_active ? 'active' : 'inactive'}
                                    onChange={(e) => setFormData({ ...formData, is_active: e.target.value === 'active' })}
                                    disabled={isReadOnly}
                                    style={{
                                        padding: '0.45rem 0.9rem',
                                        borderRadius: '12px',
                                        border: '1px solid',
                                        borderColor: formData.is_active ? '#16A34A' : '#DC2626',
                                        fontWeight: '900',
                                        fontSize: '0.82rem',
                                        color: formData.is_active ? '#15803D' : '#B91C1C',
                                        backgroundColor: 'white',
                                        cursor: isReadOnly ? 'default' : 'pointer',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                                        outline: 'none'
                                    }}
                                >
                                    <option value="active">🟢 ACTIVO</option>
                                    <option value="inactive">🔴 INACTIVO / ARCHIVADO</option>
                                </select>
                            </div>
                        )}
                    </div>
                    <button 
                        onClick={onClose} 
                        style={{ 
                            border: 'none', 
                            background: 'white', 
                            width: '44px', 
                            height: '44px', 
                            borderRadius: '14px', 
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
                            fontSize: '1.2rem',
                            color: '#94A3B8',
                            transition: 'all 0.2s'
                        }}
                    >✕</button>
                </header>

                {isLead ? (
                    <div style={{ padding: '2.5rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '2.5rem' }}>
                            {/* Left Side: General Info and chatbot conversation notes */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                <section style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '24px', border: '1px solid #E2E8F0' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.2rem' }}>
                                        <div style={{ width: '32px', height: '32px', backgroundColor: THEME.colors.primaryLight, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Building2 size={16} strokeWidth={1.5} style={{ color: THEME.colors.primary }} /></div>
                                        <h4 style={{ fontSize: '0.9rem', fontWeight: '900', color: '#1E293B', margin: 0 }}>DATOS DEL NEGOCIO</h4>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem' }}>
                                        <div>
                                            <span style={{ fontSize: '0.7rem', fontWeight: '800', color: '#94A3B8', display: 'block', textTransform: 'uppercase' }}>Empresa / Establecimiento</span>
                                            <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#1E293B', marginTop: '0.2rem' }}>{editData?.company_name || 'Sin especificar'}</div>
                                        </div>
                                        <div>
                                            <span style={{ fontSize: '0.7rem', fontWeight: '800', color: '#94A3B8', display: 'block', textTransform: 'uppercase' }}>Contacto Directo</span>
                                            <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#1E293B', marginTop: '0.2rem' }}>{editData?.contact_name || 'Sin especificar'}</div>
                                        </div>
                                        <div>
                                            <span style={{ fontSize: '0.7rem', fontWeight: '800', color: '#94A3B8', display: 'block', textTransform: 'uppercase' }}>Tipo de Negocio</span>
                                            <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#334155', marginTop: '0.2rem' }}>{(editData as any)?.business_type || 'No especificado'}</div>
                                        </div>
                                        <div>
                                            <span style={{ fontSize: '0.7rem', fontWeight: '800', color: '#94A3B8', display: 'block', textTransform: 'uppercase' }}>Tamaño de Negocio</span>
                                            <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#334155', marginTop: '0.2rem' }}>{(editData as any)?.business_size || 'No especificado'}</div>
                                        </div>
                                        <div>
                                            <span style={{ fontSize: '0.7rem', fontWeight: '800', color: '#94A3B8', display: 'block', textTransform: 'uppercase' }}>NIT</span>
                                            <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#334155', marginTop: '0.2rem' }}>{editData?.nit || 'No registrado'}</div>
                                        </div>
                                    </div>
                                </section>

                                <section style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '24px', border: '1px solid #E2E8F0' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.2rem' }}>
                                        <div style={{ width: '32px', height: '32px', backgroundColor: THEME.colors.primaryLight, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Phone size={16} strokeWidth={1.5} style={{ color: THEME.colors.primary }} /></div>
                                        <h4 style={{ fontSize: '0.9rem', fontWeight: '900', color: '#1E293B', margin: 0 }}>INFORMACIÓN DE CONTACTO</h4>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem' }}>
                                        <div>
                                            <span style={{ fontSize: '0.7rem', fontWeight: '800', color: '#94A3B8', display: 'block', textTransform: 'uppercase' }}>Teléfono</span>
                                            <div style={{ fontSize: '1rem', fontWeight: '700', color: '#1E293B', marginTop: '0.2rem' }}>📞 {editData?.phone || 'Sin número'}</div>
                                        </div>
                                        <div>
                                            <span style={{ fontSize: '0.7rem', fontWeight: '800', color: '#94A3B8', display: 'block', textTransform: 'uppercase' }}>Email</span>
                                            <div style={{ fontSize: '1rem', fontWeight: '700', color: '#0891B2', marginTop: '0.2rem' }}>📧 {editData?.email || 'Sin correo'}</div>
                                        </div>
                                        <div style={{ gridColumn: 'span 2' }}>
                                            <span style={{ fontSize: '0.7rem', fontWeight: '800', color: '#94A3B8', display: 'block', textTransform: 'uppercase' }}>Dirección Declarada</span>
                                            <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#1E293B', marginTop: '0.2rem' }}>📍 {(editData as any)?.address || 'No declarada'} - {(editData as any)?.municipality || ''}</div>
                                        </div>
                                    </div>
                                </section>

                                {(editData as any)?.notes && (
                                    <section style={{ backgroundColor: '#F8FAFC', padding: '1.5rem', borderRadius: '24px', border: '1px solid #E2E8F0' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1rem' }}>
                                            <MessageSquare size={18} strokeWidth={1.5} style={{ color: THEME.colors.primary }} />
                                            <h4 style={{ fontSize: '0.9rem', fontWeight: '900', color: '#475569', margin: 0 }}>HISTORIAL / CONVERSACIÓN DEL CHATBOT</h4>
                                        </div>
                                        <div style={{ 
                                            whiteSpace: 'pre-line', 
                                            fontSize: '0.85rem', 
                                            color: '#334155', 
                                            lineHeight: '1.6', 
                                            backgroundColor: 'white', 
                                            padding: '1.2rem', 
                                            borderRadius: '16px', 
                                            border: '1px solid #E2E8F0',
                                            maxHeight: '300px',
                                            overflowY: 'auto'
                                        }}>
                                            {(editData as any).notes}
                                        </div>
                                    </section>
                                )}
                            </div>

                            {/* Right Side: Map location & status log */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                <section style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '24px', border: '1px solid #E2E8F0' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.2rem' }}>
                                        <div style={{ width: '32px', height: '32px', backgroundColor: THEME.colors.primaryLight, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MapPin size={16} strokeWidth={1.5} style={{ color: THEME.colors.primary }} /></div>
                                        <h4 style={{ fontSize: '0.9rem', fontWeight: '900', color: '#1E293B', margin: 0 }}>UBICACIÓN EN MAPA</h4>
                                    </div>
                                    {editData?.latitude && editData?.longitude ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            <div style={{ height: '240px', width: '100%', borderRadius: '16px', overflow: 'hidden', border: '1px solid #E2E8F0', position: 'relative' }}>
                                                <div ref={mapRef} style={{ width: '100%', height: '100%' }}></div>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#059669' }}>✓ Ubicación exacta detectada</span>
                                                <a 
                                                    href={`https://www.google.com/maps?q=${editData.latitude},${editData.longitude}`} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    style={{ color: '#0891B2', textDecoration: 'none', fontSize: '0.8rem', fontWeight: '800' }}
                                                >
                                                    Abrir Google Maps ↗
                                                </a>
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ padding: '2rem 1rem', textAlign: 'center', backgroundColor: '#FFFBEB', borderRadius: '16px', border: '1px solid #FEF3C7', color: '#B45309' }}>
                                            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚠️</div>
                                            <div style={{ fontSize: '0.85rem', fontWeight: '800' }}>Sin Coordenadas GPS</div>
                                            <div style={{ fontSize: '0.75rem', marginTop: '0.2rem' }}>El prospecto no proporcionó o no se pudo georeferenciar la ubicación automáticamente.</div>
                                        </div>
                                    )}
                                </section>

                                <section style={{ backgroundColor: '#F8FAFC', padding: '1.5rem', borderRadius: '24px', border: '1px solid #E2E8F0' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#64748B', marginBottom: '0.8rem', textTransform: 'uppercase' }}>Estado del Lead</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.8rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.6rem' }}>
                                            <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: '600' }}>Fecha Registro:</span>
                                            <span style={{ fontSize: '0.78rem', color: '#1E293B', fontWeight: '800' }}>{editData?.created_at ? new Date(editData.created_at).toLocaleDateString() : 'Desconocida'}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.6rem' }}>
                                            <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: '600' }}>Número de Contactos:</span>
                                            <span style={{ fontSize: '0.78rem', color: '#1E293B', fontWeight: '800' }}>{(editData as any)?.contact_count || 0} veces</span>
                                        </div>
                                        { (editData as any)?.last_contact_date && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.6rem' }}>
                                                <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: '600' }}>Último Contacto:</span>
                                                <span style={{ fontSize: '0.78rem', color: '#1E293B', fontWeight: '800' }}>{new Date((editData as any).last_contact_date).toLocaleDateString()}</span>
                                            </div>
                                        )}
                                        { (editData as any)?.next_contact_date && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: '600' }}>Siguiente Tarea:</span>
                                                <span style={{ fontSize: '0.78rem', color: '#D97706', fontWeight: '800' }}>{new Date((editData as any).next_contact_date).toLocaleDateString()}</span>
                                            </div>
                                        )}
                                    </div>
                                </section>
                            </div>
                        </div>
                    </div>
                ) : (
                <form onSubmit={handleSubmit} style={{ padding: '1.5rem 2.5rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
                        
                        {/* BANNER NAVEGACIÓN DESDE SUCURSAL HACIA CASA MATRIZ */}
                        {formData.parent_id && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE', padding: '0.8rem 1.2rem', borderRadius: '16px', boxShadow: THEME.shadow.sm }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', fontWeight: '800', color: '#1E40AF' }}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Building2 size={15} style={{ color: '#1D4ED8' }} /> Esta es una sucursal vinculada a Casa Matriz</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={async () => {
                                        const { data } = await supabase.from('profiles').select('*').eq('id', formData.parent_id).single();
                                        if (data && onSwitchClient) onSwitchClient(data as Profile);
                                    }}
                                    style={{
                                        padding: '0.4rem 0.9rem',
                                        backgroundColor: '#1D4ED8',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '8px',
                                        fontSize: '0.75rem',
                                        fontWeight: '800',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        boxShadow: '0 2px 4px rgba(29,78,216,0.25)',
                                        transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1E3A8A'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#1D4ED8'}
                                >
                                    <ArrowLeft size={14} /> Volver a Casa Matriz
                                </button>
                            </div>
                        )}

                        {/* BLOQUE: CONFIGURACIÓN DE DOCUMENTO (EXCLUYENTE / HEREDABLE PARA MATRIZ) */}
                        {isB2B && (
                            <section style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: THEME.radius.xl, border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm }}>
                                {formData.is_corporate_parent && (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.2rem', paddingBottom: '0.8rem', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Settings size={16} strokeWidth={1.5} style={{ color: THEME.colors.primary }} />
                                            <h4 style={{ fontSize: '0.82rem', fontWeight: '800', color: THEME.colors.textMain, margin: 0, textTransform: 'uppercase' }}>
                                                CONFIGURACIÓN DE DOCUMENTO MAESTRA (CASA MATRIZ)
                                            </h4>
                                        </div>
                                        {branches.length > 0 && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: '700', color: '#1D4ED8', backgroundColor: '#EFF6FF', padding: '4px 10px', borderRadius: '8px', border: '1px solid #BFDBFE', cursor: 'pointer' }}>
                                                    <input 
                                                        type="checkbox" 
                                                        checked={applyConfigToBranches} 
                                                        onChange={(e) => setApplyConfigToBranches(e.target.checked)} 
                                                        disabled={isReadOnly}
                                                        style={{ accentColor: '#1D4ED8', cursor: 'pointer' }}
                                                    />
                                                    Heredar automáticamente a sucursales ({branches.length})
                                                </label>
                                                {!isReadOnly && editData?.id && (
                                                    <button
                                                        type="button"
                                                        onClick={handleSyncBranchesConfig}
                                                        disabled={syncingBranches}
                                                        title="Replicar esta configuración de documento a todas las sucursales inmediatamente"
                                                        style={{
                                                            padding: '4px 10px',
                                                            borderRadius: '8px',
                                                            backgroundColor: '#1D4ED8',
                                                            color: 'white',
                                                            border: 'none',
                                                            fontSize: '0.72rem',
                                                            fontWeight: '800',
                                                            cursor: syncingBranches ? 'wait' : 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '5px'
                                                        }}
                                                    >
                                                        {syncingBranches ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                                                        Replicar a Sucursales
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', alignItems: 'flex-end' }}>
                                    <div 
                                        onClick={() => {
                                            if (isReadOnly) return;
                                            setFormData({...formData, needs_crates: !formData.needs_crates});
                                        }}
                                        style={{ 
                                            height: '42px', padding: '0 1.2rem', borderRadius: THEME.radius.md, border: `1.5px solid ${formData.needs_crates ? THEME.colors.primary : THEME.colors.border}`, 
                                            backgroundColor: formData.needs_crates ? THEME.colors.primaryLight : 'white', cursor: isReadOnly ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: '10px', transition: 'all 0.2s',
                                            boxShadow: formData.needs_crates ? '0 2px 6px rgba(13, 122, 87, 0.1)' : 'none',
                                            opacity: isReadOnly ? 0.9 : 1
                                        }}
                                    >
                                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: formData.needs_crates ? THEME.colors.primary : '#CBD5E1' }}></div>
                                        <span style={{ fontSize: '0.75rem', fontWeight: '600', color: formData.needs_crates ? THEME.colors.textMain : THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilySecondary }}>
                                            REQUIERE CANASTILLAS
                                        </span>
                                    </div>

                                    <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                        <label style={{ fontSize: '0.65rem', fontWeight: '600', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.03rem', fontFamily: THEME.typography.fontFamilySecondary }}>
                                            {formData.is_corporate_parent ? 'Configuración de Documento Base para Sucursales' : 'Configuración de Documento (Excluyente)'}
                                        </label>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.6rem' }}>
                                            {[
                                                { id: 'invoice_digital', label: 'FAC. DIGITAL', icon: Mail, doc: 'invoice', withPrices: true, print: false },
                                                { id: 'invoice_printed', label: 'FAC. IMPRESA', icon: Printer, doc: 'invoice', withPrices: true, print: true },
                                                { id: 'remission_prices', label: 'REM. CON $', icon: FileText, doc: 'remission', withPrices: true, print: true },
                                                { id: 'remission_no_prices', label: 'REM. SIN $', icon: FileText, doc: 'remission', withPrices: false, print: true }
                                            ].map((opt) => {
                                                const isActive = formData.document_type === opt.doc && 
                                                               (opt.doc === 'invoice' ? formData.print_invoice === opt.print : formData.remission_with_prices === opt.withPrices);
                                                const IconComponent = opt.icon;
                                                
                                                return (
                                                    <div 
                                                        key={opt.id}
                                                        onClick={() => {
                                                            if (isReadOnly) return;
                                                            setFormData({
                                                                ...formData,
                                                                document_type: opt.doc,
                                                                remission_with_prices: opt.withPrices,
                                                                print_invoice: opt.print
                                                            });
                                                        }}
                                                        style={{
                                                            padding: '0.6rem 0.5rem',
                                                            borderRadius: THEME.radius.md,
                                                            border: `1.5px solid ${isActive ? THEME.colors.primary : THEME.colors.border}`,
                                                            backgroundColor: isActive ? THEME.colors.primaryLight : 'white',
                                                            cursor: isReadOnly ? 'default' : 'pointer',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            gap: '6px',
                                                            transition: 'all 0.2s',
                                                            boxShadow: isActive ? '0 2px 6px rgba(13, 122, 87, 0.1)' : 'none',
                                                            opacity: isReadOnly ? 0.8 : 1,
                                                            minHeight: '70px',
                                                            fontFamily: THEME.typography.fontFamilySecondary
                                                        }}
                                                    >
                                                        <IconComponent size={18} strokeWidth={1.5} style={{ color: isActive ? THEME.colors.primary : THEME.colors.textSecondary }} />
                                                        <div style={{ fontSize: '0.6rem', fontWeight: '600', color: isActive ? THEME.colors.textMain : THEME.colors.textSecondary, textAlign: 'center' }}>{opt.label}</div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                {/* BOTÓN DE EXCEPCIONES LOGÍSTICAS (SOLO SUCURSAL) */}
                                {!formData.is_corporate_parent && (
                                    <div style={{ marginTop: '1.2rem', paddingTop: '1.2rem', borderTop: `1px dashed ${THEME.colors.border}` }}>
                                        <button 
                                            type="button"
                                            onClick={() => setIsExceptionsModalOpen(true)}
                                            style={{ 
                                                width: '100%',
                                                backgroundColor: 'white', 
                                                color: THEME.colors.textMain, 
                                                border: `1px solid ${THEME.colors.border}`, 
                                                padding: '0.8rem 1.2rem', 
                                                borderRadius: THEME.radius.md, 
                                                fontSize: '0.75rem', 
                                                fontWeight: '600', 
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '8px',
                                                fontFamily: THEME.typography.fontFamilySecondary,
                                                transition: 'all 0.2s'
                                            }}
                                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = THEME.colors.primaryLight; e.currentTarget.style.borderColor = THEME.colors.primary; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'white'; e.currentTarget.style.borderColor = THEME.colors.border; }}
                                        >
                                            <Sliders size={14} strokeWidth={1.5} style={{ color: THEME.colors.primary }} /> CONFIGURAR EXCEPCIONES Y NOTAS (PICKING)
                                            {exceptionCount > 0 && (
                                                <span style={{ backgroundColor: THEME.colors.primary, color: 'white', padding: '2px 8px', borderRadius: '20px', fontSize: '0.7rem', marginLeft: '4px', fontWeight: '600' }}>
                                                    {exceptionCount}
                                                </span>
                                            )}
                                        </button>
                                    </div>
                                )}
                            </section>
                        )}
                        {/* BLOQUE: IDENTIFICACIÓN (DINÁMICO) */}
                        <section style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '24px', border: '1px solid #E2E8F0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.2rem' }}>
                                <div style={{ width: '32px', height: '32px', backgroundColor: THEME.colors.primaryLight, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><UserCheck size={16} strokeWidth={1.5} style={{ color: THEME.colors.primary }} /></div>
                                <h4 style={{ fontSize: '0.9rem', fontWeight: '900', color: '#1E293B', margin: 0 }}>
                                    {isB2C ? 'IDENTIFICACIÓN Y DATOS BÁSICOS' : 'IDENTIFICACIÓN Y VÍNCULOS'}
                                </h4>
                            </div>

                            {isB2C ? (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.2rem' }}>
                                    <FormField label="Nombre Completo" value={formData.company_name} onChange={(v) => setFormData({...formData, company_name: v, razon_social: v, contact_name: v})} required readOnly={isReadOnly} />
                                    <FormField label="Cédula / Identificación" value={formData.nit} onChange={(v) => setFormData({...formData, nit: v})} required readOnly={isEdit || isReadOnly} />
                                    <FormField label="WhatsApp / Celular" value={formData.phone} onChange={(v) => setFormData({...formData, phone: v})} required readOnly={isReadOnly} />
                                    <FormField label="Email Principal" value={formData.email} onChange={(v) => setFormData({...formData, email: v, contact_email: v})} required readOnly={isReadOnly} />
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.2rem' }}>
                                    {!formData.is_corporate_parent && (
                                        <div style={{ position: 'relative' }}>
                                            <label style={{ fontSize: '0.65rem', fontWeight: '900', color: '#64748B', marginBottom: '0.4rem', display: 'block', textTransform: 'uppercase' }}>VINCULAR A CASA MATRIZ</label>
                                            <div style={{ position: 'relative' }}>
                                                <input 
                                                    type="text"
                                                    placeholder="Buscar Matriz..."
                                                    value={formData.parent_id ? (potentialParents.find(p => p.id === formData.parent_id)?.company_name || parentSearch) : parentSearch}
                                                    onFocus={() => !isReadOnly && setIsParentDropdownOpen(true)}
                                                    onChange={(e) => {
                                                        if (isReadOnly) return;
                                                        setParentSearch(e.target.value);
                                                        if (formData.parent_id) setFormData({ ...formData, parent_id: '' });
                                                        setIsParentDropdownOpen(true);
                                                    }}
                                                    readOnly={isEdit || isReadOnly}
                                                    style={{ height: '34px', padding: '0 0.8rem', borderRadius: '8px', border: '1px solid #E2E8F0', fontWeight: '700', width: '100%', outline: 'none', backgroundColor: (isEdit || isReadOnly || formData.parent_id) ? '#F8FAFC' : 'white', fontSize: '0.8rem', cursor: (isEdit || isReadOnly) ? 'default' : 'text' }}
                                                />
                                                {isParentDropdownOpen && !formData.parent_id && (
                                                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', border: '1px solid #E2E8F0', marginTop: '6px', maxHeight: '220px', overflowY: 'auto' }}>
                                                        {potentialParents.filter(p => 
                                                            p.company_name?.toLowerCase().includes(parentSearch.toLowerCase()) || 
                                                            p.nit?.includes(parentSearch) ||
                                                            p.razon_social?.toLowerCase().includes(parentSearch.toLowerCase())
                                                        ).map(p => (
                                                            <div key={p.id} onClick={() => { handleParentSelection(p.id); setIsParentDropdownOpen(false); }} style={{ padding: '0.8rem', cursor: 'pointer', borderBottom: '1px solid #F1F5F9' }}>
                                                                <div style={{ fontWeight: '800', fontSize: '0.8rem' }}>{p.company_name}</div>
                                                                <div style={{ fontSize: '0.65rem', color: '#94A3B8', display: 'flex', gap: '8px' }}>
                                                                    <span>NIT: {p.nit}</span>
                                                                    <span>•</span>
                                                                    <span style={{ fontStyle: 'italic' }}>{p.razon_social}</span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {formData.is_corporate_parent ? (
                                        <>
                                            <FormField label="Razón Social Legal" value={formData.razon_social} onChange={(v) => setFormData({...formData, razon_social: v, company_name: v})} required readOnly={isEdit || isReadOnly} />
                                            <FormField label="NIT" value={formData.nit} onChange={(v) => setFormData({...formData, nit: v})} required readOnly={isEdit || isReadOnly} />
                                            <FormField label="Email Principal (Facturación)" value={formData.email} onChange={(v) => setFormData({...formData, email: v})} required readOnly={isReadOnly} />
                                        </>
                                    ) : (
                                        <>
                                            <FormField label="Nombre Comercial Sucursal" value={formData.company_name} onChange={(v) => setFormData({...formData, company_name: v})} required readOnly={isReadOnly} />
                                            <FormField label="ID Sucursal" value={formData.branch_id} onChange={(v) => setFormData({...formData, branch_id: v})} placeholder="Ej: SUC-01" readOnly={isReadOnly} />
                                        </>
                                    )}
                                </div>
                            )}

                            {!isB2C && (
                                <div style={{ backgroundColor: '#F8FAFC', padding: '1.5rem', borderRadius: '24px', border: '1px solid #E2E8F0', marginTop: '1.5rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
                                        <Mail size={15} strokeWidth={1.5} style={{ color: '#475569' }} />
                                        <span style={{ fontSize: '0.7rem', fontWeight: '900', color: '#475569', textTransform: 'uppercase' }}>Configuración de Notificación de Factura</span>
                                    </div>
                                    
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                                        {/* Email 1 */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: 'white', padding: '0.6rem', borderRadius: '12px', border: '1px solid #F1F5F9' }}>
                                            <input type="checkbox" checked={formData.notify_email_1} onChange={(e) => setFormData({...formData, notify_email_1: e.target.checked})} style={{ width: '18px', height: '18px', cursor: isReadOnly ? 'default' : 'pointer' }} disabled={isReadOnly} />
                                            <div style={{ flex: 1 }}>
                                                <FormField label="Email Principal" value={formData.email} onChange={(v) => setFormData({...formData, email: v})} placeholder="correo@ejemplo.com" readOnly={isReadOnly} />
                                            </div>
                                        </div>

                                        {/* Email 2 */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: 'white', padding: '0.6rem', borderRadius: '12px', border: '1px solid #F1F5F9' }}>
                                            <input type="checkbox" checked={formData.notify_email_2} onChange={(e) => setFormData({...formData, notify_email_2: e.target.checked})} style={{ width: '18px', height: '18px', cursor: isReadOnly ? 'default' : 'pointer' }} disabled={isReadOnly} />
                                            <div style={{ flex: 1 }}>
                                                <FormField label="Email Secundario" value={formData.email_2} onChange={(v) => setFormData({...formData, email_2: v})} placeholder="correo2@ejemplo.com" readOnly={isReadOnly} />
                                            </div>
                                        </div>

                                        {/* Email 3 */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: 'white', padding: '0.6rem', borderRadius: '12px', border: '1px solid #F1F5F9' }}>
                                            <input type="checkbox" checked={formData.notify_email_3} onChange={(e) => setFormData({...formData, notify_email_3: e.target.checked})} style={{ width: '18px', height: '18px', cursor: isReadOnly ? 'default' : 'pointer' }} disabled={isReadOnly} />
                                            <div style={{ flex: 1 }}>
                                                <FormField label="Email Terciario" value={formData.email_3} onChange={(v) => setFormData({...formData, email_3: v})} placeholder="correo3@ejemplo.com" readOnly={isReadOnly} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </section>


                        {/* BLOQUE: SUCURSALES VINCULADAS (UBICADO DE PRIMERAS EN LA PARTE SUPERIOR PARA MATRICES) */}
                        {isB2B && formData.is_corporate_parent && editData?.id && (
                            <section style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: THEME.radius.xl, border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.2rem' }}>
                                    <div style={{ width: '32px', height: '32px', backgroundColor: THEME.colors.primaryLight, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Building2 size={16} strokeWidth={1.5} style={{ color: THEME.colors.primary }} /></div>
                                    <h4 style={{ fontSize: '0.9rem', fontWeight: '800', color: THEME.colors.textMain, margin: 0, fontFamily: THEME.typography.fontFamilyMain }}>SUCURSALES VINCULADAS ({branches.length})</h4>
                                </div>
                                {branches.length === 0 ? (
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748B', fontStyle: 'italic', fontFamily: THEME.typography.fontFamilySecondary }}>No hay sucursales asociadas a esta Casa Matriz.</p>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', maxHeight: '320px', overflowY: 'auto', marginTop: '0.5rem' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left', fontFamily: THEME.typography.fontFamilySecondary }}>
                                            <thead>
                                                <tr style={{ borderBottom: '2px solid #E2E8F0', color: '#64748B', fontWeight: '800' }}>
                                                    <th style={{ padding: '0.6rem 0.4rem' }}>Sucursal</th>
                                                    <th style={{ padding: '0.6rem 0.4rem' }}>Contacto</th>
                                                    <th style={{ padding: '0.6rem 0.4rem' }}>ID Sucursal</th>
                                                    <th style={{ padding: '0.6rem 0.4rem' }}>Dirección</th>
                                                    <th style={{ padding: '0.6rem 0.4rem' }}>Modelo Precios</th>
                                                    <th style={{ padding: '0.6rem 0.4rem', textAlign: 'center' }}>Acción</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {branches.map(branch => {
                                                    const modelName = pricingModels?.find(m => m.id === branch.pricing_model_id)?.name || 'Heredado';
                                                    return (
                                                        <tr key={branch.id} style={{ borderBottom: '1px solid #F1F5F9', color: '#334155' }}>
                                                            <td style={{ padding: '0.6rem 0.4rem', fontWeight: '700' }}>
                                                                <span 
                                                                    onClick={() => handleSwitchToBranch(branch)} 
                                                                    title="Abrir ficha detallada de esta sucursal"
                                                                    style={{ color: '#0369A1', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
                                                                    onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                                                                    onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                                                                >
                                                                    <ExternalLink size={12} /> {branch.company_name}
                                                                </span>
                                                            </td>
                                                            <td style={{ padding: '0.6rem 0.4rem' }}>{branch.contact_name} {branch.phone && `(${branch.phone})`}</td>
                                                            <td style={{ padding: '0.6rem 0.4rem', fontWeight: '600' }}>{branch.branch_id || '---'}</td>
                                                            <td style={{ padding: '0.6rem 0.4rem' }}>{branch.address}</td>
                                                            <td style={{ padding: '0.6rem 0.4rem' }}>
                                                                <span style={{ padding: '2px 8px', borderRadius: '6px', backgroundColor: branch.pricing_model_id ? '#EFF6FF' : '#F1F5F9', color: branch.pricing_model_id ? '#1D4ED8' : '#475569', fontSize: '0.65rem', fontWeight: '700' }}>
                                                                    {modelName}
                                                                </span>
                                                            </td>
                                                            <td style={{ padding: '0.6rem 0.4rem', textAlign: 'center' }}>
                                                                <button 
                                                                    type="button"
                                                                    onClick={() => handleSwitchToBranch(branch)} 
                                                                    title="Abrir tarjeta de esta sucursal"
                                                                    style={{ padding: '4px 10px', borderRadius: '6px', backgroundColor: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', fontSize: '0.68rem', fontWeight: '800', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', transition: 'all 0.2s' }}
                                                                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#1D4ED8'; e.currentTarget.style.color = 'white'; }}
                                                                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#EFF6FF'; e.currentTarget.style.color = '#1D4ED8'; }}
                                                                >
                                                                    <ExternalLink size={11} /> Ver Ficha
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </section>
                        )}

                        {/* BLOQUE: SEGURIDAD Y ACCESO B2B */}
                        {isB2B && isReadOnly && isEdit && (
                            <section style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '24px', border: `1px solid ${THEME.colors.border}` }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.2rem' }}>
                                    <div style={{ width: '32px', height: '32px', backgroundColor: THEME.colors.primaryLight, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Lock size={16} strokeWidth={1.5} style={{ color: THEME.colors.primary }} /></div>
                                    <h4 style={{ fontSize: '0.9rem', fontWeight: '900', color: THEME.colors.textMain, margin: 0, fontFamily: THEME.typography.fontFamilyMain }}>SEGURIDAD Y ACCESO AL PORTAL</h4>
                                </div>

                                {loadingAccess ? (
                                    <div style={{ padding: '1rem', color: THEME.colors.textSecondary, fontStyle: 'italic', fontSize: '0.85rem' }}>
                                        Comprobando estado de acceso...
                                    </div>
                                ) : b2bAccess?.hasAccess ? (
                                    <div style={{ backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0', padding: '1.2rem', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#047857', fontWeight: '900', fontSize: '0.85rem' }}>
                                            <CheckCircle2 size={16} /> ACCESO INSTITUCIONAL ACTIVO
                                        </div>
                                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#065F46', fontWeight: '500' }}>
                                            El cliente tiene una cuenta activa vinculada en el sistema.
                                        </p>
                                        <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.4rem', borderTop: '1px dashed #A7F3D0', paddingTop: '0.6rem', fontSize: '0.8rem' }}>
                                            <div>
                                                <span style={{ color: '#065F46', fontWeight: '800', display: 'block', textTransform: 'uppercase', fontSize: '0.65rem' }}>Usuario (Email)</span>
                                                <span style={{ color: '#064E3B', fontWeight: '700' }}>{b2bAccess.email}</span>
                                            </div>
                                            <div>
                                                <span style={{ color: '#065F46', fontWeight: '800', display: 'block', textTransform: 'uppercase', fontSize: '0.65rem' }}>Creado el</span>
                                                <span style={{ color: '#064E3B', fontWeight: '700' }}>{new Date(b2bAccess.createdAt || '').toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', padding: '1.2rem', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748B', fontWeight: '900', fontSize: '0.85rem' }}>
                                                <AlertCircle size={16} /> SIN ACCESO AL PORTAL B2B
                                            </div>
                                            <p style={{ margin: '0.3rem 0 0', fontSize: '0.8rem', color: '#64748B', fontWeight: '500' }}>
                                                Este cliente no tiene una cuenta de usuario en Supabase Auth y no puede ingresar al Portal Institucional.
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setTempEmail(formData.email || formData.contact_email || '');
                                                setTempPassword(Math.random().toString(36).substring(2, 10) + 'A1*');
                                                setGeneratedCreds(null);
                                                setShowCredentialModal(true);
                                            }}
                                            style={{
                                                padding: '0.6rem 1.2rem',
                                                backgroundColor: THEME.colors.primary,
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '12px',
                                                fontSize: '0.8rem',
                                                fontWeight: '800',
                                                cursor: 'pointer',
                                                boxShadow: '0 4px 10px rgba(13, 122, 87, 0.15)',
                                                fontFamily: THEME.typography.fontFamilyMain,
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            Generar Acceso B2B
                                        </button>
                                    </div>
                                )}
                            </section>
                        )}

                        {/* BLOQUE: CARTERA Y LEGAL (SOLO MATRIZ) */}
                        {formData.is_corporate_parent && (
                            <section style={{ backgroundColor: '#F0F9FF', padding: '1.5rem', borderRadius: '24px', border: '1px solid #BAE6FD' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.2rem' }}>
                                    <div style={{ width: '32px', height: '32px', backgroundColor: THEME.colors.primaryLight, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Scale size={16} strokeWidth={1.5} style={{ color: THEME.colors.primary }} /></div>
                                    <h4 style={{ fontSize: '0.9rem', fontWeight: '900', color: '#0369A1', margin: 0 }}>CARTERA, DOCUMENTACIÓN Y REFERENCIAS</h4>
                                </div>
                                
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.2rem' }}>
                                    <FormField label="Responsable Pagos" value={formData.collection_responsible_name} onChange={(v) => setFormData({...formData, collection_responsible_name: v})} readOnly={isReadOnly} />
                                    <FormField label="Teléfono Tesorería" value={formData.collection_responsible_phone} onChange={(v) => setFormData({...formData, collection_responsible_phone: v})} readOnly={isReadOnly} />
                                    <FormField label="Email Pagos" value={formData.collection_responsible_email} onChange={(v) => setFormData({...formData, collection_responsible_email: v})} readOnly={isReadOnly} />
                                </div>
                                
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem', marginTop: '1.2rem' }}>
                                    <div style={{ backgroundColor: 'white', padding: '1rem', borderRadius: '16px', border: '1px solid #E0F2FE' }}>
                                        <div style={{ fontSize: '0.6rem', fontWeight: '900', color: '#64748B', marginBottom: '0.8rem', textTransform: 'uppercase' }}>Referencia Comercial 01</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.8rem' }}>
                                            <FormField label="Razón Social" value={formData.comm_ref_1_name} onChange={(v) => setFormData({...formData, comm_ref_1_name: v})} readOnly={isReadOnly} />
                                            <FormField label="NIT" value={formData.comm_ref_1_nit} onChange={(v) => setFormData({...formData, comm_ref_1_nit: v})} readOnly={isReadOnly} />
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                            <FormField label="Teléfono" value={formData.comm_ref_1_phone} onChange={(v) => setFormData({...formData, comm_ref_1_phone: v})} readOnly={isReadOnly} />
                                            <FormField label="Email" value={formData.comm_ref_1_email} onChange={(v) => setFormData({...formData, comm_ref_1_email: v})} readOnly={isReadOnly} />
                                        </div>
                                    </div>
                                    <div style={{ backgroundColor: 'white', padding: '1rem', borderRadius: '16px', border: '1px solid #E0F2FE' }}>
                                        <div style={{ fontSize: '0.6rem', fontWeight: '900', color: '#64748B', marginBottom: '0.8rem', textTransform: 'uppercase' }}>Referencia Comercial 02</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.8rem' }}>
                                            <FormField label="Razón Social" value={formData.comm_ref_2_name} onChange={(v) => setFormData({...formData, comm_ref_2_name: v})} readOnly={isReadOnly} />
                                            <FormField label="NIT" value={formData.comm_ref_2_nit} onChange={(v) => setFormData({...formData, comm_ref_2_nit: v})} readOnly={isReadOnly} />
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                            <FormField label="Teléfono" value={formData.comm_ref_2_phone} onChange={(v) => setFormData({...formData, comm_ref_2_phone: v})} readOnly={isReadOnly} />
                                            <FormField label="Email" value={formData.comm_ref_2_email} onChange={(v) => setFormData({...formData, comm_ref_2_email: v})} readOnly={isReadOnly} />
                                        </div>
                                    </div>
                                </div>
                            </section>
                        )}

                        {/* BLOQUE: CONFIGURACIÓN COMERCIAL (COMMON) */}
                        <section style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '32px', border: '1px solid #E2E8F0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
                                <div style={{ width: '36px', height: '36px', backgroundColor: THEME.colors.primaryLight, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CreditCard size={18} strokeWidth={1.5} style={{ color: THEME.colors.primary }} /></div>
                                <h4 style={{ fontSize: '1rem', fontWeight: '900', color: '#1E293B', margin: 0 }}>ESTRUCTURA COMERCIAL</h4>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                                {isB2C ? (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem' }}>
                                        <FormField label="ID ZR" value={formData.id_zr} onChange={(v) => setFormData({...formData, id_zr: v})} readOnly={isReadOnly} />
                                        <FormField label="ID LP" value={formData.id_lp} onChange={(v) => setFormData({...formData, id_lp: v})} readOnly={isReadOnly} />
                                    </div>
                                ) : (
                                    <>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                                <label style={{ fontSize: '0.65rem', fontWeight: '900', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.02rem' }}>Modelo de Precios</label>
                                                {agreement ? (() => {
                                                    const expiry = agreement.valid_until;
                                                    const status = (() => {
                                                        if (!expiry) return { label: 'Vigente', color: '#0D7A57', bgColor: '#EAEFEA', type: 'active' };
                                                        const exp = new Date(expiry);
                                                        const today = new Date();
                                                        today.setHours(0,0,0,0);
                                                        const diff = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                                                        if (diff < 0) return { label: 'Vencido', color: '#EF4444', bgColor: '#FEF2F2', type: 'expired' };
                                                        if (diff <= 15) return { label: `Vence en ${diff}d`, color: '#D97706', bgColor: '#FFFBEB', type: 'warning' };
                                                        return { label: 'Vigente', color: '#0D7A57', bgColor: '#EAEFEA', type: 'active' };
                                                    })();
                                                    
                                                    const agreementId = (() => {
                                                        const date = agreement.created_at ? new Date(agreement.created_at) : new Date();
                                                        const day = String(date.getDate()).padStart(2, '0');
                                                        const month = String(date.getMonth() + 1).padStart(2, '0');
                                                        const paddedSeq = String(agreement.quote_number).padStart(4, '0');
                                                        return `ACI ${day}${month} ${paddedSeq}`;
                                                    })();

                                                    return (
                                                        <div 
                                                            onClick={() => setIsAgreementModalOpen(true)}
                                                            title="Haga clic para ver los precios congelados del acuerdo"
                                                            style={{ 
                                                                padding: '0.8rem 1rem', 
                                                                borderRadius: THEME.radius.md, 
                                                                backgroundColor: status.bgColor, 
                                                                border: `1.5px solid ${status.type === 'expired' ? '#FCA5A5' : status.type === 'warning' ? '#FDE68A' : '#A7F3D0'}`, 
                                                                color: status.color, 
                                                                display: 'flex',
                                                                flexDirection: 'column',
                                                                gap: '0.25rem',
                                                                cursor: 'pointer',
                                                                transition: 'all 0.2s',
                                                                position: 'relative'
                                                            }}
                                                            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)'; }}
                                                            onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
                                                        >
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                    <FileText size={15} strokeWidth={1.5} style={{ color: THEME.colors.primary }} />
                                                                    <span style={{ fontWeight: '800', fontSize: '0.75rem', color: '#1E293B' }}>
                                                                        {agreementId}
                                                                    </span>
                                                                    {inheritedFromParent && (
                                                                        <span style={{ fontSize: '0.6rem', color: '#0369A1', backgroundColor: '#E0F2FE', padding: '1px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                                                                            Matriz
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <span style={{ fontSize: '0.55rem', fontWeight: '900', padding: '2px 6px', borderRadius: '10px', backgroundColor: status.type === 'expired' ? '#FEE2E2' : status.type === 'warning' ? '#FEF3C7' : '#D1FAE5', color: status.color, textTransform: 'uppercase' }}>
                                                                    {status.label}
                                                                </span>
                                                            </div>
                                                            <div style={{ fontSize: '0.65rem', color: '#64748B', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                                                                <span>Vence: {expiry ? new Date(expiry).toLocaleDateString('es-CO') : 'Indefinida'}</span>
                                                                <span style={{ fontSize: '0.6rem', color: '#0D7A57', fontWeight: '700', textDecoration: 'underline' }}>Ver Precios →</span>
                                                            </div>
                                                        </div>
                                                    );
                                                })() : (
                                                    <select 
                                                        value={formData.pricing_model_id} 
                                                        onChange={(e) => setFormData({...formData, pricing_model_id: e.target.value})} 
                                                        disabled={isReadOnly || !!formData.parent_id}
                                                        style={{ height: '34px', padding: '0 0.8rem', borderRadius: '8px', border: '1px solid #E2E8F0', fontWeight: '700', fontSize: '0.8rem', backgroundColor: (isReadOnly || !!formData.parent_id) ? '#F8FAFC' : 'white', outline: 'none', width: '100%', cursor: (isReadOnly || !!formData.parent_id) ? 'default' : 'pointer' }}
                                                    >
                                                        {formData.parent_id ? (() => {
                                                             const parent = potentialParents.find(p => p.id === formData.parent_id);
                                                             const parentModel = parent && pricingModels ? pricingModels.find(m => m.id === parent.pricing_model_id) : null;
                                                             return (
                                                                 <option value="">
                                                                     {parentModel ? `Heredado de Matriz: ${parentModel.name}` : 'Heredado de Matriz: Modelo B2C'}
                                                                 </option>
                                                             );
                                                        })() : (
                                                             <option value="">Seleccionar...</option>
                                                        )}
                                                        {!formData.parent_id && pricingModels.map(pm => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
                                                    </select>
                                                )}
                                            </div>
                                            <FormField label="Días de Pago" value={formData.payment_days} onChange={(v) => setFormData({...formData, payment_days: parseInt(v) || 0})} type="number" readOnly={isReadOnly} />
                                        </div>

                                        {/* WARNING DE ACUERDO VENCIDO O INEXISTENTE */}
                                        {loadingAgreement ? (
                                            <div style={{ padding: '0.8rem', borderRadius: '12px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <Loader2 size={14} className="animate-spin" />
                                                <span style={{ fontSize: '0.75rem', color: '#64748B' }}>Buscando Acuerdo Institucional...</span>
                                            </div>
                                        ) : !agreement ? (
                                            <div style={{ 
                                                padding: '1rem', 
                                                borderRadius: THEME.radius.lg, 
                                                backgroundColor: '#FEF2F2', 
                                                border: '1.5px solid #FCA5A5', 
                                                color: '#B91C1C', 
                                                marginTop: '1rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '10px',
                                                fontFamily: THEME.typography.fontFamilySecondary
                                            }}>
                                                <span style={{ fontSize: '1.1rem' }}>⚠️</span>
                                                <span style={{ fontSize: '0.75rem', fontWeight: '700' }}>
                                                    {formData.parent_id ? 'La Casa Matriz no cuenta con un Acuerdo Institucional vigente.' : 'El cliente no cuenta con un Acuerdo Institucional vigente.'}
                                                </span>
                                            </div>
                                        ) : null}
                                        {!formData.is_corporate_parent && (
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
                                                <FormField label="Copias Rem." value={formData.remission_copies} onChange={(v) => setFormData({...formData, remission_copies: Math.max(2, parseInt(v) || 2)})} type="number" readOnly={isReadOnly} />
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </section>

                        {/* BLOQUE: CONTACTO OPERATIVO (COMMON) */}
                        {!isB2C && (
                            <section style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: THEME.radius.xl, border: `1px solid ${THEME.colors.border}` }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.2rem' }}>
                                    <div style={{ width: '32px', height: '32px', backgroundColor: THEME.colors.primaryLight, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Phone size={16} strokeWidth={1.5} style={{ color: THEME.colors.primary }} /></div>
                                    <h4 style={{ fontSize: '0.9rem', fontWeight: '600', color: THEME.colors.textMain, margin: 0, fontFamily: THEME.typography.fontFamilyMain }}>CONTACTO OPERATIVO (ÁREA DE COMPRAS)</h4>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.2rem' }}>
                                    <FormField label="Responsable Directo" value={formData.contact_name} onChange={(v) => setFormData({...formData, contact_name: v})} required readOnly={isReadOnly} />
                                    <FormField label="WhatsApp" value={formData.phone} onChange={(v) => setFormData({...formData, phone: v})} required readOnly={isReadOnly} />
                                    <FormField label="Email Contacto" value={formData.contact_email} onChange={(v) => setFormData({...formData, contact_email: v})} required readOnly={isReadOnly} />
                                </div>
                            </section>
                        )}

                            {/* BLOQUE: UBICACIÓN Y LOGÍSTICA (SOLO SUCURSAL) */}
                            {!formData.is_corporate_parent && (
                                <section style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: THEME.radius.xl, border: `1px solid ${THEME.colors.border}` }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem', borderBottom: `1px solid ${THEME.colors.border}`, paddingBottom: '0.8rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <div style={{ width: '32px', height: '32px', backgroundColor: THEME.colors.primaryLight, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MapPin size={16} strokeWidth={1.5} style={{ color: THEME.colors.primary }} /></div>
                                            <h4 style={{ fontSize: '0.9rem', fontWeight: '600', color: THEME.colors.textMain, margin: 0, fontFamily: THEME.typography.fontFamilyMain }}>LOCALIZACIÓN OPERATIVA</h4>
                                        </div>
                                        {!isReadOnly && (
                                            <button 
                                                type="button" 
                                                onClick={handleGeocode} 
                                                disabled={geocoding} 
                                                style={{ 
                                                    backgroundColor: THEME.colors.primary, 
                                                    color: 'white', 
                                                    border: 'none', 
                                                    padding: '0.5rem 1.2rem', 
                                                    borderRadius: THEME.radius.md, 
                                                    fontSize: '0.75rem', 
                                                    fontWeight: '600', 
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    fontFamily: THEME.typography.fontFamilySecondary,
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = THEME.colors.primaryHover}
                                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = THEME.colors.primary}
                                            >
                                                {geocoding ? (
                                                    <>
                                                        <Loader2 size={14} className="animate-spin" /> Buscando...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Sparkles size={14} /> Pin inteligente (IA)
                                                    </>
                                                )}
                                            </button>
                                        )}
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '2rem' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1rem' }}>
                                                <div>
                                                    <label style={{ fontSize: '0.65rem', fontWeight: '600', color: THEME.colors.textSecondary, marginBottom: '0.4rem', display: 'block', textTransform: 'uppercase', fontFamily: THEME.typography.fontFamilySecondary }}>DIRECCIÓN PRINCIPAL (Calle/Cra/Num)</label>
                                                    <input 
                                                        type="text" 
                                                        value={formData.address} 
                                                        onChange={(e) => setFormData({...formData, address: e.target.value})}
                                                        placeholder="Ej: AV CRA 68 # 90-88"
                                                        readOnly={isReadOnly}
                                                        style={{ width: '100%', height: '34px', padding: '0 0.6rem', borderRadius: '8px', border: `1px solid ${THEME.colors.border}`, fontWeight: '600', fontSize: '0.8rem', backgroundColor: isReadOnly ? '#F8FAFC' : 'white', cursor: isReadOnly ? 'default' : 'text', fontFamily: THEME.typography.fontFamilySecondary, outline: 'none' }}
                                                    />
                                                </div>
                                                <div>
                                                    <label style={{ fontSize: '0.65rem', fontWeight: '600', color: THEME.colors.textSecondary, marginBottom: '0.4rem', display: 'block', textTransform: 'uppercase', fontFamily: THEME.typography.fontFamilySecondary }}>COMPLEMENTO (Local/Of/Torre)</label>
                                                    <input 
                                                        type="text" 
                                                        value={formData.address_complement} 
                                                        onChange={(e) => setFormData({...formData, address_complement: e.target.value})}
                                                        placeholder="Ej: Local 1-006"
                                                        readOnly={isReadOnly}
                                                        style={{ width: '100%', height: '34px', padding: '0 0.6rem', borderRadius: '8px', border: `1px solid ${THEME.colors.border}`, fontWeight: '600', fontSize: '0.8rem', backgroundColor: isReadOnly ? '#F8FAFC' : 'white', cursor: isReadOnly ? 'default' : 'text', fontFamily: THEME.typography.fontFamilySecondary, outline: 'none' }}
                                                    />
                                                </div>
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                <FormField label="Ciudad/Mnpio" value={formData.municipality} onChange={(v: string) => setFormData({...formData, municipality: v, city: v})} readOnly={isReadOnly} />
                                                <FormField label="Departamento" value={formData.department} onChange={(v: string) => setFormData({...formData, department: v})} readOnly={isReadOnly} />
                                            </div>

                                            {/* PANEL DE GEOCERCAS MANUAL */}
                                            <div style={{ backgroundColor: '#F8FAFC', padding: '1rem', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}` }}>
                                                <div style={{ fontSize: '0.65rem', fontWeight: '600', color: THEME.colors.textSecondary, marginBottom: '0.8rem', letterSpacing: '0.05rem', fontFamily: THEME.typography.fontFamilySecondary }}>GEOCERCAS (LAT/LNG)</div>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem' }}>
                                                    <FormField label="LAT" value={formData.latitude} onChange={(v) => setFormData({...formData, latitude: v, geocoding_status: 'manual'})} readOnly={isReadOnly} />
                                                    <FormField label="LNG" value={formData.longitude} onChange={(v) => setFormData({...formData, longitude: v, geocoding_status: 'manual'})} readOnly={isReadOnly} />
                                                </div>
                                                {!isReadOnly && (
                                                    <div style={{ marginTop: '0.6rem', fontSize: '0.65rem', fontWeight: '600', color: '#D97706', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: THEME.typography.fontFamilySecondary }}>
                                                        <AlertTriangle size={12} /> AJUSTE MANUAL (VERIFICA EN MAPA)
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            <div style={{ height: '300px', width: '100%', borderRadius: THEME.radius.lg, overflow: 'hidden', border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.md, position: 'relative' }}>
                                                <div ref={mapRef} style={{ width: '100%', height: '100%' }}></div>
                                                {!formData.latitude && (
                                                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(4px)', zIndex: 10 }}>
                                                        <div style={{ fontSize: '1rem', fontWeight: '600', color: THEME.colors.textMain, marginBottom: '4px', fontFamily: THEME.typography.fontFamilyMain }}>Esperando dirección...</div>
                                                        <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, fontWeight: '500', fontFamily: THEME.typography.fontFamilySecondary }}>Usa el pin inteligente o arrastra el mapa</div>
                                                    </div>
                                                )}
                                            </div>
                                            {!isReadOnly && (
                                                <div style={{ backgroundColor: THEME.colors.primaryLight, padding: '0.8rem', borderRadius: THEME.radius.md, fontSize: '0.7rem', color: THEME.colors.primary, fontWeight: '600', border: `1px solid ${THEME.colors.primary}33`, display: 'flex', alignItems: 'center', gap: '6px', fontFamily: THEME.typography.fontFamilySecondary }}>
                                                    <Sparkles size={12} /> Tip: Puedes arrastrar el marcador rojo en el mapa para ubicar el punto de entrega exacto si la dirección es ambigua.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </section>
                            )}

                            {/* BLOQUE: RESTRICCIONES Y OPERACIÓN LOGÍSTICA (SOLO SUCURSAL) */}
                            {!formData.is_corporate_parent && (
                                <section style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: THEME.radius.xl, border: `1px solid ${THEME.colors.border}` }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <div style={{ width: '32px', height: '32px', backgroundColor: THEME.colors.primaryLight, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Sliders size={16} strokeWidth={1.5} style={{ color: THEME.colors.primary }} /></div>
                                            <div>
                                                <h4 style={{ fontSize: '0.9rem', fontWeight: '600', color: THEME.colors.textMain, margin: 0, fontFamily: THEME.typography.fontFamilyMain }}>RESTRICCIONES Y OPERACIÓN LOGÍSTICA</h4>
                                                <p style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, margin: 0, fontWeight: '400', fontFamily: THEME.typography.fontFamilySecondary }}>Configura las franjas horarias para el optimizador de rutas.</p>
                                            </div>
                                        </div>
                                        {!isReadOnly && (
                                            <button 
                                                type="button" 
                                                onClick={() => {
                                                    if (!formData.delivery_restrictions) return window.showToast?.('Escribe algo primero', 'info');
                                                    const parsed = parseLogisticsText(formData.delivery_restrictions);
                                                    setFormData({ ...formData, logistics_data: parsed });
                                                    window.showToast?.('IA: Franja actualizada según el texto', 'info');
                                                }}
                                                style={{ 
                                                    backgroundColor: 'white', 
                                                    color: THEME.colors.textMain, 
                                                    border: `1px solid ${THEME.colors.border}`, 
                                                    padding: '0.5rem 1rem', 
                                                    borderRadius: THEME.radius.md, 
                                                    fontSize: '0.75rem', 
                                                    fontWeight: '600', 
                                                    cursor: 'pointer', 
                                                    display: 'flex', 
                                                    alignItems: 'center', 
                                                    gap: '6px',
                                                    fontFamily: THEME.typography.fontFamilySecondary,
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.borderColor = THEME.colors.borderActive;
                                                    e.currentTarget.style.backgroundColor = THEME.colors.primaryLight;
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.borderColor = THEME.colors.border;
                                                    e.currentTarget.style.backgroundColor = 'white';
                                                }}
                                            >
                                                <Sparkles size={14} style={{ color: THEME.colors.primary }} /> Autodiagnóstico IA
                                            </button>
                                        )}
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '2rem' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                            <div>
                                                <label style={{ fontSize: '0.65rem', fontWeight: '600', color: THEME.colors.textSecondary, textTransform: 'uppercase', marginBottom: '0.4rem', display: 'block', fontFamily: THEME.typography.fontFamilySecondary }}>Instrucciones Naturales (Voz o Texto)</label>
                                                <textarea 
                                                    value={formData.delivery_restrictions} 
                                                    onChange={(e) => setFormData({...formData, delivery_restrictions: e.target.value})} 
                                                    placeholder="Ej: 'Entregar todos los días antes de las 9:30 AM, menos los jueves'..."
                                                    readOnly={isReadOnly}
                                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: `1px solid ${THEME.colors.border}`, minHeight: '120px', outline: 'none', fontWeight: '400', fontSize: '0.85rem', resize: 'none', backgroundColor: isReadOnly ? '#F8FAFC' : 'white', lineHeight: '1.5', cursor: isReadOnly ? 'default' : 'text', fontFamily: THEME.typography.fontFamilySecondary }} 
                                                />
                                                {!isReadOnly && (
                                                    <div style={{ marginTop: '0.6rem', padding: '0.6rem 0.8rem', backgroundColor: THEME.colors.primaryLight, borderRadius: THEME.radius.md, fontSize: '0.7rem', color: THEME.colors.primary, fontWeight: '600', border: `1px solid ${THEME.colors.primary}33`, display: 'flex', alignItems: 'center', gap: '6px', fontFamily: THEME.typography.fontFamilySecondary }}>
                                                        <Sparkles size={12} /> Tip: Describe las condiciones de entrega y usa el Autodiagnóstico para generar el JSON técnico automáticamente.
                                                    </div>
                                                )}
                                            </div>

                                            {formData.logistics_data?.allowed_days?.length > 0 && (
                                                <div style={{ backgroundColor: THEME.colors.primaryLight, padding: '1rem 1.2rem', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <div style={{ width: '36px', height: '36px', backgroundColor: 'white', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm }}><Cpu size={16} strokeWidth={1.5} style={{ color: THEME.colors.primary }} /></div>
                                                    <div>
                                                        <div style={{ fontSize: '0.6rem', fontWeight: '600', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05rem', marginBottom: '2px', fontFamily: THEME.typography.fontFamilySecondary }}>
                                                            FRANJA IA GENERADA (JSON ACTIVO)
                                                        </div>
                                                        <div style={{ fontSize: '0.85rem', fontWeight: '600', color: THEME.colors.textMain, fontFamily: THEME.typography.fontFamilyMain }}>
                                                            {formatTimeWindow(formData.logistics_data)}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm }}>
                                            <div style={{ marginBottom: '1.2rem' }}>
                                                <label style={{ fontSize: '0.7rem', fontWeight: '600', color: THEME.colors.textSecondary, display: 'block', marginBottom: '0.8rem', textTransform: 'uppercase', fontFamily: THEME.typography.fontFamilySecondary }}>DÍAS PERMITIDOS</label>
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((day, idx) => {
                                                        const days = formData.logistics_data?.allowed_days || [];
                                                        const isActive = days.includes(idx + 1);
                                                        return (
                                                            <div 
                                                                key={day}
                                                                onClick={() => {
                                                                    if (isReadOnly) return;
                                                                    const newDays = isActive ? days.filter((d: number) => d !== idx + 1) : [...days, idx + 1];
                                                                    setFormData({ ...formData, logistics_data: { 
                                                                        ...formData.logistics_data, 
                                                                        allowed_days: newDays,
                                                                        days: newDays.map((d: number) => d === 7 ? 0 : d) 
                                                                    } });
                                                                }}
                                                                style={{ 
                                                                    width: '36px', height: '36px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: '600', cursor: isReadOnly ? 'default' : 'pointer',
                                                                    backgroundColor: isActive ? THEME.colors.primary : '#F1F5F9',
                                                                    color: isActive ? 'white' : THEME.colors.textSecondary,
                                                                    transition: 'all 0.2s',
                                                                    boxShadow: isActive ? '0 2px 6px rgba(13, 122, 87, 0.2)' : 'none',
                                                                    pointerEvents: isReadOnly ? 'none' : 'auto',
                                                                    fontFamily: THEME.typography.fontFamilyMain
                                                                }}
                                                            >
                                                                {day}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                                                <div>
                                                    <label style={{ fontSize: '0.65rem', fontWeight: '600', color: THEME.colors.textSecondary, display: 'block', marginBottom: '0.4rem', textTransform: 'uppercase', fontFamily: THEME.typography.fontFamilySecondary }}>INICIO (MIN 04:30)</label>
                                                    <input 
                                                        type="time" 
                                                        value={formData.logistics_data?.start_time || '04:30'} 
                                                        onChange={(e) => {
                                                            if (isReadOnly) return;
                                                            setFormData({ ...formData, logistics_data: { 
                                                                ...formData.logistics_data, 
                                                                start_time: e.target.value,
                                                                windows: [{ startTime: e.target.value, endTime: formData.logistics_data?.end_time || '12:00' }]
                                                            } });
                                                        }}
                                                        readOnly={isReadOnly}
                                                        style={{ width: '100%', height: '34px', padding: '0 0.6rem', borderRadius: '8px', border: `1px solid ${THEME.colors.border}`, fontWeight: '600', fontSize: '0.8rem', outline: 'none', backgroundColor: isReadOnly ? '#F8FAFC' : 'white', cursor: isReadOnly ? 'default' : 'pointer', fontFamily: THEME.typography.fontFamilySecondary }} 
                                                    />
                                                </div>
                                                <div>
                                                    <label style={{ fontSize: '0.65rem', fontWeight: '600', color: THEME.colors.textSecondary, display: 'block', marginBottom: '0.4rem', textTransform: 'uppercase', fontFamily: THEME.typography.fontFamilySecondary }}>FIN (MAX 19:00)</label>
                                                    <input 
                                                        type="time" 
                                                        value={formData.logistics_data?.end_time || '12:00'} 
                                                        onChange={(e) => {
                                                            if (isReadOnly) return;
                                                            setFormData({ ...formData, logistics_data: { 
                                                                ...formData.logistics_data, 
                                                                end_time: e.target.value,
                                                                windows: [{ startTime: formData.logistics_data?.start_time || '04:30', endTime: e.target.value }]
                                                            } });
                                                        }}
                                                        readOnly={isReadOnly}
                                                        style={{ width: '100%', height: '34px', padding: '0 0.6rem', borderRadius: '8px', border: `1px solid ${THEME.colors.border}`, fontWeight: '600', fontSize: '0.8rem', outline: 'none', backgroundColor: isReadOnly ? '#F8FAFC' : 'white', cursor: isReadOnly ? 'default' : 'pointer', fontFamily: THEME.typography.fontFamilySecondary }} 
                                                    />
                                                </div>
                                            </div>

                                            <div style={{ 
                                                backgroundColor: formData.logistics_data?.allowed_days?.length > 0 ? THEME.colors.primaryLight : '#F1F5F9', 
                                                padding: '1rem', 
                                                borderRadius: THEME.radius.lg, 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                gap: '12px',
                                                border: `1px solid ${formData.logistics_data?.allowed_days?.length > 0 ? THEME.colors.primary + '33' : THEME.colors.border}`,
                                                transition: 'all 0.3s'
                                            }}>
                                                <div style={{ 
                                                    width: '28px', height: '28px', 
                                                    backgroundColor: 'white', 
                                                    borderRadius: '50%', 
                                                    display: 'flex', 
                                                    alignItems: 'center', 
                                                    justifyContent: 'center', 
                                                    boxShadow: THEME.shadow.sm 
                                                }}>
                                                    {formData.logistics_data?.allowed_days?.length > 0 ? (
                                                        <Check size={14} strokeWidth={2.5} style={{ color: THEME.colors.primary }} />
                                                    ) : (
                                                        <AlertTriangle size={14} strokeWidth={1.5} style={{ color: THEME.colors.textSecondary }} />
                                                    )}
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: '0.75rem', fontWeight: '600', color: formData.logistics_data?.allowed_days?.length > 0 ? THEME.colors.textMain : THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilyMain }}>
                                                        {formData.logistics_data?.allowed_days?.length > 0 ? 'RESTRICCIÓN LISTA' : 'ESPERANDO DATOS'}
                                                    </div>
                                                    <div style={{ fontSize: '0.65rem', color: THEME.colors.textSecondary, fontWeight: '400', fontFamily: THEME.typography.fontFamilySecondary }}>
                                                        {formData.logistics_data?.allowed_days?.length > 0 ? 'Estructura JSON generada para el planeador.' : 'Completa la info para generar el JSON.'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </section>
                            )}

                            {/* BLOQUE: INFORMACIÓN FISCAL (SOLO MATRIZ) */}
                            {formData.is_corporate_parent && (
                                <section style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: THEME.radius.xl, border: `1px solid ${THEME.colors.border}` }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.2rem' }}>
                                        <div style={{ width: '32px', height: '32px', backgroundColor: THEME.colors.primaryLight, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FileText size={16} strokeWidth={1.5} style={{ color: THEME.colors.primary }} /></div>
                                        <h4 style={{ fontSize: '0.9rem', fontWeight: '600', color: THEME.colors.textMain, margin: 0, fontFamily: THEME.typography.fontFamilyMain }}>RÉGIMEN FISCAL</h4>
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.8rem', alignItems: 'center' }}>
                                        {[
                                            { label: 'Resp. IVA', key: 'iva_responsible' },
                                            { label: 'G. Contribuyente', key: 'is_gran_contribuyente' },
                                            { label: 'Autorretenedor', key: 'is_autorretenedor' },
                                            { label: 'Reg. Simple', key: 'is_regimen_simple' }
                                        ].map(tax => (
                                            <div 
                                                key={tax.key} 
                                                onClick={() => {
                                                    if (isReadOnly) return;
                                                    setFormData({...formData, [tax.key]: !formData[tax.key as keyof typeof formData]});
                                                }} 
                                                style={{ 
                                                    padding: '0.6rem 1.2rem', 
                                                    borderRadius: THEME.radius.md, 
                                                    border: `1.5px solid ${formData[tax.key as keyof typeof formData] ? THEME.colors.primary : THEME.colors.border}`, 
                                                    backgroundColor: formData[tax.key as keyof typeof formData] ? THEME.colors.primaryLight : 'white', 
                                                    cursor: isReadOnly ? 'default' : 'pointer', 
                                                    display: 'flex', 
                                                    alignItems: 'center', 
                                                    gap: '10px',
                                                    transition: 'all 0.2s',
                                                    boxShadow: formData[tax.key as keyof typeof formData] ? '0 2px 6px rgba(13, 122, 87, 0.1)' : 'none',
                                                    opacity: isReadOnly ? 0.9 : 1,
                                                    pointerEvents: isReadOnly ? 'none' : 'auto'
                                                }}
                                            >
                                                <div style={{ width: '12px', height: '12px', borderRadius: '4px', backgroundColor: formData[tax.key as keyof typeof formData] ? THEME.colors.primary : '#CBD5E1', border: `2px solid ${formData[tax.key as keyof typeof formData] ? 'white' : 'transparent'}` }}></div>
                                                <div style={{ fontSize: '0.75rem', fontWeight: '600', color: formData[tax.key as keyof typeof formData] ? THEME.colors.textMain : THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.02rem', fontFamily: THEME.typography.fontFamilySecondary }}>{tax.label}</div>
                                            </div>
                                        ))}
                                        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px', backgroundColor: THEME.colors.textMain, padding: '0.5rem 1rem', borderRadius: THEME.radius.md, boxShadow: THEME.shadow.sm }}>
                                            <label style={{ fontSize: '0.65rem', fontWeight: '600', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05rem', fontFamily: THEME.typography.fontFamilySecondary }}>CIIU</label>
                                            <input 
                                                type="text" 
                                                maxLength={4}
                                                value={formData.economic_activity_code} 
                                                onChange={(e) => {
                                                    if (isReadOnly) return;
                                                    setFormData({...formData, economic_activity_code: e.target.value.replace(/\D/g, '')});
                                                }} 
                                                readOnly={isReadOnly}
                                                placeholder="0000"
                                                style={{ width: '50px', height: '24px', border: 'none', borderBottom: `2px solid ${THEME.colors.border}`, textAlign: 'center', fontWeight: '600', fontSize: '1rem', color: 'white', outline: 'none', backgroundColor: 'transparent', cursor: isReadOnly ? 'default' : 'text', fontFamily: THEME.typography.fontFamilySecondary }}
                                            />
                                        </div>
                                    </div>
                                </section>
                            )}

                            {/* BLOQUE: EXPEDIENTE DIGITAL (SOLO MATRIZ) */}
                            {formData.is_corporate_parent && (
                                <section style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: THEME.radius.xl, border: `1px solid ${THEME.colors.border}` }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.2rem' }}>
                                        <div style={{ width: '32px', height: '32px', backgroundColor: THEME.colors.primaryLight, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Folder size={16} strokeWidth={1.5} style={{ color: THEME.colors.primary }} /></div>
                                        <h4 style={{ fontSize: '0.9rem', fontWeight: '600', color: THEME.colors.textMain, margin: 0, fontFamily: THEME.typography.fontFamilyMain }}>EXPEDIENTE DIGITAL</h4>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        <DocumentUploadField label="Registro RUT (PDF)" url={formData.rut_url} onUpload={(url) => setFormData({...formData, rut_url: url})} readOnly={isReadOnly} />
                                        <DocumentUploadField label="Cámara de Comercio" url={formData.mercantile_registry_url} onUpload={(url) => setFormData({...formData, mercantile_registry_url: url})} readOnly={isReadOnly} />
                                        <DocumentUploadField label="Cédula Representante Legal" url={formData.legal_rep_id_url} onUpload={(url) => setFormData({...formData, legal_rep_id_url: url})} readOnly={isReadOnly} />
                                        <DocumentUploadField 
                                            label="Referencias Comerciales" 
                                            urls={formData.commercial_references_urls} 
                                            onUploadMultiple={(urls) => setFormData({...formData, commercial_references_urls: urls})} 
                                            readOnly={isReadOnly} 
                                        />
                                    </div>
                                </section>
                            )}

                    </div>
                    <div style={{ display: 'flex', gap: '1.5rem', marginTop: '3rem' }}>
                        <button type="button" onClick={onClose} style={{ flex: 1, padding: '1.2rem', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, background: 'white', color: THEME.colors.textSecondary, fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s', fontFamily: THEME.typography.fontFamilySecondary }}>{isReadOnly ? 'CERRAR' : 'CANCELAR'}</button>
                        {!isReadOnly && (
                            <button type="submit" disabled={saving} style={{ flex: 2, padding: '1.2rem', borderRadius: THEME.radius.lg, border: 'none', background: THEME.colors.primary, color: 'white', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s', fontFamily: THEME.typography.fontFamilyMain }}>
                                {saving ? (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                        <Loader2 size={16} className="animate-spin" /> GUARDANDO...
                                    </div>
                                ) : `GUARDAR ${formData.is_corporate_parent ? 'CASA MATRIZ' : 'SUCURSAL'}`}
                            </button>
                        )}
                    </div>
                </form>
                )}
            </div>

            {/* MODAL PARA GENERAR CREDENCIALES B2B */}
            {showCredentialModal && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '1rem' }}>
                    <div style={{ backgroundColor: 'white', borderRadius: '24px', padding: '2rem', width: '100%', maxWidth: '460px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: '900', color: THEME.colors.textMain, margin: '0 0 1rem', fontFamily: THEME.typography.fontFamilyMain, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Lock size={20} color={THEME.colors.primary} /> Otorgar Acceso B2B
                        </h3>
                        
                        {!generatedCreds ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                                <p style={{ fontSize: '0.8rem', color: '#64748B', margin: 0, lineHeight: '1.4' }}>
                                    Esto creará un usuario de inicio de sesión en Supabase Auth y lo vinculará automáticamente al perfil comercial actual.
                                </p>
                                
                                <FormField 
                                    label="Confirmar Correo de Acceso" 
                                    value={tempEmail} 
                                    onChange={setTempEmail} 
                                    required 
                                />
                                
                                <FormField 
                                    label="Contraseña Temporal" 
                                    value={tempPassword} 
                                    onChange={setTempPassword} 
                                    required 
                                />

                                <div style={{ display: 'flex', gap: '0.8rem', marginTop: '0.5rem' }}>
                                    <button 
                                        type="button"
                                        onClick={() => setShowCredentialModal(false)}
                                        style={{ flex: 1, padding: '0.6rem', border: '1px solid #D1D5DB', borderRadius: '10px', background: 'white', color: '#475569', fontWeight: '700', fontSize: '0.8rem', cursor: 'pointer' }}
                                    >
                                        Cancelar
                                    </button>
                                    <button 
                                        type="button"
                                        disabled={generatingAccess}
                                        onClick={async () => {
                                            if (!tempEmail || !tempPassword) return alert('Email y contraseña son obligatorios');
                                            setGeneratingAccess(true);
                                            try {
                                                const { data: { session } } = await supabase.auth.getSession();
                                                const token = session?.access_token;
                                                if (!token) return alert('Sesión de administrador no válida');

                                                const res = await fetch('/api/b2b/create-account', {
                                                    method: 'POST',
                                                    headers: {
                                                        'Content-Type': 'application/json',
                                                        'Authorization': `Bearer ${token}`
                                                    },
                                                    body: JSON.stringify({
                                                        profileId: editData.id,
                                                        email: tempEmail,
                                                        password: tempPassword
                                                    })
                                                });
                                                const data = await res.json();
                                                if (res.ok && data.success) {
                                                    setGeneratedCreds({ email: tempEmail, pass: tempPassword });
                                                    checkB2bAccess();
                                                } else {
                                                    alert(data.error || 'Error al generar credenciales');
                                                }
                                            } catch (err: any) {
                                                alert('Error de red: ' + err.message);
                                            } finally {
                                                setGeneratingAccess(false);
                                            }
                                        }}
                                        style={{ flex: 1, padding: '0.6rem', border: 'none', borderRadius: '10px', background: THEME.colors.primary, color: 'white', fontWeight: '700', fontSize: '0.8rem', cursor: 'pointer' }}
                                    >
                                        {generatingAccess ? 'Generando...' : 'Confirmar Acceso'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                                <div style={{ backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0', padding: '1rem', borderRadius: '16px', color: '#047857', fontSize: '0.8rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    ✓ ACCESO CREADO CON ÉXITO
                                </div>
                                <p style={{ fontSize: '0.8rem', color: '#475569', margin: 0, lineHeight: '1.4' }}>
                                    Por favor copia estas credenciales temporales y compártelas de forma segura con el cliente institucional. Se le solicitará cambiar la contraseña en su primer ingreso.
                                </p>
                                
                                <div style={{ backgroundColor: '#F8FAFC', padding: '1rem', borderRadius: '12px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                    <div>
                                        <span style={{ fontSize: '0.6rem', fontWeight: '800', color: '#94A3B8', display: 'block', textTransform: 'uppercase' }}>Usuario / Email</span>
                                        <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#1E293B' }}>{generatedCreds.email}</span>
                                    </div>
                                    <div>
                                        <span style={{ fontSize: '0.6rem', fontWeight: '800', color: '#94A3B8', display: 'block', textTransform: 'uppercase' }}>Contraseña Temporal</span>
                                        <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#1E293B', fontFamily: 'monospace' }}>{generatedCreds.pass}</span>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '0.8rem', marginTop: '0.5rem' }}>
                                    <button 
                                        type="button"
                                        onClick={async () => {
                                            try {
                                                await navigator.clipboard.writeText(`Credenciales FruFresco B2B:\nUsuario: ${generatedCreds.email}\nContraseña: ${generatedCreds.pass}\nIngresar en: ${window.location.origin}/login`);
                                                alert('¡Credenciales copiadas al portapapeles!');
                                            } catch (e) {
                                                alert('No se pudo copiar automáticamente. Por favor cópialas manualmente.');
                                            }
                                        }}
                                        style={{ flex: 1, padding: '0.6rem', border: `1px solid ${THEME.colors.primary}`, borderRadius: '10px', background: 'white', color: THEME.colors.primary, fontWeight: '700', fontSize: '0.8rem', cursor: 'pointer' }}
                                    >
                                        Copiar Datos
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => setShowCredentialModal(false)}
                                        style={{ flex: 1, padding: '0.6rem', border: 'none', borderRadius: '10px', background: THEME.colors.primary, color: 'white', fontWeight: '700', fontSize: '0.8rem', cursor: 'pointer' }}
                                    >
                                        Entendido
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}



function FormField({ label, value, onChange, type = 'text', required = false, step = undefined, readOnly = false, placeholder = '' }: { label: string, value: string | number | undefined, onChange: (v: string) => void, type?: string, required?: boolean, step?: string, readOnly?: boolean, placeholder?: string }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <label style={{ fontSize: '0.65rem', fontWeight: '900', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.02rem' }}>
                {label} {required && <span style={{ color: '#EF4444' }}>*</span>}
            </label>
            <input 
                type={type}
                step={step}
                value={value || ''}
                onChange={(e) => onChange(e.target.value)}
                required={required}
                readOnly={readOnly}
                placeholder={placeholder}
                style={{ 
                    width: '100%', 
                    height: '34px',
                    padding: '0 0.6rem', 
                    borderRadius: '8px', 
                    border: '1px solid #E2E8F0', 
                    outline: 'none', 
                    fontWeight: '600',
                    fontSize: '0.8rem',
                    backgroundColor: readOnly ? '#F8FAFC' : 'white'
                }}
            />
        </div>
    );
}

function DocumentUploadField({ 
    label, 
    url, 
    urls, 
    onUpload, 
    onUploadMultiple, 
    readOnly = false 
}: { 
    label: string, 
    url?: string, 
    urls?: string[], 
    onUpload?: (url: string) => void, 
    onUploadMultiple?: (urls: string[]) => void, 
    readOnly?: boolean 
}) {
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const isMultiple = !!onUploadMultiple || !!urls;
    const count = isMultiple ? (urls?.length || 0) : (url ? 1 : 0);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random()}.${fileExt}`;
            const filePath = `documents/${Date.now()}_${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('client-documents')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('client-documents')
                .getPublicUrl(filePath);
            
            if (isMultiple) {
                const currentUrls = urls || [];
                onUploadMultiple?.([...currentUrls, publicUrl]);
            } else {
                onUpload?.(publicUrl);
            }
            window.showToast?.(`Archivo subido correctamente`, 'success');
        } catch (err: any) {
            console.error('Error uploading document:', err);
            window.showToast?.(`Error: ${err.message}`, 'error');
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.8rem', backgroundColor: '#F8FAFC', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '28px', height: '28px', backgroundColor: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm }}>
                        {count > 0 ? (
                            <Check size={14} strokeWidth={2.5} style={{ color: THEME.colors.primary }} />
                        ) : (
                            <FileText size={14} strokeWidth={1.5} style={{ color: THEME.colors.textSecondary }} />
                        )}
                    </div>
                    <div style={{ fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textMain, textTransform: 'uppercase', fontFamily: THEME.typography.fontFamilySecondary }}>{label}</div>
                </div>
                
                {/* Count Badge / Status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {count === 0 ? (
                        <span style={{ 
                            fontSize: '0.65rem', 
                            color: '#EF4444', 
                            backgroundColor: '#FEF2F2', 
                            padding: '0.2rem 0.5rem', 
                            borderRadius: '6px', 
                            fontWeight: '700', 
                            fontFamily: THEME.typography.fontFamilySecondary 
                        }}>
                            PENDIENTE
                        </span>
                    ) : (
                        <span style={{ 
                            fontSize: '0.65rem', 
                            color: '#047857', 
                            backgroundColor: '#ECFDF5', 
                            padding: '0.2rem 0.5rem', 
                            borderRadius: '6px', 
                            fontWeight: '700', 
                            fontFamily: THEME.typography.fontFamilySecondary 
                        }}>
                            {count} {count === 1 ? 'DOCUMENTO' : 'DOCUMENTOS'}
                        </span>
                    )}

                    <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} accept="application/pdf,image/*" />
                    
                    {!readOnly && (!isMultiple ? !url : true) && (
                        <button 
                            type="button" 
                            onClick={() => fileInputRef.current?.click()} 
                            disabled={uploading}
                            style={{ 
                                padding: '0.4rem 0.8rem', 
                                borderRadius: THEME.radius.sm, 
                                backgroundColor: uploading ? '#E2E8F0' : THEME.colors.primary, 
                                color: 'white', 
                                fontSize: '0.65rem', 
                                fontWeight: '600', 
                                border: 'none', 
                                cursor: 'pointer', 
                                fontFamily: THEME.typography.fontFamilySecondary 
                            }}
                        >
                            {uploading ? '...' : 'SUBIR'}
                        </button>
                    )}
                </div>
            </div>

            {/* Documents List details section */}
            {count > 0 && (
                <div style={{ 
                    borderTop: `1px solid ${THEME.colors.border}`, 
                    paddingTop: '0.5rem', 
                    marginTop: '0.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.4rem'
                }}>
                    {!isMultiple ? (
                        // Single document view row
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilySecondary }}>Archivo principal cargado</span>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <a href={url} target="_blank" rel="noreferrer" style={{ padding: '0.3rem 0.6rem', borderRadius: THEME.radius.sm, backgroundColor: 'white', color: THEME.colors.primary, fontSize: '0.65rem', fontWeight: '600', textDecoration: 'none', border: `1px solid ${THEME.colors.border}`, display: 'flex', alignItems: 'center', fontFamily: THEME.typography.fontFamilySecondary }}>VER</a>
                                {!readOnly && (
                                    <button 
                                        type="button" 
                                        onClick={() => fileInputRef.current?.click()}
                                        style={{ padding: '0.3rem 0.6rem', borderRadius: THEME.radius.sm, backgroundColor: 'white', color: THEME.colors.textSecondary, fontSize: '0.65rem', fontWeight: '600', border: `1px solid ${THEME.colors.border}`, cursor: 'pointer', fontFamily: THEME.typography.fontFamilySecondary }}
                                    >
                                        CAMBIAR
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : (
                        // Multiple documents view list
                        urls && urls.map((u, idx) => {
                            const cleanName = `Documento #${idx + 1}`;
                            return (
                                <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'white', padding: '0.4rem 0.6rem', borderRadius: '4px', border: '1px solid #E2E8F0' }}>
                                    <span style={{ fontSize: '0.7rem', color: THEME.colors.textMain, fontWeight: '500', fontFamily: THEME.typography.fontFamilySecondary }}>{cleanName}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <a href={u} target="_blank" rel="noreferrer" style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', backgroundColor: 'white', color: THEME.colors.primary, fontSize: '0.65rem', fontWeight: '600', textDecoration: 'none', border: `1px solid ${THEME.colors.border}`, display: 'flex', alignItems: 'center', fontFamily: THEME.typography.fontFamilySecondary }}>VER</a>
                                        {!readOnly && (
                                            <button 
                                                type="button" 
                                                onClick={() => {
                                                    const updated = urls.filter((_, i) => i !== idx);
                                                    onUploadMultiple?.(updated);
                                                }}
                                                style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
                                                title="Eliminar referencia"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
}

function ClientExceptionsModal({ clientId, onClose, readOnly = false }: { clientId: string, onClose: () => void, readOnly?: boolean }) {
    const [exceptions, setExceptions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [products, setProducts] = useState<any[]>([]);
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const scrollableRef = useRef<HTMLDivElement>(null);
    
    const [newException, setNewException] = useState<any>({
        product_id: '',
        nickname: '',
        picking_note: '',
        substitution_product_id: '',
        delivery_note: '',
        preferred_options: {}
    });
    const [searchTerm, setSearchTerm] = useState('');
    const [showResults, setShowResults] = useState(false);

    // Substitution Search states
    const [subSearchTerm, setSubSearchTerm] = useState('');
    const [showSubResults, setShowSubResults] = useState(false);
    const [showGuide, setShowGuide] = useState(false);
    const [focusedProdIndex, setFocusedProdIndex] = useState(-1);
    const [focusedSubIndex, setFocusedSubIndex] = useState(-1);

    const fetchData = async () => {
        setLoading(true);
        const { data: excData } = await supabase
            .from('product_nicknames')
            .select('*')
            .eq('customer_id', clientId);
        
        const { data: prodData } = await supabase
            .from('products')
            .select('id, name, sku, options_config, accounting_id')
            .eq('is_active', true);

        if (excData) setExceptions(excData);
        if (prodData) setProducts(prodData);
        setLoading(false);
    };

    useEffect(() => { fetchData(); }, [clientId]);

    useEffect(() => {
        if (focusedProdIndex >= 0) {
            const container = document.getElementById('original-prod-dropdown');
            const element = document.getElementById(`orig-item-${focusedProdIndex}`);
            if (container && element) {
                const containerTop = container.scrollTop;
                const containerBottom = containerTop + container.clientHeight;
                const elemTop = element.offsetTop;
                const elemBottom = elemTop + element.offsetHeight;
                
                if (elemTop < containerTop) {
                    container.scrollTop = elemTop;
                } else if (elemBottom > containerBottom) {
                    container.scrollTop = elemBottom - container.clientHeight;
                }
            }
        }
    }, [focusedProdIndex]);

    useEffect(() => {
        if (focusedSubIndex >= 0) {
            const container = document.getElementById('sub-prod-dropdown');
            const element = document.getElementById(`sub-item-${focusedSubIndex}`);
            if (container && element) {
                const containerTop = container.scrollTop;
                const containerBottom = containerTop + container.clientHeight;
                const elemTop = element.offsetTop;
                const elemBottom = elemTop + element.offsetHeight;
                
                if (elemTop < containerTop) {
                    container.scrollTop = elemTop;
                } else if (elemBottom > containerBottom) {
                    container.scrollTop = elemBottom - container.clientHeight;
                }
            }
        }
    }, [focusedSubIndex]);

    const handleSave = async () => {
        if (!newException.product_id) return;
        
        const payload = {
            customer_id: clientId,
            product_id: newException.product_id,
            nickname: newException.nickname || '',
            picking_note: newException.picking_note || '',
            substitution_product_id: newException.substitution_product_id || null,
            delivery_note: newException.delivery_note || '',
            preferred_options: newException.preferred_options || {}
        };

        const { error } = editingId 
            ? await supabase.from('product_nicknames').update(payload).eq('id', editingId)
            : await supabase.from('product_nicknames').insert([payload]);
        
        if (error) {
            window.showToast?.(`Error [${error.code}]: ${error.message}`, 'error');
        } else {
            window.showToast?.(editingId ? 'Excepción actualizada' : 'Excepción guardada', 'success');
            setIsAdding(false);
            setEditingId(null);
            setNewException({ product_id: '', nickname: '', picking_note: '', substitution_product_id: '', delivery_note: '', preferred_options: {} });
            setSearchTerm('');
            setSubSearchTerm('');
            fetchData();
        }
    };

    const handleDelete = async (id: string) => {
        const { error } = await supabase
            .from('product_nicknames')
            .delete()
            .eq('id', id);
        if (!error) fetchData();
    };

    const handleExportExcel = () => {
        try {
            // 1. Prepare data for sheet 1: Excepciones y Notas
            const sheet1Data = products.map(p => {
                const exc = exceptions.find(e => e.product_id === p.id);
                const subProduct = exc?.substitution_product_id ? products.find(prod => prod.id === exc.substitution_product_id) : null;
                
                let varString = '';
                if (exc?.preferred_options && Object.keys(exc.preferred_options).length > 0) {
                    varString = Object.entries(exc.preferred_options)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(' | ');
                }

                return {
                    'CODIGO_CONTABLE': p.accounting_id || '',
                    'PRODUCTO': p.name || '',
                    'NOMBRE_FACTURA': exc?.nickname || '',
                    'VARIACION_REQUERIDA': varString,
                    'NOTA_PICKING': exc?.picking_note || '',
                    'SUSTITUTO_CODIGO_CONTABLE': subProduct?.accounting_id || '',
                    'NOTA_ENTREGA': exc?.delivery_note || ''
                };
            });

            // 2. Prepare data for sheet 2: Variantes Estandarizadas
            const sheet2Data: any[] = [];
            products.forEach(p => {
                if (p.options_config && p.options_config.length > 0) {
                    p.options_config.forEach((opt: any) => {
                        sheet2Data.push({
                            'CODIGO_CONTABLE': p.accounting_id || '',
                            'PRODUCTO': p.name || '',
                            'ATRIBUTO': opt.name || '',
                            'VALORES_PERMITIDOS': opt.values ? opt.values.join(', ') : ''
                        });
                    });
                } else {
                    sheet2Data.push({
                        'CODIGO_CONTABLE': p.accounting_id || '',
                        'PRODUCTO': p.name || '',
                        'ATRIBUTO': 'Sin atributos',
                        'VALORES_PERMITIDOS': 'Producto base'
                    });
                }
            });

            const wb = XLSX.utils.book_new();
            const ws1 = XLSX.utils.json_to_sheet(sheet1Data);
            XLSX.utils.book_append_sheet(wb, ws1, 'Excepciones y Notas');
            
            const ws2 = XLSX.utils.json_to_sheet(sheet2Data);
            XLSX.utils.book_append_sheet(wb, ws2, 'Variantes Estandarizadas');

            XLSX.writeFile(wb, `Excepciones_Logisticas_B2B_${clientId.slice(0,8)}.xlsx`);
            window.showToast?.('Planilla descargada con éxito', 'success');
        } catch (err: any) {
            console.error('Error exporting Excel:', err);
            window.showToast?.('Error al descargar planilla: ' + err.message, 'error');
        }
    };

    const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        setLoading(true);
        try {
            const reader = new FileReader();
            reader.onload = async (evt) => {
                try {
                    const bstr = evt.target?.result;
                    const wb = XLSX.read(bstr, { type: 'binary' });
                    
                    const wsname = wb.SheetNames[0];
                    const ws = wb.Sheets[wsname];
                    const rawData: any[] = XLSX.utils.sheet_to_json(ws);
                    
                    if (rawData.length === 0) {
                        throw new Error('La planilla está vacía.');
                    }

                    const upsertRows: any[] = [];
                    
                    for (let i = 0; i < rawData.length; i++) {
                        const row = rawData[i];
                        const rowNum = i + 2;
                        
                        const accId = row.CODIGO_CONTABLE;
                        if (accId === undefined || accId === '') continue;

                        const product = products.find(p => String(p.accounting_id) === String(accId));
                        if (!product) {
                            throw new Error(`Fila ${rowNum}: El Código Contable "${accId}" no corresponde a ningún producto activo.`);
                        }

                        const varReq = row.VARIACION_REQUERIDA || '';
                        const parsedPrefOptions: Record<string, string> = {};
                        
                        if (varReq.trim()) {
                            const parts = String(varReq).split('|');
                            for (const part of parts) {
                                const kv = part.split(':');
                                if (kv.length !== 2) {
                                    throw new Error(`Fila ${rowNum}: Formato de variación inválido en "${part}". Debe ser "Atributo: Valor" y estar separado por barra vertical (|).`);
                                }
                                const attrName = kv[0].trim();
                                const attrVal = kv[1].trim();
                                
                                const configOpt = product.options_config?.find((opt: any) => opt.name.toLowerCase() === attrName.toLowerCase());
                                if (!configOpt) {
                                    throw new Error(`Fila ${rowNum}: El atributo "${attrName}" no está configurado para el producto "${product.name}".`);
                                }
                                
                                const valAllowed = configOpt.values?.find((v: string) => v.toLowerCase() === attrVal.toLowerCase());
                                if (!valAllowed) {
                                    throw new Error(`Fila ${rowNum}: El valor "${attrVal}" no es válido para el atributo "${configOpt.name}". Opciones válidas: ${configOpt.values?.join(', ')}.`);
                                }

                                parsedPrefOptions[configOpt.name] = valAllowed;
                            }
                        }

                        let substitutionProductId = null;
                        const subAccId = row.SUSTITUTO_CODIGO_CONTABLE;
                        if (subAccId !== undefined && subAccId !== '') {
                            const subProduct = products.find(p => String(p.accounting_id) === String(subAccId));
                            if (!subProduct) {
                                throw new Error(`Fila ${rowNum}: El Código Contable del Sustituto "${subAccId}" no corresponde a ningún producto activo.`);
                            }
                            if (subProduct.id === product.id) {
                                throw new Error(`Fila ${rowNum}: El producto sustituto no puede ser el mismo producto original.`);
                            }
                            substitutionProductId = subProduct.id;
                        }

                        const nickname = String(row.NOMBRE_FACTURA || '').trim();
                        const pickingNote = String(row.NOTA_PICKING || '').trim();
                        const deliveryNote = String(row.NOTA_ENTREGA || '').trim();

                        const existingExc = exceptions.find(e => e.product_id === product.id);

                        if (nickname || pickingNote || deliveryNote || Object.keys(parsedPrefOptions).length > 0 || substitutionProductId) {
                            upsertRows.push({
                                id: existingExc?.id || undefined,
                                customer_id: clientId,
                                product_id: product.id,
                                nickname: nickname || null,
                                picking_note: pickingNote || null,
                                substitution_product_id: substitutionProductId,
                                delivery_note: deliveryNote || null,
                                preferred_options: parsedPrefOptions
                            });
                        } else if (existingExc) {
                            await supabase.from('product_nicknames').delete().eq('id', existingExc.id);
                        }
                    }

                    if (upsertRows.length > 0) {
                        const { error: upsertErr } = await supabase
                            .from('product_nicknames')
                            .upsert(upsertRows);
                        
                        if (upsertErr) throw upsertErr;
                    }

                    window.showToast?.('Planilla cargada y excepciones sincronizadas con éxito', 'success');
                    fetchData();
                } catch (err: any) {
                    console.error('Error parsing sheet:', err);
                    window.showToast?.(err.message || 'Error al procesar planilla', 'error');
                } finally {
                    setLoading(false);
                    e.target.value = '';
                }
            };
            reader.readAsBinaryString(file);
        } catch (err: any) {
            console.error('Error reading file:', err);
            window.showToast?.('Error al leer el archivo', 'error');
            setLoading(false);
        }
    };

    // Find original product helper
    const getProductDetails = (id: string) => {
        return products.find(p => p.id === id);
    };

    const selectedOriginalProd = getProductDetails(newException.product_id);

    return (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '2rem' }}>
            <div style={{ backgroundColor: 'white', borderRadius: THEME.radius.xl, width: '100%', maxWidth: '800px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: THEME.shadow.lg, border: `1px solid ${THEME.colors.border}` }}>
                <header style={{ padding: '2rem', borderBottom: `1px solid ${THEME.colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Sliders size={20} strokeWidth={1.5} style={{ color: THEME.colors.primary }} />
                            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600', color: THEME.colors.textMain, fontFamily: THEME.typography.fontFamilyMain }}>
                                {readOnly ? 'Consulta de Excepciones' : 'Excepciones Logísticas'}
                            </h3>
                        </div>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilySecondary }}>{readOnly ? 'Visualizando nombres de factura y especificaciones logísticas.' : 'Personaliza variantes, sustitutos y notas de picking/despacho para este cliente.'}</p>
                    </div>
                    <button 
                        onClick={onClose} 
                        style={{ 
                            border: 'none', 
                            background: '#F1F5F9', 
                            width: '32px', 
                            height: '32px', 
                            borderRadius: '8px', 
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#E2E8F0'}
                        onMouseLeave={(e) => e.currentTarget.style.background = '#F1F5F9'}
                    >
                        <X size={16} style={{ color: THEME.colors.textSecondary }} />
                    </button>
                </header>

                <div ref={scrollableRef} style={{ padding: '2rem', flex: 1, overflowY: 'auto' }}>
                    {/* INSTRUCTIVO DE USO E IMPORTACIÓN/EXPORTACIÓN */}
                    <div style={{ marginBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: showGuide ? '1rem' : '0' }}>
                            <button
                                onClick={() => setShowGuide(!showGuide)}
                                style={{
                                    background: '#EFF6FF',
                                    border: '1px solid #BFDBFE',
                                    color: '#1D4ED8',
                                    padding: '8px 16px',
                                    borderRadius: '8px',
                                    fontSize: '0.75rem',
                                    fontWeight: '700',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    transition: 'all 0.2s',
                                    fontFamily: THEME.typography.fontFamilySecondary
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#DBEAFE'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#EFF6FF'}
                            >
                                📖 {showGuide ? 'Ocultar Instructivo de Uso' : 'Ver Instructivo (Guía Operativa)'}
                            </button>

                            {!readOnly && (
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        onClick={handleExportExcel}
                                        type="button"
                                        style={{
                                            background: '#ECFDF5',
                                            border: '1px solid #A7F3D0',
                                            color: '#047857',
                                            padding: '8px 16px',
                                            borderRadius: '8px',
                                            fontSize: '0.75rem',
                                            fontWeight: '700',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            transition: 'all 0.2s',
                                            fontFamily: THEME.typography.fontFamilySecondary
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#D1FAE5'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ECFDF5'}
                                    >
                                        📥 Descargar Planilla
                                    </button>

                                    <label
                                        style={{
                                            background: '#EEF2FF',
                                            border: '1px solid #C7D2FE',
                                            color: '#4F46E5',
                                            padding: '8px 16px',
                                            borderRadius: '8px',
                                            fontSize: '0.75rem',
                                            fontWeight: '700',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            transition: 'all 0.2s',
                                            fontFamily: THEME.typography.fontFamilySecondary
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#E0E7FF'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#EEF2FF'}
                                    >
                                        📤 Cargar Planilla
                                        <input 
                                            type="file" 
                                            accept=".xlsx, .xls" 
                                            onChange={handleImportExcel} 
                                            style={{ display: 'none' }} 
                                        />
                                    </label>
                                </div>
                            )}
                        </div>

                        {showGuide && (
                            <div style={{
                                marginTop: '8px',
                                padding: '1.2rem',
                                backgroundColor: '#F0F9FF',
                                border: '1px solid #BAE6FD',
                                borderRadius: THEME.radius.lg,
                                fontFamily: THEME.typography.fontFamilySecondary,
                                fontSize: '0.8rem',
                                color: '#0369A1',
                                animation: 'fadeSlideDown 0.15s ease-out'
                            }}>
                                <h4 style={{ margin: '0 0 8px 0', fontSize: '0.85rem', fontWeight: '800', color: '#0284C7', textTransform: 'uppercase' }}>
                                    Guía de Excepciones y Particularidades del Cliente
                                </h4>
                                <p style={{ margin: '0 0 12px 0', lineHeight: '1.4' }}>
                                    Esta sección permite configurar cómo debe comportarse el catálogo de productos específicamente para este cliente institucional. Las reglas se dividen en las siguientes particularidades:
                                </p>
                                <ul style={{ margin: 0, paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <li>
                                        <strong>🔄 Productos de Reemplazo (Sustitución):</strong> 
                                        Define qué producto alternativo ofrecer si el original no está disponible. Al agregar el producto original, el sistema <em>propondrá y permitirá cambiarlo</em> de inmediato con un clic.
                                    </li>
                                    <li>
                                        <strong>📦 Notas Logísticas y Alias de Facturación:</strong>
                                        <ul style={{ margin: '4px 0 0 0', paddingLeft: '1rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            <li><u>Alias (Nombre Factura):</u> Sobrescribe el nombre impreso en la factura o remisión.</li>
                                            <li><u>Nota del cliente:</u> Indicaciones de empaque y preparación solicitadas por el cliente (ej: <em>Bolsa microperforada, 130grs</em>).</li>
                                        </ul>
                                    </li>
                                </ul>
                            </div>
                        )}
                    </div>

                    {!readOnly && !isAdding && (
                        <button 
                            onClick={() => {
                                setIsAdding(true);
                                scrollableRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            style={{ 
                                width: '100%', 
                                padding: '1rem', 
                                borderRadius: THEME.radius.md, 
                                border: `2px dashed ${THEME.colors.border}`, 
                                background: '#F8FAFC', 
                                color: THEME.colors.textSecondary, 
                                fontWeight: '600', 
                                cursor: 'pointer', 
                                marginBottom: '2rem',
                                fontFamily: THEME.typography.fontFamilySecondary,
                                fontSize: '0.8rem',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = THEME.colors.primaryLight; e.currentTarget.style.borderColor = THEME.colors.primary; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#F8FAFC'; e.currentTarget.style.borderColor = THEME.colors.border; }}
                        >
                            + Agregar nueva regla personalizada
                        </button>
                    )}

                    {!readOnly && isAdding && (
                        <div style={{ backgroundColor: '#F8FAFC', padding: '1.5rem', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, marginBottom: '2rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                                
                                {/* A. PRODUCTO ORIGINAL */}
                                <div>
                                    <label style={{ fontSize: '0.65rem', fontWeight: '600', color: THEME.colors.textSecondary, display: 'block', marginBottom: '6px', textTransform: 'uppercase', fontFamily: THEME.typography.fontFamilySecondary }}>Producto Original (Buscador)</label>
                                    <div style={{ position: 'relative' }}>
                                        <div style={{ position: 'relative' }}>
                                            <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                                                <Search size={16} style={{ color: THEME.colors.textSecondary }} />
                                            </span>
                                            <input 
                                                type="text"
                                                placeholder="Buscar por nombre o SKU..."
                                                value={searchTerm}
                                                onChange={(e) => {
                                                    setSearchTerm(e.target.value);
                                                    setShowResults(true);
                                                    setFocusedProdIndex(-1);
                                                }}
                                                onKeyDown={(e) => {
                                                    if (!showResults || searchTerm.length === 0) return;
                                                    const filtered = products.filter(p => 
                                                        p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                                        p.sku.toLowerCase().includes(searchTerm.toLowerCase())
                                                    ).slice(0, 10);
                                                    
                                                    if (e.key === 'ArrowDown') {
                                                        e.preventDefault();
                                                        setFocusedProdIndex(prev => (prev + 1) % filtered.length);
                                                    } else if (e.key === 'ArrowUp') {
                                                        e.preventDefault();
                                                        setFocusedProdIndex(prev => (prev - 1 + filtered.length) % filtered.length);
                                                    } else if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        const targetIndex = focusedProdIndex >= 0 && focusedProdIndex < filtered.length ? focusedProdIndex : 0;
                                                        const p = filtered[targetIndex];
                                                        if (p) {
                                                            setNewException(prev => ({...prev, product_id: p.id, preferred_options: {}}));
                                                            setSearchTerm(`[${p.accounting_id || p.sku}] ${p.name}`);
                                                            setShowResults(false);
                                                            setFocusedProdIndex(-1);
                                                        }
                                                    }
                                                }}
                                                onFocus={() => setShowResults(true)}
                                                style={{ 
                                                    width: '100%', 
                                                    height: '38px', 
                                                    padding: '0 1rem 0 2.8rem', 
                                                    borderRadius: '8px', 
                                                    border: `1px solid ${THEME.colors.border}`, 
                                                    fontWeight: '500',
                                                    fontSize: '0.85rem',
                                                    outline: 'none',
                                                    transition: 'all 0.2s',
                                                    backgroundColor: 'white',
                                                    fontFamily: THEME.typography.fontFamilySecondary
                                                }}
                                                onBlur={() => setTimeout(() => {
                                                    setShowResults(false);
                                                    setFocusedProdIndex(-1);
                                                }, 200)}
                                            />
                                            {newException.product_id && (
                                                <div style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center' }}>
                                                    <span style={{ backgroundColor: THEME.colors.primaryLight, color: THEME.colors.primary, padding: '4px 8px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: THEME.typography.fontFamilySecondary }}>
                                                        <Check size={12} strokeWidth={2.5} /> SELECCIONADO
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {showResults && searchTerm.length > 0 && (
                                            <div 
                                                id="original-prod-dropdown"
                                                style={{ 
                                                    position: 'absolute', top: '100%', left: 0, right: 0, 
                                                    backgroundColor: 'white', borderRadius: '12px', border: `1px solid ${THEME.colors.border}`, 
                                                    boxShadow: THEME.shadow.lg, 
                                                    zIndex: 10, marginTop: '8px', maxHeight: '200px', overflowY: 'auto' 
                                                }}
                                            >
                                                {products
                                                    .filter(p => 
                                                        p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                                        p.sku.toLowerCase().includes(searchTerm.toLowerCase())
                                                    )
                                                    .slice(0, 10)
                                                    .map((p, idx) => (
                                                        <div 
                                                            key={p.id}
                                                            id={`orig-item-${idx}`}
                                                            onClick={() => {
                                                                setNewException(prev => ({...prev, product_id: p.id, preferred_options: {}}));
                                                                setSearchTerm(`[${p.accounting_id || p.sku}] ${p.name}`);
                                                                setShowResults(false);
                                                                setFocusedProdIndex(-1);
                                                            }}
                                                            style={{ 
                                                                padding: '0.8rem 1.2rem', cursor: 'pointer', borderBottom: `1px solid ${THEME.colors.border}`,
                                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                                transition: 'background 0.2s',
                                                                backgroundColor: idx === focusedProdIndex ? '#F1F5F9' : 'white'
                                                            }}
                                                            onMouseEnter={() => setFocusedProdIndex(idx)}
                                                            onMouseLeave={() => setFocusedProdIndex(-1)}
                                                        >
                                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                <span style={{ fontSize: '0.85rem', fontWeight: '600', color: THEME.colors.textMain, fontFamily: THEME.typography.fontFamilySecondary }}>{p.name}</span>
                                                                <span style={{ fontSize: '0.65rem', fontWeight: '500', color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilySecondary }}>ID: {p.accounting_id || p.sku}</span>
                                                            </div>
                                                            <span style={{ color: THEME.colors.primary, fontSize: '0.95rem', fontWeight: '600' }}>＋</span>
                                                        </div>
                                                    ))
                                                }
                                            </div>
                                        )}
                                    </div>
                                </div>


                                {/* C. PRODUCTO DE REEMPLAZO (SUSTITUCIÓN) */}
                                <div>
                                    <label style={{ fontSize: '0.65rem', fontWeight: '600', color: THEME.colors.textSecondary, display: 'block', marginBottom: '6px', textTransform: 'uppercase', fontFamily: THEME.typography.fontFamilySecondary }}>Producto de Reemplazo / Sustitución (Opcional)</label>
                                    <div style={{ position: 'relative' }}>
                                        <div style={{ position: 'relative' }}>
                                            <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                                                <RefreshCw size={14} style={{ color: THEME.colors.textSecondary }} />
                                            </span>
                                            <input 
                                                type="text"
                                                placeholder="Buscar producto para sustituir..."
                                                value={subSearchTerm}
                                                onChange={(e) => {
                                                    setSubSearchTerm(e.target.value);
                                                    setShowSubResults(true);
                                                    setFocusedSubIndex(-1);
                                                }}
                                                onKeyDown={(e) => {
                                                    if (!showSubResults || subSearchTerm.length === 0) return;
                                                    const filtered = products.filter(p => 
                                                        p.id !== newException.product_id && (
                                                            p.name.toLowerCase().includes(subSearchTerm.toLowerCase()) || 
                                                            p.sku.toLowerCase().includes(subSearchTerm.toLowerCase())
                                                        )
                                                    ).slice(0, 10);
                                                    
                                                    if (e.key === 'ArrowDown') {
                                                        e.preventDefault();
                                                        setFocusedSubIndex(prev => (prev + 1) % filtered.length);
                                                    } else if (e.key === 'ArrowUp') {
                                                        e.preventDefault();
                                                        setFocusedSubIndex(prev => (prev - 1 + filtered.length) % filtered.length);
                                                    } else if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        const targetIndex = focusedSubIndex >= 0 && focusedSubIndex < filtered.length ? focusedSubIndex : 0;
                                                        const p = filtered[targetIndex];
                                                        if (p) {
                                                            setNewException(prev => ({...prev, substitution_product_id: p.id}));
                                                            setSubSearchTerm(`[${p.accounting_id || p.sku}] ${p.name}`);
                                                            setShowSubResults(false);
                                                            setFocusedSubIndex(-1);
                                                        }
                                                    }
                                                }}
                                                onFocus={() => setShowSubResults(true)}
                                                style={{ 
                                                    width: '100%', 
                                                    height: '38px', 
                                                    padding: '0 1rem 0 2.8rem', 
                                                    borderRadius: '8px', 
                                                    border: `1px solid ${THEME.colors.border}`, 
                                                    fontWeight: '500',
                                                    fontSize: '0.85rem',
                                                    outline: 'none',
                                                    transition: 'all 0.2s',
                                                    backgroundColor: 'white',
                                                    fontFamily: THEME.typography.fontFamilySecondary
                                                }}
                                                onBlur={() => setTimeout(() => {
                                                    setShowSubResults(false);
                                                    setFocusedSubIndex(-1);
                                                }, 200)}
                                            />
                                            {newException.substitution_product_id && (
                                                <div style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ backgroundColor: '#FEF3C7', color: '#D97706', padding: '4px 8px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: THEME.typography.fontFamilySecondary }}>
                                                        SUSTITUTO ACTIVO
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setNewException(prev => ({ ...prev, substitution_product_id: '' }));
                                                            setSubSearchTerm('');
                                                        }}
                                                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#EF4444', fontWeight: 'bold' }}
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {showSubResults && subSearchTerm.length > 0 && (
                                            <div 
                                                id="sub-prod-dropdown"
                                                style={{ 
                                                    position: 'absolute', top: '100%', left: 0, right: 0, 
                                                    backgroundColor: 'white', borderRadius: '12px', border: `1px solid ${THEME.colors.border}`, 
                                                    boxShadow: THEME.shadow.lg, 
                                                    zIndex: 10, marginTop: '8px', maxHeight: '200px', overflowY: 'auto' 
                                                }}
                                            >
                                                {products
                                                    .filter(p => 
                                                        p.id !== newException.product_id && (
                                                            p.name.toLowerCase().includes(subSearchTerm.toLowerCase()) || 
                                                            p.sku.toLowerCase().includes(subSearchTerm.toLowerCase())
                                                        )
                                                    )
                                                    .slice(0, 10)
                                                    .map((p, idx) => (
                                                        <div 
                                                            key={p.id}
                                                            id={`sub-item-${idx}`}
                                                            onClick={() => {
                                                                setNewException(prev => ({...prev, substitution_product_id: p.id}));
                                                                setSubSearchTerm(`[${p.accounting_id || p.sku}] ${p.name}`);
                                                                setShowSubResults(false);
                                                                setFocusedSubIndex(-1);
                                                            }}
                                                            style={{ 
                                                                padding: '0.8rem 1.2rem', cursor: 'pointer', borderBottom: `1px solid ${THEME.colors.border}`,
                                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                                transition: 'background 0.2s',
                                                                backgroundColor: idx === focusedSubIndex ? '#F1F5F9' : 'white'
                                                            }}
                                                            onMouseEnter={() => setFocusedSubIndex(idx)}
                                                            onMouseLeave={() => setFocusedSubIndex(-1)}
                                                        >
                                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                <span style={{ fontSize: '0.85rem', fontWeight: '600', color: THEME.colors.textMain, fontFamily: THEME.typography.fontFamilySecondary }}>{p.name}</span>
                                                                <span style={{ fontSize: '0.65rem', fontWeight: '500', color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilySecondary }}>ID: {p.accounting_id || p.sku}</span>
                                                            </div>
                                                            <span style={{ color: '#D97706', fontSize: '0.95rem', fontWeight: '600' }}>🔄</span>
                                                        </div>
                                                    ))
                                                }
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* B. VARIACIONES ESTANDARIZADAS */}
                                {selectedOriginalProd && selectedOriginalProd.options_config && selectedOriginalProd.options_config.length > 0 && (
                                    <div style={{ backgroundColor: '#F8FAFC', padding: '1.2rem', borderRadius: '12px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                        <label style={{ fontSize: '0.65rem', fontWeight: '900', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.02em', display: 'block', fontFamily: THEME.typography.fontFamilySecondary }}>
                                            Variación Estandarizada Requerida
                                        </label>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                                            {selectedOriginalProd.options_config.map((option: any) => {
                                                const selectedValue = newException.preferred_options?.[option.name] || '';
                                                return (
                                                    <div key={option.name} style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                                        <label style={{ fontSize: '0.7rem', fontWeight: '700', color: '#64748B', fontFamily: THEME.typography.fontFamilySecondary }}>
                                                            {option.name}
                                                        </label>
                                                        <select
                                                            value={selectedValue}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                const updatedOptions = { ...newException.preferred_options };
                                                                if (val) {
                                                                    updatedOptions[option.name] = val;
                                                                } else {
                                                                    delete updatedOptions[option.name];
                                                                }
                                                                setNewException({ ...newException, preferred_options: updatedOptions });
                                                            }}
                                                            style={{
                                                                height: '38px',
                                                                borderRadius: '8px',
                                                                border: '1px solid #E2E8F0',
                                                                padding: '0 0.5rem',
                                                                fontSize: '0.8rem',
                                                                backgroundColor: 'white',
                                                                fontFamily: THEME.typography.fontFamilySecondary,
                                                                color: THEME.colors.textMain,
                                                                outline: 'none'
                                                            }}
                                                        >
                                                            <option value="">-- Sin especificar --</option>
                                                            {option.values?.map((val: string) => (
                                                                <option key={val} value={val}>{val}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* D. NOTAS Y ALIAS */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <FormField 
                                        label="Nombre en Factura (Alias)" 
                                        value={newException.nickname} 
                                        onChange={(v) => setNewException({...newException, nickname: v})} 
                                        placeholder="Ej: Papa Amarilla (Sin costo)"
                                    />
                                    <FormField 
                                        label="Nota del cliente" 
                                        value={newException.picking_note} 
                                        onChange={(v) => setNewException({...newException, picking_note: v})} 
                                        placeholder="Ej: Maduración: Pintón / Con etiqueta"
                                    />
                                </div>

                                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                                    <button onClick={() => {
                                        setIsAdding(false);
                                        setEditingId(null);
                                        setNewException({ product_id: '', nickname: '', picking_note: '', substitution_product_id: '', delivery_note: '', preferred_options: {} });
                                        setSearchTerm('');
                                        setSubSearchTerm('');
                                    }} style={{ flex: 1, padding: '0.6rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, background: 'white', fontWeight: '600', cursor: 'pointer', fontFamily: THEME.typography.fontFamilySecondary, fontSize: '0.8rem' }}>Cancelar</button>
                                    <button onClick={handleSave} style={{ flex: 1, padding: '0.6rem', borderRadius: THEME.radius.sm, border: 'none', background: THEME.colors.primary, color: 'white', fontWeight: '600', cursor: 'pointer', fontFamily: THEME.typography.fontFamilyMain, fontSize: '0.8rem' }}>Guardar Regla</button>
                                </div>
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '2rem', color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilySecondary }}>Cargando excepciones...</div>
                        ) : exceptions.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '2rem', color: THEME.colors.textSecondary, border: `1px dashed ${THEME.colors.border}`, borderRadius: THEME.radius.lg, fontFamily: THEME.typography.fontFamilySecondary }}>No hay excepciones configuradas.</div>
                        ) : (
                            exceptions.map(exc => {
                                const origProd = getProductDetails(exc.product_id);
                                const subProd = exc.substitution_product_id ? getProductDetails(exc.substitution_product_id) : null;
                                return (
                                    <div key={exc.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '1.2rem', padding: '1.2rem', backgroundColor: 'white', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}` }}>
                                        <div style={{ width: '36px', height: '36px', backgroundColor: THEME.colors.primaryLight, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '4px' }}>
                                            <Package size={16} strokeWidth={1.5} style={{ color: THEME.colors.primary }} />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '0.65rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', fontFamily: THEME.typography.fontFamilySecondary, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span>Original: {origProd?.name || '---'}</span>
                                                <span style={{ color: '#94A3B8' }}>|</span>
                                                <span style={{ color: '#64748B' }}>ID: {origProd?.accounting_id || '---'}</span>
                                            </div>

                                            {/* RENDER DETAILED RULES */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                                                
                                                {/* Nickname alias */}
                                                {exc.nickname && origProd?.name && exc.nickname.trim().toLowerCase() !== origProd.name.trim().toLowerCase() && (
                                                    <div>
                                                        <span style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary, fontWeight: '700', fontFamily: THEME.typography.fontFamilySecondary }}>Nombre Factura: </span>
                                                        <span style={{ fontSize: '0.75rem', color: THEME.colors.textMain, fontWeight: '600' }}>{exc.nickname}</span>
                                                    </div>
                                                )}

                                                {/* Preferred options (Standardized variants) */}
                                                {exc.preferred_options && Object.keys(exc.preferred_options).length > 0 && (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
                                                        <span style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary, fontWeight: '700', fontFamily: THEME.typography.fontFamilySecondary }}>Variante: </span>
                                                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                            {Object.entries(exc.preferred_options).map(([key, val]) => (
                                                                <span key={key} style={{ fontSize: '0.65rem', backgroundColor: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0', padding: '2px 6px', borderRadius: '4px', fontWeight: '800', fontFamily: THEME.typography.fontFamilySecondary }}>
                                                                    {key}: {val as string}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Picking notes */}
                                                {exc.picking_note && (
                                                    <div>
                                                        <span style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary, fontWeight: '700', fontFamily: THEME.typography.fontFamilySecondary }}>Nota del cliente: </span>
                                                        <span style={{ fontSize: '0.75rem', color: THEME.colors.primary, fontWeight: '700' }}>{exc.picking_note}</span>
                                                    </div>
                                                )}

                                                {/* Substitution product */}
                                                {subProd && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span style={{ fontSize: '0.7rem', color: '#D97706', fontWeight: '700', fontFamily: THEME.typography.fontFamilySecondary }}>🔄 Sustituir por: </span>
                                                        <span style={{ fontSize: '0.75rem', color: '#B45309', fontWeight: '800', backgroundColor: '#FFFBEB', padding: '2px 6px', borderRadius: '4px' }}>
                                                            [{subProd.accounting_id || subProd.sku}] {subProd.name}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        {!readOnly && (
                                            <div style={{ display: 'flex', gap: '8px', alignSelf: 'center' }}>
                                                <button 
                                                    onClick={() => {
                                                        setEditingId(exc.id);
                                                        setNewException({
                                                            product_id: exc.product_id,
                                                            nickname: exc.nickname,
                                                            picking_note: exc.picking_note,
                                                            substitution_product_id: exc.substitution_product_id || '',
                                                            delivery_note: exc.delivery_note || '',
                                                            preferred_options: exc.preferred_options || {}
                                                        });
                                                        setSearchTerm(origProd ? `[${origProd.accounting_id || origProd.sku}] ${origProd.name}` : '');
                                                        setSubSearchTerm(subProd ? `[${subProd.accounting_id || subProd.sku}] ${subProd.name}` : '');
                                                        setIsAdding(true);
                                                        scrollableRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                                                    }} 
                                                    style={{ border: `1px solid ${THEME.colors.border}`, background: 'white', color: THEME.colors.textSecondary, width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                                                >
                                                    <Edit2 size={14} />
                                                </button>
                                                <button 
                                                    onClick={() => handleDelete(exc.id)} 
                                                    style={{ border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#EF4444', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#FEE2E2'}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#FEF2F2'}
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

interface LeadFormModalProps {
    onClose: () => void;
    onRefresh: () => void;
}

function LeadFormModal({ onClose, onRefresh }: LeadFormModalProps) {
    const [companyName, setCompanyName] = useState('');
    const [contactName, setContactName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [nit, setNit] = useState('');
    const [address, setAddress] = useState('');
    const [municipality, setMunicipality] = useState('Bogotá');
    const [businessType, setBusinessType] = useState('Restaurante');
    const [businessSize, setBusinessSize] = useState('Standard');
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!contactName || !phone) {
            setError('Nombre de contacto y teléfono son requeridos.');
            return;
        }
        setError('');
        setLoading(true);
        try {
            const { error: insertErr } = await supabase
                .from('leads')
                .insert([{
                    company_name: companyName || null,
                    contact_name: contactName,
                    phone: phone,
                    email: email || null,
                    nit: nit ? parseInt(nit.replace(/[^0-9]/g, '')) : null,
                    address: address || null,
                    municipality: municipality || null,
                    business_type: businessType,
                    business_size: businessSize,
                    notes: notes || null,
                    status: 'new'
                }]);

            if (insertErr) throw insertErr;
            onRefresh();
            onClose();
        } catch (err: any) {
            console.error('Error creating lead:', err);
            setError(err.message || 'Error al guardar el prospecto.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            zIndex: 9999, backdropFilter: 'blur(4px)',
            fontFamily: 'system-ui, sans-serif'
        }}>
            <div style={{
                backgroundColor: 'white',
                borderRadius: '16px',
                padding: '2rem',
                width: '100%',
                maxWidth: '600px',
                maxHeight: '90vh',
                overflowY: 'auto',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '800', color: '#0F172A' }}>📢 Crear Nuevo Prospecto (Lead)</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#64748B' }}>✕</button>
                </div>

                {error && (
                    <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.875rem' }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem', textTransform: 'uppercase' }}>Razón Social / Empresa</label>
                            <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Ej: FruFresco S.A.S" style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '0.9rem', outline: 'none' }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem', textTransform: 'uppercase' }}>Nombre de Contacto *</label>
                            <input type="text" value={contactName} onChange={e => setContactName(e.target.value)} required placeholder="Ej: Juan Pérez" style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '0.9rem', outline: 'none' }} />
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem', textTransform: 'uppercase' }}>Teléfono *</label>
                            <input type="text" value={phone} onChange={e => setPhone(e.target.value)} required placeholder="Ej: 3001234567" style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '0.9rem', outline: 'none' }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem', textTransform: 'uppercase' }}>Correo Electrónico</label>
                            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Ej: contacto@empresa.com" style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '0.9rem', outline: 'none' }} />
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem', textTransform: 'uppercase' }}>NIT / Documento</label>
                            <input type="text" value={nit} onChange={e => setNit(e.target.value)} placeholder="Ej: 901393217" style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '0.9rem', outline: 'none' }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem', textTransform: 'uppercase' }}>Municipio / Ciudad</label>
                            <input type="text" value={municipality} onChange={e => setMunicipality(e.target.value)} placeholder="Ej: Bogotá" style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '0.9rem', outline: 'none' }} />
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem', textTransform: 'uppercase' }}>Dirección de Despacho</label>
                        <input type="text" value={address} onChange={e => setAddress(e.target.value)} placeholder="Ej: Calle 100 # 15-20" style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '0.9rem', outline: 'none' }} />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem', textTransform: 'uppercase' }}>Tipo de Negocio</label>
                            <select value={businessType} onChange={e => setBusinessType(e.target.value)} style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '0.9rem', outline: 'none', backgroundColor: 'white' }}>
                                <option value="Restaurante">Restaurante</option>
                                <option value="Hotel">Hotel</option>
                                <option value="Colegio">Colegio</option>
                                <option value="Casino/Catering">Casino/Catering</option>
                                <option value="Otro">Otro</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem', textTransform: 'uppercase' }}>Tamaño</label>
                            <select value={businessSize} onChange={e => setBusinessSize(e.target.value)} style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '0.9rem', outline: 'none', backgroundColor: 'white' }}>
                                <option value="Small">Pequeño / Boutique</option>
                                <option value="Standard">Mediano / Standard</option>
                                <option value="Chain">Grande / Cadena</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem', textTransform: 'uppercase' }}>Notas / Observaciones</label>
                        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ej: Requiere factura formal de inmediato..." rows={3} style={{ width: '100%', padding: '0.625rem 0.875rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '0.9rem', outline: 'none', resize: 'none' }} />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                        <button type="button" onClick={onClose} style={{ padding: '0.625rem 1.25rem', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '0.9rem', cursor: 'pointer', backgroundColor: 'white', color: '#475569', fontWeight: 'bold' }}>
                            Cancelar
                        </button>
                        <button type="submit" disabled={loading} style={{ padding: '0.625rem 1.25rem', borderRadius: '8px', border: 'none', fontSize: '0.9rem', cursor: 'pointer', backgroundColor: '#8B5CF6', color: 'white', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(139, 92, 246, 0.2)' }}>
                            {loading ? 'Guardando...' : 'Crear Prospecto'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

