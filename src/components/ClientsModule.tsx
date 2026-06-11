'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import Toast from '@/components/Toast';
import { parseLogisticsText, formatTimeWindow, LogisticsData } from '@/lib/logistics-parser';
import { THEME } from '@/lib/adminTheme';
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
    FileDown,
    FileUp,
    BarChart3,
    Building2,
    Users,
    ChevronRight,
    Home
} from 'lucide-react';
import * as XLSX from 'xlsx';

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
    remission_copies?: number;
    id_zr?: string;
    id_lp?: string;
    payment_days?: number;
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
    business_type?: string;
    business_size?: string;
    latitude?: number;
    longitude?: number;
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
    const [activeTab, setActiveTab] = useState('dashboard');
    const [clientsB2B, setClientsB2B] = useState<Profile[]>([]);
    const [clientsB2C, setClientsB2C] = useState<Profile[]>([]);
    const [leads, setLeads] = useState<Lead[]>([]);
    const [pricingModels, setPricingModels] = useState<PricingModel[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<Partial<Profile> | null>(null);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
    const [showHelpTooltip, setShowHelpTooltip] = useState(false);
    const [isNicknameModalOpen, setIsNicknameModalOpen] = useState(false);
    const [nicknameClientId, setNicknameClientId] = useState<string | null>(null);
    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isFormReadOnly, setIsFormReadOnly] = useState(false);

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
                .eq('status', 'agreement')
                .gte('valid_until', new Date().toISOString());
            
            const normalizeProfile = (p: any) => ({
                ...p,
                phone: p.phone || p.contact_phone || ''
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

    const getAgreementStatus = (clientId: string) => {
        const clientAgreements = allAgreements.filter(a => a.client_id === clientId);
        if (clientAgreements.length === 0) return 'none';
        
        const now = new Date();
        const fifteenDaysFromNow = new Date();
        fifteenDaysFromNow.setDate(now.getDate() + 15);
        
        // Prioridad: Green > Yellow > None
        const hasActive = clientAgreements.some(a => new Date(a.valid_until) > fifteenDaysFromNow);
        if (hasActive) return 'active';
        
        const hasWarning = clientAgreements.some(a => {
            const expiry = new Date(a.valid_until);
            return expiry >= now && expiry <= fifteenDaysFromNow;
        });
        if (hasWarning) return 'warning';
        
        return 'none';
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
        // Combinar b2b y b2c para exportación completa
        const allClients = [...clientsB2B, ...clientsB2C];
        
        // Tab 1: Clientes Base
        const exportData = allClients.map(c => {
            const parent = allClients.find(p => p.id === c.parent_id);
            return {
                ID_INTERNO: c.id,
                NIT_CEDULA: c.nit || '',
                Nombre_Comercial: c.company_name || '',
                Razon_Social: c.razon_social || '',
                Nombre_Contacto: c.contact_name || '',
                Telefono: c.phone || '',
                Email: c.email || '',
                Direccion: c.address || '',
                Ciudad: c.city || 'Bogotá',
                Municipio: c.municipality || 'Bogotá',
                Departamento: c.department || 'Cundinamarca',
                Tipo_Cliente: c.role === 'b2b_client' ? 'INSTITUCIONAL' : 'HOGAR',
                
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

                // Operaciones y Logística (Sucursal / Hogar)
                Requiere_Canastillas: c.needs_crates ? 'SI' : 'NO',
                Tipo_Documento: c.document_type || 'invoice', // invoice | remission
                Imprimir_Factura_Fisica: c.print_invoice ? 'SI' : 'NO',
                Remision_Con_Precios: c.remission_with_prices ? 'SI' : 'NO',
                Restricciones_Entrega: c.delivery_restrictions || '',
                Copias_Remision: c.remission_copies || 2,
                
                // Códigos ERP de Integración
                Codigo_ZR: c.id_zr || '',
                Codigo_LP: c.id_lp || '',
                Dias_Pago: c.payment_days || 0
            };
        });

        // Tab 2: Guía de Datos
        const guideHeaders = ["Campo Excel", "Requerido", "Aplica A", "Descripción y Valores Permitidos"];
        const guideRows = [
            ["ID_INTERNO", "NO", "Todos", "Dejar intacto para actualizar el cliente existente. Borrar si desea crear uno nuevo."],
            ["NIT_CEDULA", "SÍ", "Todos", "NIT de la empresa (con DV separado o sin DV) o Cédula de Ciudadanía."],
            ["Nombre_Comercial", "SÍ", "Todos", "Nombre de fantasía o del establecimiento."],
            ["Razon_Social", "SÍ (Institucionales)", "Institucional", "Razón social legal para facturación electrónica."],
            ["Nombre_Contacto", "SÍ", "Todos", "Persona encargada de recibir el pedido o coordinar compras."],
            ["Telefono", "SÍ", "Todos", "Teléfono celular de contacto principal."],
            ["Email", "SÍ", "Todos", "Correo electrónico donde se enviarán avisos de pedido y facturación."],
            ["Direccion", "SÍ", "Todos", "Dirección exacta del punto de entrega (sucursal o domicilio)."],
            ["Ciudad", "SÍ", "Todos", "Ciudad principal (ej: Bogotá, Villavicencio)."],
            ["Municipio", "SÍ", "Todos", "Municipio específico (ej: Bogotá, Restrepo, Acacías)."],
            ["Departamento", "SÍ", "Todos", "Departamento político (ej: Cundinamarca, Meta)."],
            ["Tipo_Cliente", "SÍ", "Todos", "Tipo de cuenta: INSTITUCIONAL o HOGAR."],
            ["Es_Matriz", "NO", "Institucional", "SI = Si centraliza la facturación y cartera. NO = Si es punto de entrega o independiente."],
            ["NIT_Matriz_Padre", "NO", "Sucursal", "Escriba el NIT de la casa matriz si este cliente es una sucursal vinculada."],
            ["Nombre_Matriz_Padre", "NO", "Sucursal", "Nombre de la matriz (como referencia)."],
            ["Codigo_Sucursal", "NO", "Sucursal", "Identificador interno de la sucursal (ej: SUC-01, REST-CHIA)."],
            ["Rol_Corporativo", "NO", "Sucursal", "Descripción del rol corporativo (ej: Bodega Central, Franquicia 2)."],
            ["Cupo_Credito", "NO", "Matriz / Indep.", "Monto máximo en pesos aprobado para compras a crédito (ej: 5000000)."],
            ["Condicion_Pago", "NO", "Matriz / Indep.", "Condición comercial de cartera: Contado, 8 Días, 15 Días, 30 Días."],
            ["Responsable_IVA", "NO", "Matriz / Indep.", "SI / NO. Determina si aplica cobro de IVA en facturación."],
            ["Gran_Contribuyente", "NO", "Matriz / Indep.", "SI / NO. Lógica fiscal colombiana."],
            ["Autorretenedor", "NO", "Matriz / Indep.", "SI / NO. Lógica fiscal colombiana."],
            ["Regimen_Simple", "NO", "Matriz / Indep.", "SI / NO. Régimen Simple de Tributación."],
            ["Actividad_Economica", "NO", "Matriz / Indep.", "Código CIIU de actividad económica."],
            ["Correos_Facturacion_Adicionales", "NO", "Matriz / Indep.", "Lista de correos separados por comas para copia de facturas."],
            ["Responsable_Cartera", "NO", "Matriz / Indep.", "Nombre del contacto de contabilidad / pagos del cliente."],
            ["Email_Cartera", "NO", "Matriz / Indep.", "Correo de contacto de pagos."],
            ["Telefono_Cartera", "NO", "Matriz / Indep.", "Teléfono directo de tesorería/pagos."],
            ["Requiere_Canastillas", "NO", "Todos", "SI / NO. Indica si el despacho requiere dejar canastillas plásticas."],
            ["Tipo_Documento", "SÍ", "Todos", "invoice = Factura Electrónica. remission = Remisión (Orden de entrega)."],
            ["Imprimir_Factura_Fisica", "NO", "Todos", "SI / NO. Indica si el transportador debe llevar copia impresa física."],
            ["Remision_Con_Precios", "NO", "Todos", "SI / NO. Aplica si Tipo_Documento es remission (oculta o muestra precios al recibir)."],
            ["Restricciones_Entrega", "NO", "Todos", "Horarios, parqueaderos, especificaciones logísticas de entrega."],
            ["Copias_Remision", "NO", "Todos", "Número de copias físicas a imprimir (ej: 2)."],
            ["Codigo_ZR", "NO", "Todos", "Código de zona de despacho para ruteo ERP."],
            ["Codigo_LP", "NO", "Todos", "Código de lista de precios asignada en contabilidad."],
            ["Dias_Pago", "NO", "Todos", "Plazo en días numéricos aprobado."]
        ];
        const guideSheetData = [guideHeaders, ...guideRows];

        const workbook = XLSX.utils.book_new();
        const wsClients = XLSX.utils.json_to_sheet(exportData);
        const wsGuide = XLSX.utils.aoa_to_sheet(guideSheetData);

        // Ajustar anchos
        wsClients['!cols'] = Object.keys(exportData[0] || {}).map(() => ({ wch: 20 }));
        wsGuide['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 65 }];

        XLSX.utils.book_append_sheet(workbook, wsClients, "Clientes_Master");
        XLSX.utils.book_append_sheet(workbook, wsGuide, "Guia_Campos");

        XLSX.writeFile(workbook, `CRM_Clientes_${new Date().toISOString().split('T')[0]}.xlsx`);
        window.showToast?.('Base de clientes exportada con éxito', 'success');
    };

    const downloadClientsTemplate = () => {
        const headers = [
            "NIT_CEDULA", "Nombre_Comercial", "Razon_Social", "Nombre_Contacto", "Telefono", 
            "Email", "Direccion", "Ciudad", "Municipio", "Departamento", "Tipo_Cliente", 
            "Es_Matriz", "NIT_Matriz_Padre", "Nombre_Matriz_Padre", "Codigo_Sucursal", "Rol_Corporativo",
            "Cupo_Credito", "Condicion_Pago", "Responsable_IVA", "Gran_Contribuyente", "Autorretenedor", 
            "Regimen_Simple", "Actividad_Economica", "Correos_Facturacion_Adicionales", "Responsable_Cartera", 
            "Email_Cartera", "Telefono_Cartera", "Requiere_Canastillas", "Tipo_Documento", "Imprimir_Factura_Fisica", 
            "Remision_Con_Precios", "Restricciones_Entrega", "Copias_Remision", "Codigo_ZR", "Codigo_LP", "Dias_Pago"
        ];
        const sample1 = [
            "901234567-1", "Restaurante El Gourmet", "Gourmet SAS", "Carlos Mendoza", "3159998877", 
            "carlos@elgourmet.com", "Calle 100 # 15-30", "Bogotá", "Bogotá", "Cundinamarca", "INSTITUCIONAL", 
            "SI", "", "", "", "", 
            2000000, "15 Días", "SI", "NO", "NO", 
            "NO", "5611", "contabilidad@elgourmet.com", "Luz Marina Pérez", 
            "pagos@elgourmet.com", "3001112233", "SI", "invoice", "NO", 
            "SI", "Entregar por bahía de carga antes de las 11 AM", 2, "ZR-Norte", "LP-01", 15
        ];
        const sample2 = [
            "901234567-1", "Sucursal Gourmet Unicentro", "Gourmet SAS", "Diana Restrepo", "3204445566", 
            "unicentro@elgourmet.com", "Avenida Carrera 15 # 124-30 Local 12", "Bogotá", "Bogotá", "Cundinamarca", "INSTITUCIONAL", 
            "NO", "901234567-1", "Restaurante El Gourmet", "SUC-02", "Punto de Venta Mall", 
            0, "Contado", "SI", "NO", "NO", 
            "NO", "5611", "", "", 
            "", "", "NO", "remission", "NO", 
            "SI", "Acceso por sótano de servicios, requiere carnet ARL", 2, "ZR-Norte", "LP-01", 0
        ];
        const sample3 = [
            "1020304050", "Familia Rincón", "", "Marcela Rincón", "3115556677", 
            "marcela.rincon@gmail.com", "Carrera 7 # 150-10 Apto 402", "Bogotá", "Bogotá", "Cundinamarca", "HOGAR", 
            "NO", "", "", "", "", 
            0, "Contado", "NO", "NO", "NO", 
            "NO", "", "", "", 
            "", "", "NO", "remission", "NO", 
            "NO", "Dejar en portería si no se encuentra", 1, "ZR-Hogar-Norte", "LP-B2C", 0
        ];

        const dataSheet = [headers, sample1, sample2, sample3];

        const workbook = XLSX.utils.book_new();
        const wsTemplate = XLSX.utils.aoa_to_sheet(dataSheet);
        wsTemplate['!cols'] = headers.map(() => ({ wch: 18 }));

        XLSX.utils.book_append_sheet(workbook, wsTemplate, "Plantilla_Clientes");
        XLSX.writeFile(workbook, "plantilla_carga_masiva_clientes.xlsx");
        window.showToast?.('Plantilla de clientes descargada', 'success');
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
                const cleanBool = (val: any) => val === 'SI' || val === 'si' || val === true;

                // Primero buscaremos todos los NIT de matriz/padre para poder vincular parent_id si es sucursal
                // Mapearemos los clientes y crearemos o actualizaremos sus perfiles
                const clientsToInsert = rows.map(row => {
                    const type_client = (row.Tipo_Cliente || '').toString().toUpperCase();

                    return {
                        id: row.ID_INTERNO || undefined,
                        nit: (row.NIT_CEDULA || '').toString().trim(),
                        company_name: (row.Nombre_Comercial || '').toString().trim(),
                        razon_social: (row.Razon_Social || row.Nombre_Comercial || '').toString().trim(),
                        contact_name: (row.Nombre_Contacto || row.Nombre_Comercial || '').toString().trim(),
                        phone: (row.Telefono || '').toString().trim(),
                        contact_phone: (row.Telefono || '').toString().trim(),
                        email: (row.Email || '').toString().trim(),
                        address: (row.Direccion || '').toString().trim(),
                        city: (row.Ciudad || 'Bogotá').toString().trim(),
                        municipality: (row.Municipio || row.Ciudad || 'Bogotá').toString().trim(),
                        department: (row.Departamento || 'Cundinamarca').toString().trim(),
                        role: type_client === 'HOGAR' ? 'b2c_client' : 'b2b_client',
                        
                        // Jerarquía
                        is_corporate_parent: cleanBool(row.Es_Matriz),
                        branch_id: (row.Codigo_Sucursal || '').toString().trim() || null,
                        corporate_role: (row.Rol_Corporativo || '').toString().trim() || null,
                        
                        // Financiera
                        credit_limit: parseFloat(row.Cupo_Credito || '0'),
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

                        // Logística
                        needs_crates: cleanBool(row.Requiere_Canastillas),
                        document_type: (row.Tipo_Documento || 'invoice').toString().trim().toLowerCase(),
                        print_invoice: cleanBool(row.Imprimir_Factura_Fisica),
                        remission_with_prices: cleanBool(row.Remision_Con_Precios),
                        delivery_restrictions: (row.Restricciones_Entrega || '').toString().trim() || null,
                        remission_copies: parseInt(row.Copias_Remision || '2'),

                        // ERP
                        id_zr: (row.Codigo_ZR || '').toString().trim() || null,
                        id_lp: (row.Codigo_LP || '').toString().trim() || null,
                        payment_days: parseInt(row.Dias_Pago || '0'),
                        geocoding_status: 'manual'
                    };
                });

                // Cargar en bloques de 50
                const chunkSize = 50;
                const insertedClients: any[] = [];

                for (let i = 0; i < clientsToInsert.length; i += chunkSize) {
                    const chunk = clientsToInsert.slice(i, i + chunkSize);
                    // Usamos upsert para actualizar por ID o insertar si es nuevo
                    const { data, error } = await supabase.from('profiles').upsert(chunk).select('id', 'nit');
                    if (error) throw error;
                    if (data) insertedClients.push(...data);
                }

                // Intentar hacer la vinculación parent_id si es Sucursal y especificaron NIT_Matriz_Padre
                // Esto lo hacemos en una pasada secundaria
                const branches = rows.filter(r => (r.NIT_Matriz_Padre || '').toString().trim() !== '' && !cleanBool(r.Es_Matriz));
                if (branches.length > 0) {
                    const { data: allParents } = await supabase.from('profiles').select('id, nit').eq('is_corporate_parent', true);
                    
                    if (allParents) {
                        for (const row of branches) {
                            const cleanNit = (row.NIT_CEDULA || '').toString().trim();
                            const cleanParentNit = (row.NIT_Matriz_Padre || '').toString().trim();
                            const branchProfile = insertedClients.find(c => c.nit === cleanNit);
                            const parentProfile = allParents.find(p => p.nit === cleanParentNit) || insertedClients.find(c => c.nit === cleanParentNit);
                            
                            if (branchProfile && parentProfile) {
                                await supabase.from('profiles')
                                    .update({ parent_id: parentProfile.id })
                                    .eq('id', branchProfile.id);
                            }
                        }
                    }
                }

                window.showToast?.(`Base de datos de clientes actualizada: ${clientsToInsert.length} registros procesados`, 'success');
                setIsBulkModalOpen(false);
                setSelectedFile(null);
                fetchData();
            } catch (err: any) {
                console.error('Error en carga de clientes:', err);
                window.showToast?.('Error al procesar el archivo: ' + err.message, 'error');
            } finally {
                setLoading(false);
            }
        };
        reader.readAsBinaryString(selectedFile);
    };

    const tabs = [
        { id: 'dashboard', label: 'Resumen', icon: <BarChart3 size={16} /> },
        { id: 'b2b', label: 'Institucionales', icon: <Building2 size={16} /> },
        { id: 'b2c', label: 'Hogar', icon: <Users size={16} /> },
        { id: 'leads', label: 'Prospectos', icon: <Mail size={16} /> },
    ];

    const filterData = <T extends object>(data: T[], fields: string[]): T[] => {
        if (!searchTerm) return data;

        const searchTerms = searchTerm.toLowerCase().split(',').map(term => term.trim()).filter(term => term.length > 0);
        if (searchTerms.length === 0) return data;

        return data.filter(item => 
            searchTerms.every(term => 
                fields.some(field => {
                    const value = (item as Record<string, unknown>)[field];
                    return String(value || '').toLowerCase().includes(term);
                })
            )
        );
    };

    return (
        <div style={{ backgroundColor: '#F0F2F5', height: '100%' }}>
            <Toast />



            {/* MODAL FORMULARIO (NUEVO / EDITAR) */}
            {isFormModalOpen && (
                <ClientFormModal 
                    onClose={() => setIsFormModalOpen(false)} 
                    onRefresh={fetchData}
                    pricingModels={pricingModels}
                    editData={editTarget}
                    setNicknameClientId={setNicknameClientId}
                    setIsNicknameModalOpen={setIsNicknameModalOpen}
                    isReadOnly={isFormReadOnly}
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
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => { setActiveTab(tab.id); setSearchTerm(''); }}
                                style={{
                                    padding: '0.45rem 1.1rem',
                                    border: 'none',
                                    borderRadius: '8px',
                                    background: activeTab === tab.id ? THEME.colors.primary : 'transparent',
                                    color: activeTab === tab.id ? 'white' : '#4E6157',
                                    fontWeight: activeTab === tab.id ? '700' : '500',
                                    cursor: 'pointer',
                                    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    fontSize: '0.8rem',
                                    boxShadow: activeTab === tab.id ? '0 4px 12px rgba(13, 122, 87, 0.25)' : 'none'
                                }}
                            >
                                <span style={{ 
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    color: activeTab === tab.id ? 'white' : '#4E6157',
                                    opacity: activeTab === tab.id ? 1 : 0.8
                                }}>{tab.icon}</span>
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </header>

                {/* SEGUNDA FILA: ACCIONES Y BUSCADOR (COMPACTA) */}
                {activeTab !== 'dashboard' && (
                    <div style={{ 
                        display: 'flex', 
                        gap: '0.8rem', 
                        alignItems: 'center', 
                        marginBottom: '1.2rem',
                        backgroundColor: 'white',
                        padding: '0.5rem 1rem',
                        borderRadius: '16px',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.02)',
                        border: '1px solid #F1F5F9'
                    }}>
                        {/* BOTÓN DE CREACIÓN */}
                        {activeTab === 'b2b' && (
                            <button 
                                onClick={() => handleCreateClient('b2b_client')}
                                style={{ 
                                    backgroundColor: '#0891B2', 
                                    color: 'white', 
                                    padding: '0 1.2rem', 
                                    borderRadius: '10px', 
                                    border: 'none', 
                                    fontWeight: '800', 
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 12px rgba(8, 145, 178, 0.2)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    whiteSpace: 'nowrap',
                                    height: '40px',
                                    fontSize: '0.85rem'
                                }}
                            >
                                <span>➕</span> Nuevo Institucional
                            </button>
                        )}
                        {activeTab === 'b2c' && (
                            <button 
                                onClick={() => handleCreateClient('b2c_client')}
                                style={{ 
                                    backgroundColor: '#10B981', 
                                    color: 'white', 
                                    padding: '0 1.2rem', 
                                    borderRadius: '10px', 
                                    border: 'none', 
                                    fontWeight: '800', 
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    whiteSpace: 'nowrap',
                                    height: '40px',
                                    fontSize: '0.85rem'
                                }}
                            >
                                <span>👤</span> Nuevo Cliente Hogar
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
                                    fontSize: '0.9rem'
                                }}
                            >
                                📋
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
                                    fontSize: '0.9rem'
                                }}
                            >
                                🔲
                            </button>
                        </div>

                        {/* BUSCADOR ESTÁNDAR FLEXIBLE (OCUPANDO TODO EL ESPACIO) */}
                        <div style={{ position: 'relative', flex: 1 }}>
                            <span style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.9rem', color: '#A0AEC0' }}>🔍</span>
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
                        <div 
                            onMouseEnter={() => setShowHelpTooltip(true)}
                            onMouseLeave={() => setShowHelpTooltip(false)}
                            style={{ 
                                position: 'relative',
                                width: '40px', 
                                height: '40px', 
                                borderRadius: '10px', 
                                backgroundColor: '#EFF6FF', 
                                color: '#2563EB', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                cursor: 'help',
                                border: '1px solid #DBEAFE',
                                fontSize: '1rem',
                                fontWeight: '900',
                                flexShrink: 0,
                                transition: 'all 0.2s'
                            }}
                        >
                            i
                            {showHelpTooltip && (
                                <div style={{
                                    position: 'absolute',
                                    top: '48px',
                                    right: '0',
                                    width: '280px',
                                    backgroundColor: '#1E293B',
                                    color: 'white',
                                    padding: '1.2rem',
                                    borderRadius: '16px',
                                    boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
                                    zIndex: 1000,
                                    fontSize: '0.75rem',
                                    lineHeight: '1.5',
                                    pointerEvents: 'none',
                                    animation: 'fadeInDown 0.2s ease-out'
                                }}>
                                    <div style={{ fontWeight: '900', color: '#38BDF8', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                                        🚀 COMANDOS CRM (@)
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                        <div>
                                            <b style={{ color: '#FCD34D' }}>@bogota</b>: Por ciudad<br/>
                                            <b style={{ color: '#FCD34D' }}>@nit</b>: Por NIT<br/>
                                            <b style={{ color: '#FCD34D' }}>@nogps</b>: Sin geo
                                        </div>
                                        <div>
                                            <b style={{ color: '#FCD34D' }}>@activo</b>: Acuerdo ok<br/>
                                            <b style={{ color: '#FCD34D' }}>@vencido</b>: Expirado<br/>
                                            <b style={{ color: '#FCD34D' }}>@branch</b>: Sucursales
                                        </div>
                                    </div>
                                    <style>{`
                                        @keyframes fadeInDown {
                                            from { opacity: 0; transform: translateY(-10px); }
                                            to { opacity: 1; transform: translateY(0); }
                                        }
                                    `}</style>
                                </div>
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
                                    <KPICard title="CLIENTES B2B" value={clientsB2B.length} icon={<Building2 size={20} />} color="#EAEFEA" textColor="#0D7A57" subtitle="Institucionales" />
                                    <KPICard title="CLIENTES B2C" value={clientsB2C.length} icon={<Home size={20} />} color="#EAEFEA" textColor="#0D7A57" subtitle="Consumidores" />
                                    <KPICard 
                                        title="TAREAS CRÍTICAS" 
                                        value={leads.filter(l => l.status !== 'converted' && l.status !== 'rejected' && l.next_contact_date && new Date(l.next_contact_date) <= new Date()).length} 
                                        icon={<AlertTriangle size={20} />} 
                                        color="#EAEFEA" 
                                        textColor="#0D7A57" 
                                        subtitle="Prioridad comercial" 
                                    />
                                </div>

                                {/* Middle Row: Funnel & Critical Tasks & Sales */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
                                    {/* Funnel Box */}
                                    <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 4px 20px rgba(0,0,0,0.02)', border: '1px solid #E2E8F0', borderTop: '4px solid #0D7A57' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
                                            <div>
                                                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <BarChart3 size={18} style={{ color: '#0D7A57' }} /> Embudo Comercial
                                                </h3>
                                                <p style={{ margin: '0.1rem 0 0 0', fontSize: '0.8rem', color: '#64748B', fontWeight: '500' }}>Trayectoria del prospecto</p>
                                            </div>
                                            <div style={{ backgroundColor: '#F1F5F9', padding: '0.35rem 0.75rem', borderRadius: '8px', border: '1px solid #E2E8F0', textAlign: 'center', minWidth: '54px' }}>
                                                <div style={{ fontSize: '0.55rem', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ITEMS</div>
                                                <div style={{ fontSize: '1rem', fontWeight: '800', color: '#1E293B', lineHeight: '1.2' }}>{leads.length}</div>
                                            </div>
                                        </div>
                                        <FunnelGraphic leads={leads} />
                                    </div>

                                    {/* Sales Distribution Pie Chart */}
                                    <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 4px 20px rgba(0,0,0,0.02)', border: '1px solid #E2E8F0', borderTop: '4px solid #0D7A57' }}>
                                        <div style={{ marginBottom: '1.2rem' }}>
                                            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <BarChart3 size={18} style={{ color: '#0D7A57' }} /> Distribución de Ventas
                                            </h3>
                                            <p style={{ margin: '0.1rem 0 0 0', fontSize: '0.8rem', color: '#64748B', fontWeight: '500' }}>Balance B2B vs B2C</p>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '160px' }}>
                                            <SalesPieChart 
                                                totalB2B={orders.filter(o => o.is_b2b).reduce((sum, o) => sum + (o.total || 0), 0)}
                                                totalB2C={orders.filter(o => !o.is_b2b).reduce((sum, o) => sum + (o.total || 0), 0)}
                                            />
                                        </div>
                                    </div>

                                    {/* Task Box */}
                                    <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 4px 20px rgba(0,0,0,0.02)', border: '1px solid #E2E8F0', borderTop: '4px solid #0D7A57', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                                            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                                                onEdit={() => handleEditClient(client)}
                                                agreementStatus={getAgreementStatus(client.id)}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{ backgroundColor: 'white', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', border: '1px solid #E2E8F0' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                            <thead>
                                                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
                                                    <th style={{ padding: '1.2rem', color: '#64748B', fontSize: '0.85rem', fontWeight: '800' }}>IDENTIFICACIÓN / CLIENTE</th>
                                                    <th style={{ padding: '1.2rem', color: '#64748B', fontSize: '0.85rem', fontWeight: '800' }}>CONTACTO</th>
                                                    <th style={{ padding: '1.2rem', color: '#64748B', fontSize: '0.85rem', fontWeight: '800' }}>UBICACIÓN</th>
                                                    <th style={{ padding: '1.2rem', color: '#64748B', fontSize: '0.85rem', fontWeight: '800' }}>COMERCIAL</th>
                                                    <th style={{ padding: '1.2rem', color: '#64748B', fontSize: '0.85rem', fontWeight: '800' }}>ESTADO</th>
                                                    <th style={{ padding: '1.2rem', color: '#64748B', fontSize: '0.85rem', fontWeight: '800' }}>ACCIONES</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filterData(clientsB2B, ['company_name', 'razon_social', 'nit', 'contact_name', 'phone', 'email', 'city', 'municipality', 'department', 'address']).map(client => (
                                                    <ClientListRow 
                                                        key={client.id} 
                                                        client={client} 
                                                        pricingModels={pricingModels}
                                                        onViewDetails={() => handleViewDetails(client)}
                                                        onEdit={() => handleEditClient(client)}
                                                        agreementStatus={getAgreementStatus(client.id)}
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
                                                onEdit={() => handleEditClient(client)}
                                            />
                                        ))}
                                        {clientsB2C.length === 0 && <EmptyState text="No hay clientes hogar registrados aún." />}
                                    </div>
                                ) : (
                                    <div style={{ backgroundColor: 'white', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', border: '1px solid #E2E8F0' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                            <thead>
                                                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
                                                    <th style={{ padding: '1.2rem', color: '#64748B', fontSize: '0.85rem', fontWeight: '800' }}>CLIENTE / IDENTIFICACIÓN</th>
                                                    <th style={{ padding: '1.2rem', color: '#64748B', fontSize: '0.85rem', fontWeight: '800' }}>CONTACTO</th>
                                                    <th style={{ padding: '1.2rem', color: '#64748B', fontSize: '0.85rem', fontWeight: '800' }}>DIRECCIÓN</th>
                                                    <th style={{ padding: '1.2rem', color: '#64748B', fontSize: '0.85rem', fontWeight: '800' }}>ESTADO</th>
                                                    <th style={{ padding: '1.2rem', color: '#64748B', fontSize: '0.85rem', fontWeight: '800' }}>ACCIONES</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filterData(clientsB2C, ['company_name', 'contact_name', 'phone', 'email', 'nit', 'address', 'municipality', 'department']).map(client => (
                                                    <ClientListRow 
                                                        key={client.id} 
                                                        client={client} 
                                                        onViewDetails={() => handleViewDetails(client)}
                                                        onEdit={() => handleEditClient(client)}
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
                                    <div style={{ backgroundColor: 'white', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', border: '1px solid #E2E8F0' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                            <thead>
                                                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
                                                    <th style={{ padding: '1.2rem', color: '#64748B', fontSize: '0.85rem', fontWeight: '800' }}>PROSPECTO / EMPRESA</th>
                                                    <th style={{ padding: '1.2rem', color: '#64748B', fontSize: '0.85rem', fontWeight: '800' }}>CONTACTO</th>
                                                    <th style={{ padding: '1.2rem', color: '#64748B', fontSize: '0.85rem', fontWeight: '800' }}>UBICACIÓN</th>
                                                    <th style={{ padding: '1.2rem', color: '#64748B', fontSize: '0.85rem', fontWeight: '800' }}>ESTADO</th>
                                                    <th style={{ padding: '1.2rem', color: '#64748B', fontSize: '0.85rem', fontWeight: '800' }}>SEGUIMIENTO</th>
                                                    <th style={{ padding: '1.2rem', color: '#64748B', fontSize: '0.85rem', fontWeight: '800' }}>ACCIONES</th>
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
        </div>
    );
}



function KPICard({ title, value, icon, color, textColor, subtitle }: { title: string, value: number | string, icon: React.ReactNode, color: string, textColor: string, subtitle: string }) {
    return (
        <div style={{
            backgroundColor: 'white',
            padding: '1.5rem',
            borderRadius: '16px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.02)',
            display: 'flex',
            alignItems: 'center',
            gap: '1.5rem',
            border: '1px solid #E2E8F0',
            transition: 'all 0.2s ease-in-out',
            cursor: 'default'
        }} onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 8px 30px rgba(0,0,0,0.05)';
        }} onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.02)';
        }}>
            <div style={{ backgroundColor: color, width: '56px', height: '56px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: textColor, flexShrink: 0 }}>
                {icon}
            </div>
            <div>
                <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05rem' }}>{title}</div>
                <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#1E293B', margin: '0.2rem 0', lineHeight: 1.1 }}>{value}</div>
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
                    <span style={{ fontSize: '0.65rem', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>TOTAL</span>
                    <span style={{ fontSize: '1.25rem', fontWeight: '800', color: '#1E293B', marginTop: '2px' }}>${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '4px', backgroundColor: '#0D7A57', marginTop: '4px' }} />
                    <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.03em' }}>CANAL B2B</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#0D7A57', marginTop: '2px' }}>${totalB2B.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                        <div style={{ fontSize: '0.75rem', fontWeight: '500', color: '#94A3B8', marginTop: '1px' }}>{Math.round(b2bPercent)}% del total</div>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', borderTop: '1px solid #F1F5F9', paddingTop: '1rem' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '4px', backgroundColor: '#7E8F9F', marginTop: '4px' }} />
                    <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.03em' }}>CANAL B2C</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#1E293B', marginTop: '2px' }}>${totalB2C.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
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

function ClientCard({ type, data, pricingModels, onUpdatePricingModel, onUpdateStatus, onViewDetails, onEdit, onRegisterContact, onScheduleTask, agreementStatus }: { 
    type: 'b2b' | 'b2c' | 'lead', 
    data: Profile | Lead, 
    pricingModels?: PricingModel[],
    onUpdatePricingModel?: (id: string, modelId: string) => void,
    onUpdateStatus?: (id: string, status: string) => void,
    onViewDetails?: () => void,
    onEdit?: () => void,
    onRegisterContact?: () => void,
    onScheduleTask?: (date: string) => void,
    agreementStatus?: 'active' | 'warning' | 'none'
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

    return (
        <div 
            onClick={onViewDetails}
            style={{ 
                backgroundColor: 'white', 
                borderRadius: '24px', 
                padding: '2rem', 
                boxShadow: '0 8px 30px rgba(0,0,0,0.04)',
                border: '1px solid #F0F2F5',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.5rem',
                position: 'relative',
                overflow: 'hidden',
                cursor: 'pointer'
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

                {/* TRAFFIC LIGHT (Semáforo Comercial) */}
                {isB2B && agreementStatus && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        backgroundColor: 'rgba(248, 250, 252, 0.9)',
                        padding: '4px 10px',
                        borderRadius: '10px',
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                    }}>
                        <div style={{
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            backgroundColor: 
                                agreementStatus === 'active' ? '#10B981' : 
                                agreementStatus === 'warning' ? '#F59E0B' : '#94A3B8',
                            boxShadow: agreementStatus !== 'none' ? `0 0 8px ${agreementStatus === 'active' ? '#10B98166' : '#F59E0B66'}` : 'none'
                        }} />
                        <span style={{ 
                            fontSize: '0.6rem', 
                            fontWeight: '800', 
                            color: '#475569',
                            textTransform: 'uppercase',
                            letterSpacing: '0.02rem'
                        }}>
                            {agreementStatus === 'active' ? 'Acuerdo Activo' : 
                             agreementStatus === 'warning' ? 'Por Vencer' : 'Sin Acuerdo'}
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
                        <span style={{ fontSize: '0.8rem' }}>{profileData.is_corporate_parent ? '🏰' : '📍'}</span>
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
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '900', color: '#1A202C', paddingRight: '100px', lineHeight: '1.3' }}>
                    {isB2B ? profileData?.company_name : isB2C ? profileData?.contact_name : leadData?.company_name}
                </h3>
                {isB2B && profileData?.razon_social && <p style={{ margin: '0.1rem 0', fontSize: '0.75rem', color: '#718096', fontStyle: 'italic', lineHeight: '1.2' }}>{profileData.razon_social}</p>}
                {(isB2B || isLead) && <p style={{ margin: '0.4rem 0', fontSize: '0.8rem', color: '#4A5568', fontWeight: '700' }}>👤 {isB2B ? profileData?.contact_name : leadData?.contact_name}</p>}
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

                {(isB2B || isB2C) && profileData && (
                    <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
                        {profileData.needs_crates && (
                            <div style={{ backgroundColor: '#F0F9FF', color: '#0369A1', padding: '0.4rem 0.8rem', borderRadius: '8px', fontSize: '0.7rem', fontWeight: '900', border: '1px solid #BAE6FD', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span>🧺</span> CON CANASTAS
                            </div>
                        )}
                        <div style={{ backgroundColor: '#F8FAFC', color: '#475569', padding: '0.4rem 0.8rem', borderRadius: '8px', fontSize: '0.7rem', fontWeight: '900', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span>📄</span> {
                                profileData.document_type === 'invoice' 
                                    ? (profileData.print_invoice ? 'FACTURA IMPRESA' : 'FACTURA DIGITAL')
                                    : (profileData.remission_with_prices ? 'REMISIÓN ($)' : 'REMISIÓN (Sin $)')
                            }
                        </div>
                    </div>
                )}

                {isB2B && profileData && profileData.delivery_restrictions && (
                    <div style={{ backgroundColor: '#FFFBEB', padding: '0.8rem', borderRadius: '12px', border: '1px solid #FEF3C7' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#B45309', display: 'block', marginBottom: '0.2rem' }}>⚠️ RESTRICCIONES</span>
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
                                <span style={{ fontSize: '1.2rem' }}>🤖</span>
                                <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#92400E', lineHeight: '1.2' }}>
                                    FRANJA ESTRUCTURADA: {formatTimeWindow(profileData.logistics_data)}
                                </span>
                            </div>
                        )}
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
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', backgroundColor: '#F8FAFC', padding: '1rem', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
                            <div>
                                <label style={{ fontSize: '0.65rem', fontWeight: '800', color: '#94A3B8', display: 'block', textTransform: 'uppercase' }}>Tipo Negocio</label>
                                <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#334155' }}>{leadData.business_type || 'No especificado'}</div>
                            </div>
                            <div>
                                <label style={{ fontSize: '0.65rem', fontWeight: '800', color: '#94A3B8', display: 'block', textTransform: 'uppercase' }}>Tamaño</label>
                                <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#334155' }}>{leadData.business_size || 'No especificado'}</div>
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

                        {leadData.latitude && leadData.longitude ? (
                            <div style={{ marginBottom: '1rem', padding: '0.8rem', backgroundColor: '#F0FDF4', borderRadius: '12px', border: '1px solid #DCFCE7', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '1.1rem' }}>📍</span>
                                <div>
                                    <label style={{ fontSize: '0.65rem', fontWeight: '800', color: '#166534', display: 'block' }}>UBICACIÓN VERIFICADA</label>
                                    <div style={{ fontSize: '0.8rem', fontWeight: '800', color: '#15803D' }}>
                                        {leadData.latitude.toFixed(6)}, {leadData.longitude.toFixed(6)}
                                        <a 
                                            href={`https://www.google.com/maps?q=${leadData.latitude},${leadData.longitude}`} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            style={{ marginLeft: '10px', color: '#0891B2', textDecoration: 'none', fontSize: '0.75rem', fontWeight: '900' }}
                                        >
                                            Abrir Mapa ↗
                                        </a>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div style={{ marginBottom: '1rem', padding: '0.8rem', backgroundColor: '#FEF2F2', borderRadius: '12px', border: '1px solid #FEE2E2', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '1.1rem' }}>⚠️</span>
                                <div>
                                    <label style={{ fontSize: '0.65rem', fontWeight: '800', color: '#991B1B', display: 'block' }}>SIN UBICACIÓN GPS</label>
                                    <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#B91C1C' }}>
                                        Ubicación no capturada por el bot (v1.0 o error)
                                    </div>
                                </div>
                            </div>
                        )}
                        {leadData.notes && (
                            <div style={{ backgroundColor: '#F0FDF4', padding: '0.8rem', borderRadius: '12px', border: '1px solid #DCFCE7' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#15803D', display: 'block', marginBottom: '0.2rem' }}>📝 NOTA</span>
                                <span style={{ fontSize: '0.8rem', color: '#166534' }}>{leadData.notes}</span>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Actions */}
            <div 
                onClick={(e) => e.stopPropagation()}
                style={{ marginTop: 'auto', paddingTop: '1.5rem', borderTop: '1px solid #F0F2F5', display: 'flex', gap: '0.5rem' }}
            >
                {onViewDetails && (
                    <button 
                        onClick={onViewDetails}
                        style={{ flex: 1, padding: '0.8rem', borderRadius: '12px', border: '1px solid #E2E8F0', background: 'white', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s' }} 
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F9FAFB'} 
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                    >
                        Ficha
                    </button>
                )}
                {(isB2B || isB2C) && (
                    <button 
                        onClick={onEdit}
                        style={{ flex: 1, padding: '0.8rem', borderRadius: '12px', border: '1px solid #E2E8F0', background: 'white', fontWeight: '700', cursor: 'pointer' }}
                    >
                        Editar
                    </button>
                )}
                {isLead && onRegisterContact && (
                    <button 
                        onClick={onRegisterContact}
                        style={{ flex: 1.5, padding: '0.8rem', borderRadius: '12px', border: 'none', background: '#10B981', color: 'white', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    >
                        <span>✅</span> Registrar Contacto
                    </button>
                )}
                {isLead && onScheduleTask && (
                    <button 
                        onClick={() => {
                            const date = window.prompt('Fecha de siguiente contacto (AAAA-MM-DD):', new Date(Date.now() + 86400000).toISOString().split('T')[0]);
                            if (date) onScheduleTask(date);
                        }}
                        style={{ flex: 1, padding: '0.8rem', borderRadius: '12px', border: '1px solid #E2E8F0', background: 'white', fontWeight: '700', cursor: 'pointer' }}
                    >
                        📅 Tarea
                    </button>
                )}
                <button 
                    onClick={handleWhatsApp}
                    style={{ padding: '0.8rem', borderRadius: '12px', border: 'none', background: '#25D366', color: 'white', fontWeight: '800', cursor: 'pointer' }}
                >
                    💬 WhatsApp
                </button>
            </div>
        </div>
    );
}

function ClientListRow({ client, pricingModels, onViewDetails, onEdit, agreementStatus, onRegisterContact }: { 
    client: Profile, 
    pricingModels?: PricingModel[], 
    onViewDetails: () => void, 
    onEdit?: () => void, 
    agreementStatus?: 'active' | 'warning' | 'none',
    onRegisterContact?: () => void
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

    return (
        <tr 
            style={{ borderBottom: '1px solid #F1F5F9', transition: 'background 0.2s', cursor: 'pointer' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            onClick={onViewDetails}
        >
            <td style={{ padding: '1rem 1.2rem' }}>
                <div style={{ fontWeight: '800', color: '#1E293B', fontSize: '0.95rem' }}>{client.company_name || client.contact_name}</div>
                {isLead ? (
                    <div style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                        {(client as any).business_type && <span style={{ fontSize: '0.65rem', backgroundColor: '#EFF6FF', color: '#1E40AF', padding: '2px 6px', borderRadius: '4px', fontWeight: '800' }}>{(client as any).business_type}</span>}
                        {(client as any).business_size && <span style={{ fontSize: '0.65rem', backgroundColor: '#F0FDF4', color: '#166534', padding: '2px 6px', borderRadius: '4px', fontWeight: '800' }}>{(client as any).business_size}</span>}
                    </div>
                ) : (
                    <>
                        <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '600' }}>NIT: {client.nit || '---'}</div>
                        <div style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                            {client.is_corporate_parent && <span style={{ fontSize: '0.6rem', backgroundColor: '#E0F2FE', color: '#0369A1', padding: '1px 6px', borderRadius: '4px', fontWeight: '900', textTransform: 'uppercase' }}>Matriz</span>}
                            {client.parent_id && <span style={{ fontSize: '0.6rem', backgroundColor: '#FFF7ED', color: '#C2410C', padding: '1px 6px', borderRadius: '4px', fontWeight: '900', textTransform: 'uppercase' }}>Sucursal</span>}
                            {client.needs_crates && <span title="Requiere Canastillas" style={{ fontSize: '0.6rem', backgroundColor: '#ECFDF5', color: '#059669', padding: '1px 6px', borderRadius: '4px', fontWeight: '900', border: '1px solid #A7F3D0' }}>🧺 SI</span>}
                            <span title="Tipo de Documento" style={{ fontSize: '0.6rem', backgroundColor: '#F8FAFC', color: '#475569', padding: '1px 6px', borderRadius: '4px', fontWeight: '900', border: '1px solid #E2E8F0' }}>
                                📄 {client.document_type === 'invoice' ? (client.print_invoice ? 'FAC-IMP' : 'FAC-DIG') : (client.remission_with_prices ? 'REM-$' : 'REM-S/S')}
                            </span>
                        </div>
                    </>
                )}
            </td>
            <td style={{ padding: '1rem 1.2rem' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#475569' }}>{client.contact_name}</div>
                <div style={{ fontSize: '0.8rem', color: '#64748B' }}>📞 {client.phone}</div>
                {client.email && <div style={{ fontSize: '0.75rem', color: '#0891B2', fontWeight: '600', marginTop: '2px' }}>📧 {client.email}</div>}
            </td>
            <td style={{ padding: '1rem 1.2rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569' }}>
                    {displayCity ? `${displayCity} / ` : ''}{displayMunicipality || '---'}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>{displayAddress || '---'}</div>
            </td>
            <td style={{ padding: '1rem 1.2rem' }}>
                {isB2B ? (
                    <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: '800', color: '#0891B2' }}>{selectedModel?.name || 'Varios'}</div>
                        <div style={{ fontSize: '0.7rem', color: '#64748B' }}>Modelo de Precios</div>
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
                        {(client as any).status}
                    </span>
                ) : (
                    <span style={{ fontSize: '0.85rem', color: '#94A3B8' }}>Hogar</span>
                )}
            </td>
            <td style={{ padding: '1rem 1.2rem' }}>
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
                    <>
                        {agreementStatus && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                <div style={{ 
                                    width: '8px', height: '8px', borderRadius: '50%', 
                                    backgroundColor: agreementStatus === 'active' ? '#10B981' : agreementStatus === 'warning' ? '#F59E0B' : '#CBD5E1' 
                                }} />
                                <span style={{ fontSize: '0.7rem', fontWeight: '800', color: '#64748B' }}>{agreementStatus === 'active' ? 'AL DÍA' : 'SIN ACUERDO'}</span>
                            </div>
                        )}
                        {(client.latitude && client.longitude) ? (
                            <div style={{ fontSize: '0.7rem', color: '#10B981', fontWeight: '900' }}>🗺️ GPS OK</div>
                        ) : (
                            <div style={{ fontSize: '0.7rem', color: '#EF4444', fontWeight: '900' }}>📍 NO GPS</div>
                        )}
                    </>
                )}
            </td>
            <td style={{ padding: '1rem 1.2rem' }}>
                <div style={{ display: 'flex', gap: '8px' }} onClick={(e) => e.stopPropagation()}>
                    {!isLead && onEdit && (
                        <button 
                            onClick={onEdit} 
                            style={{ background: '#F1F5F9', border: 'none', padding: '6px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem' }}
                            title="Editar"
                        >✏️</button>
                    )}
                    <button 
                        onClick={handleWhatsApp} 
                        style={{ background: '#DCFCE7', border: 'none', padding: '6px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem' }}
                        title="WhatsApp"
                    >💬</button>
                    {onRegisterContact && (
                        <button 
                            onClick={onRegisterContact} 
                            style={{ background: '#F3E8FF', border: 'none', padding: '6px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem' }}
                            title="Registrar Contacto"
                        >📞</button>
                    )}
                </div>
            </td>
        </tr>
    );
}

function InfoRow({ icon, label, value }: { icon: string, label: string, value: string | number | undefined | null }) {
    return (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '1rem' }}>{icon}</span>
            <div style={{ fontSize: '0.78rem' }}>
                <span style={{ color: '#718096', fontWeight: '600' }}>{label}: </span>
                <span style={{ color: '#1A202C', fontWeight: '800' }}>{value || 'N/A'}</span>
            </div>
        </div>
    );
}

function EmptyState({ text }: { text: string }) {
    return (
        <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '5rem', backgroundColor: 'white', borderRadius: '24px', border: '2px dashed #E2E8F0' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔦</div>
            <p style={{ color: '#718096', fontWeight: '700' }}>{text}</p>
        </div>
    );
}



function ClientFormModal({ onClose, onRefresh, pricingModels, editData, setNicknameClientId, setIsNicknameModalOpen, isReadOnly = false }: { onClose: () => void, onRefresh: () => void, pricingModels: PricingModel[], editData?: Partial<Profile> | null, setNicknameClientId?: (id: string | null) => void, setIsNicknameModalOpen?: (open: boolean) => void, isReadOnly?: boolean }) {
    const isEdit = !!editData && !!editData.id;
    const isLead = !!editData && ('status' in editData);
    const role = (editData as any)?.role || 'b2b_client';
    const isB2C = role === 'b2c_client';
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
        notify_email_1: (editData as any)?.notify_email_1 !== undefined ? (editData as any).notify_email_1 : true,
        notify_email_2: (editData as any)?.notify_email_2 || false,
        notify_email_3: (editData as any)?.notify_email_3 || false
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

    const fetchExceptionCount = async () => {
        if (!editData?.id) return;
        const { count } = await supabase
            .from('product_nicknames')
            .select('*', { count: 'exact', head: true })
            .eq('customer_id', editData.id);
        setExceptionCount(count || 0);
    };

    useEffect(() => {
        fetchExceptionCount();
    }, [editData?.id]);
    const [stableClientId] = useState(editData?.id || crypto.randomUUID());

    useEffect(() => {
        const fetchParents = async () => {
            const { data } = await supabase
                .from('profiles')
                .select('id, company_name, nit, razon_social, email, pricing_model_id, document_type, phone')
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
        if (!mapRef.current || !window.google || isLead) return;

        const latVal = parseFloat(String(formData.latitude));
        const lngVal = parseFloat(String(formData.longitude));
        
        // Bogotá center generic coords if null
        const lat = !isNaN(latVal) ? latVal : 4.6097;
        const lng = !isNaN(lngVal) ? lngVal : -74.0817; 

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
                draggable: !isReadOnly,
                animation: window.google.maps.Animation.DROP
            });

            // Sincronizar el arrastre del marcador con el formulario
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

            // Click en mapa para mover marcador
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
        } else {
            // Solo actualizamos posición si no estamos en modo "Manual" (para no romper la interacción del usuario)
            if (formData.geocoding_status === 'verified') {
                const newPos = { lat, lng };
                mapInstance.current?.setCenter(newPos);
                markerInstance.current?.setPosition(newPos);
            }
        }
    }, [formData.latitude, formData.longitude, formData.geocoding_status, isReadOnly, isLead]);

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
                                        <div style={{ width: '32px', height: '32px', backgroundColor: '#F1F5F9', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>🏢</div>
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
                                    </div>
                                </section>

                                <section style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '24px', border: '1px solid #E2E8F0' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.2rem' }}>
                                        <div style={{ width: '32px', height: '32px', backgroundColor: '#F1F5F9', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>📞</div>
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
                                            <span style={{ fontSize: '1.2rem' }}>💬</span>
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
                                        <div style={{ width: '32px', height: '32px', backgroundColor: '#F1F5F9', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>🗺️</div>
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
                        
                        {/* BLOQUE: IDENTIFICACIÓN (DINÁMICO) */}
                        <section style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '24px', border: '1px solid #E2E8F0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.2rem' }}>
                                <div style={{ width: '32px', height: '32px', backgroundColor: '#F1F5F9', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>🆔</div>
                                <h4 style={{ fontSize: '0.9rem', fontWeight: '900', color: '#1E293B', margin: 0 }}>IDENTIFICACIÓN Y VÍNCULOS</h4>
                            </div>

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


                                    <div style={{ backgroundColor: '#F8FAFC', padding: '1.5rem', borderRadius: '24px', border: '1px solid #E2E8F0', marginTop: '1.5rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
                                            <span style={{ fontSize: '1rem' }}>📧</span>
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
                        </section>

                        {/* BLOQUE: CARTERA Y LEGAL (SOLO MATRIZ) */}
                        {formData.is_corporate_parent && (
                            <section style={{ backgroundColor: '#F0F9FF', padding: '1.5rem', borderRadius: '24px', border: '1px solid #BAE6FD' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.2rem' }}>
                                    <div style={{ width: '32px', height: '32px', backgroundColor: 'white', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>⚖️</div>
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
                                    <div style={{ width: '36px', height: '36px', backgroundColor: '#F8FAFC', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>💰</div>
                                    <h4 style={{ fontSize: '1rem', fontWeight: '900', color: '#1E293B', margin: 0 }}>ESTRUCTURA COMERCIAL</h4>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                            <label style={{ fontSize: '0.65rem', fontWeight: '900', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.02rem' }}>Modelo de Precios</label>
                                            <select 
                                                value={formData.pricing_model_id} 
                                                onChange={(e) => setFormData({...formData, pricing_model_id: e.target.value})} 
                                                disabled={isReadOnly}
                                                style={{ height: '34px', padding: '0 0.8rem', borderRadius: '8px', border: '1px solid #E2E8F0', fontWeight: '700', fontSize: '0.8rem', backgroundColor: isReadOnly ? '#F8FAFC' : 'white', outline: 'none', width: '100%', cursor: isReadOnly ? 'default' : 'pointer' }}
                                            >
                                                <option value="">Seleccionar...</option>
                                                {pricingModels.map(pm => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
                                            </select>
                                        </div>
                                        <FormField label="Días de Pago" value={formData.payment_days} onChange={(v) => setFormData({...formData, payment_days: parseInt(v) || 0})} type="number" readOnly={isReadOnly} />
                                    </div>
                                    {!formData.is_corporate_parent && (
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                                            <FormField label="ID ZR" value={formData.id_zr} onChange={(v) => setFormData({...formData, id_zr: v})} readOnly={isReadOnly} />
                                            <FormField label="ID LP" value={formData.id_lp} onChange={(v) => setFormData({...formData, id_lp: v})} readOnly={isReadOnly} />
                                            <FormField label="Copias Rem." value={formData.remission_copies} onChange={(v) => setFormData({...formData, remission_copies: Math.max(2, parseInt(v) || 2)})} type="number" readOnly={isReadOnly} />
                                        </div>
                                    )}
                                </div>
                            </section>

              {/* BLOQUE: CONTACTO OPERATIVO (COMMON) */}
                            <section style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: THEME.radius.xl, border: `1px solid ${THEME.colors.border}` }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.2rem' }}>
                                    <div style={{ width: '32px', height: '32px', backgroundColor: THEME.colors.primaryLight, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Phone size={16} strokeWidth={1.5} style={{ color: THEME.colors.primary }} /></div>
                                    <h4 style={{ fontSize: '0.9rem', fontWeight: '600', color: THEME.colors.textMain, margin: 0, fontFamily: THEME.typography.fontFamilyMain }}>CONTACTO OPERATIVO</h4>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.2rem' }}>
                                    <FormField label="Responsable Directo" value={formData.contact_name} onChange={(v) => setFormData({...formData, contact_name: v})} required readOnly={isReadOnly} />
                                    <FormField label="WhatsApp" value={formData.phone} onChange={(v) => setFormData({...formData, phone: v})} required readOnly={isReadOnly} />
                                    <FormField label="Email Contacto" value={formData.contact_email} onChange={(v) => setFormData({...formData, contact_email: v})} required readOnly={isReadOnly} />
                                </div>
                            </section>

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

                            {/* BLOQUE CONDICIONAL: EXPEDIENTE (MATRIZ) VS OPERACIÓN (SUCURSAL) */}
                            {formData.is_corporate_parent ? (
                                <section style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: THEME.radius.xl, border: `1px solid ${THEME.colors.border}` }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.2rem' }}>
                                        <div style={{ width: '32px', height: '32px', backgroundColor: THEME.colors.primaryLight, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Folder size={16} strokeWidth={1.5} style={{ color: THEME.colors.primary }} /></div>
                                        <h4 style={{ fontSize: '0.9rem', fontWeight: '600', color: THEME.colors.textMain, margin: 0, fontFamily: THEME.typography.fontFamilyMain }}>EXPEDIENTE DIGITAL</h4>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        <DocumentUploadField label="Registro RUT (PDF)" url={formData.rut_url} onUpload={(url) => setFormData({...formData, rut_url: url})} readOnly={isReadOnly} />
                                        <DocumentUploadField label="Cámara de Comercio" url={formData.mercantile_registry_url} onUpload={(url) => setFormData({...formData, mercantile_registry_url: url})} readOnly={isReadOnly} />
                                        <DocumentUploadField label="Cédula Representante Legal" url={formData.legal_rep_id_url} onUpload={(url) => setFormData({...formData, legal_rep_id_url: url})} readOnly={isReadOnly} />
                                    </div>
                                </section>
                            ) : (
                                <section style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: THEME.radius.xl, border: `1px solid ${THEME.colors.border}` }}>
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
                                            <label style={{ fontSize: '0.65rem', fontWeight: '600', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.03rem', fontFamily: THEME.typography.fontFamilySecondary }}>Configuración de Documento (Excluyente)</label>
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

function DocumentUploadField({ label, url, onUpload, readOnly = false }: { label: string, url: string | undefined, onUpload: (url: string) => void, readOnly?: boolean }) {
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

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
            
            onUpload(publicUrl);
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '0.8rem', backgroundColor: '#F8FAFC', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '28px', height: '28px', backgroundColor: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm }}>
                    {url ? (
                        <Check size={14} strokeWidth={2.5} style={{ color: THEME.colors.primary }} />
                    ) : (
                        <FileText size={14} strokeWidth={1.5} style={{ color: THEME.colors.textSecondary }} />
                    )}
                </div>
                <div style={{ fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textMain, textTransform: 'uppercase', fontFamily: THEME.typography.fontFamilySecondary }}>{label}</div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} accept="application/pdf,image/*" />
                {url && (
                    <a href={url} target="_blank" rel="noreferrer" style={{ padding: '0.4rem 0.8rem', borderRadius: THEME.radius.sm, backgroundColor: 'white', color: THEME.colors.primary, fontSize: '0.65rem', fontWeight: '600', textDecoration: 'none', border: `1px solid ${THEME.colors.border}`, display: 'flex', alignItems: 'center', fontFamily: THEME.typography.fontFamilySecondary }}>VER</a>
                )}
                {!readOnly && (
                    <button 
                        type="button" 
                        onClick={() => fileInputRef.current?.click()} 
                        disabled={uploading}
                        style={{ padding: '0.4rem 0.8rem', borderRadius: THEME.radius.sm, backgroundColor: uploading ? '#E2E8F0' : THEME.colors.primary, color: 'white', fontSize: '0.65rem', fontWeight: '600', border: 'none', cursor: 'pointer', fontFamily: THEME.typography.fontFamilySecondary }}
                    >
                        {uploading ? '...' : (url ? 'CAMBIAR' : 'SUBIR')}
                    </button>
                )}
                {readOnly && !url && (
                    <span style={{ fontSize: '0.65rem', color: THEME.colors.textSecondary, fontWeight: '600', fontFamily: THEME.typography.fontFamilySecondary }}>PENDIENTE</span>
                )}
            </div>
        </div>
    );
}

function ClientExceptionsModal({ clientId, onClose, readOnly = false }: { clientId: string, onClose: () => void, readOnly?: boolean }) {
    const [exceptions, setExceptions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [products, setProducts] = useState<any[]>([]);
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    
    const [newException, setNewException] = useState({
        product_id: '',
        nickname: '',
        picking_note: ''
    });
    const [searchTerm, setSearchTerm] = useState('');
    const [showResults, setShowResults] = useState(false);

    const fetchData = async () => {
        setLoading(true);
        const { data: excData } = await supabase
            .from('product_nicknames')
            .select('*, products(name, sku)')
            .eq('customer_id', clientId);
        
        const { data: prodData } = await supabase
            .from('products')
            .select('id, name, sku')
            .eq('is_active', true);

        if (excData) setExceptions(excData);
        if (prodData) setProducts(prodData);
        setLoading(false);
    };

    useEffect(() => { fetchData(); }, [clientId]);

    const handleSave = async () => {
        if (!newException.product_id) return;
        
        const payload = {
            customer_id: clientId,
            product_id: newException.product_id,
            nickname: newException.nickname || '',
            picking_note: newException.picking_note || ''
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
            setNewException({ product_id: '', nickname: '', picking_note: '' });
            setSearchTerm('');
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
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilySecondary }}>{readOnly ? 'Visualizando nombres de factura y notas de picking personalizadas.' : 'Personaliza nombres de factura y notas de picking para este cliente.'}</p>
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

                <div style={{ padding: '2rem', flex: 1, overflowY: 'auto' }}>
                    {!readOnly && !isAdding && (
                        <button 
                            onClick={() => setIsAdding(true)}
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
                                <div>
                                    <label style={{ fontSize: '0.65rem', fontWeight: '600', color: THEME.colors.textSecondary, display: 'block', marginBottom: '6px', textTransform: 'uppercase', fontFamily: THEME.typography.fontFamilySecondary }}>Producto Original (Buscador)</label>
                                    <div style={{ position: 'relative' }}>
                                        <div style={{ position: 'relative' }}>
                                            <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                                                <Search size={16} style={{ color: THEME.colors.textSecondary }} />
                                            </span>
                                            <input 
                                                type="text"
                                                placeholder="Buscar por nombre o ID (SKU)..."
                                                value={searchTerm}
                                                onChange={(e) => {
                                                    setSearchTerm(e.target.value);
                                                    setShowResults(true);
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
                                                onBlur={() => setTimeout(() => setShowResults(false), 200)}
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
                                            <div style={{ 
                                                position: 'absolute', top: '100%', left: 0, right: 0, 
                                                backgroundColor: 'white', borderRadius: '12px', border: `1px solid ${THEME.colors.border}`, 
                                                boxShadow: THEME.shadow.lg, 
                                                zIndex: 10, marginTop: '8px', maxHeight: '250px', overflowY: 'auto' 
                                            }}>
                                                {products
                                                    .filter(p => 
                                                        p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                                        p.sku.toLowerCase().includes(searchTerm.toLowerCase())
                                                    )
                                                    .slice(0, 15) // Limit results for performance
                                                    .map(p => (
                                                        <div 
                                                            key={p.id}
                                                            onClick={() => {
                                                                setNewException({...newException, product_id: p.id});
                                                                setSearchTerm(`[${p.sku}] ${p.name}`);
                                                                setShowResults(false);
                                                            }}
                                                            style={{ 
                                                                padding: '0.8rem 1.2rem', cursor: 'pointer', borderBottom: `1px solid ${THEME.colors.border}`,
                                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                                transition: 'background 0.2s'
                                                            }}
                                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                                                        >
                                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                <span style={{ fontSize: '0.85rem', fontWeight: '600', color: THEME.colors.textMain, fontFamily: THEME.typography.fontFamilySecondary }}>{p.name}</span>
                                                                <span style={{ fontSize: '0.65rem', fontWeight: '500', color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilySecondary }}>SKU: {p.sku}</span>
                                                            </div>
                                                            <span style={{ color: THEME.colors.primary, fontSize: '0.95rem', fontWeight: '600' }}>＋</span>
                                                        </div>
                                                    ))
                                                }
                                                {products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.sku.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 && (
                                                    <div style={{ padding: '1.2rem', textAlign: 'center', color: THEME.colors.textSecondary, fontSize: '0.8rem', fontFamily: THEME.typography.fontFamilySecondary }}>
                                                        No se encontraron productos.
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <FormField 
                                        label="Nombre en Factura (Alias)" 
                                        value={newException.nickname} 
                                        onChange={(v) => setNewException({...newException, nickname: v})} 
                                        placeholder="Ej: Papa Amarilla"
                                    />
                                    <FormField 
                                        label="Nota de Picking (Bodega)" 
                                        value={newException.picking_note} 
                                        onChange={(v) => setNewException({...newException, picking_note: v})} 
                                        placeholder="Ej: Lavada y grande"
                                    />
                                </div>
                                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                                    <button onClick={() => {
                                        setIsAdding(false);
                                        setEditingId(null);
                                        setNewException({ product_id: '', nickname: '', picking_note: '' });
                                        setSearchTerm('');
                                    }} style={{ flex: 1, padding: '0.6rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, background: 'white', fontWeight: '600', cursor: 'pointer', fontFamily: THEME.typography.fontFamilySecondary, fontSize: '0.8rem' }}>Cancelar</button>
                                    <button onClick={handleSave} style={{ flex: 1, padding: '0.6rem', borderRadius: THEME.radius.sm, border: 'none', background: THEME.colors.primary, color: 'white', fontWeight: '600', cursor: 'pointer', fontFamily: THEME.typography.fontFamilyMain, fontSize: '0.8rem' }}>Guardar Regla</button>
                                </div>
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '2rem', color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilySecondary }}>Cargando reglas...</div>
                        ) : exceptions.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '2rem', color: THEME.colors.textSecondary, border: `1px dashed ${THEME.colors.border}`, borderRadius: THEME.radius.lg, fontFamily: THEME.typography.fontFamilySecondary }}>No hay excepciones configuradas.</div>
                        ) : (
                            exceptions.map(exc => (
                                <div key={exc.id} style={{ display: 'flex', alignItems: 'center', gap: '1.2rem', padding: '1.2rem', backgroundColor: 'white', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}` }}>
                                    <div style={{ width: '36px', height: '36px', backgroundColor: THEME.colors.primaryLight, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Package size={16} strokeWidth={1.5} style={{ color: THEME.colors.primary }} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '0.65rem', fontWeight: '600', color: THEME.colors.textSecondary, textTransform: 'uppercase', fontFamily: THEME.typography.fontFamilySecondary }}>Original: {exc.products?.name}</div>
                                        <div style={{ display: 'flex', gap: '1.5rem', marginTop: '4px' }}>
                                            <div>
                                                <span style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary, fontWeight: '500', fontFamily: THEME.typography.fontFamilySecondary }}>Factura: </span>
                                                <span style={{ fontSize: '0.8rem', color: THEME.colors.textMain, fontWeight: '600', fontFamily: THEME.typography.fontFamilySecondary }}>{exc.nickname || '---'}</span>
                                            </div>
                                            <div>
                                                <span style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary, fontWeight: '500', fontFamily: THEME.typography.fontFamilySecondary }}>Picking: </span>
                                                <span style={{ fontSize: '0.8rem', color: THEME.colors.primary, fontWeight: '600', fontFamily: THEME.typography.fontFamilySecondary }}>{exc.picking_note || '---'}</span>
                                            </div>
                                        </div>
                                    </div>
                                    {!readOnly && (
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button 
                                                onClick={() => {
                                                    setEditingId(exc.id);
                                                    setNewException({
                                                        product_id: exc.product_id,
                                                        nickname: exc.nickname,
                                                        picking_note: exc.picking_note
                                                    });
                                                    setSearchTerm(`[${exc.products?.sku}] ${exc.products?.name}`);
                                                    setIsAdding(true);
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
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

